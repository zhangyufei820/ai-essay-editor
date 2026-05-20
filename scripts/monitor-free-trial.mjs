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
    for (const table of CORE_TABLES) {
      try {
        await countRows(table)
      } catch {
        missing.push(table)
      }
    }
    checks.tables = { ok: missing.length === 0, missing }
    if (missing.length > 0) {
      incidents.push({
        incidentType: "core_tables_missing",
        severity: "p0",
        title: "共创体验核心数据表缺失",
        details: { missing },
        autoActions: ["disable_campaign", "disable_consumption"],
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
      checks.funnel = { counts }
      if (isChinaDaytime() && counts.free_trial_announcement_shown === 0) {
        incidents.push({ incidentType: "announcement_zero_today", severity: "warning", title: "白天活动弹窗曝光为 0", details: { counts } })
      }
      if (counts.free_trial_announcement_shown > 50 && counts.daily_survey_submit_success === 0) {
        incidents.push({ incidentType: "survey_submit_zero_with_exposure", severity: "p1", title: "活动曝光充足但今日问卷提交为 0", details: { counts } })
      }
      if (counts.survey_required_block > 20 && counts.survey_required_block / Math.max(counts.daily_survey_submit_success, 1) > 5) {
        incidents.push({ incidentType: "survey_required_block_ratio_high", severity: "p1", title: "问卷阻断与提交比例异常偏高", details: { counts } })
      }
      if (counts.trial_billing_real_credit_fallback > 50) {
        incidents.push({ incidentType: "real_credit_fallback_high", severity: "p1", title: "trial 超额扣真实积分 fallback 次数偏高", details: { count: counts.trial_billing_real_credit_fallback } })
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
