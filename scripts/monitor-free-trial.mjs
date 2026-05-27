#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"

const CORE_TABLES = [
  "free_trial_grants",
  "survey_templates",
  "survey_responses",
  "trial_credit_usages",
  "campaign_events",
]

const WATCH_EVENT_NAMES = [
  "free_trial_announcement_shown",
  "daily_survey_auto_prompt_shown",
  "daily_survey_submit_success",
  "survey_required_block",
  "trial_billing_real_credit_fallback",
]

const RUNTIME_FLAG_KEYS = ["campaignEnabled", "consumptionEnabled", "autoPromptEnabled"]

const CREDIT_CONSUMPTION_REFERENCE_PREFIXES = [
  "chat_",
  "img_",
  "poster_",
  "tools-img_",
  "openclaw_",
  "image-prompt-reverse:",
  "worksheet_",
  "essay-grade:",
  "flashcards:",
]

const CREDIT_CONSUMPTION_DESCRIPTION_KEYWORDS = [
  "作文批改",
  "闪卡",
  "图片",
  "图像",
  "对话",
  "OpenClaw",
  "错题",
  "worksheet",
]

const REQUIRED_MONITOR_FILES = [
  "app/api/free-trial/runtime-flags/route.ts",
  "app/api/cron/free-trial-monitor/route.ts",
  "app/api/admin/free-trial-monitor/route.ts",
  "lib/free-trial-runtime-config.ts",
  "lib/free-trial-monitor.ts",
  "scripts/monitor-free-trial.mjs",
]

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const index = trimmed.indexOf("=")
    if (index <= 0) continue
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

for (const file of [".env.local", ".env.production", ".env"]) {
  loadEnvFile(path.join(process.cwd(), file))
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase env")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const supabase = getSupabase()

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function isChinaDaytime(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(now))
  return hour >= 8 && hour <= 23
}

function countEventsSince(events, sinceMs) {
  return events.filter((event) => new Date(event.created_at).getTime() >= sinceMs).length
}

function countEventsBetween(events, startMs, endMs) {
  return events.filter((event) => {
    const createdAt = new Date(event.created_at).getTime()
    return createdAt >= startMs && createdAt < endMs
  }).length
}

function minutesAgoIso(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString()
}

function isAiCreditConsumption(row) {
  const referenceId = String(row.reference_id || "")
  const description = String(row.description || "")

  return CREDIT_CONSUMPTION_REFERENCE_PREFIXES.some((prefix) => referenceId.startsWith(prefix)) ||
    CREDIT_CONSUMPTION_DESCRIPTION_KEYWORDS.some((keyword) => description.includes(keyword))
}

function isExpectedTrialRealCreditFallbackEvent(event) {
  const metadata = event.metadata || {}
  const realCreditsUsed = Number(metadata.realCreditsUsed || 0)
  const trialUsed = Number(metadata.trialUsed || 0)
  return realCreditsUsed > 0 && trialUsed === 0
}

async function countRows(table, filters) {
  let query = supabase.from(table).select("*", { count: "exact", head: true })
  if (filters) query = filters(query)
  const { count, error } = await query
  if (error) throw error
  return count || 0
}

async function fetchRows(table, select = "*", filters) {
  let query = supabase.from(table).select(select)
  if (filters) query = filters(query)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function setRuntimeConfig(configKey, enabled, reason, updatedBy = "monitor-script") {
  const { error } = await supabase.from("free_trial_runtime_config").upsert({
    config_key: configKey,
    config_value: {
      enabled,
      reason,
      updatedAt: new Date().toISOString(),
      updatedBy,
    },
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  }, { onConflict: "config_key" })
  if (error) throw error
}

async function createIncident(incident, autoActionTaken = null, status = "open") {
  const { error } = await supabase.from("monitor_incidents").insert({
    incident_type: incident.incidentType,
    severity: incident.severity,
    status,
    title: incident.title,
    details: incident.details || {},
    auto_action_taken: autoActionTaken,
    resolved_at: status === "mitigated" || status === "resolved" ? new Date().toISOString() : null,
  })
  if (error) throw error
}

async function createRun() {
  const { data, error } = await supabase
    .from("monitor_runs")
    .insert({ status: "running", checks_json: {}, actions_json: {} })
    .select("id")
    .single()
  if (error) return null
  return data.id
}

async function finishRun(runId, status, checks, actions, errorMessage = null) {
  if (!runId) return
  await supabase
    .from("monitor_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      checks_json: checks,
      actions_json: { actions },
      error_message: errorMessage,
    })
    .eq("id", runId)
}

async function getMonitorEnabled() {
  const { data } = await supabase
    .from("free_trial_runtime_config")
    .select("config_value")
    .eq("config_key", "free_trial_monitor_enabled")
    .maybeSingle()
  return data?.config_value?.enabled !== false
}

async function notifyWebhook(incident, autoActionTaken) {
  if (!process.env.MONITOR_WEBHOOK_URL || !["p0", "p1"].includes(incident.severity)) return
  try {
    await fetch(process.env.MONITOR_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        severity: incident.severity,
        title: incident.title,
        details: incident.details || {},
        autoActionTaken,
        createdAt: new Date().toISOString(),
      }),
    })
  } catch {
    // Webhook is best effort only.
  }
}

async function checkRuntimeFlagsEndpoint(siteUrl, checks, incidents) {
  const url = `${siteUrl}/api/free-trial/runtime-flags`

  try {
    const response = await fetch(url)
    const contentType = response.headers.get("content-type") || ""
    let payload = null

    if (contentType.includes("application/json")) {
      payload = await response.json()
    }

    const hasValidShape = Boolean(payload) && RUNTIME_FLAG_KEYS.every((key) => typeof payload?.[key] === "boolean")
    checks.runtimeFlagsEndpoint = {
      ok: response.ok && hasValidShape,
      status: response.status,
      contentType,
      payload: payload ? Object.fromEntries(RUNTIME_FLAG_KEYS.map((key) => [key, payload?.[key]])) : null,
    }

    if (!response.ok || !hasValidShape) {
      incidents.push({
        incidentType: "runtime_flags_endpoint_unavailable",
        severity: "p1",
        title: "runtime flags API 不可用或响应异常",
        details: {
          url,
          status: response.status,
          contentType,
          payloadKeys: payload ? Object.keys(payload) : null,
          expectedKeys: RUNTIME_FLAG_KEYS,
        },
      })
    }
  } catch (error) {
    checks.runtimeFlagsEndpoint = { ok: false, url, error: error.message }
    incidents.push({
      incidentType: "runtime_flags_endpoint_unavailable",
      severity: "p1",
      title: "runtime flags API 不可用或响应异常",
      details: { url, error: error.message },
    })
  }
}

function checkLocalMonitorFiles(checks, incidents) {
  const missing = REQUIRED_MONITOR_FILES.filter((file) => !fs.existsSync(path.join(process.cwd(), file)))
  checks.monitorFiles = { ok: missing.length === 0, missing }

  if (missing.length > 0) {
    incidents.push({
      incidentType: "monitor_deployment_files_missing",
      severity: "p1",
      title: "共创体验监控部署文件缺失",
      details: {
        cwd: process.cwd(),
        missing,
        note: "该异常需要重新部署或同步源码；监控不会自动删除或修改用户数据。",
      },
    })
  }
}

async function runMonitor() {
  const runId = await createRun()
  const checks = {}
  const actions = []
  const incidents = []

  try {
    const siteUrl = (process.env.FREE_TRIAL_MONITOR_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://shenxiang.school").replace(/\/$/, "")
    try {
      const response = await fetch(`${siteUrl}/api/health`)
      checks.health = { ok: response.ok, status: response.status }
      if (!response.ok) {
        incidents.push({ incidentType: "health_check_failed", severity: "p1", title: "站点健康检查失败", details: { status: response.status } })
      }
    } catch (error) {
      checks.health = { ok: false, error: error.message }
      incidents.push({ incidentType: "health_check_failed", severity: "p1", title: "站点健康检查失败", details: { error: error.message } })
    }

    await checkRuntimeFlagsEndpoint(siteUrl, checks, incidents)
    checkLocalMonitorFiles(checks, incidents)

    const missing = []
    const tableErrors = {}
    for (const table of CORE_TABLES) {
      try {
        await countRows(table)
      } catch (error) {
        missing.push(table)
        tableErrors[table] = error instanceof Error ? error.message : String(error)
      }
    }
    checks.tables = { ok: missing.length === 0, missing, errors: tableErrors }
    if (missing.length > 0) {
      incidents.push({
        incidentType: "core_tables_missing",
        severity: "p1",
        title: "共创体验核心表探测失败，需要人工确认",
        details: {
          missing,
          errors: tableErrors,
          autoStopLoss: false,
          reason: "Supabase 或网络瞬时失败不能单次关闭用户可见权益。",
        },
      })
    }

    if (missing.length === 0) {
      const campaignActive = await countRows("free_trial_grants", (query) => query.eq("grant_type", "campaign").eq("status", "active"))
      const paidExtensionActive = await countRows("free_trial_grants", (query) => query.eq("grant_type", "paid_extension").eq("status", "active"))
      const paidExtensionNoSurvey = await countRows("free_trial_grants", (query) => query.eq("grant_type", "paid_extension").eq("status", "active").eq("requires_daily_survey", false))
      const paidExtensionRequiresSurvey = await countRows("free_trial_grants", (query) => query.eq("grant_type", "paid_extension").eq("status", "active").eq("requires_daily_survey", true))
      checks.grants = { campaignActive, paidExtensionActive, paidExtensionNoSurvey, paidExtensionRequiresSurvey }
      if (campaignActive < 500) {
        incidents.push({ incidentType: "campaign_active_count_low", severity: "p1", title: "campaign active 数量低于预期", details: { campaignActive } })
      }
      if (paidExtensionActive < 49 || paidExtensionNoSurvey < 49 || paidExtensionRequiresSurvey > 0) {
        incidents.push({
          incidentType: "paid_extension_survey_guard_failed",
          severity: "p0",
          title: "付费会员顺延免问卷保护异常",
          details: checks.grants,
          autoActions: ["disable_consumption"],
        })
      }

      const today = todayIsoDate()
      const events = await fetchRows("campaign_events", "event_name, created_at", (query) => query.eq("event_date", today).in("event_name", WATCH_EVENT_NAMES))
      const counts = Object.fromEntries(WATCH_EVENT_NAMES.map((eventName) => [eventName, 0]))
      for (const event of events) counts[event.event_name] = (counts[event.event_name] || 0) + 1
      const nowMs = Date.now()
      const fallbackEvents = events.filter((event) => event.event_name === "trial_billing_real_credit_fallback")
      const fallbackRecent5m = countEventsSince(fallbackEvents, nowMs - 5 * 60 * 1000)
      const fallbackRecent30m = countEventsSince(fallbackEvents, nowMs - 30 * 60 * 1000)
      const fallbackPrevious30m = countEventsBetween(fallbackEvents, nowMs - 60 * 60 * 1000, nowMs - 30 * 60 * 1000)
      checks.funnel = {
        counts,
        fallbackWindows: {
          recent5m: fallbackRecent5m,
          recent30m: fallbackRecent30m,
          previous30m: fallbackPrevious30m,
        },
      }
      if (isChinaDaytime() && counts.free_trial_announcement_shown === 0) {
        incidents.push({ incidentType: "announcement_zero_today", severity: "warning", title: "白天活动弹窗曝光为 0", details: { counts } })
      }
      if (counts.free_trial_announcement_shown > 50 && counts.daily_survey_submit_success === 0) {
        incidents.push({ incidentType: "survey_submit_zero_with_exposure", severity: "p1", title: "活动曝光充足但今日问卷提交为 0", details: { counts } })
      }
      if (counts.survey_required_block > 20 && counts.survey_required_block / Math.max(counts.daily_survey_submit_success, 1) > 5) {
        incidents.push({ incidentType: "survey_required_block_ratio_high", severity: "p1", title: "问卷阻断与提交比例异常偏高", details: { counts } })
      }
      const fallbackIsGrowing = fallbackPrevious30m > 0 && fallbackRecent30m >= fallbackPrevious30m * 2
      if (fallbackRecent5m >= 5 || fallbackRecent30m >= 20 || (fallbackRecent30m >= 10 && fallbackIsGrowing)) {
        incidents.push({
          incidentType: "real_credit_fallback_high",
          severity: "p1",
          title: "trial 超额扣真实积分 fallback 次数偏高",
          details: {
            fallbackTotalToday: counts.trial_billing_real_credit_fallback,
            recent5m: fallbackRecent5m,
            recent30m: fallbackRecent30m,
            previous30m: fallbackPrevious30m,
            fallbackIsGrowing,
          },
        })
      }

      const usages = await fetchRows("trial_credit_usages", "user_id, amount, created_at", (query) => query.eq("usage_date", today))
      const totalTrialUsed = usages.reduce((sum, row) => sum + Number(row.amount || 0), 0)
      const byUser = new Map()
      let recent30m = 0
      const since = Date.now() - 30 * 60 * 1000
      for (const row of usages) {
        byUser.set(row.user_id, (byUser.get(row.user_id) || 0) + Number(row.amount || 0))
        if (new Date(row.created_at).getTime() >= since) recent30m += Number(row.amount || 0)
      }
      const distinctUsers = byUser.size
      const avgPerUser = distinctUsers > 0 ? totalTrialUsed / distinctUsers : 0
      const maxUserDailyUsage = Math.max(0, ...Array.from(byUser.values()))
      checks.trialUsage = { totalTrialUsed, distinctUsers, avgPerUser, maxUserDailyUsage, recent30m }
      if (avgPerUser > 5000 || maxUserDailyUsage > 10000 || recent30m > 100000) {
        incidents.push({
          incidentType: "trial_usage_p0",
          severity: "p0",
          title: "trial 消耗超过 P0 阈值",
          details: checks.trialUsage,
          autoActions: ["disable_consumption"],
        })
      } else if (avgPerUser > 3000) {
        incidents.push({ incidentType: "trial_avg_per_user_warning", severity: "warning", title: "人均 trial 消耗偏高", details: checks.trialUsage })
      }

      const { data: consumptionFlag } = await supabase
        .from("free_trial_runtime_config")
        .select("config_value")
        .eq("config_key", "free_trial_consumption_enabled")
        .maybeSingle()
      if (consumptionFlag?.config_value?.enabled === false) {
        checks.unexpectedRealCreditDebits = {
          skipped: true,
          reason: "free_trial_consumption_enabled=false; real credit consumption is expected while trial consumption is disabled",
        }
      } else {
        const since30m = minutesAgoIso(30)
        const since60m = minutesAgoIso(60)
        const recentDebits = await fetchRows(
          "credit_transactions",
          "id,user_id,amount,type,description,reference_id,created_at",
          (query) => query
            .lt("amount", 0)
            .gte("created_at", since30m)
            .order("created_at", { ascending: false })
            .limit(200),
        )
        const aiDebits = recentDebits.filter(isAiCreditConsumption)
        const referenceIds = Array.from(new Set(aiDebits.map((row) => row.reference_id).filter(Boolean)))
        let trialUsageReferenceIds = new Set()
        let expectedFallbackReferenceIds = new Set()
        if (referenceIds.length > 0) {
          const [usageRows, fallbackEvents] = await Promise.all([
            fetchRows(
              "trial_credit_usages",
              "reference_id",
              (query) => query
                .in("reference_id", referenceIds)
                .gte("created_at", since60m),
            ),
            fetchRows(
              "campaign_events",
              "metadata",
              (query) => query
                .eq("event_name", "trial_billing_real_credit_fallback")
                .gte("created_at", since60m),
            ),
          ])
          trialUsageReferenceIds = new Set(usageRows.map((row) => row.reference_id).filter(Boolean))
          expectedFallbackReferenceIds = new Set(
            fallbackEvents
              .filter(isExpectedTrialRealCreditFallbackEvent)
              .map((event) => event.metadata?.referenceId)
              .filter((referenceId) => typeof referenceId === "string" && referenceIds.includes(referenceId)),
          )
        }
        const unexpected = aiDebits.filter((row) => (
          !row.reference_id ||
          (!trialUsageReferenceIds.has(row.reference_id) && !expectedFallbackReferenceIds.has(row.reference_id))
        ))
        const nowMs = Date.now()
        const unexpectedRecent5m = unexpected.filter((row) => new Date(row.created_at).getTime() >= nowMs - 5 * 60 * 1000)
        const unexpectedAmount30m = unexpected.reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0)
        const unexpectedAmount5m = unexpectedRecent5m.reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0)
        checks.unexpectedRealCreditDebits = {
          scannedDebits30m: recentDebits.length,
          aiDebits30m: aiDebits.length,
          unexpectedCount30m: unexpected.length,
          unexpectedAmount30m,
          unexpectedUsers30m: new Set(unexpected.map((row) => row.user_id)).size,
          unexpectedCount5m: unexpectedRecent5m.length,
          unexpectedAmount5m,
          unexpectedUsers5m: new Set(unexpectedRecent5m.map((row) => row.user_id)).size,
          matchedTrialUsageReferences: trialUsageReferenceIds.size,
          matchedExpectedFallbackReferences: expectedFallbackReferenceIds.size,
          samples: unexpected.slice(0, 20).map((row) => ({
            id: row.id,
            userId: row.user_id,
            amount: row.amount,
            type: row.type,
            description: row.description,
            referenceId: row.reference_id,
            createdAt: row.created_at,
          })),
          thresholds: {
            p1Count30m: 3,
            p1Amount30m: 200,
            p0Count5m: 10,
            p0Amount5m: 500,
          },
        }
        if (unexpectedRecent5m.length >= 10 || unexpectedAmount5m >= 500) {
          incidents.push({
            incidentType: "unexpected_real_credit_debits",
            severity: "p0",
            title: "近期 AI 功能真实积分扣费未匹配 trial usage",
            details: checks.unexpectedRealCreditDebits,
            autoActions: ["disable_consumption"],
          })
        } else if (unexpected.length >= 3 || unexpectedAmount30m >= 200) {
          incidents.push({
            incidentType: "unexpected_real_credit_debits",
            severity: "p1",
            title: "近期 AI 功能真实积分扣费未匹配 trial usage",
            details: checks.unexpectedRealCreditDebits,
          })
        }
      }

      const surveyRows = await fetchRows("survey_responses", "quality_score", (query) => query.eq("survey_date", today))
      const responses = surveyRows.length
      const avgQualityScore = responses > 0 ? surveyRows.reduce((sum, row) => sum + Number(row.quality_score || 0), 0) / responses : null
      checks.surveyQuality = { responses, avgQualityScore }
      if (responses > 20 && avgQualityScore < 50) {
        incidents.push({ incidentType: "survey_quality_low", severity: "warning", title: "今日问卷平均质量分偏低", details: checks.surveyQuality })
      }
    }

    const monitorEnabled = await getMonitorEnabled()
    const actionSet = new Set(incidents.flatMap((incident) => incident.autoActions || []))
    for (const action of actionSet) {
      if (!monitorEnabled) {
        actions.push({ action, skipped: true, reason: "free_trial_monitor_enabled=false" })
        continue
      }
      if (action === "disable_campaign") {
        await setRuntimeConfig("free_trial_campaign_enabled", false, "monitor auto stop: core tables missing")
        actions.push({ action, success: true })
      }
      if (action === "disable_consumption") {
        await setRuntimeConfig("free_trial_consumption_enabled", false, "monitor auto stop: P0 risk")
        actions.push({ action, success: true })
      }
    }

    let incidentsCreated = 0
    for (const incident of incidents) {
      const autoActionTaken = (incident.autoActions || []).join(", ") || null
      await createIncident(incident, autoActionTaken, incident.severity === "p0" && autoActionTaken ? "mitigated" : "open")
      incidentsCreated += 1
      await notifyWebhook(incident, autoActionTaken)
    }

    await finishRun(runId, "success", checks, actions)
    return { ok: true, status: "success", runId, checks, actions, incidentsCreated }
  } catch (error) {
    await finishRun(runId, "failed", checks, actions, error.message)
    throw error
  }
}

runMonitor()
  .then((result) => {
    console.log(JSON.stringify({
      ok: result.ok,
      status: result.status,
      runId: result.runId,
      incidentsCreated: result.incidentsCreated,
      actions: result.actions,
    }, null, 2))
  })
  .catch((error) => {
    console.error("[monitor-free-trial] failed:", error.message)
    process.exit(1)
  })
