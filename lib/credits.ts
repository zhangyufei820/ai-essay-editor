import { createClient } from "@supabase/supabase-js"
import {
  createBillingAuditMetadata,
  enrichBillingMetadata,
  type BillingAuditMetadata,
} from "@/lib/billing-audit"
import { spendRealCredits as spendRealCreditsDirect } from "@/lib/real-credit-spending"

export { createBillingAuditMetadata, type BillingAuditInput, type BillingAuditMetadata } from "@/lib/billing-audit"

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

// 仅扣真实积分。trial-credits 内部会调用它处理超额部分，避免 spendCredits 递归。
export async function spendRealCredits(
  userId: string,
  amount: number,
  type: string,
  description: string,
  referenceId?: string,
  billingMetadata?: BillingAuditMetadata,
): Promise<boolean> {
  return spendRealCreditsDirect(userId, amount, type, description, referenceId, billingMetadata)
}

// 消费积分：默认先使用共创体验 trial 额度，额度不足时再扣真实积分。
export async function spendCredits(
  userId: string,
  amount: number,
  type: string,
  description: string,
  referenceId?: string,
  billingMetadata?: BillingAuditMetadata,
  options: { realCreditUserId?: string } = {},
): Promise<boolean> {
  if (billingMetadata?.skipTrialBilling) {
    return spendRealCredits(options.realCreditUserId || userId, amount, type, description, referenceId, billingMetadata)
  }

  try {
    const { consumeWithTrialCredits } = await import("@/lib/trial-credits")
    const result = await consumeWithTrialCredits({
      userId,
      realCreditUserId: options.realCreditUserId,
      amount,
      actionType: type,
      description,
      referenceId,
      billingMetadata,
    })

    if (result.blocked && result.reason === "survey_required") {
      console.warn(`[积分系统] trial 扣费被问卷门禁阻断 userId=${userId}, amount=${amount}, type=${type}`)
      return false
    }

    return result.success
  } catch (error) {
    console.error("[积分系统] trial-first 扣费失败，回退真实积分扣费:", error)
    return spendRealCredits(options.realCreditUserId || userId, amount, type, description, referenceId, {
      ...(billingMetadata || {}),
      rawProviderMetadata: {
        ...(billingMetadata?.rawProviderMetadata || {}),
        trialFirstFallback: true,
      },
      skipTrialBilling: true,
    })
  }
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
  const { data: updatedCreditRow, error: updateError } = await supabase
    .from("user_credits")
    .update({
      credits: balanceAfter,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("credits", credits.credits)
    .select("user_id")
    .maybeSingle()

  if (updateError || !updatedCreditRow) {
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

export async function getReferralStats(userId: string): Promise<{ uses: number; totalReward: number }> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("referrals")
    .select("reward_credits")
    .eq("referrer_id", userId)
    .eq("status", "completed")

  if (error) {
    console.error("[积分系统] 获取邀请统计失败:", error)
    throw error
  }

  return {
    uses: data?.length || 0,
    totalReward: (data || []).reduce((sum, row) => sum + Number(row.reward_credits || 0), 0),
  }
}

// 处理推荐注册
export async function handleReferralSignup(newUserId: string, referralCode: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const normalizedCode = referralCode.trim()
  if (!newUserId.trim() || !normalizedCode || normalizedCode.length > 100) return false

  const { data, error } = await supabase.rpc("grant_referral_credits_once", {
    p_referee_id: newUserId,
    p_referral_code: normalizedCode,
  })

  if (error) {
    console.error("[积分系统] 推荐注册原子结算失败:", error)
    return false
  }

  const result = (Array.isArray(data) ? data[0] : data) as { applied?: boolean; referrer_id?: string } | null
  if (!result) {
    console.error("[积分系统] 推荐注册原子结算返回无效")
    return false
  }

  console.log(`[积分系统] 推荐注册结算完成 | referee=${newUserId}, referrer=${result.referrer_id || "unknown"}, applied=${result.applied === true}`)
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
