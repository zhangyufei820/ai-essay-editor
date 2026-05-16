import { createClient } from "@supabase/supabase-js"
import {
  ASSUMED_PROVIDER_INPUT_VCOINS_PER_1M,
  ASSUMED_PROVIDER_OUTPUT_VCOINS_PER_1M,
  PRICING_VERSION,
  TEXT_INPUT_CREDITS_PER_1K,
  TEXT_OUTPUT_CREDITS_PER_1K,
} from "@/lib/billing-config"

export interface UserCredits {
  credits: number
  is_pro?: boolean
  total_earned?: number
  total_spent?: number
}

export interface CreditTransaction {
  id: string
  amount: number
  type: string
  description: string
  created_at: string
}

export interface BillingAuditMetadata {
  userId?: string
  actionType?: string
  appId?: string | null
  workflowId?: string | null
  modelId?: string | null
  feature?: "text" | "image2" | "image" | "suno" | string
  requestedAppId?: string | null
  requestedWorkflowId?: string | null
  requestedModelId?: string | null
  upstreamProvider?: string | null
  upstreamModel?: string | null
  upstreamGroup?: string | null
  upstreamRequestId?: string | null
  rawProviderMetadata?: Record<string, unknown> | null
  pricingVersion?: string
  usageSource?: string
  rawUsageSource?: string
  estimated?: boolean
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  textInputCreditsPer1K?: number
  textOutputCreditsPer1K?: number
  chargedCredits?: number
  balanceBefore?: number
  balanceAfter?: number
  assumedProviderInputVcoinsPer1M?: number
  assumedProviderOutputVcoinsPer1M?: number
  providerTotalPrice?: string | number | null
  providerCurrency?: string | null
  rawUsageJson?: Record<string, unknown> | null
  finishReason?: string | null
  latency?: number | null
  timeToFirstToken?: number | null
  conversationId?: string | null
  messageId?: string | null
  requestId?: string | null
  createdAt?: string
  description?: string
}

export type BillingAuditInput = BillingAuditMetadata & {
  rawUsage?: Record<string, unknown> | null
}

export interface CreditSummary {
  total_earned: number
  total_spent: number
}

export function summarizeCreditTransactions(
  transactions: Array<Pick<CreditTransaction, 'amount'> | null | undefined>
): CreditSummary {
  return transactions.reduce<CreditSummary>((summary, transaction) => {
    const amount = transaction?.amount || 0
    if (amount > 0) {
      summary.total_earned += amount
    } else if (amount < 0) {
      summary.total_spent += Math.abs(amount)
    }
    return summary
  }, { total_earned: 0, total_spent: 0 })
}

function normalizeBillingUsageSource(source?: string, estimated?: boolean): string {
  if (!source) return estimated ? "estimated" : "dify"
  if (source === "fallback_total_as_output" || source === "no_output" || source === "fixed") return source
  if (source === "estimated_from_output_text") return "estimated"
  if (estimated) return "estimated"
  return "dify"
}

function readRawProviderMetadata(metadata?: BillingAuditInput | null): Record<string, unknown> | null {
  const fromRawUsage = metadata?.rawUsage
  const provider = metadata?.rawProviderMetadata
  if (fromRawUsage && Object.keys(fromRawUsage).length > 0) {
    return {
      ...(provider || {}),
      usage: fromRawUsage,
    }
  }
  return provider || null
}

export function createBillingAuditMetadata(input: BillingAuditInput): BillingAuditMetadata {
  const rawUsage =
    input.rawUsageJson ||
    input.rawUsage ||
    (input.rawProviderMetadata?.usage && typeof input.rawProviderMetadata.usage === "object"
      ? input.rawProviderMetadata.usage as Record<string, unknown>
      : null)
  const rawProviderTotalPrice = input.providerTotalPrice ?? rawUsage?.total_price ?? rawUsage?.totalPrice ?? null
  const providerTotalPrice =
    typeof rawProviderTotalPrice === "string" || typeof rawProviderTotalPrice === "number"
      ? rawProviderTotalPrice
      : null
  const providerCurrency = input.providerCurrency ?? (typeof rawUsage?.currency === "string" ? rawUsage.currency : null)
  const finishReason =
    input.finishReason ??
    (typeof input.rawProviderMetadata?.finishReason === "string" ? input.rawProviderMetadata.finishReason : null)
  const latency =
    input.latency ??
    (typeof input.rawProviderMetadata?.latency === "number" ? input.rawProviderMetadata.latency : null)
  const timeToFirstToken =
    input.timeToFirstToken ??
    (typeof input.rawProviderMetadata?.timeToFirstToken === "number" ? input.rawProviderMetadata.timeToFirstToken : null)
  const rawUsageSource = input.rawUsageSource || input.usageSource
  const estimated = input.estimated ?? (
    typeof input.rawProviderMetadata?.estimated === "boolean"
      ? input.rawProviderMetadata.estimated
      : undefined
  )

  return {
    ...input,
    actionType: input.actionType || input.feature || undefined,
    appId: input.appId ?? input.requestedAppId ?? null,
    workflowId: input.workflowId ?? input.requestedWorkflowId ?? null,
    modelId: input.modelId ?? input.requestedModelId ?? null,
    requestedAppId: input.requestedAppId ?? input.appId ?? null,
    requestedWorkflowId: input.requestedWorkflowId ?? input.workflowId ?? null,
    requestedModelId: input.requestedModelId ?? input.modelId ?? null,
    rawProviderMetadata: readRawProviderMetadata(input),
    pricingVersion: input.pricingVersion || PRICING_VERSION,
    usageSource: normalizeBillingUsageSource(input.usageSource, estimated),
    rawUsageSource,
    estimated: estimated ?? false,
    promptTokens: input.promptTokens ?? 0,
    completionTokens: input.completionTokens ?? 0,
    totalTokens: input.totalTokens ?? 0,
    textInputCreditsPer1K: input.textInputCreditsPer1K ?? TEXT_INPUT_CREDITS_PER_1K,
    textOutputCreditsPer1K: input.textOutputCreditsPer1K ?? TEXT_OUTPUT_CREDITS_PER_1K,
    chargedCredits: input.chargedCredits ?? 0,
    assumedProviderInputVcoinsPer1M: input.assumedProviderInputVcoinsPer1M ?? ASSUMED_PROVIDER_INPUT_VCOINS_PER_1M,
    assumedProviderOutputVcoinsPer1M: input.assumedProviderOutputVcoinsPer1M ?? ASSUMED_PROVIDER_OUTPUT_VCOINS_PER_1M,
    providerTotalPrice,
    providerCurrency,
    rawUsageJson: rawUsage || null,
    finishReason,
    latency,
    timeToFirstToken,
    conversationId: input.conversationId ?? null,
    messageId: input.messageId ?? null,
    requestId: input.requestId ?? input.upstreamRequestId ?? null,
    createdAt: input.createdAt || new Date().toISOString(),
    description: input.description,
  }
}

function enrichBillingMetadata(
  userId: string,
  amount: number,
  type: string,
  description: string,
  balanceBefore: number,
  balanceAfter: number,
  referenceId?: string,
  billingMetadata?: BillingAuditMetadata,
): BillingAuditMetadata {
  return createBillingAuditMetadata({
    ...(billingMetadata || {}),
    userId: billingMetadata?.userId || userId,
    actionType: billingMetadata?.actionType || type,
    chargedCredits: billingMetadata?.chargedCredits ?? Math.abs(amount),
    balanceBefore,
    balanceAfter,
    requestId: billingMetadata?.requestId || referenceId || null,
    conversationId: billingMetadata?.conversationId || referenceId || null,
    description: billingMetadata?.description || description,
  })
}

// 🔥 使用 Service Role Key 创建管理员客户端（绕过所有 RLS）
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("缺少 Supabase 配置")
  }
  return createClient(url, key)
}

async function loadCreditSummary(userId: string, currentBalance: number): Promise<CreditSummary> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("amount")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[积分系统] 获取累计积分失败:", error)
    return {
      total_earned: currentBalance,
      total_spent: 0,
    }
  }

  const summary = summarizeCreditTransactions(data || [])

  // 兼容历史老账号：如果没有任何交易流水，把当前余额视为累计获得
  if ((data || []).length === 0 && currentBalance > 0) {
    summary.total_earned = currentBalance
  }

  return summary
}

// 获取用户积分
export async function getUserCredits(
  userId: string,
  options: { includeTotals?: boolean } = {},
): Promise<UserCredits | null> {
  const supabase = getSupabaseAdmin()
  const includeTotals = options.includeTotals ?? false

  const { data, error } = await supabase
    .from("user_credits")
    .select("credits, is_pro")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("[积分系统] 获取用户积分失败:", error)
    return null
  }

  if (!data) {
    console.log(`[积分系统] 用户 ${userId} 无积分记录，自动初始化 1000 积分`)
    const { data: created, error: createError } = await supabase
      .from("user_credits")
      .upsert({ user_id: userId, credits: 1000, is_pro: false })
      .select("credits, is_pro")
      .single()

    if (createError) {
      console.error("[积分系统] 初始化用户积分失败:", createError)
      return null
    }

    if (!includeTotals) {
      return created
    }

    return {
      ...created,
      total_earned: 1000,
      total_spent: 0,
    }
  }

  if (!includeTotals) {
    return data
  }

  const summary = await loadCreditSummary(userId, data.credits || 0)
  return {
    ...data,
    ...summary,
  }
}

// 记录积分交易
async function recordTransaction(
  supabase: any,
  userId: string,
  amount: number,
  type: string,
  description: string,
  balanceBefore: number,
  balanceAfter: number,
  referenceId?: string,
  billingMetadata?: BillingAuditMetadata,
): Promise<void> {
  const basePayload = {
    user_id: userId,
    amount: amount,
    type: type,
    description: description,
    reference_id: referenceId,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
  }
  const normalizedBillingMetadata = enrichBillingMetadata(
    userId,
    amount,
    type,
    description,
    balanceBefore,
    balanceAfter,
    referenceId,
    billingMetadata,
  )
  const payload = { ...basePayload, billing_metadata: normalizedBillingMetadata }

  try {
    const { error } = await supabase.from("credit_transactions").insert(payload)

    if (error) {
      const message = String(error.message || "")
      const missingMetadataColumn =
        error.code === "PGRST204" ||
        error.code === "42703" ||
        message.includes("billing_metadata") ||
        message.includes("Could not find")

      if (missingMetadataColumn) {
        console.warn("[积分系统] billing_metadata 字段不存在，已回退为基础交易流水")
        await supabase.from("credit_transactions").insert(basePayload)
        return
      }
    }

    if (error) {
      console.log("[积分系统] 记录交易失败（不影响主流程）:", error)
    }
  } catch (error) {
    // 如果表不存在，静默失败（不影响主流程）
    console.log("[积分系统] 记录交易失败（表可能不存在）:", error)
  }
}

// 消费积分
export async function spendCredits(
  userId: string,
  amount: number,
  type: string,
  description: string,
  referenceId?: string,
  billingMetadata?: BillingAuditMetadata,
): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (referenceId) {
    console.log(`[积分系统] 扣费参考ID: ${referenceId}`)
  }
  if (billingMetadata) {
    console.log("[Billing Audit] 用户扣费审计字段:", JSON.stringify(billingMetadata))
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    console.error(`[积分系统] 扣费金额非法 userId=${userId}, amount=${amount}, type=${type}`)
    return false
  }

  // 检查积分是否足够
  const credits = await getUserCredits(userId)
  if (!credits || credits.credits < amount) {
    console.error(`[积分系统] 扣除积分失败：余额不足 userId=${userId}, amount=${amount}, balance=${credits?.credits ?? "null"}, type=${type}`)
    return false
  }

  const balanceBefore = credits.credits
  const balanceAfter = credits.credits - amount

  // 🔥 使用条件更新防止并发竞态：只有积分未变化时才扣费
  const { data: updatedCreditRow, error: updateError } = await supabase
    .from("user_credits")
    .update({
      credits: balanceAfter,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("credits", credits.credits)  // 🔥 关键：只有在积分未变时才更新
    .gte("credits", amount)
    .select("credits")
    .maybeSingle()

  if (updateError) {
    console.error("[积分系统] 扣除积分失败:", updateError)
    return false
  }

  if (!updatedCreditRow || updatedCreditRow.credits !== balanceAfter) {
    console.error(`[积分系统] 扣除积分失败：并发条件更新未生效 userId=${userId}, amount=${amount}, expectedBefore=${credits.credits}, expectedAfter=${balanceAfter}, type=${type}`)
    return false
  }

  // 记录交易
  await recordTransaction(
    supabase,
    userId,
    -amount,
    type,
    description,
    balanceBefore,
    balanceAfter,
    referenceId,
    billingMetadata,
  )
  
  console.log(`[积分系统] 用户 ${userId} 消费 ${amount} 积分，余额: ${balanceAfter}`)
  return true
}

export async function recordBillingIssue(
  userId: string,
  expectedAmount: number,
  type: string,
  description: string,
  referenceId?: string,
  billingMetadata?: BillingAuditMetadata,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const credits = await getUserCredits(userId)
    const balance = credits?.credits || 0

    await recordTransaction(
      supabase,
      userId,
      0,
      type,
      description,
      balance,
      balance,
      referenceId,
      {
        ...billingMetadata,
        chargedCredits: expectedAmount,
        rawProviderMetadata: {
          ...(billingMetadata?.rawProviderMetadata || {}),
          billingIssue: true,
          expectedCredits: expectedAmount,
          currentCredits: balance,
        },
      },
    )
  } catch (error) {
    console.error("[Billing Audit] 记录异常账单失败:", error)
  }
}

// 增加积分
export async function addCredits(
  userId: string,
  amount: number,
  type: string,
  description: string,
  referenceId?: string,
  billingMetadata?: BillingAuditMetadata,
): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (referenceId) {
    console.log(`[积分系统] 入账参考ID: ${referenceId}`)
  }

  let credits = await getUserCredits(userId)
  let balanceBefore = 0
  
  // 如果用户积分记录不存在，先创建一条记录
  if (!credits) {
    console.log(`[积分系统] 用户 ${userId} 积分记录不存在，正在创建...`)
    
    // 🔥 直接尝试创建积分记录（使用 upsert 避免冲突）
    const { error: insertError } = await supabase
      .from("user_credits")
      .upsert({
        user_id: userId,
        credits: 0,
        is_pro: type === "purchase", // 购买时标记为 Pro
      }, { onConflict: 'user_id' })
    
    if (insertError) {
      console.error("[积分系统] 创建积分记录失败:", insertError)
      return false
    }
    
    // 重新获取积分记录
    credits = await getUserCredits(userId)
    if (!credits) {
      console.error("[积分系统] 创建后仍无法获取积分记录")
      return false
    }
  }

  balanceBefore = credits.credits
  const balanceAfter = credits.credits + amount

  // 增加积分
  const { error: updateError } = await supabase
    .from("user_credits")
    .update({
      credits: balanceAfter,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)

  if (updateError) {
    console.error("[积分系统] 增加积分失败:", updateError)
    return false
  }

  // 记录交易
  await recordTransaction(supabase, userId, amount, type, description, balanceBefore, balanceAfter, referenceId, billingMetadata)

  console.log(`[积分系统] 用户 ${userId} 成功增加 ${amount} 积分，当前积分: ${balanceAfter}`)
  return true
}

// 获取用户积分交易记录
export async function getCreditTransactions(userId: string, limit: number = 50): Promise<CreditTransaction[]> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from("credit_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[积分系统] 获取交易记录失败:", error)
    return []
  }

  return data || []
}

// 获取用户推荐码
export async function getUserReferralCode(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.from("referral_codes").select("code").eq("user_id", userId).maybeSingle()

  if (error) {
    console.error("[积分系统] 获取推荐码失败:", error)
    return null
  }

  return data?.code || null
}

// 🎯 邀请奖励配置
export const REFERRAL_CONFIG = {
  REWARD_PER_INVITE: 1000,      // 每次成功邀请，双方各得积分
  MAX_REFERRER_REWARD: 50000,   // 邀请者最多可获得的总积分
}

// 获取用户已获得的邀请奖励总额
export async function getReferralRewardTotal(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin()
  
  const { data, error } = await supabase
    .from("referrals")
    .select("reward_credits")
    .eq("referrer_id", userId)
    .eq("status", "completed")
  
  if (error || !data) return 0
  
  return data.reduce((sum, r) => sum + (r.reward_credits || 0), 0)
}

// 处理推荐注册
export async function handleReferralSignup(newUserId: string, referralCode: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()

  const { data: existingReferral, error: existingReferralError } = await supabase
    .from("referrals")
    .select("referrer_id, referee_id, referral_code, reward_credits, status, completed_at")
    .eq("referee_id", newUserId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingReferralError) {
    console.error("[积分系统] 查询现有推荐记录失败:", existingReferralError)
    return false
  }

  if (existingReferral) {
    console.log(`[积分系统] 推荐关系已存在，跳过重复发放 | referee=${newUserId}, referrer=${existingReferral.referrer_id}`)
    return true
  }

  // 查找推荐码对应的用户
  const { data: codeData, error: codeError } = await supabase
    .from("referral_codes")
    .select("user_id")
    .eq("code", referralCode)
    .single()

  if (codeError || !codeData) {
    return false
  }

  const referrerId = codeData.user_id
  if (referrerId === newUserId) {
    console.warn(`[积分系统] 拒绝自邀请 | userId=${newUserId}, referralCode=${referralCode}`)
    return false
  }
  
  // 🔥 检查邀请者是否已达到奖励上限
  const currentRewardTotal = await getReferralRewardTotal(referrerId)
  const canReceiveReward = currentRewardTotal < REFERRAL_CONFIG.MAX_REFERRER_REWARD
  
  // 计算实际奖励（如果接近上限，只给剩余额度）
  const remainingQuota = REFERRAL_CONFIG.MAX_REFERRER_REWARD - currentRewardTotal
  const actualReferrerReward = canReceiveReward
    ? Math.min(REFERRAL_CONFIG.REWARD_PER_INVITE, remainingQuota)
    : 0

  const { error: referralError } = await supabase.from("referrals").insert({
    referrer_id: referrerId,
    referee_id: newUserId,
    referral_code: referralCode,
    reward_credits: actualReferrerReward,
    status: "completed",
    completed_at: new Date().toISOString(),
  })

  if (referralError) {
    console.error("[积分系统] 创建推荐记录失败:", referralError)
    return false
  }

  // 🎁 给推荐人增加积分（如果未达上限）
  if (actualReferrerReward > 0) {
    await addCredits(referrerId, actualReferrerReward, "referral", `🎉 成功邀请好友，获得 ${actualReferrerReward} 积分奖励`, newUserId)
  }

  // 🎁 给新用户增加积分（被邀请者始终获得奖励）
  await addCredits(newUserId, REFERRAL_CONFIG.REWARD_PER_INVITE, "referral", `🎊 通过好友邀请注册，获得 ${REFERRAL_CONFIG.REWARD_PER_INVITE} 积分奖励`, newUserId)

  return true
}

// 创建用户推荐码
export async function createUserReferralCode(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()

  const existingCode = await getUserReferralCode(userId)
  if (existingCode) {
    return existingCode
  }
  
  // 生成推荐码
  const prefix = "SX"
  const suffix = userId.slice(-6).toUpperCase()
  const random = Math.random().toString(36).substring(2, 5).toUpperCase()
  const code = `${prefix}${random}${suffix}`
  
  try {
    const { error } = await supabase
      .from("referral_codes")
      .upsert({
        user_id: userId,
        code: code,
        uses: 0,
      }, { onConflict: 'user_id' })
    
    if (error) {
      console.error("[积分系统] 创建推荐码失败:", error)
      return null
    }
    
    console.log(`[积分系统] 用户 ${userId} 推荐码创建成功: ${code}`)
    return code
  } catch (error) {
    console.error("[积分系统] 创建推荐码异常:", error)
    return null
  }
}
