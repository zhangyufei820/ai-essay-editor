import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { isMembershipProduct } from "@/lib/products"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

const DEFAULT_TRIAL_DAYS = 60
const DEFAULT_DAILY_QUOTA = 2000

export type TrialGrantType = "campaign" | "paid_extension" | "referral" | "admin" | "streak_reward"
export type TrialGrantStatus = "active" | "paused" | "expired" | "revoked"

export interface FreeTrialGrant {
  id: string
  user_id: string
  grant_type: TrialGrantType
  start_at: string
  end_at: string
  daily_quota: number
  total_quota: number | null
  status: TrialGrantStatus
  requires_daily_survey: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface UserTrialStatus {
  user_id: string
  active_grant_id: string | null
  trial_start_at: string | null
  trial_end_at: string | null
  daily_quota: number
  requires_daily_survey: boolean
  today_survey_completed: boolean
  today_trial_used: number
  today_trial_remaining: number
  trial_active: boolean
  current_streak_days: number
}

export interface TrialOperationResult<T> {
  success: boolean
  data: T | null
  error: string | null
}

export interface GrantFreeTrialOptions {
  grantType?: TrialGrantType
  days?: number
  dailyQuota?: number
  totalQuota?: number | null
  requiresDailySurvey?: boolean
  metadata?: Record<string, unknown>
  startAt?: Date
}

export interface BatchGrantCampaignTrialOptions extends GrantFreeTrialOptions {
  userIds: string[]
}

export interface BatchGrantCampaignTrialResult {
  requested: number
  granted: number
  skipped: number
  errors: Array<{ userId: string; error: string }>
  grants: FreeTrialGrant[]
}

export interface ExtendPaidMembershipsResult {
  checkedUsers: number
  extended: number
  skipped: number
  errors: Array<{ userId: string; error: string }>
  grants: FreeTrialGrant[]
}

function toIsoDate(date: Date): string {
  return date.toISOString()
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeDays(days?: number): number {
  if (!Number.isFinite(days) || !days || days <= 0) return DEFAULT_TRIAL_DAYS
  return Math.floor(days)
}

function normalizeQuota(dailyQuota?: number): number {
  if (!Number.isFinite(dailyQuota) || !dailyQuota || dailyQuota < 0) return DEFAULT_DAILY_QUOTA
  return Math.floor(dailyQuota)
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function sortGrantsForDisplay(left: FreeTrialGrant, right: FreeTrialGrant): number {
  const leftHasQuota = left.daily_quota > 0
  const rightHasQuota = right.daily_quota > 0
  if (leftHasQuota !== rightHasQuota) return leftHasQuota ? -1 : 1
  if (left.daily_quota !== right.daily_quota) return right.daily_quota - left.daily_quota
  if (left.requires_daily_survey !== right.requires_daily_survey) {
    return left.requires_daily_survey ? 1 : -1
  }
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
}

async function getActiveTrialGrantWithClient(
  supabase: SupabaseClient,
  userId: string,
): Promise<FreeTrialGrant | null> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("free_trial_grants")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .lte("start_at", now)
    .gt("end_at", now)
    .order("start_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as FreeTrialGrant | null) || null
}

async function getActiveTrialGrantsWithClient(
  supabase: SupabaseClient,
  userId: string,
): Promise<FreeTrialGrant[]> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("free_trial_grants")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .lte("start_at", now)
    .gt("end_at", now)

  if (error) throw error
  return (data || []) as FreeTrialGrant[]
}

export async function getActiveTrialGrant(userId: string): Promise<TrialOperationResult<FreeTrialGrant>> {
  try {
    const grant = await getActiveTrialGrantWithClient(getSupabaseAdmin(), userId)
    return { success: true, data: grant, error: null }
  } catch (error) {
    logger.error("[free-trial] getActiveTrialGrant failed", { userId, error })
    return { success: false, data: null, error: getErrorMessage(error) }
  }
}

export async function claimFreeTrial(
  userId: string,
  options: Omit<GrantFreeTrialOptions, "grantType"> = {},
): Promise<TrialOperationResult<FreeTrialGrant>> {
  return grantFreeTrial(userId, {
    ...options,
    grantType: "campaign",
    requiresDailySurvey: options.requiresDailySurvey ?? true,
  })
}

export async function hasPaidMembership(userId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()

    const { data: creditUser, error: creditError } = await supabase
      .from("user_credits")
      .select("user_id, is_pro")
      .eq("user_id", userId)
      .maybeSingle()

    if (creditError) {
      logger.warn("[free-trial] failed to check paid user from user_credits", { userId, error: creditError })
    }
    if (creditUser?.is_pro) return true

    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("product_id")
      .eq("user_id", userId)
      .eq("status", "paid")

    if (orderError) {
      logger.warn("[free-trial] failed to check paid user from orders", { userId, error: orderError })
      return false
    }

    return (orders || []).some((order) => isMembershipProduct(String(order.product_id)))
  } catch (error) {
    logger.warn("[free-trial] hasPaidMembership failed", { userId, error })
    return false
  }
}

export async function grantFreeTrial(
  userId: string,
  options: GrantFreeTrialOptions = {},
): Promise<TrialOperationResult<FreeTrialGrant>> {
  try {
    const supabase = getSupabaseAdmin()
    const existingGrant = await getActiveTrialGrantWithClient(supabase, userId)
    if (existingGrant) {
      return { success: true, data: existingGrant, error: null }
    }

    const grantType = options.grantType || "campaign"
    const startAt = options.startAt || new Date()
    const days = normalizeDays(options.days)
    const dailyQuota = normalizeQuota(options.dailyQuota)
    const requiresDailySurvey = options.requiresDailySurvey ?? grantType !== "paid_extension"

    const { data, error } = await supabase
      .from("free_trial_grants")
      .insert({
        user_id: userId,
        grant_type: grantType,
        start_at: toIsoDate(startAt),
        end_at: toIsoDate(addDays(startAt, days)),
        daily_quota: dailyQuota,
        total_quota: options.totalQuota ?? null,
        status: "active",
        requires_daily_survey: requiresDailySurvey,
        metadata: {
          ...(options.metadata || {}),
          source: options.metadata?.source || "backend_library",
          durationDays: days,
        },
      })
      .select("*")
      .single()

    if (error) throw error
    return { success: true, data: data as FreeTrialGrant, error: null }
  } catch (error) {
    logger.error("[free-trial] grantFreeTrial failed", { userId, options, error })
    return { success: false, data: null, error: getErrorMessage(error) }
  }
}

export async function extendTrialByDays(
  userId: string,
  days: number,
  reason: string,
  metadata: Record<string, unknown> = {},
): Promise<TrialOperationResult<FreeTrialGrant>> {
  try {
    const supabase = getSupabaseAdmin()
    const existingGrant = await getActiveTrialGrantWithClient(supabase, userId)
    if (!existingGrant) {
      return grantFreeTrial(userId, {
        grantType: "admin",
        days,
        metadata: { ...metadata, reason },
      })
    }

    const currentEnd = new Date(existingGrant.end_at)
    const baseEnd = currentEnd > new Date() ? currentEnd : new Date()
    const nextEndAt = toIsoDate(addDays(baseEnd, Math.max(1, Math.floor(days))))

    const { data, error } = await supabase
      .from("free_trial_grants")
      .update({
        end_at: nextEndAt,
        metadata: {
          ...(existingGrant.metadata || {}),
          ...metadata,
          lastExtensionReason: reason,
          lastExtendedAt: new Date().toISOString(),
          lastExtendedDays: Math.max(1, Math.floor(days)),
        },
      })
      .eq("id", existingGrant.id)
      .select("*")
      .single()

    if (error) throw error
    return { success: true, data: data as FreeTrialGrant, error: null }
  } catch (error) {
    logger.error("[free-trial] extendTrialByDays failed", { userId, days, reason, error })
    return { success: false, data: null, error: getErrorMessage(error) }
  }
}

async function setTrialStatus(
  userId: string,
  status: Extract<TrialGrantStatus, "paused" | "revoked">,
  reason?: string,
): Promise<TrialOperationResult<FreeTrialGrant>> {
  try {
    const supabase = getSupabaseAdmin()
    const existingGrant = await getActiveTrialGrantWithClient(supabase, userId)
    if (!existingGrant) {
      return { success: true, data: null, error: null }
    }

    const { data, error } = await supabase
      .from("free_trial_grants")
      .update({
        status,
        metadata: {
          ...(existingGrant.metadata || {}),
          statusReason: reason || null,
          statusChangedAt: new Date().toISOString(),
        },
      })
      .eq("id", existingGrant.id)
      .select("*")
      .single()

    if (error) throw error
    return { success: true, data: data as FreeTrialGrant, error: null }
  } catch (error) {
    logger.error("[free-trial] setTrialStatus failed", { userId, status, reason, error })
    return { success: false, data: null, error: getErrorMessage(error) }
  }
}

export async function pauseTrial(userId: string, reason?: string): Promise<TrialOperationResult<FreeTrialGrant>> {
  return setTrialStatus(userId, "paused", reason)
}

export async function revokeTrial(userId: string, reason?: string): Promise<TrialOperationResult<FreeTrialGrant>> {
  return setTrialStatus(userId, "revoked", reason)
}

export async function getUserTrialStatus(userId: string): Promise<TrialOperationResult<UserTrialStatus>> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("user_trial_status")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()

    if (error) throw error

    const fallback: UserTrialStatus = {
      user_id: userId,
      active_grant_id: null,
      trial_start_at: null,
      trial_end_at: null,
      daily_quota: 0,
      requires_daily_survey: true,
      today_survey_completed: false,
      today_trial_used: 0,
      today_trial_remaining: 0,
      trial_active: false,
      current_streak_days: 0,
    }

    const viewStatus = (data as UserTrialStatus | null) || fallback
    if (viewStatus.daily_quota > 0 || viewStatus.today_trial_remaining > 0) {
      return { success: true, data: viewStatus, error: null }
    }

    const activeGrants = await getActiveTrialGrantsWithClient(supabase, userId)
    const displayGrant = activeGrants.sort(sortGrantsForDisplay)[0]
    if (!displayGrant || displayGrant.daily_quota <= 0) {
      return { success: true, data: viewStatus, error: null }
    }

    const [usageResult, surveyResult] = await Promise.all([
      supabase
        .from("trial_credit_usages")
        .select("amount")
        .eq("user_id", userId)
        .eq("usage_date", todayIsoDate()),
      supabase
        .from("survey_responses")
        .select("id")
        .eq("user_id", userId)
        .eq("survey_date", todayIsoDate())
        .maybeSingle(),
    ])

    if (usageResult.error) throw usageResult.error
    if (surveyResult.error) throw surveyResult.error

    const todayTrialUsed = (usageResult.data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const hasNoSurveyGrant = activeGrants.some((grant) => !grant.requires_daily_survey)
    const todaySurveyCompleted = Boolean(surveyResult.data) || hasNoSurveyGrant

    return {
      success: true,
      data: {
        ...viewStatus,
        active_grant_id: displayGrant.id,
        trial_start_at: displayGrant.start_at,
        trial_end_at: displayGrant.end_at,
        daily_quota: displayGrant.daily_quota,
        requires_daily_survey: hasNoSurveyGrant ? false : displayGrant.requires_daily_survey,
        today_survey_completed: todaySurveyCompleted,
        today_trial_used: todayTrialUsed,
        today_trial_remaining: Math.max(displayGrant.daily_quota - todayTrialUsed, 0),
        trial_active: !displayGrant.requires_daily_survey || todaySurveyCompleted,
      },
      error: null,
    }
  } catch (error) {
    logger.error("[free-trial] getUserTrialStatus failed", { userId, error })
    return { success: false, data: null, error: getErrorMessage(error) }
  }
}

export async function batchGrantCampaignTrial(
  options: BatchGrantCampaignTrialOptions,
): Promise<BatchGrantCampaignTrialResult> {
  const result: BatchGrantCampaignTrialResult = {
    requested: options.userIds.length,
    granted: 0,
    skipped: 0,
    errors: [],
    grants: [],
  }

  const uniqueUserIds = Array.from(new Set(options.userIds.map((id) => id.trim()).filter(Boolean)))
  for (const userId of uniqueUserIds) {
    const existingBeforeGrant = await getActiveTrialGrant(userId)
    const response = await claimFreeTrial(userId, options)
    if (!response.success || !response.data) {
      result.errors.push({ userId, error: response.error || "grant_failed" })
      continue
    }

    result.grants.push(response.data)
    if (existingBeforeGrant.data) {
      result.skipped += 1
    } else {
      result.granted += 1
    }
  }

  return result
}

async function loadPaidMembershipUserIds(supabase: SupabaseClient): Promise<string[]> {
  const userIds = new Set<string>()

  const { data: creditUsers, error: creditError } = await supabase
    .from("user_credits")
    .select("user_id")
    .eq("is_pro", true)

  if (creditError) {
    logger.warn("[free-trial] failed to load paid users from user_credits", creditError)
  }
  for (const row of creditUsers || []) {
    if (row.user_id) userIds.add(String(row.user_id))
  }

  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select("user_id, product_id")
    .eq("status", "paid")

  if (orderError) {
    logger.warn("[free-trial] failed to load paid users from orders", orderError)
  }
  for (const order of orders || []) {
    if (order.user_id && isMembershipProduct(String(order.product_id))) {
      userIds.add(String(order.user_id))
    }
  }

  return Array.from(userIds)
}

export async function extendPaidMembershipsByDays(days: number): Promise<ExtendPaidMembershipsResult> {
  const result: ExtendPaidMembershipsResult = {
    checkedUsers: 0,
    extended: 0,
    skipped: 0,
    errors: [],
    grants: [],
  }

  try {
    const supabase = getSupabaseAdmin()
    const userIds = await loadPaidMembershipUserIds(supabase)
    result.checkedUsers = userIds.length

    for (const userId of userIds) {
      const existingBeforeGrant = await getActiveTrialGrant(userId)
      const response = await grantFreeTrial(userId, {
        grantType: "paid_extension",
        days,
        dailyQuota: DEFAULT_DAILY_QUOTA,
        requiresDailySurvey: false,
        metadata: {
          reason: "paid_membership_extension",
          extensionDays: Math.max(1, Math.floor(days)),
        },
      })

      if (!response.success || !response.data) {
        result.errors.push({ userId, error: response.error || "extension_failed" })
        continue
      }

      result.grants.push(response.data)
      if (existingBeforeGrant.data) {
        result.skipped += 1
      } else {
        result.extended += 1
      }
    }
  } catch (error) {
    logger.error("[free-trial] extendPaidMembershipsByDays failed", { days, error })
    result.errors.push({ userId: "*", error: getErrorMessage(error) })
  }

  return result
}
