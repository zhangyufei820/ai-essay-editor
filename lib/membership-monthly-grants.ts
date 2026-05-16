import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { getProductById, getProductCredits, getProductPriceInCents, isMembershipProduct } from "@/lib/products"

const MAX_CREDITS = 10_000_000
const MEMBERSHIP_PRODUCT_IDS = ["basic", "pro", "premium"] as const

type PaidOrder = {
  id: number
  created_at: string
  user_id: string
  product_id: string
  product_name: string | null
  amount: number | string | null
  status: string
  billing_cycle?: string | null
  credits_amount?: number | null
}

type GrantCandidate = {
  order: PaidOrder
  period: number
  grantAt: Date
  credits: number
  referenceId: string
  description: string
}

export type MonthlyMembershipGrantResult = {
  checkedOrders: number
  dueGrants: number
  granted: number
  skipped: number
  errors: Array<{ referenceId: string; error: string }>
  grants: Array<{
    userId: string
    orderId: number
    productId: string
    period: number
    credits: number
    referenceId: string
    dryRun: boolean
  }>
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("缺少 Supabase 配置")
  return createClient(url, key)
}

function addUtcMonths(date: Date, months: number) {
  const next = new Date(date.getTime())
  const day = next.getUTCDate()
  next.setUTCDate(1)
  next.setUTCMonth(next.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
  next.setUTCDate(Math.min(day, lastDay))
  return next
}

function amountToCents(amount: unknown) {
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) return null
  return Math.round(numeric * 100)
}

function isAnnualMembershipOrder(order: PaidOrder) {
  if (order.billing_cycle === "annual") return true
  if (!isMembershipProduct(order.product_id)) return false

  const paidAmount = amountToCents(order.amount)
  const annualAmount = getProductPriceInCents(order.product_id, "annual")
  const monthlyAmount = getProductPriceInCents(order.product_id, "monthly")
  if (paidAmount == null || annualAmount == null || monthlyAmount == null) return false

  return paidAmount === annualAmount || paidAmount > monthlyAmount * 3
}

function buildGrantCandidates(order: PaidOrder, now: Date): GrantCandidate[] {
  if (!isAnnualMembershipOrder(order)) return []
  const product = getProductById(order.product_id)
  if (!product || product.productType !== "membership") return []

  const purchasedAt = new Date(order.created_at)
  if (Number.isNaN(purchasedAt.getTime())) return []

  const credits = getProductCredits(order.product_id)
  if (!Number.isFinite(credits) || credits <= 0) return []

  const candidates: GrantCandidate[] = []
  for (let period = 1; period < 12; period += 1) {
    const grantAt = addUtcMonths(purchasedAt, period)
    if (grantAt > now) continue
    candidates.push({
      order,
      period,
      grantAt,
      credits,
      referenceId: `membership_monthly:${order.id}:${period}`,
      description: `${order.product_name || product.name}年付第${period + 1}/12期会员积分发放：${credits}积分`,
    })
  }
  return candidates
}

async function hasExistingGrant(supabase: SupabaseClient, candidate: GrantCandidate) {
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("user_id", candidate.order.user_id)
    .eq("reference_id", candidate.referenceId)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}

async function applyGrant(supabase: SupabaseClient, candidate: GrantCandidate) {
  const { data: currentCredits, error: readError } = await supabase
    .from("user_credits")
    .select("credits, is_pro")
    .eq("user_id", candidate.order.user_id)
    .maybeSingle()

  if (readError) throw readError

  const balanceBefore = Number(currentCredits?.credits || 0)
  const balanceAfter = balanceBefore + candidate.credits
  if (balanceAfter > MAX_CREDITS) {
    throw new Error(`积分超限: ${balanceAfter} > ${MAX_CREDITS}`)
  }

  if (currentCredits) {
    const { data: updatedCredits, error: updateError } = await supabase
      .from("user_credits")
      .update({
        credits: balanceAfter,
        is_pro: true,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", candidate.order.user_id)
      .eq("credits", balanceBefore)
      .select("credits")
      .maybeSingle()

    if (updateError) throw updateError
    if (!updatedCredits || Number(updatedCredits.credits) !== balanceAfter) {
      throw new Error("积分更新冲突，请稍后重试")
    }
  } else {
    const { error: insertError } = await supabase
      .from("user_credits")
      .insert({
        user_id: candidate.order.user_id,
        credits: balanceAfter,
        is_pro: true,
      })

    if (insertError) throw insertError
  }

  const { error: txError } = await supabase.from("credit_transactions").insert({
    user_id: candidate.order.user_id,
    amount: candidate.credits,
    type: "membership_grant",
    description: candidate.description,
    reference_id: candidate.referenceId,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    order_id: candidate.order.id,
  })

  if (txError) throw txError
}

export async function grantDueAnnualMembershipCredits(options: {
  dryRun?: boolean
  now?: Date
  supabase?: SupabaseClient
} = {}): Promise<MonthlyMembershipGrantResult> {
  const supabase = options.supabase || getSupabaseAdmin()
  const now = options.now || new Date()
  const result: MonthlyMembershipGrantResult = {
    checkedOrders: 0,
    dueGrants: 0,
    granted: 0,
    skipped: 0,
    errors: [],
    grants: [],
  }

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .eq("status", "paid")
    .in("product_id", [...MEMBERSHIP_PRODUCT_IDS])
    .gte("created_at", addUtcMonths(now, -13).toISOString())
    .order("created_at", { ascending: true })

  if (error) throw error

  result.checkedOrders = orders?.length || 0

  for (const order of (orders || []) as PaidOrder[]) {
    const candidates = buildGrantCandidates(order, now)
    result.dueGrants += candidates.length

    for (const candidate of candidates) {
      try {
        if (await hasExistingGrant(supabase, candidate)) {
          result.skipped += 1
          continue
        }

        result.grants.push({
          userId: candidate.order.user_id,
          orderId: candidate.order.id,
          productId: candidate.order.product_id,
          period: candidate.period,
          credits: candidate.credits,
          referenceId: candidate.referenceId,
          dryRun: Boolean(options.dryRun),
        })

        if (!options.dryRun) {
          await applyGrant(supabase, candidate)
        }
        result.granted += 1
      } catch (error) {
        result.errors.push({
          referenceId: candidate.referenceId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  return result
}
