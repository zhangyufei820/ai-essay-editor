import {
  ASSUMED_PROVIDER_INPUT_VCOINS_PER_1M,
  ASSUMED_PROVIDER_OUTPUT_VCOINS_PER_1M,
  GEMINI_IMAGE_CREDITS,
  HIGH_CONSUMPTION_TEXT_CREDITS,
  HIGH_CONSUMPTION_TEXT_OUTPUT_TOKENS,
  IMAGE2_CREDITS,
  IMAGE2_1K_CREDITS,
  IMAGE2_2K_CREDITS,
  IMAGE2_4K_CREDITS,
  IMAGE2_512_CREDITS,
  IMAGE2_HIGH_QUALITY_EXTRA_CREDITS,
  IMAGE2_MEDIUM_QUALITY_EXTRA_CREDITS,
  MEDIA_BILLING,
  PRICING_VERSION,
  SUNO_BASE_CREDITS,
  TEXT_WORKFLOW_MAX_OUTPUT_TOKENS,
  TEXT_INPUT_CREDITS_PER_1K,
  TEXT_MIN_CHARGE_CREDITS,
  TEXT_MIN_REQUIRED_CREDITS,
  TEXT_OUTPUT_CREDITS_PER_1K,
  TEXT_TOKEN_BILLING,
  TEXT_WORKFLOW_MIN_REQUIRED_CREDITS,
  type MediaBillingItem,
} from "@/lib/billing-config"
import { getPublicAiLabel } from "@/lib/public-ai-labels"

export type ModelType =
  | "general-chat"
  | "standard"
  | "teaching-pro"
  | "gpt-5"
  | "claude-opus"
  | "gemini-pro"
  | "gemini-image"
  | "banana-2-pro"
  | "gpt-image-2"
  | "suno-v5"
  | "grok-4.2"
  | "open-claw"
  | "quanquan-math"
  | "quanquan-english"
  | "vocab-card"
  | "problem"
  | "beike-pro"
  | "banzhuren"
  | "all-in-one-agent"
  | "super-all-in-one-agent"
  | "ai-writing-paper"
  | "zhongying-essay"
  | "reading-report"
  | "experiment-report"
  | "study-abroad"
  | "resume-optimize"
  | "speech-defense"
  | "school-wechat"
  | "teacher-agent"

export type GenMode = "text" | "image" | "music" | "video"
export type ModelCategory = "text" | "media"
export type TextWorkflowKind = "default_text" | "short_agent" | "ordinary_writing" | "essay_correction" | "long_writing"
export type Image2SizeTier = "512" | "1K" | "2K" | "4K"
export type Image2QualityTier = "auto" | "low" | "medium" | "high"

const MODEL_MAX_OUTPUT_TOKEN_OVERRIDES: Partial<Record<ModelType, number>> = {
  "experiment-report": 4000,
}

export type TokenUsage = {
  totalTokens?: number
  inputTokens?: number
  outputTokens?: number
  promptTokens?: number
  completionTokens?: number
}

export type TextBillingOptions = {
  hasOutputContent?: boolean
}

export type ParsedDifyUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  hasOutput: boolean
  estimated: boolean
  usageSource: TextUsageSource
  finishReason?: string
  latency?: number
  timeToFirstToken?: number
  rawUsage?: Record<string, unknown>
  outputText?: string
  reasoningContent?: string
}

export type TextUsageSource =
  | "split_tokens"
  | "derived_completion_from_total"
  | "derived_prompt_from_total"
  | "fallback_total_as_output"
  | "estimated_from_output_text"
  | "no_output"

export type TextCreditsInput = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  outputText?: string
  hasOutput?: boolean
  estimated?: boolean
  reasoningContent?: string
  rawUsage?: Record<string, unknown>
  usageSource?: TextUsageSource
  pricingConfig?: {
    inputCreditsPer1K?: number
    outputCreditsPer1K?: number
    minimumCredits?: number
  }
}

type ModelCostConfig = {
  category: ModelCategory
  displayName: string
  mode: GenMode
  estimatedInputTokens?: number
  estimatedOutputTokens?: number
  fixedCost?: number
}

const TEXT_MODEL_DEFAULTS = {
  category: "text",
  mode: "text",
  estimatedInputTokens: 800,
  estimatedOutputTokens: 1200,
} as const

export const MODEL_COSTS: Record<ModelType, ModelCostConfig> = {
  "general-chat": { ...TEXT_MODEL_DEFAULTS, displayName: "通用轻量对话", estimatedInputTokens: 300, estimatedOutputTokens: 600 },
  standard: { ...TEXT_MODEL_DEFAULTS, displayName: "作文批改智能体" },
  "teaching-pro": { ...TEXT_MODEL_DEFAULTS, displayName: "教学评智能助手", estimatedInputTokens: 1000, estimatedOutputTokens: 1500 },
  "quanquan-math": { ...TEXT_MODEL_DEFAULTS, displayName: "全学段数学智能体" },
  "quanquan-english": { ...TEXT_MODEL_DEFAULTS, displayName: "全学段英语智能体" },
  "vocab-card": { ...TEXT_MODEL_DEFAULTS, displayName: "词境记忆卡", estimatedInputTokens: 600, estimatedOutputTokens: 1000 },
  problem: { ...TEXT_MODEL_DEFAULTS, displayName: "题目解析智能体", estimatedInputTokens: 600, estimatedOutputTokens: 1000 },
  "beike-pro": { ...TEXT_MODEL_DEFAULTS, displayName: "全学段备课助手Pro", estimatedInputTokens: 1200, estimatedOutputTokens: 1800 },
  banzhuren: { ...TEXT_MODEL_DEFAULTS, displayName: "班主任超级助手", estimatedInputTokens: 1000, estimatedOutputTokens: 1500 },
  "all-in-one-agent": { ...TEXT_MODEL_DEFAULTS, displayName: "数学图片与动画生成器", estimatedInputTokens: 1200, estimatedOutputTokens: 1800 },
  "super-all-in-one-agent": { ...TEXT_MODEL_DEFAULTS, displayName: "超级全能智能体", estimatedInputTokens: 1600, estimatedOutputTokens: 2400 },
  "ai-writing-paper": { ...TEXT_MODEL_DEFAULTS, displayName: "论文写作助手", estimatedInputTokens: 1200, estimatedOutputTokens: 1800 },
  "zhongying-essay": { ...TEXT_MODEL_DEFAULTS, displayName: "中英文作文助手" },
  "reading-report": { ...TEXT_MODEL_DEFAULTS, displayName: "读书报告助手", estimatedInputTokens: 1000, estimatedOutputTokens: 1500 },
  "experiment-report": { ...TEXT_MODEL_DEFAULTS, displayName: "实验报告助理", estimatedInputTokens: 1000, estimatedOutputTokens: 1500 },
  "study-abroad": { ...TEXT_MODEL_DEFAULTS, displayName: "留学与升学文书助手", estimatedInputTokens: 1200, estimatedOutputTokens: 1800 },
  "resume-optimize": { ...TEXT_MODEL_DEFAULTS, displayName: "实习简历优化助手" },
  "speech-defense": { ...TEXT_MODEL_DEFAULTS, displayName: "演讲与答辩稿助手", estimatedInputTokens: 1000, estimatedOutputTokens: 1500 },
  "school-wechat": { ...TEXT_MODEL_DEFAULTS, displayName: "学校公众号写作助手" },
  "teacher-agent": { ...TEXT_MODEL_DEFAULTS, displayName: "教师自定义智能体", estimatedInputTokens: 700, estimatedOutputTokens: 1000 },
  "gpt-5": { ...TEXT_MODEL_DEFAULTS, displayName: getPublicAiLabel("gpt-5"), estimatedInputTokens: 700, estimatedOutputTokens: 1000 },
  "claude-opus": { ...TEXT_MODEL_DEFAULTS, displayName: getPublicAiLabel("claude-opus") },
  "gemini-pro": { ...TEXT_MODEL_DEFAULTS, displayName: getPublicAiLabel("gemini-pro"), estimatedInputTokens: 700, estimatedOutputTokens: 1000 },
  "grok-4.2": { ...TEXT_MODEL_DEFAULTS, displayName: getPublicAiLabel("grok-4.2"), estimatedInputTokens: 700, estimatedOutputTokens: 1000 },
  "open-claw": { ...TEXT_MODEL_DEFAULTS, displayName: getPublicAiLabel("open-claw"), estimatedInputTokens: 700, estimatedOutputTokens: 1000 },
  "banana-2-pro": {
    category: "media",
    fixedCost: MEDIA_BILLING["banana-2-pro"].fixedCredits,
    displayName: getPublicAiLabel("banana-2-pro"),
    mode: "image",
    estimatedInputTokens: 300,
    estimatedOutputTokens: 300,
  },
  "gemini-image": {
    category: "media",
    fixedCost: MEDIA_BILLING["gemini-image"].fixedCredits,
    displayName: getPublicAiLabel("gemini-image"),
    mode: "image",
    estimatedInputTokens: 300,
    estimatedOutputTokens: 300,
  },
  "gpt-image-2": {
    category: "media",
    fixedCost: MEDIA_BILLING["gpt-image-2"].fixedCredits,
    displayName: getPublicAiLabel("gpt-image-2"),
    mode: "image",
  },
  "suno-v5": {
    category: "media",
    fixedCost: MEDIA_BILLING["suno-v5"].fixedCredits,
    displayName: getPublicAiLabel("suno-v5"),
    mode: "music",
    estimatedInputTokens: 300,
    estimatedOutputTokens: 300,
  },
}

export {
  ASSUMED_PROVIDER_INPUT_VCOINS_PER_1M,
  ASSUMED_PROVIDER_OUTPUT_VCOINS_PER_1M,
  GEMINI_IMAGE_CREDITS,
  IMAGE2_CREDITS,
  IMAGE2_1K_CREDITS,
  IMAGE2_2K_CREDITS,
  IMAGE2_4K_CREDITS,
  IMAGE2_512_CREDITS,
  IMAGE2_HIGH_QUALITY_EXTRA_CREDITS,
  IMAGE2_MEDIUM_QUALITY_EXTRA_CREDITS,
  PRICING_VERSION,
  SUNO_BASE_CREDITS,
  TEXT_WORKFLOW_MAX_OUTPUT_TOKENS,
  TEXT_INPUT_CREDITS_PER_1K,
  TEXT_MIN_CHARGE_CREDITS,
  TEXT_MIN_REQUIRED_CREDITS,
  TEXT_OUTPUT_CREDITS_PER_1K,
  TEXT_WORKFLOW_MIN_REQUIRED_CREDITS,
}

export const pricingVersion = PRICING_VERSION

export const INPUT_TOKEN_RATE = TEXT_INPUT_CREDITS_PER_1K
export const OUTPUT_TOKEN_RATE = TEXT_OUTPUT_CREDITS_PER_1K
export const MIN_TEXT_CHARGE = TEXT_MIN_CHARGE_CREDITS
export const MIN_TEXT_REQUIRED_CREDITS = TEXT_MIN_REQUIRED_CREDITS

export const DAILY_FREE_LIMIT = 0
export const LUXURY_THRESHOLD = Number.POSITIVE_INFINITY
export const LUXURY_CREDITS = 12000
function normalizeInputTokens(usage?: TokenUsage): number {
  return Math.max(0, Number(usage?.promptTokens ?? usage?.inputTokens ?? 0) || 0)
}

function normalizeOutputTokens(usage?: TokenUsage): number {
  return Math.max(0, Number(usage?.completionTokens ?? usage?.outputTokens ?? 0) || 0)
}

function toNonNegativeNumber(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") return value
  }
  return undefined
}

function resolveDifyUsage(rawResponse: any): Record<string, unknown> {
  const usage =
    rawResponse?.usage ||
    rawResponse?.metadata?.usage ||
    rawResponse?.data?.usage ||
    rawResponse?.data?.metadata?.usage ||
    rawResponse?.data?.outputs?.usage ||
    rawResponse?.outputs?.usage

  return usage && typeof usage === "object" ? usage : {}
}

function resolveDifyOutputText(rawResponse: any): string {
  const outputs = rawResponse?.data?.outputs || rawResponse?.outputs || {}
  const text = firstString(
    rawResponse?.text,
    rawResponse?.answer,
    rawResponse?.message,
    rawResponse?.data?.text,
    rawResponse?.data?.answer,
    outputs.text,
    outputs.result,
    outputs.answer,
  )
  return text || ""
}

function estimateTokensFromText(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const cjkChars = trimmed.match(/[\u3400-\u9fff]/g)?.length || 0
  const nonCjkText = trimmed.replace(/[\u3400-\u9fff]/g, " ")
  const wordCount = nonCjkText.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length || 0
  const symbolCount = nonCjkText.replace(/\s+/g, "").length - wordCount
  return Math.max(1, Math.ceil(cjkChars / 1.5 + wordCount * 1.3 + Math.max(symbolCount, 0) / 4))
}

export function parseDifyUsage(rawResponse: unknown): ParsedDifyUsage {
  const raw = rawResponse as any
  const rawUsage = resolveDifyUsage(raw)
  const hasPromptTokens = rawUsage.prompt_tokens !== undefined && rawUsage.prompt_tokens !== null
  const hasCompletionTokens = rawUsage.completion_tokens !== undefined && rawUsage.completion_tokens !== null
  const hasTotalTokens = rawUsage.total_tokens !== undefined && rawUsage.total_tokens !== null
  const explicitPromptTokens = toNonNegativeNumber(rawUsage.prompt_tokens)
  const explicitCompletionTokens = toNonNegativeNumber(rawUsage.completion_tokens)
  const totalTokens = toNonNegativeNumber(rawUsage.total_tokens ?? raw?.total_tokens ?? raw?.data?.total_tokens)
  const outputText = resolveDifyOutputText(raw)
  const reasoningContent = firstString(raw?.reasoning_content, raw?.data?.reasoning_content) || ""
  const hasOutput = outputText.trim().length > 0 || explicitCompletionTokens > 0
  let promptTokens = explicitPromptTokens
  let completionTokens = explicitCompletionTokens
  let resolvedTotalTokens = totalTokens
  let estimated = false
  let usageSource: TextUsageSource = "split_tokens"

  if (!hasOutput) {
    usageSource = "no_output"
  } else if (hasPromptTokens && hasCompletionTokens) {
    usageSource = "split_tokens"
  } else if (hasPromptTokens && hasTotalTokens) {
    completionTokens = Math.max(totalTokens - promptTokens, 0)
    estimated = true
    usageSource = "derived_completion_from_total"
  } else if (hasCompletionTokens && hasTotalTokens) {
    promptTokens = Math.max(totalTokens - completionTokens, 0)
    estimated = true
    usageSource = "derived_prompt_from_total"
  } else if (hasTotalTokens) {
    promptTokens = 0
    completionTokens = totalTokens
    estimated = true
    usageSource = "fallback_total_as_output"
  } else {
    promptTokens = 0
    completionTokens = estimateTokensFromText(outputText)
    resolvedTotalTokens = completionTokens
    estimated = true
    usageSource = "estimated_from_output_text"
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens: resolvedTotalTokens,
    hasOutput,
    estimated,
    usageSource,
    finishReason: firstString(raw?.finish_reason, raw?.data?.finish_reason),
    latency: rawUsage.latency === undefined ? undefined : toNonNegativeNumber(rawUsage.latency),
    timeToFirstToken: rawUsage.time_to_first_token === undefined ? undefined : toNonNegativeNumber(rawUsage.time_to_first_token),
    rawUsage,
    outputText,
    reasoningContent,
  }
}

export function calculateTextCredits(input: TextCreditsInput): number {
  const promptTokens = toNonNegativeNumber(input.promptTokens)
  const completionTokens = toNonNegativeNumber(input.completionTokens)
  const totalTokens = toNonNegativeNumber(input.totalTokens)
  const hasSplitTokenUsage = promptTokens > 0 || completionTokens > 0
  const outputText = input.outputText || ""
  const hasOutput = input.hasOutput ?? (outputText.trim().length > 0 || completionTokens > 0)

  if (!hasOutput) {
    return 0
  }

  let billablePromptTokens = promptTokens
  let billableCompletionTokens = completionTokens

  if (!hasSplitTokenUsage) {
    billablePromptTokens = 0
    billableCompletionTokens = totalTokens > 0 ? totalTokens : estimateTokensFromText(outputText)
  }

  if (billablePromptTokens <= 0 && billableCompletionTokens <= 0) {
    return 0
  }

  const config = input.pricingConfig || TEXT_TOKEN_BILLING
  const inputRate = config.inputCreditsPer1K ?? TEXT_INPUT_CREDITS_PER_1K
  const outputRate = config.outputCreditsPer1K ?? TEXT_OUTPUT_CREDITS_PER_1K
  const minimumCredits = config.minimumCredits ?? TEXT_MIN_CHARGE_CREDITS
  const credits = Math.ceil((billablePromptTokens / 1000) * inputRate + (billableCompletionTokens / 1000) * outputRate)

  return Math.max(minimumCredits, credits)
}

export function calculateTextUsageCost(tokenUsage?: TokenUsage, options: TextBillingOptions = {}): number {
  const inputTokens = normalizeInputTokens(tokenUsage)
  const outputTokens = normalizeOutputTokens(tokenUsage)
  const totalTokens = toNonNegativeNumber(tokenUsage?.totalTokens)
  return calculateTextCredits({
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens,
    hasOutput: options.hasOutputContent ?? outputTokens > 0,
  })
}

export function calculatePreviewCost(
  model: ModelType,
  options?: {
    isLuxury?: boolean
    estimatedInputTokens?: number
    estimatedOutputTokens?: number
  },
): number {
  const config = MODEL_COSTS[model]
  if (!config) return TEXT_TOKEN_BILLING.minimumCredits
  if (config.category === "media" && config.fixedCost) return config.fixedCost

  return calculateTextUsageCost({
    inputTokens: options?.estimatedInputTokens ?? config.estimatedInputTokens,
    outputTokens: options?.estimatedOutputTokens ?? config.estimatedOutputTokens,
  }, { hasOutputContent: true })
}

export function normalizeImage2SizeTier(size?: unknown): Image2SizeTier {
  const value = typeof size === "string" ? size.trim() : ""
  if (value === "512") return "512"
  if (value === "2K" || value === "original_2k" || value.startsWith("2048x") || value.endsWith("x2048")) return "2K"
  if (value === "4K" || value === "original_4k" || value === "3840x2160" || value === "2160x3840") return "4K"
  return "1K"
}

export function calculateImage2Credits(options: {
  size?: unknown
  quality?: unknown
  count?: unknown
  tokenUsage?: TokenUsage
  hasOutputContent?: boolean
} = {}): number {
  const sizeTier = normalizeImage2SizeTier(options.size)
  const baseCreditsBySize: Record<Image2SizeTier, number> = {
    "512": IMAGE2_512_CREDITS,
    "1K": IMAGE2_1K_CREDITS,
    "2K": IMAGE2_2K_CREDITS,
    "4K": IMAGE2_4K_CREDITS,
  }
  const quality = typeof options.quality === "string" ? options.quality : "low"
  const qualityExtra =
    quality === "medium"
      ? IMAGE2_MEDIUM_QUALITY_EXTRA_CREDITS
      : quality === "high"
        ? IMAGE2_HIGH_QUALITY_EXTRA_CREDITS
        : 0
  const imageCount = Math.max(1, Math.floor(Number(options.count ?? 1) || 1))
  const imageCredits = (baseCreditsBySize[sizeTier] + qualityExtra) * imageCount
  const tokenCredits = calculateTextUsageCost(options.tokenUsage, { hasOutputContent: options.hasOutputContent })
  return imageCredits + tokenCredits
}

export function calculateActualCost(
  model: ModelType,
  tokenUsage?: TokenUsage,
  options?: {
    hasGeneratedImage?: boolean
    hasOutputContent?: boolean
  },
): number {
  const config = MODEL_COSTS[model]
  if (!config) return calculateTextUsageCost(tokenUsage, { hasOutputContent: options?.hasOutputContent })

  if (model === "banana-2-pro" || model === "gemini-image") {
    const textCost = calculateTextUsageCost(tokenUsage, { hasOutputContent: options?.hasOutputContent })
    return options?.hasGeneratedImage ? (config.fixedCost || 0) + textCost : textCost
  }

  if (config.category === "media" && config.fixedCost) {
    if (model === "gpt-image-2") {
      return calculateImage2Credits({ tokenUsage, hasOutputContent: options?.hasOutputContent })
    }
    const textCost = model === "suno-v5" ? calculateTextUsageCost(tokenUsage, { hasOutputContent: options?.hasOutputContent }) : 0
    return config.fixedCost + textCost
  }

  return calculateTextUsageCost(tokenUsage, { hasOutputContent: options?.hasOutputContent })
}

export function getMinimumRequiredCredits(model: ModelType): number {
  const config = MODEL_COSTS[model]
  if (config?.category === "media" && config.fixedCost) return config.fixedCost

  const workflowKind = getTextWorkflowKind(model)
  if (workflowKind === "essay_correction") {
    return TEXT_WORKFLOW_MIN_REQUIRED_CREDITS.essay_correction
  }
  if (workflowKind === "long_writing") {
    return TEXT_WORKFLOW_MIN_REQUIRED_CREDITS.long_writing
  }

  return TEXT_WORKFLOW_MIN_REQUIRED_CREDITS.default_text
}

export function getTextWorkflowKind(model: ModelType): TextWorkflowKind {
  if (model === "general-chat") return "default_text"
  if (model === "standard") return "essay_correction"

  const shortAgents: ModelType[] = ["vocab-card", "quanquan-math", "quanquan-english"]
  if (shortAgents.includes(model)) return "short_agent"

  const ordinaryWriting: ModelType[] = ["resume-optimize", "speech-defense", "school-wechat"]
  if (ordinaryWriting.includes(model)) return "ordinary_writing"

  const longWriting: ModelType[] = [
    "teaching-pro",
    "beike-pro",
    "ai-writing-paper",
    "zhongying-essay",
    "reading-report",
    "experiment-report",
    "study-abroad",
  ]
  if (longWriting.includes(model)) return "long_writing"

  return "default_text"
}

export function getMaxOutputTokensForModel(model: ModelType): number | null {
  const config = MODEL_COSTS[model]
  if (config?.category === "media") return null
  const override = MODEL_MAX_OUTPUT_TOKEN_OVERRIDES[model]
  if (override) return override
  return TEXT_WORKFLOW_MAX_OUTPUT_TOKENS[getTextWorkflowKind(model)]
}

export function getMediaBillingConfig(model: ModelType): MediaBillingItem | undefined {
  return MEDIA_BILLING[model as keyof typeof MEDIA_BILLING]
}

export function appendTextOutputLimitInstruction(text: string, _model: ModelType): string {
  return text
}

export function shouldAuditHighConsumptionTextCall(
  model: ModelType,
  completionTokens: number,
  chargedCredits: number,
): boolean {
  if (MODEL_COSTS[model]?.category === "media") return false
  const maxOutputTokens = getMaxOutputTokensForModel(model) || HIGH_CONSUMPTION_TEXT_OUTPUT_TOKENS
  return (
    completionTokens >= HIGH_CONSUMPTION_TEXT_OUTPUT_TOKENS ||
    completionTokens >= Math.floor(maxOutputTokens * 0.9) ||
    chargedCredits >= HIGH_CONSUMPTION_TEXT_CREDITS
  )
}

export function getModelDisplayName(model: ModelType): string {
  return MODEL_COSTS[model]?.displayName || model
}

export function getModelMode(model: ModelType): GenMode {
  return MODEL_COSTS[model]?.mode || "text"
}

export function getModelCategory(model: ModelType): ModelCategory {
  return MODEL_COSTS[model]?.category || "text"
}

export function validateProfitMargin(): boolean {
  return true
}
