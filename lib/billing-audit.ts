import {
  ASSUMED_PROVIDER_INPUT_VCOINS_PER_1M,
  ASSUMED_PROVIDER_OUTPUT_VCOINS_PER_1M,
  PRICING_VERSION,
  TEXT_INPUT_CREDITS_PER_1K,
  TEXT_OUTPUT_CREDITS_PER_1K,
} from "@/lib/billing-config"

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

function normalizeBillingUsageSource(source?: string, estimated?: boolean): string {
  if (!source) return estimated ? "estimated" : "dify"
  if (source === "fallback_total_as_output" || source === "no_output" || source === "fixed") return source
  if (source === "estimated_from_output_text" || estimated) return "estimated"
  return "dify"
}

function readRawProviderMetadata(metadata?: BillingAuditInput | null): Record<string, unknown> | null {
  const fromRawUsage = metadata?.rawUsage
  const provider = metadata?.rawProviderMetadata
  if (fromRawUsage && Object.keys(fromRawUsage).length > 0) {
    return { ...(provider || {}), usage: fromRawUsage }
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
  const finishReason = input.finishReason ??
    (typeof input.rawProviderMetadata?.finishReason === "string" ? input.rawProviderMetadata.finishReason : null)
  const latency = input.latency ??
    (typeof input.rawProviderMetadata?.latency === "number" ? input.rawProviderMetadata.latency : null)
  const timeToFirstToken = input.timeToFirstToken ??
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

export function enrichBillingMetadata(
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
