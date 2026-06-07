import { logger } from "@/lib/logger"

export const MAX_PAYMENT_CREDITS_BALANCE = 10_000_000
export const PAYMENT_CREDIT_GRANT_RETRY_LIMIT = 3

export type PaymentCreditGrantResult = {
  ok: boolean
  balanceBefore?: number
  balanceAfter?: number
  errorReason?: string
  error?: unknown
}

export async function grantPaymentCreditsWithOptimisticRetry(
  supabase: any,
  {
    orderNo,
    userId,
    credits,
    isPro,
  }: {
    orderNo: string
    userId: string
    credits: number
    isPro: boolean
  }
): Promise<PaymentCreditGrantResult> {
  for (let attempt = 1; attempt <= PAYMENT_CREDIT_GRANT_RETRY_LIMIT; attempt++) {
    const { data: currentCredits, error: creditsError } = await supabase
      .from("user_credits")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()

    if (creditsError) {
      logger.error("[xunhupay] credits load failed", { orderNo, userId, attempt, creditsError })
      return { ok: false, errorReason: "credits_load_failed", error: creditsError }
    }

    const balanceBefore = Number(currentCredits?.credits || 0)
    const balanceAfter = balanceBefore + credits

    if (balanceAfter > MAX_PAYMENT_CREDITS_BALANCE) {
      logger.error("[xunhupay] credits limit exceeded", {
        orderNo,
        userId,
        balanceAfter,
        maxCredits: MAX_PAYMENT_CREDITS_BALANCE,
      })
      return { ok: false, balanceBefore, balanceAfter, errorReason: "credits_limit_exceeded" }
    }

    if (currentCredits) {
      const newIsPro = isPro || Boolean(currentCredits.is_pro)

      logger.info("[xunhupay] updating user credits", {
        orderNo,
        userId,
        attempt,
        before: currentCredits.credits,
        after: balanceAfter,
        wasPro: currentCredits.is_pro,
        isPro: newIsPro,
      })

      const { data: updatedCredits, error: updateError } = await supabase
        .from("user_credits")
        .update({
          credits: balanceAfter,
          is_pro: newIsPro,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("credits", currentCredits.credits)
        .select("credits")
        .maybeSingle()

      if (!updateError && updatedCredits?.credits === balanceAfter) {
        logger.info("[xunhupay] user credits updated", { orderNo, userId, attempt })
        return { ok: true, balanceBefore, balanceAfter }
      }

      logger.warn("[xunhupay] credits optimistic update conflict", { orderNo, userId, attempt, updateError })
      continue
    }

    logger.info("[xunhupay] creating user credits", { orderNo, userId, credits, isPro, attempt })

    const { error: insertError } = await supabase
      .from("user_credits")
      .insert({
        user_id: userId,
        credits,
        is_pro: isPro,
      })

    if (!insertError) {
      logger.info("[xunhupay] user credits created", { orderNo, userId, attempt })
      return { ok: true, balanceBefore: 0, balanceAfter: credits }
    }

    const isConflict = insertError.code === "23505" || insertError.code === "409"
    if (isConflict) {
      logger.warn("[xunhupay] credits insert conflict, retrying as increment", { orderNo, userId, attempt })
      continue
    }

    logger.error("[xunhupay] credits insert failed", { orderNo, userId, attempt, insertError })
    return { ok: false, errorReason: "credits_insert_failed", error: insertError }
  }

  return { ok: false, errorReason: "credits_retry_exhausted" }
}
