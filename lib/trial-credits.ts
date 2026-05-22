import { spendRealCredits, type BillingAuditMetadata } from "@/lib/credits"
import { recordCampaignEvent } from "@/lib/campaign-events"
import { getActiveTrialGrant, getUserTrialStatus, grantFreeTrial, hasPaidMembership, type FreeTrialGrant } from "@/lib/free-trial"
import { getAllRuntimeFlags, isRuntimeConsumptionEnabled } from "@/lib/free-trial-runtime-config"
import { logger } from "@/lib/logger"
import { hasSubmittedSurveyToday } from "@/lib/surveys"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export interface TrialCreditOperationResult<T> {
  success: boolean
  data: T | null
  error: string | null
}

export interface TrialCreditUsage {
  id: string
  user_id: string
  grant_id: string | null
  usage_date: string
  action_type: string
  amount: number
  reference_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface RecordTrialCreditUsageInput {
  userId: string
  grantId: string
  amount: number
  actionType: string
  referenceId?: string
  metadata?: Record<string, unknown>
}

export interface ConsumeWithTrialCreditsInput {
  userId: string
  amount: number
  actionType: string
  referenceId?: string
  metadata?: Record<string, unknown>
  description?: string
  billingMetadata?: BillingAuditMetadata
  spendRealCredits?: boolean
}

export interface CanUseTrialCreditsResult {
  allowed: boolean
  blocked: boolean
  reason: "ok" | "invalid_amount" | "no_active_trial" | "trial_disabled" | "survey_required" | "insufficient_trial_credits" | "system_error"
  grantId: string | null
  remainingToday: number
  trialUsedAvailable: number
}

export interface ConsumeWithTrialCreditsResult {
  success: boolean
  blocked: boolean
  reason: string | null
  shouldUseRealCredits: boolean
  trialUsed: number
  realCreditsUsed: number
  remainingToday: number
  grantId: string | null
  realCreditsSpent: boolean
  error: string | null
  trialDisabledReason?: string | null
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function normalizeAmount(amount: number): number | null {
  if (!Number.isInteger(amount) || amount <= 0) return null
  return amount
}

async function getGrantOrNull(userId: string): Promise<FreeTrialGrant | null> {
  return getBestActiveGrantForConsumption(userId)
}

async function ensureGrantForOpenCampaign(userId: string): Promise<FreeTrialGrant | null> {
  const existingGrant = await getGrantOrNull(userId)
  if (existingGrant) return existingGrant

  const flags = await getAllRuntimeFlags()
  if (!flags.campaignEnabled) return null

  const paidUser = await hasPaidMembership(userId)
  const grantResult = await grantFreeTrial(userId, {
    grantType: paidUser ? "paid_extension" : "campaign",
    days: 60,
    dailyQuota: 2000,
    requiresDailySurvey: !paidUser,
    metadata: {
      source: paidUser ? "auto_trial_consumption_paid_extension" : "auto_trial_consumption_campaign",
      reason: "auto_grant_before_trial_consumption",
    },
  })

  if (!grantResult.success || !grantResult.data) {
    logger.warn("[trial-credits] auto grant before consumption failed", { userId, error: grantResult.error })
    return null
  }

  return grantResult.data
}

function sortGrantsForTrialConsumption(left: FreeTrialGrant, right: FreeTrialGrant): number {
  const leftHasQuota = left.daily_quota > 0
  const rightHasQuota = right.daily_quota > 0
  if (leftHasQuota !== rightHasQuota) return leftHasQuota ? -1 : 1
  if (left.daily_quota !== right.daily_quota) return right.daily_quota - left.daily_quota
  if (left.requires_daily_survey !== right.requires_daily_survey) {
    return left.requires_daily_survey ? 1 : -1
  }
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
}

function hasActiveNoSurveyGrant(grants: FreeTrialGrant[]): boolean {
  return grants.some((grant) => !grant.requires_daily_survey)
}

async function getActiveGrants(userId: string): Promise<FreeTrialGrant[]> {
  const now = new Date().toISOString()
  const { data, error } = await getSupabaseAdmin()
    .from("free_trial_grants")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .lte("start_at", now)
    .gt("end_at", now)

  if (error) throw error
  return (data || []) as FreeTrialGrant[]
}

async function getBestActiveGrantForConsumption(userId: string): Promise<FreeTrialGrant | null> {
  try {
    const grants = await getActiveGrants(userId)
    return grants.sort(sortGrantsForTrialConsumption)[0] || null
  } catch (error) {
    logger.warn("[trial-credits] active grant list failed, falling back to free-trial helper", { userId, error })
    const grantResult = await getActiveTrialGrant(userId)
    return grantResult.success ? grantResult.data : null
  }
}

async function shouldRequireSurveyForGrant(userId: string, grant: FreeTrialGrant): Promise<TrialCreditOperationResult<boolean>> {
  try {
    if (!grant.requires_daily_survey) {
      return { success: true, data: false, error: null }
    }

    const grants = await getActiveGrants(userId)
    if (hasActiveNoSurveyGrant(grants)) {
      return { success: true, data: false, error: null }
    }

    const submitted = await hasSubmittedSurveyToday(userId)
    if (!submitted.success) {
      return { success: false, data: true, error: submitted.error }
    }

    return { success: true, data: !submitted.data, error: null }
  } catch (error) {
    logger.error("[trial-credits] shouldRequireSurveyForGrant failed", { userId, grantId: grant.id, error })
    return { success: false, data: true, error: getErrorMessage(error) }
  }
}

export async function getTodayTrialUsage(userId: string): Promise<TrialCreditOperationResult<number>> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("trial_credit_usages")
      .select("amount")
      .eq("user_id", userId)
      .eq("usage_date", todayIsoDate())

    if (error) throw error
    const total = (data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0)
    return { success: true, data: total, error: null }
  } catch (error) {
    logger.error("[trial-credits] getTodayTrialUsage failed", { userId, error })
    return { success: false, data: 0, error: getErrorMessage(error) }
  }
}

export async function getTodayTrialRemaining(userId: string): Promise<TrialCreditOperationResult<number>> {
  try {
    const grant = await ensureGrantForOpenCampaign(userId)
    if (!grant) return { success: true, data: 0, error: null }

    const usage = await getTodayTrialUsage(userId)
    const used = usage.data || 0
    return { success: true, data: Math.max(grant.daily_quota - used, 0), error: null }
  } catch (error) {
    logger.error("[trial-credits] getTodayTrialRemaining failed", { userId, error })
    return { success: false, data: 0, error: getErrorMessage(error) }
  }
}

export async function shouldRequireSurveyBeforeTrialUse(userId: string): Promise<TrialCreditOperationResult<boolean>> {
  try {
    const grant = await ensureGrantForOpenCampaign(userId)
    if (!grant) {
      return { success: true, data: false, error: null }
    }
    return shouldRequireSurveyForGrant(userId, grant)
  } catch (error) {
    logger.error("[trial-credits] shouldRequireSurveyBeforeTrialUse failed", { userId, error })
    return { success: false, data: true, error: getErrorMessage(error) }
  }
}

export async function canUseTrialCredits(
  userId: string,
  amount: number,
): Promise<TrialCreditOperationResult<CanUseTrialCreditsResult>> {
  try {
    const normalizedAmount = normalizeAmount(amount)
    if (!normalizedAmount) {
      return {
        success: true,
        data: {
          allowed: false,
          blocked: true,
          reason: "invalid_amount",
          grantId: null,
          remainingToday: 0,
          trialUsedAvailable: 0,
        },
        error: null,
      }
    }

    const runtimeConsumption = await isRuntimeConsumptionEnabled()
    if (!runtimeConsumption.enabled) {
      return {
        success: true,
        data: {
          allowed: false,
          blocked: false,
          reason: "trial_disabled",
          grantId: null,
          remainingToday: 0,
          trialUsedAvailable: 0,
        },
        error: null,
      }
    }

    const grant = await getGrantOrNull(userId)
    if (!grant) {
      return {
        success: true,
        data: {
          allowed: false,
          blocked: false,
          reason: "no_active_trial",
          grantId: null,
          remainingToday: 0,
          trialUsedAvailable: 0,
        },
        error: null,
      }
    }

    const surveyRequired = await shouldRequireSurveyBeforeTrialUse(userId)
    if (surveyRequired.data) {
      return {
        success: true,
        data: {
          allowed: false,
          blocked: true,
          reason: "survey_required",
          grantId: grant.id,
          remainingToday: 0,
          trialUsedAvailable: 0,
        },
        error: null,
      }
    }

    const remaining = await getTodayTrialRemaining(userId)
    const remainingToday = Math.max(remaining.data || 0, 0)
    return {
      success: true,
      data: {
        allowed: remainingToday >= normalizedAmount,
        blocked: false,
        reason: remainingToday >= normalizedAmount ? "ok" : "insufficient_trial_credits",
        grantId: grant.id,
        remainingToday,
        trialUsedAvailable: Math.min(remainingToday, normalizedAmount),
      },
      error: null,
    }
  } catch (error) {
    logger.error("[trial-credits] canUseTrialCredits failed", { userId, amount, error })
    return {
      success: false,
      data: {
        allowed: false,
        blocked: true,
        reason: "system_error",
        grantId: null,
        remainingToday: 0,
        trialUsedAvailable: 0,
      },
      error: getErrorMessage(error),
    }
  }
}

export async function recordTrialCreditUsage(
  input: RecordTrialCreditUsageInput,
): Promise<TrialCreditOperationResult<TrialCreditUsage>> {
  try {
    const amount = normalizeAmount(input.amount)
    if (!amount) {
      return { success: false, data: null, error: "invalid_amount" }
    }

    const { data, error } = await getSupabaseAdmin()
      .from("trial_credit_usages")
      .insert({
        user_id: input.userId,
        grant_id: input.grantId,
        usage_date: todayIsoDate(),
        action_type: input.actionType,
        amount,
        reference_id: input.referenceId || null,
        metadata: input.metadata || {},
      })
      .select("*")
      .single()

    if (error) throw error
    return { success: true, data: data as TrialCreditUsage, error: null }
  } catch (error) {
    logger.error("[trial-credits] recordTrialCreditUsage failed", { input, error })
    return { success: false, data: null, error: getErrorMessage(error) }
  }
}

async function tryRecordLegacyTrialTransaction(input: {
  userId: string
  amount: number
  actionType: string
  referenceId?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", input.userId)
      .maybeSingle()

    const balance = Number(credits?.credits || 0)
    const { error } = await supabase.from("credit_transactions").insert({
      user_id: input.userId,
      amount: 0,
      type: "trial_consumption",
      description: `共创体验额度抵扣 ${input.amount} 积分`,
      reference_id: input.referenceId || null,
      balance_before: balance,
      balance_after: balance,
      billing_metadata: {
        ...(input.metadata || {}),
        actionType: input.actionType,
        trialCreditsUsed: input.amount,
        chargedCredits: 0,
        usageSource: "free_trial",
      },
    })

    if (error) {
      logger.warn("[trial-credits] legacy trial transaction skipped", {
        userId: input.userId,
        code: error.code,
        message: error.message,
      })
    }
  } catch (error) {
    logger.warn("[trial-credits] legacy trial transaction failed", { userId: input.userId, error })
  }
}

async function tryRecordTrialBillingEvents(input: {
  userId: string
  grantId: string | null
  trialUsed: number
  realCreditsUsed: number
  remainingToday: number
  actionType: string
  referenceId?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await recordCampaignEvent({
      eventName: "trial_billing_success",
      userId: input.userId,
      metadata: {
        grantId: input.grantId,
        trialUsed: input.trialUsed,
        realCreditsUsed: input.realCreditsUsed,
        remainingToday: input.remainingToday,
        actionType: input.actionType,
        referenceId: input.referenceId || null,
        feature: input.metadata?.feature || null,
      },
    })

    if (input.realCreditsUsed > 0) {
      await recordCampaignEvent({
        eventName: "trial_billing_real_credit_fallback",
        userId: input.userId,
        metadata: {
          grantId: input.grantId,
          trialUsed: input.trialUsed,
          realCreditsUsed: input.realCreditsUsed,
          actionType: input.actionType,
          referenceId: input.referenceId || null,
          feature: input.metadata?.feature || null,
        },
      })
    }
  } catch (error) {
    logger.warn("[trial-credits] campaign billing event failed", { userId: input.userId, error })
  }
}

export async function consumeWithTrialCredits(
  input: ConsumeWithTrialCreditsInput,
): Promise<ConsumeWithTrialCreditsResult> {
  const amount = normalizeAmount(input.amount)
  const baseResult: ConsumeWithTrialCreditsResult = {
    success: false,
    blocked: false,
    reason: null,
    shouldUseRealCredits: false,
    trialUsed: 0,
    realCreditsUsed: 0,
    remainingToday: 0,
    grantId: null,
    realCreditsSpent: false,
    error: null,
  }

  if (!amount) {
    return { ...baseResult, blocked: true, reason: "invalid_amount", error: "invalid_amount" }
  }

  try {
    const runtimeConsumption = await isRuntimeConsumptionEnabled()
    if (!runtimeConsumption.enabled) {
      const disabledBillingMetadata = {
        ...(input.billingMetadata || {}),
        rawProviderMetadata: {
          ...(input.billingMetadata?.rawProviderMetadata || {}),
          trialDisabledReason: runtimeConsumption.reason,
        },
      }

      if (input.spendRealCredits === false) {
        return {
          ...baseResult,
          success: true,
          shouldUseRealCredits: true,
          realCreditsUsed: amount,
          reason: runtimeConsumption.reason || "trial_consumption_disabled",
        }
      }

      const spent = await spendRealCredits(
        input.userId,
        amount,
        input.actionType,
        input.description || `${input.actionType} 消费 ${amount} 积分`,
        input.referenceId,
        { ...disabledBillingMetadata, skipTrialBilling: true },
      )

      return {
        ...baseResult,
        success: spent,
        shouldUseRealCredits: true,
        realCreditsUsed: amount,
        realCreditsSpent: spent,
        reason: spent ? runtimeConsumption.reason || "trial_consumption_disabled" : "real_credit_spend_failed",
        error: spent ? null : "real_credit_spend_failed",
        trialDisabledReason: runtimeConsumption.reason || "trial_consumption_disabled",
      }
    }

    const grant = await ensureGrantForOpenCampaign(input.userId)
    if (!grant) {
      if (input.spendRealCredits === false) {
        return {
          ...baseResult,
          success: true,
          shouldUseRealCredits: true,
          realCreditsUsed: amount,
          reason: "no_active_trial",
        }
      }

      const spent = await spendRealCredits(
        input.userId,
        amount,
        input.actionType,
        input.description || `${input.actionType} 消费 ${amount} 积分`,
        input.referenceId,
        { ...(input.billingMetadata || {}), skipTrialBilling: true },
      )

      return {
        ...baseResult,
        success: spent,
        shouldUseRealCredits: true,
        realCreditsUsed: amount,
        realCreditsSpent: spent,
        reason: spent ? "no_active_trial" : "real_credit_spend_failed",
        error: spent ? null : "real_credit_spend_failed",
      }
    }

    const surveyRequired = await shouldRequireSurveyForGrant(input.userId, grant)
    if (surveyRequired.data) {
      return {
        ...baseResult,
        success: true,
        blocked: true,
        reason: "survey_required",
        grantId: grant.id,
      }
    }

    const remainingResult = await getTodayTrialRemaining(input.userId)
    const remainingToday = Math.max(remainingResult.data || 0, 0)
    const trialUsed = Math.min(remainingToday, amount)
    const realCreditsUsed = amount - trialUsed

    if (trialUsed > 0) {
      const recorded = await recordTrialCreditUsage({
        userId: input.userId,
        grantId: grant.id,
        amount: trialUsed,
        actionType: input.actionType,
        referenceId: input.referenceId,
        metadata: input.metadata,
      })

      if (!recorded.success) {
        return {
          ...baseResult,
          success: false,
          reason: "trial_usage_record_failed",
          grantId: grant.id,
          remainingToday,
          error: recorded.error || "trial_usage_record_failed",
        }
      }

      await tryRecordLegacyTrialTransaction({
        userId: input.userId,
        amount: trialUsed,
        actionType: input.actionType,
        referenceId: input.referenceId,
        metadata: input.metadata,
      })
    }

    let realCreditsSpent = false
    if (realCreditsUsed > 0) {
      if (input.spendRealCredits === false) {
        return {
          ...baseResult,
          success: true,
          shouldUseRealCredits: true,
          trialUsed,
          realCreditsUsed,
          remainingToday: 0,
          grantId: grant.id,
          reason: "partial_real_credits_required",
        }
      }

      realCreditsSpent = await spendRealCredits(
        input.userId,
        realCreditsUsed,
        input.actionType,
        input.description || `${input.actionType} 超出体验额度，扣除真实积分 ${realCreditsUsed}`,
        input.referenceId,
        {
          ...(input.billingMetadata || {}),
          rawProviderMetadata: {
            ...(input.billingMetadata?.rawProviderMetadata || {}),
            trialCreditsUsed: trialUsed,
            realCreditsUsed,
          },
          chargedCredits: realCreditsUsed,
          skipTrialBilling: true,
        },
      )

      if (!realCreditsSpent) {
        return {
          ...baseResult,
          success: false,
          shouldUseRealCredits: true,
          trialUsed,
          realCreditsUsed,
          remainingToday: Math.max(remainingToday - trialUsed, 0),
          grantId: grant.id,
          reason: "real_credit_spend_failed",
          error: "real_credit_spend_failed",
        }
      }
    }

    const finalRemainingToday = Math.max(remainingToday - trialUsed, 0)
    await tryRecordTrialBillingEvents({
      userId: input.userId,
      grantId: grant.id,
      trialUsed,
      realCreditsUsed,
      remainingToday: finalRemainingToday,
      actionType: input.actionType,
      referenceId: input.referenceId,
      metadata: input.metadata,
    })

    return {
      success: true,
      blocked: false,
      reason: null,
      shouldUseRealCredits: realCreditsUsed > 0,
      trialUsed,
      realCreditsUsed,
      remainingToday: finalRemainingToday,
      grantId: grant.id,
      realCreditsSpent,
      error: null,
    }
  } catch (error) {
    logger.error("[trial-credits] consumeWithTrialCredits failed", { input, error })
    return { ...baseResult, blocked: true, reason: "system_error", error: getErrorMessage(error) }
  }
}
