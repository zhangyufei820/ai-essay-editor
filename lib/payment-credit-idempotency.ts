import type { SupabaseClient } from "@supabase/supabase-js"

export type PaymentProvider = "stripe" | "xunhupay"

export type GrantPaymentCreditsOnceInput = {
  provider: PaymentProvider
  eventId: string
  referenceId: string
  orderNo?: string | null
  userId: string
  productId: string
  credits: number
  isPro: boolean
  description: string
  metadata?: Record<string, unknown>
}

export type GrantPaymentCreditsOnceResult = {
  ok: boolean
  applied: boolean
  balanceBefore?: number
  balanceAfter?: number
  error?: unknown
}

export async function grantPaymentCreditsOnce(
  supabase: SupabaseClient,
  input: GrantPaymentCreditsOnceInput,
): Promise<GrantPaymentCreditsOnceResult> {
  if (!input.eventId.trim() || !input.referenceId.trim() || !input.userId.trim()) {
    return { ok: false, applied: false, error: new Error("Missing payment identity") }
  }
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    return { ok: false, applied: false, error: new Error("Invalid payment credits") }
  }

  const { data, error } = await supabase.rpc("grant_payment_credits_once", {
    p_provider: input.provider,
    p_event_id: input.eventId,
    p_reference_id: input.referenceId,
    p_order_no: input.orderNo || null,
    p_user_id: input.userId,
    p_product_id: input.productId,
    p_credits: input.credits,
    p_is_pro: input.isPro,
    p_description: input.description,
    p_metadata: input.metadata || {},
  })

  if (error) return { ok: false, applied: false, error }

  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== "object") {
    return { ok: false, applied: false, error: new Error("Invalid payment grant response") }
  }

  const result = row as Record<string, unknown>
  return {
    ok: true,
    applied: result.applied === true,
    balanceBefore: typeof result.balance_before === "number" ? result.balance_before : undefined,
    balanceAfter: typeof result.balance_after === "number" ? result.balance_after : undefined,
  }
}
