import {
  createMonitorIncident,
  disableFreeTrialCampaign,
  disableFreeTrialConsumption,
  getAllRuntimeFlags,
} from "@/lib/free-trial-runtime-config"
import { logger } from "@/lib/logger"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

type Severity = "info" | "warning" | "p1" | "p0"

export interface MonitorIncidentDraft {
  incidentType: string
  severity: Severity
  title: string
  details?: Record<string, unknown>
  autoActions?: Array<"disable_campaign" | "disable_consumption" | "disable_auto_prompt">
}

export interface FreeTrialMonitorResult {
  ok: boolean
  status: "success" | "failed"
  checks: Record<string, unknown>
  actions: Array<Record<string, unknown>>
  incidentsCreated: number
  incidents: MonitorIncidentDraft[]
  runId: string | null
  error?: string
}

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

const RUNTIME_FLAG_KEYS = ["campaignEnabled", "consumptionEnabled", "autoPromptEnabled"] as const

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString()
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isChinaDaytime(now = new Date()): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(now))
  return hour >= 8 && hour <= 23
}

async function countRows(table: string, filters?: (query: any) => any): Promise<number> {
  let query = getSupabaseAdmin().from(table).select("*", { count: "exact", head: true })
  if (filters) query = filters(query)
  const { count, error } = await query
  if (error) throw error
  return count || 0
}

async function fetchRows<T = Record<string, unknown>>(table: string, select = "*", filters?: (query: any) => any): Promise<T[]> {
  let query = getSupabaseAdmin().from(table).select(select)
  if (filters) query = filters(query)
  const { data, error } = await query
  if (error) throw error
  return (data || []) as T[]
}

function addIncident(
  incidents: MonitorIncidentDraft[],
  incident: MonitorIncidentDraft,
) {
  incidents.push(incident)
}

async function createMonitorRun(): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("monitor_runs")
      .insert({ status: "running", checks_json: {}, actions_json: {} })
      .select("id")
      .single()
    if (error) throw error
    return String(data.id)
  } catch (error) {
    logger.warn("[free-trial-monitor] create monitor run failed", error)
    return null
  }
}

async function finishMonitorRun(
  runId: string | null,
  status: "success" | "failed",
  checks: Record<string, unknown>,
  actions: Array<Record<string, unknown>>,
  errorMessage?: string,
) {
  if (!runId) return
  try {
    await getSupabaseAdmin()
      .from("monitor_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        checks_json: checks,
        actions_json: { actions },
        error_message: errorMessage || null,
      })
      .eq("id", runId)
  } catch (error) {
    logger.warn("[free-trial-monitor] finish monitor run failed", { runId, error })
  }
}

async function notifyWebhook(incident: MonitorIncidentDraft, autoActionTaken: string | null) {
  const webhookUrl = process.env.MONITOR_WEBHOOK_URL
  if (!webhookUrl || !["p0", "p1"].includes(incident.severity)) return

  try {
    await fetch(webhookUrl, {
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
  } catch (error) {
    logger.warn("[free-trial-monitor] webhook notify failed", { title: incident.title, error })
  }
}

async function recentHealthFailures(): Promise<number> {
  try {
    const runs = await fetchRows<{ checks_json: Record<string, any> }>(
      "monitor_runs",
      "checks_json",
      (query) => query
        .neq("status", "running")
        .order("started_at", { ascending: false })
        .limit(3),
    )
    return runs.filter((run) => run.checks_json?.health?.ok === false).length
  } catch {
    return 0
  }
}

async function checkHealth(checks: Record<string, unknown>, incidents: MonitorIncidentDraft[]) {
  const baseUrl = process.env.FREE_TRIAL_MONITOR_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://shenxiang.school"
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/health`, { cache: "no-store" })
    checks.health = { ok: response.ok, status: response.status }
    if (!response.ok) {
      const failures = await recentHealthFailures()
      addIncident(incidents, {
        incidentType: "health_check_failed",
        severity: failures >= 2 ? "p0" : "p1",
        title: failures >= 2 ? "站点健康检查连续失败" : "站点健康检查失败",
        details: { status: response.status, recentFailuresBeforeThisRun: failures },
      })
    }
  } catch (error) {
    const failures = await recentHealthFailures()
    checks.health = { ok: false, error: getErrorMessage(error), recentFailuresBeforeThisRun: failures }
    addIncident(incidents, {
      incidentType: "health_check_failed",
      severity: failures >= 2 ? "p0" : "p1",
      title: failures >= 2 ? "站点健康检查连续失败" : "站点健康检查失败",
      details: { error: getErrorMessage(error), recentFailuresBeforeThisRun: failures },
    })
  }
}

async function checkRuntimeFlagsEndpoint(checks: Record<string, unknown>, incidents: MonitorIncidentDraft[]) {
  const baseUrl = process.env.FREE_TRIAL_MONITOR_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://shenxiang.school"
  const url = `${baseUrl.replace(/\/$/, "")}/api/free-trial/runtime-flags`

  try {
    const response = await fetch(url, { cache: "no-store" })
    const contentType = response.headers.get("content-type") || ""
    let payload: Record<string, unknown> | null = null

    if (contentType.includes("application/json")) {
      payload = await response.json()
    }

    const hasValidShape = Boolean(payload) && RUNTIME_FLAG_KEYS.every((key) => typeof payload?.[key] === "boolean")
    checks.runtimeFlagsEndpoint = {
      ok: response.ok && hasValidShape,
      status: response.status,
      contentType,
      payload: payload
        ? Object.fromEntries(RUNTIME_FLAG_KEYS.map((key) => [key, payload?.[key]]))
        : null,
    }

    if (!response.ok || !hasValidShape) {
      addIncident(incidents, {
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
    checks.runtimeFlagsEndpoint = { ok: false, url, error: getErrorMessage(error) }
    addIncident(incidents, {
      incidentType: "runtime_flags_endpoint_unavailable",
      severity: "p1",
      title: "runtime flags API 不可用或响应异常",
      details: { url, error: getErrorMessage(error) },
    })
  }
}

async function checkTables(checks: Record<string, unknown>, incidents: MonitorIncidentDraft[]) {
  const results: Record<string, boolean> = {}
  const missing: string[] = []

  for (const table of CORE_TABLES) {
    try {
      await countRows(table)
      results[table] = true
    } catch {
      results[table] = false
      missing.push(table)
    }
  }

  checks.tables = { ok: missing.length === 0, results, missing }
  if (missing.length > 0) {
    addIncident(incidents, {
      incidentType: "core_tables_missing",
      severity: "p0",
      title: "共创体验核心数据表缺失",
      details: { missing },
      autoActions: ["disable_campaign", "disable_consumption"],
    })
  }
}

async function checkGrants(checks: Record<string, unknown>, incidents: MonitorIncidentDraft[]) {
  const [
    campaignActive,
    paidExtensionActive,
    paidExtensionNoSurvey,
    paidExtensionRequiresSurvey,
  ] = await Promise.all([
    countRows("free_trial_grants", (query) => query.eq("grant_type", "campaign").eq("status", "active")),
    countRows("free_trial_grants", (query) => query.eq("grant_type", "paid_extension").eq("status", "active")),
    countRows("free_trial_grants", (query) => query.eq("grant_type", "paid_extension").eq("status", "active").eq("requires_daily_survey", false)),
    countRows("free_trial_grants", (query) => query.eq("grant_type", "paid_extension").eq("status", "active").eq("requires_daily_survey", true)),
  ])

  checks.grants = {
    campaignActive,
    paidExtensionActive,
    paidExtensionNoSurvey,
    paidExtensionRequiresSurvey,
  }

  if (campaignActive < 500) {
    addIncident(incidents, {
      incidentType: "campaign_active_count_low",
      severity: "p1",
      title: "campaign active 数量低于预期",
      details: { campaignActive, expectedAtLeast: 500 },
    })
  }

  if (paidExtensionActive < 49 || paidExtensionNoSurvey < 49 || paidExtensionRequiresSurvey > 0) {
    addIncident(incidents, {
      incidentType: "paid_extension_survey_guard_failed",
      severity: "p0",
      title: "付费会员顺延免问卷保护异常",
      details: { paidExtensionActive, paidExtensionNoSurvey, paidExtensionRequiresSurvey },
      autoActions: ["disable_consumption"],
    })
  }
}

async function checkDuplicateGrants(checks: Record<string, unknown>, incidents: MonitorIncidentDraft[]) {
  const rows = await fetchRows<{ user_id: string; grant_type: string }>(
    "free_trial_grants",
    "user_id, grant_type",
    (query) => query.in("grant_type", ["campaign", "paid_extension"]).eq("status", "active"),
  )
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.grant_type}:${row.user_id}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  const duplicates = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .slice(0, 50)
    .map(([key, count]) => {
      const [grantType, userId] = key.split(":")
      return { grantType, userId, count }
    })

  checks.duplicateGrants = { duplicateCount: duplicates.length, duplicates }
  if (duplicates.length > 0) {
    addIncident(incidents, {
      incidentType: "duplicate_active_grants",
      severity: "p1",
      title: "发现重复 active grant，需要人工处理",
      details: { duplicates },
    })
  }
}

async function checkFunnel(checks: Record<string, unknown>, incidents: MonitorIncidentDraft[]) {
  const today = todayIsoDate()
  const events = await fetchRows<{ event_name: string; created_at: string }>(
    "campaign_events",
    "event_name, created_at",
    (query) => query.eq("event_date", today).in("event_name", WATCH_EVENT_NAMES),
  )

  const counts = Object.fromEntries(WATCH_EVENT_NAMES.map((eventName) => [eventName, 0])) as Record<string, number>
  const recentAnnouncement = events.some((event) =>
    event.event_name === "free_trial_announcement_shown" &&
    new Date(event.created_at).getTime() >= Date.now() - 30 * 60 * 1000
  )
  for (const event of events) counts[event.event_name] = (counts[event.event_name] || 0) + 1

  checks.funnel = { counts, recentAnnouncement }

  if (isChinaDaytime() && !recentAnnouncement) {
    addIncident(incidents, {
      incidentType: "announcement_zero_30m",
      severity: "warning",
      title: "白天 30 分钟内活动弹窗曝光为 0",
      details: { counts, windowMinutes: 30 },
    })
  }

  if (counts.free_trial_announcement_shown > 50 && counts.daily_survey_submit_success === 0) {
    addIncident(incidents, {
      incidentType: "survey_submit_zero_with_exposure",
      severity: "p1",
      title: "活动曝光充足但今日问卷提交为 0",
      details: { counts },
    })
  }

  const submitters = counts.daily_survey_submit_success
  const blocks = counts.survey_required_block
  if (blocks > 20 && blocks / Math.max(submitters, 1) > 5) {
    addIncident(incidents, {
      incidentType: "survey_required_block_ratio_high",
      severity: "p1",
      title: "问卷阻断与提交比例异常偏高",
      details: { blocks, submitters, ratio: blocks / Math.max(submitters, 1) },
    })
  }

  if ((counts.trial_billing_real_credit_fallback || 0) > 50) {
    addIncident(incidents, {
      incidentType: "real_credit_fallback_high",
      severity: "p1",
      title: "trial 超额扣真实积分 fallback 次数偏高",
      details: { fallbackCount: counts.trial_billing_real_credit_fallback, todo: "无法自动判断用户投诉或误扣，需要人工复核。" },
    })
  }
}

async function checkTrialUsage(checks: Record<string, unknown>, incidents: MonitorIncidentDraft[]) {
  const today = todayIsoDate()
  const usages = await fetchRows<{ user_id: string; amount: number; created_at: string }>(
    "trial_credit_usages",
    "user_id, amount, created_at",
    (query) => query.eq("usage_date", today),
  )

  const totalTrialUsed = usages.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const byUser = new Map<string, number>()
  let recent30m = 0
  const recentSince = Date.now() - 30 * 60 * 1000
  for (const row of usages) {
    byUser.set(row.user_id, (byUser.get(row.user_id) || 0) + Number(row.amount || 0))
    if (new Date(row.created_at).getTime() >= recentSince) {
      recent30m += Number(row.amount || 0)
    }
  }

  const distinctUsers = byUser.size
  const avgPerUser = distinctUsers > 0 ? totalTrialUsed / distinctUsers : 0
  const maxUserDailyUsage = Math.max(0, ...Array.from(byUser.values()))
  const maxUser = Array.from(byUser.entries()).sort((a, b) => b[1] - a[1])[0] || null

  checks.trialUsage = {
    totalTrialUsed,
    distinctUsers,
    avgPerUser,
    maxUserDailyUsage,
    maxUser: maxUser ? { userId: maxUser[0], amount: maxUser[1] } : null,
    recent30m,
  }

  if (avgPerUser > 5000) {
    addIncident(incidents, {
      incidentType: "trial_avg_per_user_p0",
      severity: "p0",
      title: "人均 trial 消耗超过 P0 阈值",
      details: { avgPerUser, threshold: 5000, totalTrialUsed, distinctUsers },
      autoActions: ["disable_consumption"],
    })
  } else if (avgPerUser > 3000) {
    addIncident(incidents, {
      incidentType: "trial_avg_per_user_warning",
      severity: "warning",
      title: "人均 trial 消耗偏高",
      details: { avgPerUser, threshold: 3000, totalTrialUsed, distinctUsers },
    })
  }

  if (maxUserDailyUsage > 10000) {
    addIncident(incidents, {
      incidentType: "single_user_trial_usage_p0",
      severity: "p0",
      title: "单用户今日 trial 消耗超过 P0 阈值",
      details: { maxUserDailyUsage, threshold: 10000, maxUser: maxUser ? { userId: maxUser[0], amount: maxUser[1] } : null },
      autoActions: ["disable_consumption"],
    })
  }

  if (recent30m > 100000) {
    addIncident(incidents, {
      incidentType: "trial_usage_spike_30m_p0",
      severity: "p0",
      title: "30 分钟 trial 消耗异常暴涨",
      details: { recent30m, threshold: 100000 },
      autoActions: ["disable_consumption"],
    })
  }
}

async function checkSurveyQuality(checks: Record<string, unknown>, incidents: MonitorIncidentDraft[]) {
  const today = todayIsoDate()
  const rows = await fetchRows<{ quality_score: number }>(
    "survey_responses",
    "quality_score",
    (query) => query.eq("survey_date", today),
  )
  const responses = rows.length
  const scores = rows.map((row) => Number(row.quality_score || 0))
  const avgQualityScore = responses > 0
    ? scores.reduce((sum, score) => sum + score, 0) / responses
    : null
  const minQualityScore = responses > 0 ? Math.min(...scores) : null

  checks.surveyQuality = { responses, avgQualityScore, minQualityScore }
  if (responses > 20 && avgQualityScore != null && avgQualityScore < 50) {
    addIncident(incidents, {
      incidentType: "survey_quality_low",
      severity: "warning",
      title: "今日问卷平均质量分偏低",
      details: { responses, avgQualityScore, minQualityScore },
    })
  }
}

async function checkAdminDashboard(checks: Record<string, unknown>) {
  checks.adminDashboard = {
    skipped: true,
    reason: "admin dashboard requires logged-in admin session; cron monitor validates database-backed metrics directly",
  }
}

async function executeAutoActions(
  incidents: MonitorIncidentDraft[],
  monitorEnabled: boolean,
): Promise<Array<Record<string, unknown>>> {
  const actions: Array<Record<string, unknown>> = []
  const actionSet = new Set<string>()

  for (const incident of incidents) {
    for (const action of incident.autoActions || []) {
      actionSet.add(action)
    }
  }

  for (const action of actionSet) {
    if (!monitorEnabled) {
      actions.push({ action, skipped: true, reason: "free_trial_monitor_enabled=false" })
      continue
    }

    if (action === "disable_campaign") {
      const result = await disableFreeTrialCampaign("监控自动止损：关闭活动弹窗/领取", { source: "monitor", action })
      actions.push({ action, success: result.success, error: result.error })
    }

    if (action === "disable_consumption") {
      const result = await disableFreeTrialConsumption("监控自动止损：关闭 trial 免费消耗", { source: "monitor", action })
      actions.push({ action, success: result.success, error: result.error })
    }
  }

  return actions
}

async function persistIncidents(incidents: MonitorIncidentDraft[], actions: Array<Record<string, unknown>>) {
  let created = 0
  for (const incident of incidents) {
    const actionNames = (incident.autoActions || []).join(", ")
    const relatedActions = actions.filter((action) => incident.autoActions?.includes(action.action as any))
    const autoActionTaken = actionNames || null
    const result = await createMonitorIncident({
      incidentType: incident.incidentType,
      severity: incident.severity,
      title: incident.title,
      details: {
        ...(incident.details || {}),
        relatedActions,
      },
      autoActionTaken,
      status: incident.severity === "p0" && autoActionTaken ? "mitigated" : "open",
    })
    if (result.success) created += 1
    await notifyWebhook(incident, autoActionTaken)
  }
  return created
}

export async function runFreeTrialMonitor(): Promise<FreeTrialMonitorResult> {
  const runId = await createMonitorRun()
  const checks: Record<string, unknown> = {}
  const incidents: MonitorIncidentDraft[] = []
  let actions: Array<Record<string, unknown>> = []

  try {
    const runtimeFlags = await getAllRuntimeFlags()
    checks.runtimeFlags = {
      campaignEnabled: runtimeFlags.campaignEnabled,
      consumptionEnabled: runtimeFlags.consumptionEnabled,
      autoPromptEnabled: runtimeFlags.autoPromptEnabled,
      monitorEnabled: runtimeFlags.monitorEnabled,
    }

    await checkHealth(checks, incidents)
    await checkRuntimeFlagsEndpoint(checks, incidents)
    await checkTables(checks, incidents)

    const tableCheck = checks.tables as { ok?: boolean } | undefined
    if (tableCheck?.ok !== false) {
      await checkGrants(checks, incidents)
      await checkDuplicateGrants(checks, incidents)
      await checkFunnel(checks, incidents)
      await checkTrialUsage(checks, incidents)
      await checkSurveyQuality(checks, incidents)
      await checkAdminDashboard(checks)
      checks.paidUserBlockDetection = {
        skipped: true,
        reason: "campaign_events metadata currently does not reliably tag paid users",
      }
    }

    actions = await executeAutoActions(incidents, runtimeFlags.monitorEnabled)
    const incidentsCreated = await persistIncidents(incidents, actions)
    await finishMonitorRun(runId, "success", checks, actions)

    return {
      ok: true,
      status: "success",
      checks,
      actions,
      incidentsCreated,
      incidents,
      runId,
    }
  } catch (error) {
    const message = getErrorMessage(error)
    logger.error("[free-trial-monitor] run failed", error)
    await createMonitorIncident({
      incidentType: "monitor_run_failed",
      severity: "p1",
      title: "共创体验监控任务执行失败",
      details: { error: message },
    })
    await finishMonitorRun(runId, "failed", checks, actions, message)
    return {
      ok: false,
      status: "failed",
      checks,
      actions,
      incidentsCreated: 1,
      incidents,
      runId,
      error: message,
    }
  }
}
