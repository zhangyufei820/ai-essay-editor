import {
  calculateActualCost,
  calculateTextCredits,
  getMinimumRequiredCredits,
  parseDifyUsage,
  type ModelType,
  type ParsedDifyUsage,
  type TextCreditsInput,
  type TokenUsage,
} from "@/lib/pricing"
import {
  createBillingAuditMetadata,
  spendCredits,
  type BillingAuditInput,
  type BillingAuditMetadata,
} from "@/lib/credits"

export { parseDifyUsage, calculateTextCredits }
export type { ParsedDifyUsage, TextCreditsInput }

export type MinimumBalanceCheck = {
  ok: boolean
  requiredCredits: number
  currentCredits: number
  error?: string
}

export function estimateTokensFromText(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const cjkChars = trimmed.match(/[\u3400-\u9fff]/g)?.length || 0
  const nonCjkText = trimmed.replace(/[\u3400-\u9fff]/g, " ")
  const wordCount = nonCjkText.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length || 0
  const symbolCount = nonCjkText.replace(/\s+/g, "").length - wordCount
  return Math.max(1, Math.ceil(cjkChars / 1.5 + wordCount * 1.3 + Math.max(symbolCount, 0) / 4))
}

export function calculateImageCredits(model: ModelType, count = 1): number {
  const safeCount = Math.max(1, Math.floor(count || 1))
  return calculateActualCost(model) * safeCount
}

export function calculateSunoCredits(
  tokenUsage?: TokenUsage,
  options: { hasOutputContent?: boolean } = {},
): number {
  return calculateActualCost("suno-v5", tokenUsage, {
    hasOutputContent: options.hasOutputContent,
  })
}

export function checkMinimumBalance(
  currentCredits: number,
  requiredCreditsOrModel: number | ModelType,
): MinimumBalanceCheck {
  const requiredCredits =
    typeof requiredCreditsOrModel === "number"
      ? requiredCreditsOrModel
      : getMinimumRequiredCredits(requiredCreditsOrModel)
  const ok = currentCredits >= requiredCredits
  return {
    ok,
    requiredCredits,
    currentCredits,
    error: ok ? undefined : `当前功能至少需要 ${requiredCredits} 积分，当前剩余 ${currentCredits} 积分。请充值或升级会员后继续使用。`,
  }
}

export async function chargeCreditsSafely(
  userId: string,
  amount: number,
  actionType: string,
  description: string,
  referenceId?: string,
  billingMetadata?: BillingAuditMetadata,
): Promise<boolean> {
  return spendCredits(userId, amount, actionType, description, referenceId, billingMetadata)
}

export function createBillingLog(input: BillingAuditInput): BillingAuditMetadata {
  return createBillingAuditMetadata(input)
}
