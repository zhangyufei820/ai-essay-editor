import { logger } from "@/lib/logger"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const ALLOWED_CAMPAIGN_EVENTS = [
  "free_trial_announcement_shown",
  "free_trial_announcement_dismissed",
  "free_trial_claim_clicked",
  "free_trial_claim_success",
  "daily_survey_auto_prompt_shown",
  "daily_survey_gate_shown",
  "daily_survey_later_clicked",
  "daily_survey_submit_success",
  "survey_required_block",
  "trial_billing_success",
  "trial_billing_real_credit_fallback",
] as const

export type CampaignEventName = typeof ALLOWED_CAMPAIGN_EVENTS[number]

export interface RecordCampaignEventInput {
  eventName: CampaignEventName
  userId?: string | null
  anonymousId?: string | null
  pagePath?: string | null
  metadata?: Record<string, unknown>
}

export interface CampaignEventOperationResult {
  success: boolean
  error: string | null
}

export const CAMPAIGN_EVENT_METADATA_MAX_BYTES = 10 * 1024

const ALLOWED_CAMPAIGN_EVENT_SET = new Set<string>(ALLOWED_CAMPAIGN_EVENTS)

export function isAllowedCampaignEventName(value: unknown): value is CampaignEventName {
  return typeof value === "string" && ALLOWED_CAMPAIGN_EVENT_SET.has(value)
}

export function getCampaignEventMetadataSize(metadata: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(metadata || {}), "utf8")
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function sanitizeCampaignPagePath(pagePath: unknown): string | null {
  if (typeof pagePath !== "string") return null
  const trimmed = pagePath.trim()
  if (!trimmed) return null

  try {
    const parsed = trimmed.startsWith("http")
      ? new URL(trimmed)
      : new URL(trimmed, "https://shenxiang.school")
    return parsed.pathname.slice(0, 240)
  } catch {
    return trimmed.split("?")[0].slice(0, 240) || null
  }
}

export async function recordCampaignEvent(input: RecordCampaignEventInput): Promise<CampaignEventOperationResult> {
  try {
    if (!isAllowedCampaignEventName(input.eventName)) {
      return { success: false, error: "invalid_event_name" }
    }

    if (!input.userId && !input.anonymousId) {
      return { success: false, error: "missing_actor" }
    }

    if (getCampaignEventMetadataSize(input.metadata || {}) > CAMPAIGN_EVENT_METADATA_MAX_BYTES) {
      return { success: false, error: "metadata_too_large" }
    }

    const { error } = await getSupabaseAdmin()
      .from("campaign_events")
      .insert({
        user_id: input.userId || null,
        anonymous_id: input.userId ? null : input.anonymousId || null,
        event_name: input.eventName,
        page_path: sanitizeCampaignPagePath(input.pagePath),
        metadata: input.metadata || {},
      })

    if (error) throw error
    return { success: true, error: null }
  } catch (error) {
    logger.warn("[campaign-events] record failed", {
      eventName: input.eventName,
      hasUserId: Boolean(input.userId),
      hasAnonymousId: Boolean(input.anonymousId),
      error,
    })
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
