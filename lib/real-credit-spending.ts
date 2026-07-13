import { enrichBillingMetadata, type BillingAuditMetadata } from "@/lib/billing-audit"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

async function loadOrInitializeCredits(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("user_credits")
    .select("credits")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) return { supabase, credits: null, error }
  if (data) return { supabase, credits: Number(data.credits || 0), error: null }

  const { error: createError } = await supabase
    .from("user_credits")
    .insert({ user_id: userId, credits: 1000, is_pro: false })

  if (createError && createError.code !== "23505" && createError.code !== "409") {
    return { supabase, credits: null, error: createError }
  }

  const { data: initialized, error: reloadError } = await supabase
    .from("user_credits")
    .select("credits")
    .eq("user_id", userId)
    .single()

  return {
    supabase,
    credits: reloadError ? null : Number(initialized?.credits || 0),
    error: reloadError,
  }
}

async function recordRealCreditTransaction(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  amount: number,
  type: string,
  description: string,
  balanceBefore: number,
  balanceAfter: number,
  referenceId?: string,
  billingMetadata?: BillingAuditMetadata,
) {
  const basePayload = {
    user_id: userId,
    amount,
    type,
    description,
    reference_id: referenceId,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
  }
  const payload = {
    ...basePayload,
    billing_metadata: enrichBillingMetadata(
      userId,
      amount,
      type,
      description,
      balanceBefore,
      balanceAfter,
      referenceId,
      billingMetadata,
    ),
  }

  try {
    const { error } = await supabase.from("credit_transactions").insert(payload)
    if (!error) return

    const message = String(error.message || "")
    const missingMetadataColumn =
      error.code === "PGRST204" ||
      error.code === "42703" ||
      message.includes("billing_metadata") ||
      message.includes("Could not find")
    if (missingMetadataColumn) {
      await supabase.from("credit_transactions").insert(basePayload)
      return
    }
    console.log("[积分系统] 记录交易失败（不影响主流程）:", error)
  } catch (error) {
    console.log("[积分系统] 记录交易失败（表可能不存在）:", error)
  }
}

export async function spendRealCredits(
  userId: string,
  amount: number,
  type: string,
  description: string,
  referenceId?: string,
  billingMetadata?: BillingAuditMetadata,
): Promise<boolean> {
  if (referenceId) console.log(`[积分系统] 扣费参考ID: ${referenceId}`)
  if (billingMetadata) console.log("[Billing Audit] 用户扣费审计字段:", JSON.stringify(billingMetadata))

  if (!Number.isInteger(amount) || amount <= 0) {
    console.error(`[积分系统] 扣费金额非法 userId=${userId}, amount=${amount}, type=${type}`)
    return false
  }

  const current = await loadOrInitializeCredits(userId)
  if (current.error || current.credits === null || current.credits < amount) {
    console.error(`[积分系统] 扣除积分失败：余额不足 userId=${userId}, amount=${amount}, balance=${current.credits ?? "null"}, type=${type}`)
    return false
  }

  const balanceBefore = current.credits
  const balanceAfter = balanceBefore - amount
  const { data: updatedCreditRow, error: updateError } = await current.supabase
    .from("user_credits")
    .update({ credits: balanceAfter, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("credits", balanceBefore)
    .gte("credits", amount)
    .select("credits")
    .maybeSingle()

  if (updateError || !updatedCreditRow || updatedCreditRow.credits !== balanceAfter) {
    console.error(`[积分系统] 扣除积分失败：并发条件更新未生效 userId=${userId}, amount=${amount}, expectedBefore=${balanceBefore}, expectedAfter=${balanceAfter}, type=${type}`)
    return false
  }

  await recordRealCreditTransaction(
    current.supabase,
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
