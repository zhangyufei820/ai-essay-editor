import { NextResponse } from "next/server"
import { recordBillingIssue, getUserCredits } from "@/lib/credits"
import {
  chargeCreditsSafely as spendCredits,
  createBillingLog as createBillingAuditMetadata,
  parseDifyUsage,
  type ParsedDifyUsage,
} from "@/lib/billing"
import { PRICING_VERSION, SUNO_BASE_CREDITS, calculateActualCost } from "@/lib/pricing"

const SUNO_MODEL = "suno-v5" as const
const SUNO_APP_ID = "SUNO_SERVER_GATEWAY_WORKFLOW"

export async function ensureSunoCredits(userId: string, options: { realCreditUserId?: string } = {}) {
  const realCreditUserId = options.realCreditUserId || userId
  const userCredits = await getUserCredits(realCreditUserId)
  if (!userCredits || userCredits.credits < SUNO_BASE_CREDITS) {
    return NextResponse.json({
      error: "当前积分不足",
      message: `当前功能至少需要 ${SUNO_BASE_CREDITS} 积分，当前剩余 ${userCredits?.credits || 0} 积分。请充值或升级会员后继续使用。`,
      code: "INSUFFICIENT_CREDITS",
      required: SUNO_BASE_CREDITS,
      current: userCredits?.credits || 0,
      action: "请充值或升级会员",
    }, { status: 402 })
  }
  return null
}

export function createSunoChargeDescription(operation: string) {
  return `🎵 AI 音乐创作 - ${operation}（基础费用）`
}

export async function chargeSunoBaseCredits(params: {
  userId: string
  realCreditUserId?: string
  operation: string
  description?: string
  referenceId?: string | null
  requestId?: string | null
}) {
  const { userId, operation, referenceId, requestId } = params
  if (!userId) return false
  const description = params.description || createSunoChargeDescription(operation)

  return spendCredits(
    userId,
    SUNO_BASE_CREDITS,
    "suno_music",
    description,
    referenceId || requestId || undefined,
    createBillingAuditMetadata({
      userId,
      actionType: "suno_music",
      feature: "suno",
      appId: SUNO_APP_ID,
      workflowId: null,
      modelId: SUNO_MODEL,
      requestedAppId: SUNO_APP_ID,
      requestedWorkflowId: null,
      requestedModelId: SUNO_MODEL,
      usageSource: "fixed",
      estimated: false,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      chargedCredits: SUNO_BASE_CREDITS,
      conversationId: null,
      requestId: requestId || referenceId || null,
      rawProviderMetadata: {
        baseCredits: SUNO_BASE_CREDITS,
        operation,
        pricingVersion: PRICING_VERSION,
      },
      description,
    }),
    { realCreditUserId: params.realCreditUserId },
  )
}

export async function recordSunoBillingFailure(params: {
  userId: string
  operation: string
  description?: string
  referenceId?: string | null
  requestId?: string | null
}) {
  const { userId, operation, referenceId, requestId } = params
  const description = params.description || createSunoChargeDescription(operation)

  await recordBillingIssue(
    userId,
    SUNO_BASE_CREDITS,
    "billing_failed",
    `异常账单：${description}`,
    referenceId || requestId || undefined,
    createBillingAuditMetadata({
      userId,
      actionType: "billing_failed",
      feature: "suno",
      appId: SUNO_APP_ID,
      workflowId: null,
      modelId: SUNO_MODEL,
      requestedAppId: SUNO_APP_ID,
      requestedWorkflowId: null,
      requestedModelId: SUNO_MODEL,
      upstreamProvider: null,
      upstreamModel: null,
      upstreamGroup: null,
      upstreamRequestId: null,
      rawProviderMetadata: {
        operation,
        billingIssue: true,
      },
      usageSource: "fixed",
      estimated: false,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      chargedCredits: SUNO_BASE_CREDITS,
      conversationId: null,
      requestId: requestId || referenceId || null,
      description,
    }),
  )
}

function hasExplicitDifyUsage(usage: ParsedDifyUsage) {
  return Boolean(usage.rawUsage && Object.keys(usage.rawUsage).length > 0)
}

export async function chargeSunoTokenUsageIfPresent(params: {
  userId: string
  realCreditUserId?: string
  operation: string
  providerPayload: unknown
  referenceId?: string | null
  requestId?: string | null
}) {
  const parsedUsage = parseDifyUsage(params.providerPayload)
  if (!hasExplicitDifyUsage(parsedUsage)) return { charged: false, credits: 0, reason: "no_explicit_usage" as const }

  const totalTokens = parsedUsage.totalTokens
  const promptTokens = parsedUsage.promptTokens
  const completionTokens = parsedUsage.completionTokens
  const tokenCredits = calculateActualCost(
    SUNO_MODEL,
    { totalTokens, inputTokens: promptTokens, outputTokens: completionTokens },
    { hasOutputContent: parsedUsage.hasOutput },
  ) - SUNO_BASE_CREDITS

  if (tokenCredits <= 0) return { charged: false, credits: 0, reason: "no_extra_cost" as const }

  const description = `🎵 AI 音乐创作 - ${params.operation}（输入 ${promptTokens} tokens / 输出 ${completionTokens} tokens）`
  const billingMetadata = createBillingAuditMetadata({
    userId: params.userId,
    actionType: "suno_llm_token",
    feature: "suno",
    appId: SUNO_APP_ID,
    workflowId: null,
    modelId: SUNO_MODEL,
    requestedAppId: SUNO_APP_ID,
    requestedWorkflowId: null,
    requestedModelId: SUNO_MODEL,
    upstreamProvider: null,
    upstreamModel: null,
    upstreamGroup: null,
    upstreamRequestId: null,
    rawProviderMetadata: {
      usage: parsedUsage.rawUsage || null,
      finishReason: parsedUsage.finishReason || null,
      latency: parsedUsage.latency ?? null,
      timeToFirstToken: parsedUsage.timeToFirstToken ?? null,
      usageSource: parsedUsage.usageSource,
      estimated: parsedUsage.estimated,
      operation: params.operation,
    },
    usageSource: parsedUsage.usageSource,
    estimated: parsedUsage.estimated,
    promptTokens,
    completionTokens,
    totalTokens,
    chargedCredits: tokenCredits,
    rawUsageJson: parsedUsage.rawUsage || null,
    finishReason: parsedUsage.finishReason || null,
    latency: parsedUsage.latency ?? null,
    timeToFirstToken: parsedUsage.timeToFirstToken ?? null,
    conversationId: null,
    requestId: params.requestId || params.referenceId || null,
    description,
  })

  const success = await spendCredits(
    params.userId,
    tokenCredits,
    "suno_llm_token",
    description,
    params.referenceId || params.requestId || undefined,
    billingMetadata,
    { realCreditUserId: params.realCreditUserId },
  )

  if (!success) {
    await recordBillingIssue(
      params.userId,
      tokenCredits,
      "billing_failed",
      `异常账单：${description}`,
      params.referenceId || params.requestId || undefined,
      billingMetadata,
    )
  }

  return { charged: success, credits: tokenCredits, reason: success ? "charged" as const : "charge_failed" as const }
}
