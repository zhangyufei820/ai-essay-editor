import { enrichBillingMetadata, type BillingAuditMetadata } from "@/lib/billing-audit"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

type AtomicSpendResult = {
  spent?: boolean
  balance_before?: number
  balance_after?: number
}

export async function spendRealCredits(
  userId: string,
  amount: number,
  type: string,
  description: string,
  referenceId?: string,
  billingMetadata?: BillingAuditMetadata,
): Promise<boolean> {
  if (!userId.trim() || !Number.isInteger(amount) || amount <= 0) {
    console.error(`[积分系统] 扣费参数非法 userId=${userId}, amount=${amount}, type=${type}`)
    return false
  }

  const metadata = enrichBillingMetadata(
    userId,
    -amount,
    type,
    description,
    0,
    0,
    referenceId,
    billingMetadata,
  )
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc("spend_real_credits_atomic", {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_description: description,
    p_reference_id: referenceId || null,
    p_billing_metadata: metadata,
  })

  if (error) {
    console.error(`[积分系统] 原子扣费失败 userId=${userId}, amount=${amount}, type=${type}:`, error.message)
    return false
  }

  const result = (Array.isArray(data) ? data[0] : data) as AtomicSpendResult | null
  if (!result?.spent) {
    console.warn(`[积分系统] 余额不足 userId=${userId}, amount=${amount}, type=${type}`)
    return false
  }

  console.log(`[积分系统] 用户 ${userId} 消费 ${amount} 积分，余额: ${result.balance_after}`)
  return true
}
