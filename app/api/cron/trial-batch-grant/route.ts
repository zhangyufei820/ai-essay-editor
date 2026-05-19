import { NextResponse, type NextRequest } from "next/server"
import { logAdminAction, verifyAdminToken } from "@/lib/admin-auth"
import {
  batchGrantCampaignTrial,
  extendPaidMembershipsByDays,
  type BatchGrantCampaignTrialResult,
  type ExtendPaidMembershipsResult,
} from "@/lib/free-trial"
import { isFreeTrialBatchGrantEnabled } from "@/lib/free-trial-flags"
import { logger } from "@/lib/logger"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type TrialBatchGrantBody = {
  dryRun?: boolean
  includeExistingUsers?: boolean
  extendPaidMemberships?: boolean
  days?: number
}

type DryRunResult = {
  usersScanned: number
  trialsGranted: number
  paidMembershipsExtended: number
  errors: Array<{ scope: string; error: string }>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.TRIAL_BATCH_CRON_SECRET
  if (!secret) return false
  const authorization = request.headers.get("authorization") || ""
  const headerSecret = request.headers.get("x-cron-secret") || ""
  return authorization === `Bearer ${secret}` || headerSecret === secret
}

async function isAdminAuthorized(request: NextRequest): Promise<boolean> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  if (!token) return false
  return verifyAdminToken(token)
}

async function assertAuthorized(request: NextRequest): Promise<"cron" | "admin" | null> {
  if (isCronAuthorized(request)) return "cron"
  if (await isAdminAuthorized(request)) return "admin"
  return null
}

function normalizeBody(body: unknown): Required<TrialBatchGrantBody> {
  const data = isPlainObject(body) ? body : {}
  return {
    dryRun: data.dryRun !== false,
    includeExistingUsers: data.includeExistingUsers === true,
    extendPaidMemberships: data.extendPaidMemberships === true,
    days: Number.isFinite(Number(data.days)) && Number(data.days) > 0
      ? Math.min(Math.floor(Number(data.days)), 365)
      : 60,
  }
}

async function loadExistingUserIds(): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("user_credits")
    .select("user_id")
    .order("updated_at", { ascending: false })

  if (error) throw error
  return Array.from(new Set((data || []).map((row) => String(row.user_id || "")).filter(Boolean)))
}

async function loadPaidUserIds(): Promise<string[]> {
  const supabase = getSupabaseAdmin()
  const userIds = new Set<string>()

  const { data: credits, error: creditsError } = await supabase
    .from("user_credits")
    .select("user_id")
    .eq("is_pro", true)
  if (creditsError) throw creditsError
  for (const row of credits || []) {
    if (row.user_id) userIds.add(String(row.user_id))
  }

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("user_id, product_id")
    .eq("status", "paid")
    .in("product_id", ["basic", "pro", "premium", "enterprise", "campus"])
  if (ordersError) throw ordersError
  for (const row of orders || []) {
    if (row.user_id) userIds.add(String(row.user_id))
  }

  return Array.from(userIds)
}

async function loadActiveTrialUserIds(): Promise<Set<string>> {
  const now = new Date().toISOString()
  const { data, error } = await getSupabaseAdmin()
    .from("free_trial_grants")
    .select("user_id")
    .eq("status", "active")
    .lte("start_at", now)
    .gt("end_at", now)

  if (error) throw error
  return new Set((data || []).map((row) => String(row.user_id || "")).filter(Boolean))
}

async function runDryRun(options: Required<TrialBatchGrantBody>): Promise<DryRunResult> {
  const result: DryRunResult = {
    usersScanned: 0,
    trialsGranted: 0,
    paidMembershipsExtended: 0,
    errors: [],
  }

  try {
    const existingUsers = options.includeExistingUsers ? await loadExistingUserIds() : []
    const activeTrialUsers = await loadActiveTrialUserIds()
    result.usersScanned = existingUsers.length
    result.trialsGranted = existingUsers.filter((userId) => !activeTrialUsers.has(userId)).length
  } catch (error) {
    result.errors.push({ scope: "existing_users", error: error instanceof Error ? error.message : String(error) })
  }

  if (options.extendPaidMemberships) {
    try {
      const paidUsers = await loadPaidUserIds()
      const activeTrialUsers = await loadActiveTrialUserIds()
      result.paidMembershipsExtended = paidUsers.filter((userId) => !activeTrialUsers.has(userId)).length
      result.usersScanned = Math.max(result.usersScanned, paidUsers.length)
    } catch (error) {
      result.errors.push({ scope: "paid_memberships", error: error instanceof Error ? error.message : String(error) })
    }
  }

  return result
}

async function runWrite(options: Required<TrialBatchGrantBody>): Promise<{
  usersScanned: number
  campaign: BatchGrantCampaignTrialResult | null
  paid: ExtendPaidMembershipsResult | null
  errors: Array<{ scope: string; error: string }>
}> {
  const errors: Array<{ scope: string; error: string }> = []
  let campaign: BatchGrantCampaignTrialResult | null = null
  let paid: ExtendPaidMembershipsResult | null = null
  let usersScanned = 0

  if (options.includeExistingUsers) {
    try {
      const userIds = await loadExistingUserIds()
      usersScanned = userIds.length
      campaign = await batchGrantCampaignTrial({
        userIds,
        days: options.days,
        dailyQuota: 2000,
        requiresDailySurvey: true,
        metadata: { source: "trial_batch_grant" },
      })
    } catch (error) {
      errors.push({ scope: "campaign_grants", error: error instanceof Error ? error.message : String(error) })
    }
  }

  if (options.extendPaidMemberships) {
    paid = await extendPaidMembershipsByDays(options.days)
    usersScanned = Math.max(usersScanned, paid.checkedUsers)
  }

  return { usersScanned, campaign, paid, errors }
}

export async function POST(request: NextRequest) {
  const authMode = await assertAuthorized(request)
  if (!authMode) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  try {
    const body = normalizeBody(await request.json().catch(() => ({})))

    if (!body.includeExistingUsers && !body.extendPaidMemberships) {
      return NextResponse.json(
        {
          ok: false,
          dryRun: body.dryRun,
          usersScanned: 0,
          trialsGranted: 0,
          paidMembershipsExtended: 0,
          errors: [{ scope: "request", error: "至少开启 includeExistingUsers 或 extendPaidMemberships" }],
        },
        { status: 400 },
      )
    }

    if (body.dryRun) {
      const dryRun = await runDryRun(body)
      return NextResponse.json({
        ok: dryRun.errors.length === 0,
        dryRun: true,
        usersScanned: dryRun.usersScanned,
        trialsGranted: dryRun.trialsGranted,
        paidMembershipsExtended: dryRun.paidMembershipsExtended,
        errors: dryRun.errors,
      })
    }

    if (!isFreeTrialBatchGrantEnabled()) {
      return NextResponse.json(
        {
          ok: false,
          dryRun: false,
          usersScanned: 0,
          trialsGranted: 0,
          paidMembershipsExtended: 0,
          errors: [{ scope: "feature_flag", error: "FREE_TRIAL_BATCH_GRANT_ENABLED=false，禁止实际批量发放" }],
        },
        { status: 403 },
      )
    }

    const result = await runWrite(body)
    if (authMode === "admin") {
      const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || null
      await logAdminAction("trial_batch_grant", token, {
        includeExistingUsers: body.includeExistingUsers,
        extendPaidMemberships: body.extendPaidMemberships,
        days: body.days,
      })
    }

    const errors = [
      ...result.errors,
      ...(result.campaign?.errors || []).map((error) => ({ scope: `campaign:${error.userId}`, error: error.error })),
      ...(result.paid?.errors || []).map((error) => ({ scope: `paid:${error.userId}`, error: error.error })),
    ]

    return NextResponse.json({
      ok: errors.length === 0,
      dryRun: false,
      usersScanned: result.usersScanned,
      trialsGranted: result.campaign?.granted || 0,
      paidMembershipsExtended: result.paid?.extended || 0,
      errors,
    })
  } catch (error) {
    logger.error("[trial-batch-grant] unexpected error", error)
    return NextResponse.json(
      {
        ok: false,
        dryRun: true,
        usersScanned: 0,
        trialsGranted: 0,
        paidMembershipsExtended: 0,
        errors: [{ scope: "server", error: "批量发放失败" }],
      },
      { status: 500 },
    )
  }
}
