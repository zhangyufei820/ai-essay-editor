import { getFreeTrialFlags, type FreeTrialFlags } from "@/lib/free-trial-flags"
import { logger } from "@/lib/logger"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const RUNTIME_CONFIG_KEYS = {
  campaign: "free_trial_campaign_enabled",
  consumption: "free_trial_consumption_enabled",
  autoPrompt: "free_trial_auto_prompt_enabled",
  monitor: "free_trial_monitor_enabled",
} as const

export type RuntimeConfigKey = typeof RUNTIME_CONFIG_KEYS[keyof typeof RUNTIME_CONFIG_KEYS]

export interface RuntimeConfigRow {
  id: string
  config_key: RuntimeConfigKey | string
  config_value: Record<string, unknown>
  description: string | null
  updated_by: string | null
  updated_at: string
  created_at: string
}

export interface RuntimeFlagSnapshot {
  campaignEnabled: boolean
  consumptionEnabled: boolean
  autoPromptEnabled: boolean
  monitorEnabled: boolean
  env: FreeTrialFlags
  runtime: Record<string, RuntimeConfigRow | null>
}

export interface RuntimeConfigResult<T> {
  success: boolean
  data: T | null
  error: string | null
}

export type MonitorSeverity = "info" | "warning" | "p1" | "p0"
export type MonitorIncidentStatus = "open" | "mitigated" | "resolved" | "ignored"

export interface CreateMonitorIncidentInput {
  incidentType: string
  severity: MonitorSeverity
  title: string
  details?: Record<string, unknown>
  autoActionTaken?: string | null
  status?: MonitorIncidentStatus
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readEnabled(value: unknown, fallback: boolean): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback
  const enabled = (value as Record<string, unknown>).enabled
  return typeof enabled === "boolean" ? enabled : fallback
}

function nowIso(): string {
  return new Date().toISOString()
}

export async function getRuntimeConfig(
  key: RuntimeConfigKey | string,
): Promise<RuntimeConfigResult<RuntimeConfigRow>> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("free_trial_runtime_config")
      .select("*")
      .eq("config_key", key)
      .maybeSingle()

    if (error) throw error
    return { success: true, data: (data as RuntimeConfigRow | null) || null, error: null }
  } catch (error) {
    logger.warn("[free-trial-runtime-config] getRuntimeConfig failed", { key, error })
    return { success: false, data: null, error: getErrorMessage(error) }
  }
}

export async function getBooleanRuntimeFlag(
  key: RuntimeConfigKey | string,
  fallback: boolean,
): Promise<boolean> {
  const result = await getRuntimeConfig(key)
  if (!result.success || !result.data) return fallback
  return readEnabled(result.data.config_value, fallback)
}

export async function setRuntimeConfig(
  key: RuntimeConfigKey | string,
  value: Record<string, unknown>,
  updatedBy: string,
): Promise<RuntimeConfigResult<RuntimeConfigRow>> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("free_trial_runtime_config")
      .upsert({
        config_key: key,
        config_value: value,
        updated_by: updatedBy,
        updated_at: nowIso(),
      }, { onConflict: "config_key" })
      .select("*")
      .single()

    if (error) throw error
    return { success: true, data: data as RuntimeConfigRow, error: null }
  } catch (error) {
    logger.error("[free-trial-runtime-config] setRuntimeConfig failed", { key, updatedBy, error })
    return { success: false, data: null, error: getErrorMessage(error) }
  }
}

export async function createMonitorIncident(
  input: CreateMonitorIncidentInput,
): Promise<RuntimeConfigResult<Record<string, unknown>>> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("monitor_incidents")
      .insert({
        incident_type: input.incidentType,
        severity: input.severity,
        status: input.status || "open",
        title: input.title,
        details: input.details || {},
        auto_action_taken: input.autoActionTaken || null,
        resolved_at: input.status === "mitigated" || input.status === "resolved" ? nowIso() : null,
      })
      .select("*")
      .single()

    if (error) throw error
    return { success: true, data: data as Record<string, unknown>, error: null }
  } catch (error) {
    logger.error("[free-trial-runtime-config] createMonitorIncident failed", { input, error })
    return { success: false, data: null, error: getErrorMessage(error) }
  }
}

async function disableRuntimeFlag(
  key: RuntimeConfigKey,
  reason: string,
  details: Record<string, unknown> = {},
  action: string,
): Promise<RuntimeConfigResult<RuntimeConfigRow>> {
  const disabledAt = nowIso()
  const configResult = await setRuntimeConfig(
    key,
    {
      enabled: false,
      reason,
      disabledAt,
      details,
    },
    "monitor",
  )

  await createMonitorIncident({
    incidentType: action,
    severity: "p0",
    status: configResult.success ? "mitigated" : "open",
    title: reason,
    details: {
      ...details,
      configKey: key,
      disabledAt,
      configWriteSuccess: configResult.success,
      configError: configResult.error,
    },
    autoActionTaken: `${key}=false`,
  })

  return configResult
}

export function getEnvFallbackForRuntimeKey(key: RuntimeConfigKey | string): boolean {
  const envFlags = getFreeTrialFlags()
  if (key === RUNTIME_CONFIG_KEYS.consumption) return envFlags.consumptionEnabled
  if (key === RUNTIME_CONFIG_KEYS.campaign) return envFlags.campaignEnabled
  if (key === RUNTIME_CONFIG_KEYS.autoPrompt) return true
  if (key === RUNTIME_CONFIG_KEYS.monitor) return true
  return true
}

export async function disableFreeTrialConsumption(
  reason: string,
  details: Record<string, unknown> = {},
): Promise<RuntimeConfigResult<RuntimeConfigRow>> {
  return disableRuntimeFlag(RUNTIME_CONFIG_KEYS.consumption, reason, details, "disable_free_trial_consumption")
}

export async function disableFreeTrialCampaign(
  reason: string,
  details: Record<string, unknown> = {},
): Promise<RuntimeConfigResult<RuntimeConfigRow>> {
  return disableRuntimeFlag(RUNTIME_CONFIG_KEYS.campaign, reason, details, "disable_free_trial_campaign")
}

export async function disableDailySurveyAutoPrompt(
  reason: string,
  details: Record<string, unknown> = {},
): Promise<RuntimeConfigResult<RuntimeConfigRow>> {
  return disableRuntimeFlag(RUNTIME_CONFIG_KEYS.autoPrompt, reason, details, "disable_daily_survey_auto_prompt")
}

export async function getAllRuntimeFlags(): Promise<RuntimeFlagSnapshot> {
  const env = getFreeTrialFlags()
  const keys = Object.values(RUNTIME_CONFIG_KEYS)
  const rows = await Promise.all(keys.map((key) => getRuntimeConfig(key)))
  const runtime = keys.reduce<Record<string, RuntimeConfigRow | null>>((acc, key, index) => {
    acc[key] = rows[index].data
    return acc
  }, {})

  const campaignRuntime = runtime[RUNTIME_CONFIG_KEYS.campaign]
  const consumptionRuntime = runtime[RUNTIME_CONFIG_KEYS.consumption]
  const autoPromptRuntime = runtime[RUNTIME_CONFIG_KEYS.autoPrompt]
  const monitorRuntime = runtime[RUNTIME_CONFIG_KEYS.monitor]

  return {
    campaignEnabled: env.campaignEnabled && readEnabled(campaignRuntime?.config_value, true),
    consumptionEnabled: env.consumptionEnabled && readEnabled(consumptionRuntime?.config_value, true),
    autoPromptEnabled: readEnabled(autoPromptRuntime?.config_value, true),
    monitorEnabled: readEnabled(monitorRuntime?.config_value, true),
    env,
    runtime,
  }
}

export async function isRuntimeConsumptionEnabled(): Promise<{
  enabled: boolean
  reason: string | null
}> {
  const envFlags = getFreeTrialFlags()
  if (!envFlags.consumptionEnabled) {
    return { enabled: false, reason: "env_free_trial_consumption_disabled" }
  }

  const runtimeEnabled = await getBooleanRuntimeFlag(RUNTIME_CONFIG_KEYS.consumption, true)
  if (!runtimeEnabled) {
    return { enabled: false, reason: "runtime_free_trial_consumption_disabled" }
  }

  return { enabled: true, reason: null }
}
