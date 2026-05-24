import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { createClient } from "@supabase/supabase-js"
import {
  DifyChatRequest,
  DifyWorkflowRequest,
  DifyImageObject,
  DifyFileObject,
  DifyImageSize,
} from "@/lib/dify-types"
import {
  calculateActualCost,
  calculateImage2Credits,
  getMaxOutputTokensForModel,
  getMinimumRequiredCredits,
  ModelType,
  getModelDisplayName,
  PRICING_VERSION,
  shouldAuditHighConsumptionTextCall,
} from "@/lib/pricing"
import { canUseImage2, isSubscribedUser, resolveMembershipStatus } from "@/lib/permissions"
import { recordBillingIssue } from "@/lib/credits"
import { refundImageTaskCredits } from "@/lib/image-task-refunds"
import { canUseTrialCredits } from "@/lib/trial-credits"
import {
  chargeCreditsSafely as spendCredits,
  createBillingLog as createBillingAuditMetadata,
  parseDifyUsage,
  type ParsedDifyUsage,
} from "@/lib/billing"
import { assertSecureTlsConfiguration } from "@/lib/runtime-security"
import { requireUser } from "@/lib/auth/verified-user"
import { isConfiguredAdminUser } from "@/lib/admin-auth"
import { internalDifyFetch } from "@/lib/internal-dify-fetch"
import { getDifyCredentialForModel } from "@/lib/dify-credentials"
import { isWorkflowSkillAgent } from "@/lib/workflow-skill-agents"
import { extractDifyTextOutput } from "@/lib/dify-output-text"
import { rewriteOpenClawMediaReferences } from "@/lib/openclaw-media"
import { rewriteOpenClawMediaReferencesWithSignedUrls } from "@/lib/openclaw-media-server"
import { evaluateOpenClawRuntimeRequest } from "@/lib/openclaw-runtime-guard"
import { getCodexSkillById } from "@/lib/codex-skills"
import { getOpenClawSkillById } from "@/lib/openclaw-skills"
import {
  createRequestId,
  createTraceId,
  createTaskRun,
  extractArtifactsFromText,
  extractArtifactsFromUnknown,
  replaceTaskNodeEvents,
  sanitizeForTrace,
  updateTaskRun,
} from "@/lib/ai-task-trace"
import { buildVocabCardWorkflowInputs, cleanVocabAnswer, extractVocabCardAudioUrl, extractVocabCardTtsStatus } from "@/lib/vocab-card-workflow"

export const runtime = "nodejs"
// 🔥 增加超时时间，支持 OpenClaw 大型 PPT 与图片生成网关的长任务重试
export const maxDuration = 900
export const dynamic = "force-dynamic"

type GptImageV11Inputs = {
  aspect_ratio: string
  size: string
  model: string
  quality: string
  output_format: string
  output_compression: number
  background: string
  moderation: string
  n: number
  mode: string
  reference_image_url: string
  reference_image_urls: string[]
  mask_image_url: string
}

type GeminiImageGatewayInputs = {
  aspect_ratio: string
  image_size: string
  model: string
  n: number
  mode: string
  reference_image_url: string
  reference_image_urls: string[]
}

const GPT_IMAGE_V11_DEFAULT_INPUTS: GptImageV11Inputs = {
  aspect_ratio: "1:1",
  size: "1024x1024",
  model: "gpt-image-1",
  quality: "low",
  output_format: "png",
  output_compression: 100,
  background: "auto",
  moderation: "auto",
  n: 1,
  mode: "image_generate",
  reference_image_url: "",
  reference_image_urls: [],
  mask_image_url: "",
}

const GPT_IMAGE_V11_ALLOWED = {
  aspect_ratio: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21", "2:1", "1:2", "3:1", "1:3"],
  size: ["auto", "1K", "2K", "4K", "original_1k", "original_2k", "original_4k", "1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "1152x2048", "3840x2160", "2160x3840"],
  model: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"],
  quality: ["auto", "low", "medium", "high"],
  output_format: ["png", "jpeg", "webp"],
  background: ["auto", "opaque", "transparent"],
  moderation: ["auto", "low"],
  mode: ["image_generate", "image_edit"],
} as const

const GEMINI_IMAGE_GATEWAY_DEFAULT_INPUTS: GeminiImageGatewayInputs = {
  aspect_ratio: "1:1",
  image_size: "1K",
  model: "gemini-3.1-flash-image-preview",
  n: 1,
  mode: "image_generate",
  reference_image_url: "",
  reference_image_urls: [],
}

const GEMINI_IMAGE_GATEWAY_ALLOWED = {
  aspect_ratio: ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "4:1", "1:4", "8:1", "1:8"],
  image_size: ["auto", "512", "1K", "2K", "4K"],
  model: ["gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"],
  mode: ["image_generate", "image_edit"],
} as const

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function pickEnum(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === "string" && allowed.includes(value) ? value : fallback
}

function pickImageSize(value: unknown): string {
  if (typeof value !== "string") return GPT_IMAGE_V11_DEFAULT_INPUTS.size
  const trimmed = value.trim()
  return trimmed || GPT_IMAGE_V11_DEFAULT_INPUTS.size
}

function pickUrlString(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.startsWith("http://") || value.startsWith("https://") ? value : ""
}

function pickUrlStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .filter((item) => item.startsWith("http://") || item.startsWith("https://"))
}

function isHtmlErrorContent(value: unknown) {
  if (typeof value !== "string") return false
  const text = value.trim().toLowerCase()
  return (
    text.startsWith("<!doctype html") ||
    text.startsWith("<html") ||
    text.includes("<title>shenxiang.school | 502: bad gateway</title>") ||
    text.includes("524: a timeout occurred") ||
    (text.includes("cloudflare") && (text.includes("bad gateway") || text.includes("a timeout occurred")))
  )
}

function sanitizeUpstreamErrorText(value: unknown, fallback = "图片服务暂时不可用，请稍后重试。") {
  if (typeof value !== "string") return fallback
  if (!value.trim() || isHtmlErrorContent(value)) return fallback
  return value.replace(/Dify\s*API/gi, "图片服务").replace(/Dify/gi, "服务").replace(/网关/g, "服务")
}

function buildGptImageV11Inputs(inputs: unknown): GptImageV11Inputs {
  const record = inputs && typeof inputs === "object" ? inputs as Record<string, unknown> : {}
  const referenceImageUrls = pickUrlStrings(record.reference_image_urls)
  const referenceImageUrl = pickUrlString(record.reference_image_url)
  const safeReferenceImageUrls = referenceImageUrls.length > 0
    ? referenceImageUrls
    : referenceImageUrl
      ? [referenceImageUrl]
      : []

  return {
    aspect_ratio: pickEnum(record.aspect_ratio, GPT_IMAGE_V11_ALLOWED.aspect_ratio, GPT_IMAGE_V11_DEFAULT_INPUTS.aspect_ratio),
    size: pickImageSize(record.size),
    model: pickEnum(record.model, GPT_IMAGE_V11_ALLOWED.model, GPT_IMAGE_V11_DEFAULT_INPUTS.model),
    quality: pickEnum(record.quality, GPT_IMAGE_V11_ALLOWED.quality, GPT_IMAGE_V11_DEFAULT_INPUTS.quality),
    output_format: pickEnum(record.output_format, GPT_IMAGE_V11_ALLOWED.output_format, GPT_IMAGE_V11_DEFAULT_INPUTS.output_format),
    output_compression: clampNumber(record.output_compression, 0, 100, GPT_IMAGE_V11_DEFAULT_INPUTS.output_compression),
    background: pickEnum(record.background, GPT_IMAGE_V11_ALLOWED.background, GPT_IMAGE_V11_DEFAULT_INPUTS.background),
    moderation: pickEnum(record.moderation, GPT_IMAGE_V11_ALLOWED.moderation, GPT_IMAGE_V11_DEFAULT_INPUTS.moderation),
    n: clampNumber(record.n, 1, 4, GPT_IMAGE_V11_DEFAULT_INPUTS.n),
    mode: pickEnum(record.mode, GPT_IMAGE_V11_ALLOWED.mode, GPT_IMAGE_V11_DEFAULT_INPUTS.mode),
    reference_image_url: safeReferenceImageUrls[0] || "",
    reference_image_urls: safeReferenceImageUrls.slice(0, 10),
    mask_image_url: pickUrlString(record.mask_image_url),
  }
}

function buildGeminiImageGatewayInputs(inputs: unknown): GeminiImageGatewayInputs {
  const record = inputs && typeof inputs === "object" ? inputs as Record<string, unknown> : {}
  const referenceImageUrls = pickUrlStrings(record.reference_image_urls)
  const referenceImageUrl = pickUrlString(record.reference_image_url)
  const safeReferenceImageUrls = referenceImageUrls.length > 0
    ? referenceImageUrls
    : referenceImageUrl
      ? [referenceImageUrl]
      : []
  const rawImageSize = typeof record.image_size === "string" && record.image_size.trim()
    ? record.image_size
    : typeof record.size === "string"
      ? record.size
      : GEMINI_IMAGE_GATEWAY_DEFAULT_INPUTS.image_size

  return {
    aspect_ratio: pickEnum(record.aspect_ratio, GEMINI_IMAGE_GATEWAY_ALLOWED.aspect_ratio, GEMINI_IMAGE_GATEWAY_DEFAULT_INPUTS.aspect_ratio),
    image_size: pickEnum(rawImageSize, GEMINI_IMAGE_GATEWAY_ALLOWED.image_size, GEMINI_IMAGE_GATEWAY_DEFAULT_INPUTS.image_size),
    model: pickEnum(record.model, GEMINI_IMAGE_GATEWAY_ALLOWED.model, GEMINI_IMAGE_GATEWAY_DEFAULT_INPUTS.model),
    n: clampNumber(record.n, 1, 4, GEMINI_IMAGE_GATEWAY_DEFAULT_INPUTS.n),
    mode: pickEnum(record.mode, GEMINI_IMAGE_GATEWAY_ALLOWED.mode, GEMINI_IMAGE_GATEWAY_DEFAULT_INPUTS.mode),
    reference_image_url: safeReferenceImageUrls[0] || "",
    reference_image_urls: safeReferenceImageUrls.slice(0, 10),
  }
}

function buildGptImageV11DifyInputs(inputs: unknown) {
  const imageInputs = buildGptImageV11Inputs(inputs)
  const referenceImageUrlsText = imageInputs.reference_image_urls.join("\n")

  return {
    ...imageInputs,
    reference_image_urls: referenceImageUrlsText,
    image_urls: referenceImageUrlsText,
    input_image_url: imageInputs.reference_image_url,
    source_image_url: imageInputs.reference_image_url,
    source_images: referenceImageUrlsText,
  }
}

function getImageGatewayOrientation(aspectRatio: string): "square" | "landscape" | "portrait" {
  const [width, height] = aspectRatio.split(":").map((part) => Number(part))
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "square"
  if (width > height) return "landscape"
  if (height > width) return "portrait"
  return "square"
}

function getImageGatewaySizeByTier(tier: "1K" | "2K" | "4K", aspectRatio: string): string {
  const orientation = getImageGatewayOrientation(aspectRatio)
  const sizeMap: Record<"1K" | "2K" | "4K", Record<"square" | "landscape" | "portrait", string>> = {
    "1K": {
      square: "1024x1024",
      landscape: "1536x1024",
      portrait: "1024x1536",
    },
    "2K": {
      square: "2048x2048",
      landscape: "2048x1152",
      portrait: "1152x2048",
    },
    "4K": {
      square: "2048x2048",
      landscape: "3840x2160",
      portrait: "2160x3840",
    },
  }
  return sizeMap[tier][orientation]
}

function normalizeImageGatewaySize(inputs: GptImageV11Inputs): string {
  const size = inputs.size.trim()

  if (/^\d+x\d+$/i.test(size)) return size

  if (
    inputs.mode === "image_edit" &&
    size.startsWith("original_") &&
    (inputs.reference_image_urls.length > 0 || inputs.reference_image_url)
  ) {
    return size
  }

  if (size === "4K" || size === "original_4k") return getImageGatewaySizeByTier("4K", inputs.aspect_ratio)
  if (size === "2K" || size === "original_2k") return getImageGatewaySizeByTier("2K", inputs.aspect_ratio)

  return getImageGatewaySizeByTier("1K", inputs.aspect_ratio)
}

function calculateGptImageGatewayCredits(inputs: GptImageV11Inputs): number {
  const modelType = inputs.model as ModelType
  if (modelType === "gpt-image-2") {
    return calculateImage2Credits({
      size: inputs.size,
      quality: inputs.quality,
      count: inputs.n,
    })
  }
  return calculateActualCost(modelType) * inputs.n
}

function getGptImageGatewayCreditsPerImage(inputs: GptImageV11Inputs): number {
  return Math.ceil(calculateGptImageGatewayCredits({ ...inputs, n: 1 }))
}

const WORKFLOW_MODELS = new Set(["vocab-card"])
const MEMBERSHIP_PRODUCT_IDS = ["basic", "pro", "premium", "enterprise", "campus"]
const ALL_IN_ONE_AGENT_MODEL = "all-in-one-agent"
const SUPER_ALL_IN_ONE_AGENT_MODEL = "super-all-in-one-agent"

const IMAGE_MEDIA_PATTERNS = [
  /生成(?:图片|图像|图)(?!.*(?:视频|短片|影片|mp4))/i,
  /(?:^|[\s，。,.；;、])(?:画|绘制)(?:一张|一幅|一个|张|个|幅|图|图片|图像|海报|插图|头像|logo|图标)/i,
  /(?:海报|封面图|配图|插图|头像|logo|图标|壁纸|表情包)/i,
  /\b(?:generate|create|make)\s+(?:an?\s+)?(?:image|picture|poster|illustration|cover|logo|icon)\b/i,
]

const VIDEO_MEDIA_PATTERNS = [
  /(?:生成|制作|合成|创建).*(?:视频|短片|影片|mp4)/i,
  /(?:图片|图像|首帧|尾帧).*(?:转视频|生成视频|视频)/i,
  /(?:图生视频|文生视频|首尾帧|视频生成|短视频|运镜|镜头生成)/i,
  /\b(?:video|mp4|image-to-video|text-to-video|short film|clip)\b/i,
]

function matchesAnyPattern(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value))
}

function detectMediaRequest(query: string, inputs: unknown): "image" | "video" | "unknown" {
  const record = inputs && typeof inputs === "object" && !Array.isArray(inputs)
    ? inputs as Record<string, unknown>
    : null
  const parts = [
    query,
    typeof record?.prompt === "string" ? record.prompt : "",
    typeof record?.image_prompt === "string" ? record.image_prompt : "",
    typeof record?.task_type === "string" ? record.task_type : "",
    typeof record?.user_intent === "string" ? record.user_intent : "",
    typeof record?.skill_name === "string" ? record.skill_name : "",
  ].filter(Boolean).join("\n")

  if (matchesAnyPattern(parts, VIDEO_MEDIA_PATTERNS)) return "video"
  if (matchesAnyPattern(parts, IMAGE_MEDIA_PATTERNS)) return "image"
  return "unknown"
}

function buildAllInOneAgentWorkflowInputs(query: string, inputs: unknown, fileUrls: string[]) {
  const record = inputs && typeof inputs === "object" ? inputs as Record<string, unknown> : {}
  const rawQuality = typeof record.quality === "string" ? record.quality : "low"
  const quality = ["low", "medium", "high"].includes(rawQuality) ? rawQuality : "low"
  const rawDuration = typeof record.duration_seconds === "number"
    ? record.duration_seconds
    : Number(record.duration_seconds)
  const imageUrlsText = fileUrls.join("\n")
  const prompt = query || "请根据用户需求生成内容"
  const mediaRequest = detectMediaRequest(prompt, record)

  return {
    ...record,
    raw_prompt: fileUrls.length > 0
      ? `${prompt}\n\n已上传原始图片，请必须基于这些图片进行改图或优化，不要说没有收到附件，也不要生成与原图无关的通用图片。原图地址：\n${imageUrlsText}`
      : prompt,
    prompt,
    query: prompt,
    style: typeof record.style === "string" && record.style.trim() ? record.style : "auto",
    duration_seconds: Number.isFinite(rawDuration) && rawDuration > 0 ? String(Math.min(120, Math.max(1, rawDuration))) : "auto",
    quality,
    requested_media_type: mediaRequest,
    requested_tool_family: mediaRequest === "image" ? "image_gateway" : mediaRequest === "video" ? "video_gateway" : "auto",
    has_uploaded_images: fileUrls.length > 0 ? "true" : "false",
    uploaded_image_count: String(fileUrls.length),
    file_urls: imageUrlsText,
    file_url: fileUrls[0] || "",
    image_urls: imageUrlsText,
    images: fileUrls.map((url) => ({ type: "image", url })),
    reference_image_urls: imageUrlsText,
    reference_image_url: fileUrls[0] || "",
    input_image_url: fileUrls[0] || "",
    source_image_url: fileUrls[0] || "",
    source_images: imageUrlsText,
  }
}

const CODEX_SKILL_INPUT_KEYS = [
  "codex_skill_id",
  "selected_skill",
  "skill_id",
  "skill",
  "skill_name",
] as const

function readCodexSkillId(inputs: unknown) {
  const record = readRecord(inputs)
  if (!record) return null

  for (const key of CODEX_SKILL_INPUT_KEYS) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }

  return null
}

function buildCodexSkillInputs(inputs: unknown) {
  const baseInputs = readRecord(inputs) ? { ...(inputs as Record<string, unknown>) } : {}
  const skillId = readCodexSkillId(baseInputs)
  if (!skillId) return { inputs: baseInputs, skillId: null }

  const skill = getCodexSkillById(skillId)
  const skillDisplayName = skill?.name || skillId

  return {
    inputs: {
      ...baseInputs,
      codex_skill_id: skillId,
      selected_skill: skillId,
      skill_id: skillId,
      skill: skillId,
      skill_name: skillId,
      skill_selected: skillId,
      codex_skill_name: skillDisplayName,
      codex_skill_description: skill?.description || "",
      codex_skill_category: skill?.category || "",
      codex_skill_tags: skill?.tags || [],
      force_skill_selected: "true",
    },
    skillId,
  }
}

function buildCodexSkillQuery(query: string, chatInputs: Record<string, unknown>) {
  const skillId = readCodexSkillId(chatInputs)
  if (!skillId) return query

  const skill = getCodexSkillById(skillId)
  const skillDisplayName = skill?.name || skillId
  const skillDescription = skill?.description || "用户已在前端明确选择该技能。"
  const skillTags = Array.isArray(skill?.tags) ? skill.tags.join("、") : ""
  const mediaRequest = detectMediaRequest(query, chatInputs)
  const mediaRoutingNote = [
    "[媒体工具路由硬规则]",
    "- 用户说“生成图片 / 生成图像 / 画图 / 海报 / 封面 / 配图 / illustration / poster”时，必须调用图片网关工具 generateImage 或 submitImageTask，禁止调用 createVideo。",
    "- 只有用户明确说“生成视频 / 图生视频 / 文生视频 / MP4 / 短片 / 首帧尾帧视频”时，才允许调用视频网关 createVideo。",
    "- 如果当前技能是 image_prompt，且用户说“生成图片”，请使用上一轮或当前上下文里的图片提示词作为 prompt 调用 generateImage。",
    `- 当前检测到的媒体意图: ${mediaRequest}`,
  ].join("\n")

  return [
    "[Codex 已加载技能]",
    `skill_selected: ${skillId}`,
    `skill_id: ${skillId}`,
    `skill_name: ${skillId}`,
    `skill_display_name: ${skillDisplayName}`,
    `skill_description: ${skillDescription}`,
    skillTags ? `skill_tags: ${skillTags}` : "",
    mediaRoutingNote,
    "system_note: 用户已在前端明确选择以上技能。请必须按该技能处理下面的用户请求，不要重新判定为 general 或其他技能，也不要把本段路由提示原样展示给用户。",
    "",
    "用户请求：",
    query,
  ].filter(Boolean).join("\n")
}

function buildImageWorkflowInputs(query: string, inputs: unknown) {
  const record = inputs && typeof inputs === "object" ? inputs as Record<string, unknown> : {}
  const referenceImageUrls = pickUrlStrings(record.reference_image_urls)
  const referenceImageUrl = pickUrlString(record.reference_image_url)
  const safeReferenceImageUrls = referenceImageUrls.length > 0
    ? referenceImageUrls
    : referenceImageUrl
      ? [referenceImageUrl]
      : []
  const imageUrlsText = safeReferenceImageUrls.join("\n")

  const { model: _model, provider: _provider, ...safeRecord } = record

  return {
    ...safeRecord,
    image_prompt: query,
    prompt: typeof record.prompt === "string" && record.prompt.trim() ? record.prompt : query,
    query,
    reference_image_url: safeReferenceImageUrls[0] || "",
    reference_image_urls: imageUrlsText,
    image_urls: imageUrlsText,
    input_image_url: safeReferenceImageUrls[0] || "",
    source_image_url: safeReferenceImageUrls[0] || "",
    source_images: imageUrlsText,
  }
}

type MembershipIdentity = {
  email?: string | null
  phone?: string | null
}

function hasGptImageModelInput(inputs: unknown): boolean {
  if (!inputs || typeof inputs !== "object") return false
  const rawModel = (inputs as Record<string, unknown>).model
  return typeof rawModel === "string" && GPT_IMAGE_V11_ALLOWED.model.some((model) => model === rawModel)
}

function isGptImageGatewayModel(model: unknown): model is "gpt-image-2" | "gpt-image-1" {
  return model === "gpt-image-2" || model === "gpt-image-1"
}

async function resolveActiveMembershipStatus(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  identity: MembershipIdentity = {},
): Promise<string | null> {
  const candidateUserIds = await resolveMembershipCandidateUserIds(supabase, userId, identity)

  const { data, error } = await supabase
    .from("orders")
    .select("product_id")
    .in("user_id", candidateUserIds)
    .eq("status", "paid")
    .in("product_id", MEMBERSHIP_PRODUCT_IDS)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn("[会员权限] 查询会员订单失败:", error.message)
    return null
  }

  const productId = typeof data?.product_id === "string" ? data.product_id : null
  if (isSubscribedUser(productId)) {
    return productId
  }

  const { data: creditData, error: creditError } = await supabase
    .from("user_credits")
    .select("is_pro")
    .in("user_id", candidateUserIds)

  if (creditError) {
    console.warn("[会员权限] 查询会员标记失败:", creditError.message)
    return null
  }

  const subscribedCredit = Array.isArray(creditData)
    ? creditData.find((row) => resolveMembershipStatus({ is_pro: row?.is_pro }))
    : null
  return resolveMembershipStatus({ is_pro: subscribedCredit?.is_pro })
}

function normalizeContactEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase()
  return normalized || null
}

function normalizeContactPhone(phone?: string | null): string | null {
  const normalized = String(phone || "").replace(/\D/g, "")
  return normalized.length >= 6 ? normalized : null
}

async function resolveMembershipCandidateUserIds(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  identity: MembershipIdentity,
): Promise<string[]> {
  const candidates = new Set<string>([userId])
  const emails = new Set<string>()
  const phones = new Set<string>()

  const authEmail = normalizeContactEmail(identity.email)
  const authPhone = normalizeContactPhone(identity.phone)
  if (authEmail) emails.add(authEmail)
  if (authPhone) phones.add(authPhone)

  const { data: currentProfile, error: currentProfileError } = await supabase
    .from("user_profiles")
    .select("email, phone")
    .eq("user_id", userId)
    .maybeSingle()

  if (currentProfileError) {
    console.warn("[会员权限] 查询当前用户资料失败:", currentProfileError.message)
  } else {
    const profileEmail = normalizeContactEmail(currentProfile?.email)
    const profilePhone = normalizeContactPhone(currentProfile?.phone)
    if (profileEmail) emails.add(profileEmail)
    if (profilePhone) phones.add(profilePhone)
  }

  for (const email of emails) {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("user_id")
      .ilike("email", email)
      .limit(10)

    if (error) {
      console.warn("[会员权限] 按邮箱关联用户失败:", error.message)
      continue
    }
    data?.forEach((profile) => {
      if (typeof profile?.user_id === "string" && profile.user_id) candidates.add(profile.user_id)
    })
  }

  for (const phone of phones) {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("user_id")
      .like("phone", `%${phone}%`)
      .limit(10)

    if (error) {
      console.warn("[会员权限] 按手机号关联用户失败:", error.message)
      continue
    }
    data?.forEach((profile) => {
      if (typeof profile?.user_id === "string" && profile.user_id) candidates.add(profile.user_id)
    })
  }

  return [...candidates]
}

function sanitizeVocabCardOutputs(outputs: unknown): Record<string, unknown> {
  const record = outputs && typeof outputs === "object" ? outputs as Record<string, unknown> : {}
  const audioUrl = extractVocabCardAudioUrl(record)
  return {
    answer: cleanVocabAnswer(record.answer),
    frontend_card_json: record.frontend_card_json || "",
    current_word: record.current_word || "",
    word: record.word || "",
    render_mode: record.render_mode || "",
    audio_url: audioUrl,
    tts_status: extractVocabCardTtsStatus(record, audioUrl),
    tts_response: record.tts_response || "",
  }
}

function summarizeDifyEventForLog(json: Record<string, any>) {
  const data = json.data && typeof json.data === "object" ? json.data as Record<string, any> : {}
  const outputs = data.outputs && typeof data.outputs === "object" ? data.outputs as Record<string, any> : {}
  return {
    event: typeof json.event === "string" ? json.event : "unknown",
    hasConversationId: typeof json.conversation_id === "string",
    nodeTitle: typeof data.title === "string" ? data.title : typeof json.title === "string" ? json.title : undefined,
    workflowRunId: typeof data.workflow_run_id === "string" || typeof json.workflow_run_id === "string" ? "present" : "missing",
    hasAnswer: typeof json.answer === "string" && json.answer.length > 0,
    outputKeys: Object.keys(outputs).slice(0, 10),
    fileCount: Array.isArray(outputs.files) ? outputs.files.length : undefined,
  }
}

// 默认的基础配置
const DIFY_BASE_URL = process.env.DIFY_INTERNAL_URL
  || process.env.DIFY_BASE_URL
  || "https://api.dify.ai/v1"
const DEFAULT_DIFY_FIRST_BYTE_TIMEOUT_MS = 120_000
const DEFAULT_DIFY_BLOCKING_RESPONSE_TIMEOUT_MS = Number(process.env.DIFY_BLOCKING_RESPONSE_TIMEOUT_MS || 600_000)
const OPENCLAW_FIRST_BYTE_TIMEOUT_MS = 900_000
const GPT_IMAGE_BLOCKING_TIMEOUT_MS = 300_000
const GPT_IMAGE_GATEWAY_TIMEOUT_MS = 540_000
const GPT_IMAGE_ASYNC_TASK_MAX_AGE_MS = 30 * 60 * 1000
const GPT_IMAGE_POLL_TOKEN_TTL_MS = GPT_IMAGE_ASYNC_TASK_MAX_AGE_MS + 5 * 60 * 1000
const IMAGE_GATEWAY_URL = (process.env.DIFY_IMAGE_GATEWAY_URL || "http://dify-image-gateway:8001").replace(/\/+$/, "")
const GEMINI_IMAGE_GATEWAY_URL = (process.env.GEMINI_IMAGE_GATEWAY_URL || "http://gemini-image-gateway:8002").replace(/\/+$/, "")
// 🔥 作文批改（standard）使用专用的 ESSAY_CORRECTION_API_KEY
const DEFAULT_DIFY_KEY = process.env.ESSAY_CORRECTION_API_KEY || process.env.DIFY_API_KEY 
const MISSING_DIFY_CREDENTIAL_STATUS = 503

function isDifyCredentialInvalidResponse(status: number, body: string) {
  const normalized = body.toLowerCase()
  return (
    status === 401 &&
    (
      normalized.includes("access token is invalid") ||
      normalized.includes('"code":"unauthorized"') ||
      normalized.includes('"code": "unauthorized"')
    )
  )
}

function getDifyCredentialInvalidMessage(model: string | null | undefined, keySource: string) {
  const label = model === "gemini-image"
    ? "Gemini 图像工作流"
    : model === "banana-2-pro"
      ? "Banana 图像工作流"
      : "Dify 工作流"
  return `${label}凭据失效，请管理员在服务器环境变量 ${keySource || "DIFY_API_KEY"} 中配置有效的 Dify 应用 API Key。`
}

function nowMs() {
  return Date.now()
}

function logPerf(requestId: string, stage: string, startedAt: number, extra: Record<string, unknown> = {}) {
  console.info("[DifyPerf]", {
    requestId,
    stage,
    elapsedMs: nowMs() - startedAt,
    ...extra,
  })
}

function getImageTaskPollSecret() {
  return process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
    || process.env.DIFY_IMAGE_GATEWAY_TOKEN
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || ""
}

function encodePollTokenPayload(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

function decodePollTokenPayload(encoded: string) {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8")
    const payload = JSON.parse(json)
    return payload && typeof payload === "object" ? payload as Record<string, unknown> : null
  } catch {
    return null
  }
}

function createPollTokenUserHash(secret: string, userId: string) {
  return createHmac("sha256", secret).update(userId).digest("hex").slice(0, 32)
}

function safeTimingEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function signImageTaskPollToken(params: { requestId: string; taskId: string; userId: string }) {
  const secret = getImageTaskPollSecret()
  if (!secret) return ""

  const encoded = encodePollTokenPayload({
    v: 1,
    requestId: params.requestId,
    taskId: params.taskId,
    userHash: createPollTokenUserHash(secret, params.userId),
    expiresAt: Date.now() + GPT_IMAGE_POLL_TOKEN_TTL_MS,
  })
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url")
  return `${encoded}.${signature}`
}

function verifyImageTaskPollToken(token: string | null, params: { requestId: string; taskId: string; userId: string }) {
  const secret = getImageTaskPollSecret()
  if (!secret || !token) return false

  const [encoded, signature, extra] = token.split(".")
  if (!encoded || !signature || extra !== undefined) return false

  const expectedSignature = createHmac("sha256", secret).update(encoded).digest("base64url")
  if (!safeTimingEqual(signature, expectedSignature)) return false

  const payload = decodePollTokenPayload(encoded)
  const expiresAt = typeof payload?.expiresAt === "number" ? payload.expiresAt : 0
  return (
    payload?.v === 1
    && payload.requestId === params.requestId
    && payload.taskId === params.taskId
    && payload.userHash === createPollTokenUserHash(secret, params.userId)
    && expiresAt > Date.now()
  )
}

function fireAndForget(label: string, work: Promise<unknown>) {
  work.catch((error) => {
    console.warn(`[${label}] async task failed:`, error instanceof Error ? error.message : String(error))
  })
}

// Supabase 客户端工厂函数（延迟创建避免构建时错误）
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * 🔥 验证AI响应是否为有效的作文批改结果
 * 如果AI没有识别到文档内容，返回的是废话/提示语，则不应该扣费
 * 
 * @param responseText AI返回的完整文本
 * @param modelType 使用的模型类型
 * @returns true = 有效响应，应该扣费；false = 无效响应，不扣费
 */
function validateEssayCorrectionResponse(responseText: string, modelType: ModelType): boolean {
  // 如果响应为空或太短，不扣费
  if (!responseText || responseText.length < 100) {
    console.log(`⚠️ [验证] 响应内容过短 (${responseText?.length || 0} 字符)，不扣费`)
    return false
  }
  
  // 🔥 检测无效响应的关键词（AI没有识别到文档时的常见回复）
  const invalidPatterns = [
    /没有.*?提供.*?文本/i,
    /没有.*?识别.*?内容/i,
    /无法.*?识别.*?文档/i,
    /请.*?提供.*?作文/i,
    /请.*?上传.*?文档/i,
    /没有.*?收到.*?作文/i,
    /未.*?检测到.*?内容/i,
    /没有.*?找到.*?文本/i,
    /请.*?输入.*?作文/i,
    /无法.*?读取.*?文件/i,
    /文档.*?为空/i,
    /内容.*?为空/i,
    /没有.*?文字/i,
    /图片.*?无法.*?识别/i,
    /OCR.*?失败/i,
    /不显示.*?提供.*?文本/i,
    // 🔥 新增：检测"评分全为0"的无效响应
    /您尚未提供.*?作文/i,
    /尚未提供.*?内容/i,
    /无法评价/i,
    /无法统计/i,
    /无法进行.*?分析/i,
    /无法判定/i,
    /未提供.*?作文/i,
    /未提供.*?内容/i,
    /需要.*?作文.*?文本/i,
    /缺少.*?作文/i,
  ]
  
  // 检查是否匹配无效模式
  for (const pattern of invalidPatterns) {
    if (pattern.test(responseText)) {
      console.log(`⚠️ [验证] 检测到无效响应模式: ${pattern}`)
      return false
    }
  }
  
  // 🔥 新增：检测"综合总分为0"的情况
  // 匹配类似 "综合总分 100% 0" 或 "得分 0" 的模式
  const zeroScorePatterns = [
    /综合总分.*?100%.*?0[^\d]/,
    /综合.*?得分.*?[：:]\s*0[^\d]/,
    /总分.*?[：:]\s*0[^\d]/,
    /等级判定.*?无法判定/,
  ]
  
  let zeroScoreCount = 0
  for (const pattern of zeroScorePatterns) {
    if (pattern.test(responseText)) {
      zeroScoreCount++
    }
  }
  
  // 如果检测到多个"0分"指标，说明是无效响应
  if (zeroScoreCount >= 2) {
    console.log(`⚠️ [验证] 检测到评分全为0的无效响应 (${zeroScoreCount}个0分指标)`)
    return false
  }
  
  // 🔥 检测有效响应的关键词（作文批改应该包含的内容）
  const validIndicators = [
    /批改/,
    /评分/,
    /得分/,
    /分数/,
    /优点/,
    /缺点/,
    /建议/,
    /修改/,
    /润色/,
    /原文/,
    /总评/,
    /点评/,
    /结构/,
    /语言/,
    /内容/,
    /主题/,
    /开头/,
    /结尾/,
    /段落/,
  ]
  
  // 至少要匹配3个有效指标才认为是有效的批改结果
  let validCount = 0
  for (const indicator of validIndicators) {
    if (indicator.test(responseText)) {
      validCount++
    }
  }
  
  if (validCount < 3) {
    console.log(`⚠️ [验证] 有效指标不足 (${validCount}/3)，可能不是有效的批改结果`)
    return false
  }
  
  // 🔥 新增：检查是否有实际的分数（非0分）
  // 匹配类似 "得分 15" 或 "分数：18" 的模式
  const hasRealScore = /得分.*?[1-9]\d*|分数.*?[1-9]\d*|[1-9]\d*\s*分/.test(responseText)
  
  if (!hasRealScore) {
    console.log(`⚠️ [验证] 未检测到有效分数，可能是无效批改`)
    return false
  }
  
  console.log(`✅ [验证] 响应有效，包含 ${validCount} 个批改指标，且有实际分数`)
  return true
}

const WORKFLOW_TERMINAL_STATUSES = new Set([
  "succeeded",
  "failed",
  "stopped",
  "partial-succeeded",
  "paused",
])

function isWorkflowTerminalStatus(status: unknown): status is string {
  return typeof status === "string" && WORKFLOW_TERMINAL_STATUSES.has(status)
}

function extractWorkflowImageUrls(payload: unknown): string[] {
  const urls = new Set<string>()

  const visit = (value: unknown) => {
    if (!value) return

    if (typeof value === "string") {
      if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:image/")) {
        urls.add(value)
      }
      return
    }

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    if (typeof value !== "object") return

    const record = value as Record<string, unknown>
    visit(record.url)
    visit(record.first_url)
    visit(record.image_data_uri)
    visit(record.image)
    visit(record.images)
    visit(record.file)
    visit(record.files)
    visit(record.data)
    visit(record.outputs)

    if (typeof record.raw_body === "string") {
      try {
        visit(JSON.parse(record.raw_body))
      } catch {
        // Ignore malformed raw_body payloads and keep other fallbacks.
      }
    }
  }

  visit(payload)
  return Array.from(urls)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function extractJsonObjectsFromText(text: string): unknown[] {
  const objects: unknown[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === "{") {
      if (depth === 0) start = index
      depth++
      continue
    }

    if (char === "}" && depth > 0) {
      depth--
      if (depth === 0 && start >= 0) {
        const parsed = safeJsonParse(text.slice(start, index + 1))
        if (parsed) objects.push(parsed)
        start = -1
      }
    }
  }

  return objects
}

function looksLikeAllInOneControlPayload(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return false
  return /^(?:animation|video|image|ppt|presentation|workflow|tool|artifact|parameters?)\s*\{/i.test(trimmed)
    || /^\{[\s\S]*"(?:output_mode|parameters_to_animate|axes_config|animation_style|duration_seconds|quality|task_id|skill_name|status|success)"[\s\S]*\}$/.test(trimmed)
}

function shouldStreamAllInOneAnswer(event: Record<string, unknown>) {
  const answer = typeof event.answer === "string" ? event.answer : ""
  if (!answer.trim() || looksLikeAllInOneControlPayload(answer)) return false
  const selector = Array.isArray(event.from_variable_selector)
    ? event.from_variable_selector.filter((item): item is string => typeof item === "string").join(".")
    : ""
  return !selector.includes("quick_reply_answer_node") && !selector.includes("frontend_input_node")
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

const OPENCLAW_SKILL_INPUT_KEYS = [
  "openclaw_skill_id",
  "selected_skill",
  "skill_id",
  "skill",
  "skill_name",
] as const

function readOpenClawSkillId(inputs: unknown) {
  const record = readRecord(inputs)
  if (!record) return null

  for (const key of OPENCLAW_SKILL_INPUT_KEYS) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }

  return null
}

function buildOpenClawSkillInputs(inputs: unknown) {
  const baseInputs = readRecord(inputs) ? { ...(inputs as Record<string, unknown>) } : {}
  const skillId = readOpenClawSkillId(baseInputs)
  if (!skillId) return { inputs: baseInputs, skillId: null }

  const skill = getOpenClawSkillById(skillId)
  const skillDisplayName = skill?.name || skillId

  return {
    inputs: {
      ...baseInputs,
      openclaw_skill_id: skillId,
      selected_skill: skillId,
      skill_id: skillId,
      skill: skillId,
      skill_name: skillId,
      skill_selected: skillId,
      openclaw_skill_name: skillDisplayName,
      openclaw_skill_description: skill?.description || "",
      openclaw_skill_category: skill?.category || "",
      openclaw_skill_tags: skill?.tags || [],
      force_skill_selected: "true",
    },
    skillId,
  }
}

function buildOpenClawSkillQuery(query: string, chatInputs: Record<string, unknown>) {
  const skillId = readOpenClawSkillId(chatInputs)
  if (!skillId) return query

  const skill = getOpenClawSkillById(skillId)
  const skillDisplayName = skill?.name || skillId
  const skillDescription = skill?.description || "用户已在前端明确选择该技能。"
  const skillTags = Array.isArray(skill?.tags) ? skill.tags.join("、") : ""

  return [
    "[OpenClaw 已加载技能]",
    `skill_selected: ${skillId}`,
    `skill_id: ${skillId}`,
    `skill_name: ${skillId}`,
    `skill_display_name: ${skillDisplayName}`,
    `skill_description: ${skillDescription}`,
    skillTags ? `skill_tags: ${skillTags}` : "",
    "system_note: 用户已在前端明确选择以上技能。请必须按该技能处理下面的用户请求，不要重新判定为 none，也不要把本段路由提示原样展示给用户。",
    "",
    "用户请求：",
    query,
  ].filter(Boolean).join("\n")
}

function extractOpenClawFinalNodeText(event: Record<string, unknown>) {
  if (event.event !== "node_finished") return ""

  const data = readRecord(event.data)
  const outputs = readRecord(data?.outputs)
  if (!data || !outputs) return ""

  const nodeTitle = String(data.title || event.title || "").trim().toLowerCase()
  const nodeType = String(data.node_type || data.type || event.node_type || "").trim().toLowerCase()
  const isFinalTextNode =
    nodeType === "llm" ||
    nodeType === "answer" ||
    nodeType === "direct-answer" ||
    nodeTitle === "llm" ||
    nodeTitle.includes("直接回复") ||
    nodeTitle.includes("direct reply") ||
    nodeTitle.includes("final answer") ||
    nodeTitle.includes("answer")

  if (!isFinalTextNode) return ""

  return extractDifyTextOutput({
    answer: outputs.answer,
    text: outputs.text,
    result: outputs.result,
    markdown: outputs.markdown,
    content: outputs.content,
  })
}

function extractFinalNodeOutputText(event: Record<string, unknown>) {
  if (event.event !== "node_finished") return ""

  const data = readRecord(event.data)
  const outputs = readRecord(data?.outputs)
  if (!data || !outputs) return ""

  const nodeTitle = String(data.title || event.title || "").trim().toLowerCase()
  const nodeType = String(data.node_type || data.type || event.node_type || "").trim().toLowerCase()
  const isDisplayNode =
    nodeType === "llm" ||
    nodeType === "answer" ||
    nodeType === "direct-answer" ||
    nodeTitle === "llm" ||
    nodeTitle.includes("直接回复") ||
    nodeTitle.includes("direct reply") ||
    nodeTitle.includes("final answer") ||
    nodeTitle.includes("answer") ||
    nodeTitle.includes("总编辑") ||
    nodeTitle.includes("报告")

  if (!isDisplayNode) return ""

  return extractDifyTextOutput({
    answer: outputs.answer,
    text: outputs.text,
    result: outputs.result,
    markdown: outputs.markdown,
    content: outputs.content,
  })
}

function extractDisplayTextFromUnknown(value: unknown): string[] {
  if (!value) return []
  if (typeof value === "string") {
    const parsed = safeJsonParse(value)
    if (parsed && parsed !== value) return extractDisplayTextFromUnknown(parsed)
    return [value]
  }
  if (Array.isArray(value)) return value.flatMap(extractDisplayTextFromUnknown)
  if (typeof value !== "object") return []

  const record = value as Record<string, unknown>
  return ["result", "answer", "text", "markdown", "content", "message", "outputs", "data"]
    .flatMap((key) => extractDisplayTextFromUnknown(record[key]))
}

function stripInternalFileReferences(markdown: string) {
  return markdown
    .replace(/`?(?:\/workspace|\/tmp|\/opt|\/app|file:\/\/|generated\/)[^\s`)]+`?/g, "已在对话中整理为可展示内容")
    .replace(/^\s*[-*]?\s*(?:视频文件|文件结果|输出文件|本地文件|文件路径)\s*[:：]\s*已在对话中整理为可展示内容\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function normalizeAllInOneAgentDisplay(rawText: string) {
  const parsedValues = [
    safeJsonParse(rawText),
    ...extractJsonObjectsFromText(rawText),
  ].filter(Boolean)

  const textCandidates = parsedValues.length > 0
    ? parsedValues.flatMap(extractDisplayTextFromUnknown)
    : [rawText]

  const rawDisplayText = textCandidates
    .map((text) => text.trim())
    .filter((text) => !looksLikeAllInOneControlPayload(text))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || (parsedValues.length > 0 || looksLikeAllInOneControlPayload(rawText) ? "" : rawText)

  const displayText = stripInternalFileReferences(rawDisplayText)
  return displayText || "任务已提交，但上游还没有返回可直接展示的内容。请稍后重试，或换一个更明确的生成要求。"
}

type SseByteController = {
  enqueue(chunk: Uint8Array): void
}

function enqueueSseEvent(controller: SseByteController, payload: Record<string, unknown>) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`))
}

function enqueueSseAnswer(controller: SseByteController, answer: string) {
  enqueueSseEvent(controller, { event: "message", answer })
}

function enqueueSseStatus(controller: SseByteController, payload: {
  stage: string
  progress?: number
  heartbeat?: number
}) {
  enqueueSseEvent(controller, {
    event: "status",
    ...payload,
    ts: Date.now(),
  })
}

function getTraceModelDisplayName(model?: string | null) {
  if (!model) return "当前任务"
  return getModelDisplayName(model as ModelType) || model
}

const DIFY_CONVERSATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeDifyConversationId(value: unknown, modelPrefix: string): string | null {
  if (typeof value !== "string") return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const separatorIndex = trimmed.indexOf(":")
  if (separatorIndex > 0) {
    const prefix = trimmed.slice(0, separatorIndex)
    const candidate = trimmed.slice(separatorIndex + 1)
    if (prefix !== modelPrefix) return null
    return DIFY_CONVERSATION_ID_PATTERN.test(candidate) ? candidate : null
  }

  return DIFY_CONVERSATION_ID_PATTERN.test(trimmed) ? trimmed : null
}

async function shouldRetryDifyWithNewConversation(response: Response, conversationId: string | null) {
  if (!conversationId) return false
  if (response.status === 404) return true
  if (response.status !== 400) return false

  const text = await response.clone().text().catch(() => "")
  const lower = text.toLowerCase()
  const isConversationError =
    lower.includes("conversation") &&
    (
      lower.includes("not found") ||
      lower.includes("not_found") ||
      lower.includes("not exists") ||
      lower.includes("does not exist") ||
      lower.includes("invalid")
    )

  return isConversationError
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  }
}

function buildImageGatewayPayload(query: string, inputs: unknown) {
  const imageInputs = buildGptImageV11Inputs(inputs)
  const gatewaySize = normalizeImageGatewaySize(imageInputs)

  return {
    prompt: query || "生成图片",
    mode: imageInputs.mode,
    model: imageInputs.model,
    size: gatewaySize,
    quality: imageInputs.quality,
    n: imageInputs.n,
    output_format: imageInputs.output_format,
    output_compression: imageInputs.output_compression,
    background: imageInputs.background,
    moderation: imageInputs.moderation,
    reference_image_urls: imageInputs.reference_image_urls.length > 0
      ? imageInputs.reference_image_urls
      : imageInputs.reference_image_url
        ? [imageInputs.reference_image_url]
        : [],
    mask_image_url: imageInputs.mask_image_url,
  }
}

function buildGeminiImageGatewayPayload(query: string, inputs: unknown) {
  const imageInputs = buildGeminiImageGatewayInputs(inputs)

  return {
    prompt: query || "生成图片",
    mode: imageInputs.mode,
    model: imageInputs.model,
    aspect_ratio: imageInputs.aspect_ratio,
    image_size: imageInputs.image_size,
    response_modalities: ["TEXT", "IMAGE"],
    n: imageInputs.n,
    reference_image_url: imageInputs.reference_image_url,
    reference_image_urls: imageInputs.reference_image_urls,
  }
}

function createImageGatewayResponse(payload: unknown) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}
  const success = record.success !== false
  const statusCode = typeof record.status_code === "number" ? record.status_code : success ? 200 : 502
  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : {}
  const imageUrls = extractWorkflowImageUrls(data)
  const detail = record.detail && typeof record.detail === "object" ? record.detail as Record<string, unknown> : {}
  const requestPayload = detail.request_payload && typeof detail.request_payload === "object" ? detail.request_payload as Record<string, unknown> : {}
  const referenceImageUrls = Array.isArray(requestPayload.reference_image_urls) ? requestPayload.reference_image_urls : []
  const message = typeof record.message === "string"
    ? sanitizeUpstreamErrorText(record.message, success ? "图片生成成功" : "图片服务暂时不可用，请稍后重试。")
    : success ? "图片生成成功" : "图片服务暂时不可用，请稍后重试。"
  const answer = [message, ...imageUrls.map((url) => `![Generated Image](${url})`)].join("\n\n")

  console.log("[GPT Image Gateway] response", {
    success,
    code: typeof record.code === "string" ? record.code : "",
    statusCode,
    message,
    imageCount: imageUrls.length,
    referenceCount: referenceImageUrls.length,
  })

  if (!success) {
    return Response.json({ error: message, code: "IMAGE_GATEWAY_FAILED" }, { status: statusCode >= 400 ? statusCode : 502 })
  }

  return Response.json({
    answer,
    data: {
      status: "succeeded",
      outputs: {
        ...record,
        text: answer,
        image_urls: imageUrls,
        images: imageUrls.map((url) => ({ type: "image", url })),
      },
    },
  })
}

async function chargeFixedImageCredits(params: {
  userId: string
  amount: number
  imageCount: number
  imageSize: string
  modelId: ModelType
  keySource: string | null
  gatewayName: string
  feature?: string
  rawProviderMetadata?: Record<string, unknown>
  requestId: string
  conversationId?: string | null
  messageId?: string | null
}) {
  const description = `图片生成 - ${getModelDisplayName(params.modelId)} x${params.imageCount}`
  const billingMetadata = createBillingAuditMetadata({
    userId: params.userId,
    actionType: "image_generation",
    feature: params.feature || "image",
    appId: params.keySource || params.gatewayName,
    workflowId: params.gatewayName,
    modelId: params.modelId,
    requestedAppId: params.keySource || params.gatewayName,
    requestedWorkflowId: params.gatewayName,
    requestedModelId: params.modelId,
    pricingVersion: PRICING_VERSION,
    usageSource: "fixed",
    estimated: false,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    chargedCredits: params.amount,
    requestId: params.requestId,
    conversationId: params.conversationId || null,
    messageId: params.messageId || null,
    rawProviderMetadata: {
      imageCount: params.imageCount,
      fixedCreditsPerImage: Math.ceil(params.amount / Math.max(1, params.imageCount)),
      imageSize: params.imageSize,
      ...(params.rawProviderMetadata || {}),
    },
    description,
  })

  const charged = await spendCredits(
    params.userId,
    params.amount,
    "consume",
    description,
    params.requestId,
    billingMetadata,
  )

  return { charged, description, billingMetadata }
}

async function chargeImageGatewayCredits(params: {
  userId: string
  amount: number
  inputs: GptImageV11Inputs
  billingModel: ModelType
  keySource: string | null
  requestId: string
  conversationId?: string | null
  messageId?: string | null
}) {
  return chargeFixedImageCredits({
    userId: params.userId,
    amount: params.amount,
    imageCount: params.inputs.n || 1,
    imageSize: params.inputs.size,
    modelId: params.billingModel,
    keySource: params.keySource,
    gatewayName: "dify-image-gateway",
    feature: params.billingModel === "gpt-image-2" ? "image2" : "image",
    requestId: params.requestId,
    conversationId: params.conversationId || null,
    messageId: params.messageId || null,
    rawProviderMetadata: {
      imageQuality: params.inputs.quality,
      inputs: params.inputs,
    },
  })
}

async function callImageGatewayDirect(query: string, inputs: unknown) {
  const gatewayToken = process.env.DIFY_IMAGE_GATEWAY_TOKEN || ""
  const timeout = createTimeoutSignal(GPT_IMAGE_GATEWAY_TIMEOUT_MS)

  try {
    const response = await internalDifyFetch(`${IMAGE_GATEWAY_URL}/api/image/unified`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(gatewayToken
          ? {
              "x-gateway-token": gatewayToken,
              Authorization: `Bearer ${gatewayToken}`,
            }
          : {}),
      },
      body: JSON.stringify(buildImageGatewayPayload(query, inputs)),
      signal: timeout.signal,
    })

    const text = await response.text()
    let payload: unknown = {}
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { success: false, message: sanitizeUpstreamErrorText(text), status_code: response.status }
    }

    if (!response.ok) {
      const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}
      const message = sanitizeUpstreamErrorText(record.message, "图片服务请求失败，请稍后重试。")
      return Response.json({ error: message, code: "IMAGE_GATEWAY_HTTP_ERROR" }, { status: response.status })
    }

    return createImageGatewayResponse(payload)
  } catch (error) {
    const err = error instanceof Error ? error : null
    if (err?.name === "AbortError") {
      return Response.json(
        { error: "图片生成等待超时，请降低尺寸或质量后重试", code: "IMAGE_GATEWAY_TIMEOUT" },
        { status: 504 },
      )
    }

    console.error("❌ [GPT Image] 直连图片服务失败:", error)
    return Response.json(
      { error: "图片服务暂时不可用，请稍后重试" },
      { status: 502 },
    )
  } finally {
    timeout.clear()
  }
}

async function callGeminiImageGatewayDirect(query: string, inputs: unknown) {
  const gatewayToken = process.env.GEMINI_IMAGE_GATEWAY_TOKEN || ""
  const timeout = createTimeoutSignal(GPT_IMAGE_GATEWAY_TIMEOUT_MS)

  try {
    const response = await internalDifyFetch(`${GEMINI_IMAGE_GATEWAY_URL}/api/gemini-image/unified`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(gatewayToken
          ? {
              "x-gateway-token": gatewayToken,
              Authorization: `Bearer ${gatewayToken}`,
            }
          : {}),
      },
      body: JSON.stringify(buildGeminiImageGatewayPayload(query, inputs)),
      signal: timeout.signal,
    })

    const text = await response.text()
    let payload: unknown = {}
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { success: false, message: sanitizeUpstreamErrorText(text), status_code: response.status }
    }

    if (!response.ok) {
      const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}
      const message = sanitizeUpstreamErrorText(record.message, "Gemini 图像服务请求失败，请稍后重试。")
      return Response.json({ error: message, code: "GEMINI_IMAGE_GATEWAY_HTTP_ERROR" }, { status: response.status })
    }

    return createImageGatewayResponse(payload)
  } catch (error) {
    const err = error instanceof Error ? error : null
    if (err?.name === "AbortError") {
      return Response.json(
        { error: "Gemini 图像生成等待超时，请降低尺寸或质量后重试", code: "GEMINI_IMAGE_GATEWAY_TIMEOUT" },
        { status: 504 },
      )
    }

    console.error("❌ [Gemini Image] 直连图片服务失败:", error)
    return Response.json(
      { error: "Gemini 图像服务暂时不可用，请稍后重试", code: "GEMINI_IMAGE_GATEWAY_UNAVAILABLE" },
      { status: 502 },
    )
  } finally {
    timeout.clear()
  }
}

async function startImageGatewayTask(params: {
  query: string
  inputs: unknown
  userId: string
  requestId: string
  traceId: string
}) {
  const gatewayToken = process.env.DIFY_IMAGE_GATEWAY_TOKEN || ""
  const response = await internalDifyFetch(`${IMAGE_GATEWAY_URL}/api/image/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(gatewayToken
        ? {
            "x-gateway-token": gatewayToken,
            Authorization: `Bearer ${gatewayToken}`,
          }
        : {}),
    },
    body: JSON.stringify({
      ...buildImageGatewayPayload(params.query, params.inputs),
      user_id: params.userId,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  const taskId = typeof payload?.task_id === "string" ? payload.task_id : ""

  if (!response.ok || !taskId) {
    const message = typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.error === "string"
        ? payload.error
        : "图片任务提交失败"
    throw new Error(message)
  }

  await updateTaskRun(params.requestId, {
    status: "running",
    stage: "图片任务已提交，等待生成结果",
    progress: 15,
    upstreamTaskId: taskId,
    metadata: {
      image_task_id: taskId,
      gateway_status: response.status,
    },
  })

  console.log("[GPT Image Task] persisted", {
    taskId,
    promptLength: params.query.length,
    requestId: params.requestId,
    traceId: params.traceId,
  })

  return taskId
}

export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("imageTaskId")
  if (!taskId) {
    return Response.json({ error: "缺少图片任务 ID", code: "IMAGE_TASK_ID_MISSING" }, { status: 400 })
  }

  const auth = await requireUser(request)
  if (auth.response) return auth.response
  const userId = auth.user!.id
  const requestId = request.nextUrl.searchParams.get("requestId") || request.headers.get("X-Request-Id")
  if (!requestId) {
    return Response.json({ error: "未授权访问，请先登录", code: "UNAUTHORIZED", taskId }, { status: 401 })
  }
  const pollToken = request.nextUrl.searchParams.get("pollToken") || request.headers.get("X-Image-Task-Poll-Token")

  const { data: taskOwner, error: taskOwnerError } = await getSupabaseAdmin()
    .from("ai_task_runs")
    .select("id,user_id,upstream_task_id,status,created_at")
    .eq("id", requestId)
    .eq("user_id", userId)
    .maybeSingle()

  if (taskOwnerError) {
    console.error("[GPT Image Task] 权限校验失败:", taskOwnerError)
    return Response.json({ error: "图片任务权限校验失败", code: "IMAGE_TASK_OWNER_LOOKUP_FAILED", requestId, taskId }, { status: 500 })
  }

  if (!taskOwner || (taskOwner.upstream_task_id && taskOwner.upstream_task_id !== taskId)) {
    const tokenAuthorized = verifyImageTaskPollToken(pollToken, { requestId, taskId, userId })
    if (!tokenAuthorized) {
      console.warn("[GPT Image Task] 用户无权查询图片任务", {
        requestId,
        taskId,
        hasOwner: Boolean(taskOwner),
        hasPollToken: Boolean(pollToken),
      })
      return Response.json({ error: "无权访问该图片任务", code: "IMAGE_TASK_FORBIDDEN", requestId, taskId }, { status: 403 })
    }
    console.warn("[GPT Image Task] owner 记录暂未匹配，已使用签名轮询凭证继续查询", {
      requestId,
      taskId,
      hasOwner: Boolean(taskOwner),
    })
  }

  const createdAtMs = taskOwner?.created_at ? new Date(taskOwner.created_at).getTime() : NaN
  const taskAgeMs = Number.isFinite(createdAtMs) ? Date.now() - createdAtMs : 0

  const gatewayToken = process.env.DIFY_IMAGE_GATEWAY_TOKEN || ""
  const response = await internalDifyFetch(`${IMAGE_GATEWAY_URL}/api/image/tasks/${encodeURIComponent(taskId)}`, {
    headers: {
      ...(gatewayToken
        ? {
            "x-gateway-token": gatewayToken,
            Authorization: `Bearer ${gatewayToken}`,
          }
        : {}),
    },
  })
  const task = await response.json().catch(() => ({}))

  if (!response.ok || task?.code === "task_not_found") {
    const refund = await refundImageTaskCredits({
      userId,
      requestId,
      reason: "图片任务不存在或已过期",
      errorCode: "IMAGE_TASK_NOT_FOUND",
      statusCode: response.status || 404,
    })
    if (requestId) {
      await updateTaskRun(requestId, {
        status: "failed",
        stage: "图片任务不存在或已过期",
        progress: 100,
        upstreamTaskId: taskId,
        errorMessage: "图片任务不存在或已过期",
        errorCode: "IMAGE_TASK_NOT_FOUND",
        sanitizedError: sanitizeForTrace(task) as Record<string, unknown>,
        metadata: {
          refund_status: refund.status,
          refund_amount: refund.amount || 0,
          refund_reference_id: refund.refundReferenceId || null,
        },
      })
    }
    return Response.json({
      status: "failed",
      error: "图片任务不存在或已过期",
      code: "IMAGE_TASK_NOT_FOUND",
      requestId,
      taskId,
      refund,
    })
  }

  const elapsedMs = typeof task?.elapsed_ms === "number" ? task.elapsed_ms : 0

  if (task?.status === "succeeded") {
    const wrappedResponse = createImageGatewayResponse(task.result)
    const wrappedPayload = await wrappedResponse.json().catch(() => ({}))
    if (requestId) {
      await updateTaskRun(requestId, {
        status: "succeeded",
        stage: "图片生成完成",
        progress: 100,
        upstreamTaskId: taskId,
        artifacts: extractArtifactsFromUnknown(wrappedPayload),
        metadata: {
          elapsed_ms: elapsedMs,
          gateway_status: task?.status,
        },
      })
    }
    return Response.json({
      status: "succeeded",
      taskId,
      requestId,
      elapsedMs,
      result: wrappedPayload,
    })
  }

  if (task?.status === "failed") {
    const errorMessage = typeof task?.error === "string" ? task.error : "图片服务请求失败"
    const statusCode = typeof task?.status_code === "number" && task.status_code >= 400 ? task.status_code : 502
    const refund = await refundImageTaskCredits({
      userId,
      requestId,
      reason: errorMessage,
      errorCode: "IMAGE_TASK_FAILED",
      statusCode,
    })
    if (requestId) {
      await updateTaskRun(requestId, {
        status: "failed",
        stage: "图片生成失败",
        progress: 100,
        upstreamTaskId: taskId,
        errorMessage,
        errorCode: "IMAGE_TASK_FAILED",
        sanitizedError: sanitizeForTrace(task?.error_payload || task) as Record<string, unknown>,
        metadata: {
          elapsed_ms: elapsedMs,
          gateway_status: task?.status,
          status_code: statusCode,
          refund_status: refund.status,
          refund_amount: refund.amount || 0,
          refund_reference_id: refund.refundReferenceId || null,
        },
      })
    }
    return Response.json({
      status: "failed",
      taskId,
      requestId,
      elapsedMs,
      error: errorMessage,
      code: "IMAGE_TASK_FAILED",
      upstreamStatusCode: statusCode,
      data: task?.error_payload || {},
      refund,
    })
  }

  if ((taskOwner?.status === "queued" || taskOwner?.status === "running") && taskAgeMs > GPT_IMAGE_ASYNC_TASK_MAX_AGE_MS) {
    const refund = await refundImageTaskCredits({
      userId,
      requestId,
      reason: "图片异步任务轮询超时",
      errorCode: "IMAGE_TASK_POLL_TIMEOUT",
    })
    await updateTaskRun(requestId, {
      status: "timeout",
      stage: "图片任务超时，已自动退回积分",
      progress: 100,
      upstreamTaskId: taskId,
      errorMessage: "图片任务长时间未完成，系统已自动结束并尝试退回积分",
      errorCode: "IMAGE_TASK_POLL_TIMEOUT",
      metadata: {
        elapsed_ms: taskAgeMs,
        gateway_status: task?.status || "timeout",
        refund_status: refund.status,
        refund_amount: refund.amount || 0,
        refund_reference_id: refund.refundReferenceId || null,
      },
    })
    return Response.json({
      status: "failed",
      taskId,
      requestId,
      elapsedMs: taskAgeMs,
      error: "图片任务超时，已自动退回积分",
      code: "IMAGE_TASK_POLL_TIMEOUT",
      refund,
    })
  }

  if (requestId) {
    await updateTaskRun(requestId, {
      status: "running",
      stage: task?.status === "queued" ? "图片任务排队中" : "图片正在生成",
      progress: task?.status === "queued" ? 25 : 55,
      upstreamTaskId: taskId,
      metadata: {
        elapsed_ms: elapsedMs,
        gateway_status: task?.status || "running",
      },
    })
  }

  return Response.json({
    status: task?.status === "queued" ? "running" : "running",
    taskId,
    requestId,
    elapsedMs,
  })
}

async function pollWorkflowRunDetail(params: {
  workflowRunId: string
  baseUrl: string
  credential: string
  maxWaitMs?: number
  pollIntervalMs?: number
}) {
  const {
    workflowRunId,
    baseUrl,
    credential,
    maxWaitMs = 180_000,
    pollIntervalMs = 2_000,
  } = params

  const deadline = Date.now() + maxWaitMs
  let lastPayload: Record<string, unknown> | null = null

  while (Date.now() < deadline) {
    const detailResponse = await internalDifyFetch(`${baseUrl}/workflows/run/${workflowRunId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credential}`,
      },
      cache: "no-store",
    })

    if (!detailResponse.ok) {
      const errorText = await detailResponse.text()
      console.warn(`⚠️ [GPT Image 2] 查询工作流详情失败 status=${detailResponse.status} body=${errorText.slice(0, 200)}`)
    } else {
      const detail = await detailResponse.json()
      lastPayload = detail

      const status = typeof detail?.status === "string" ? detail.status : "unknown"
      const imageCount = extractWorkflowImageUrls(detail?.outputs).length

      console.log(`🔄 [GPT Image 2] 轮询工作流详情 status=${status} images=${imageCount}`)

      if (imageCount > 0 || isWorkflowTerminalStatus(status)) {
        return detail
      }
    }

    await sleep(pollIntervalMs)
  }

  console.warn(`⏰ [GPT Image 2] 轮询工作流详情超时 workflow_run_id=${workflowRunId}`)
  return lastPayload
}

export async function POST(request: NextRequest) {
  try {
    const apiStartedAt = nowMs()
    assertSecureTlsConfiguration()

    // IP 限流：30次/分钟
    const { getClientIP, checkIpRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(request)
    const limitResult = checkIpRateLimit(ip, 30)
    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }
    const auth = await requireUser(request)
    if (auth.response) return auth.response
    
    const body = await request.json()
    const { query, conversation_id, fileIds, inputs, model, imageSize, async_image_task, sessionId, messageId } = body
    const workflowSkillId = isWorkflowSkillAgent(body.workflowSkillId) ? body.workflowSkillId : null
    const difyFileIds = Array.isArray(fileIds)
      ? fileIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : []
    const fileUrls = pickUrlStrings(body.fileUrls)

    const modelPrefix = workflowSkillId || model || "general-chat"
    const requestedModelType = (model || "general-chat") as ModelType
    const configuredMaxOutputTokens = getMaxOutputTokensForModel(requestedModelType)
    const isAllInOneAgent = model === ALL_IN_ONE_AGENT_MODEL || model === SUPER_ALL_IN_ONE_AGENT_MODEL
    const effectiveQuery = query || "你好"
    let effectiveConvId = normalizeDifyConversationId(conversation_id, modelPrefix)
    
    console.log(`🔍 [Dify-Chat] 接收请求: model=${model || "general-chat"} workflowSkill=${workflowSkillId || "none"} files=${difyFileIds.length} urls=${fileUrls.length}`)
    
    const userId = auth.user!.id
    if (model === "open-claw" && !isConfiguredAdminUser(userId)) {
      const guard = evaluateOpenClawRuntimeRequest({ query: effectiveQuery, inputs })
      if (!guard.allowed) {
        console.warn(`[OpenClaw Guard] blocked user=${userId} code=${guard.code} matched=${guard.matched}`)
        return new Response(
          JSON.stringify({
            error: guard.message,
            code: guard.code,
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        )
      }
    }

    const isGptImageGatewayRequest = isGptImageGatewayModel(model)
    const isGeminiImageGatewayRequest = model === "gemini-image"
    const isDirectImageGatewayRequest = isGptImageGatewayRequest || isGeminiImageGatewayRequest
    const requestId = request.headers.get("X-Request-Id") || body.requestId || createRequestId(isDirectImageGatewayRequest ? "img" : "chat")
    logPerf(requestId, "api_enter", apiStartedAt, { model: model || "general-chat" })
    logPerf(requestId, "auth_done", apiStartedAt)
    const taskKind = isDirectImageGatewayRequest ? "image" : model === "open-claw" ? "openclaw" : isAllInOneAgent ? "workflow" : "dify"
    if (hasGptImageModelInput(inputs) && !isDirectImageGatewayRequest && model !== "banana-2-pro") {
      console.warn(`🚫 [媒体权限] 图片模型请求顶层 model 不匹配，拒绝绕过媒体计费: model=${model || "empty"}`)
      return new Response(
        JSON.stringify({
          error: "图片生成请求参数无效",
          message: "图片生成必须通过图片工作台提交，不能伪装为普通文本请求。",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const imageInputsForBilling = isGptImageGatewayRequest ? buildGptImageV11Inputs(inputs) : null
    const billingModelType = imageInputsForBilling?.model as ModelType | undefined
    const createTaskRunInput = {
      userId,
      sessionId: typeof sessionId === "string" ? sessionId : null,
      messageId: typeof messageId === "string" ? messageId : null,
      model: model || "general-chat",
      kind: taskKind,
      requestId,
      stage: "请求已接收",
      metadata: {
        file_count: difyFileIds.length,
        file_url_count: fileUrls.length,
        prompt_length: typeof query === "string" ? query.length : 0,
        max_output_tokens: configuredMaxOutputTokens,
        async_image_task: async_image_task === true,
      },
    }
    const taskRun = isGptImageGatewayRequest && async_image_task === true
      ? await createTaskRun(createTaskRunInput)
      : {
          id: requestId,
          requestId,
          traceId: createTraceId(requestId),
          persisted: false,
        }
    if (!(isGptImageGatewayRequest && async_image_task === true)) {
      fireAndForget("AI Task Trace create", createTaskRun(createTaskRunInput))
    }

    if (typeof sessionId === "string" && sessionId.trim()) {
      const { data: sessionOwner, error: sessionOwnerError } = await getSupabaseAdmin()
        .from("chat_sessions")
        .select("user_id")
        .eq("id", sessionId)
        .maybeSingle()

      if (sessionOwnerError) {
        console.error("[Dify-Chat] 会话 owner 校验失败:", sessionOwnerError.message)
        return Response.json({ error: "会话权限校验失败", code: "CHAT_SESSION_OWNER_LOOKUP_FAILED", requestId }, { status: 500 })
      }

      if (sessionOwner && sessionOwner.user_id !== userId) {
        console.warn(`🚫 [Dify-Chat] 会话越权访问被拦截: requestId=${requestId}`)
        return Response.json({ error: "无权访问该会话", code: "CHAT_SESSION_FORBIDDEN", requestId }, { status: 403 })
      }
    }

    if (!isDirectImageGatewayRequest && !isAllInOneAgent && fileUrls.length > 0 && difyFileIds.length === 0) {
      console.warn(`🚫 [Dify-Chat] 非图片生成模型拒绝 remote_url 附件: model=${model || "general-chat"} urls=${fileUrls.length}`)
      return new Response(
        JSON.stringify({ error: "文件上传缺少 Dify 文件 ID，请重新上传文件后再试" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    console.log(`🔄 [切换模型] 目标模型: ${model || "默认标准版"} | conversation=${effectiveConvId ? "reuse" : "new"}`)

    // --- 1. 钥匙分发中心 (彻底分离通道) ---
    const { credential: selectedCredential, source: keySource } = getDifyCredentialForModel(workflowSkillId ? "workflow-skill" : model, process.env, DEFAULT_DIFY_KEY)

    // 安全检查：防止忘配 Key
    if (!selectedCredential && !isDirectImageGatewayRequest) {
        console.error(`❌ 严重错误: 模型 ${workflowSkillId || model} 的凭据未配置！环境变量 ${keySource} 为空`);
        return new Response(JSON.stringify({ 
          error: `配置错误：${workflowSkillId || model} 模型凭据未设置`,
          code: "DIFY_CREDENTIAL_MISSING",
          details: `请在生产环境变量中配置 ${keySource}`
        }), { 
          status: MISSING_DIFY_CREDENTIAL_STATUS,
          headers: { "Content-Type": "application/json" }
        });
    }
    
    // 🔥 Banana 专用调试日志
    if (model === "banana-2-pro") {
      console.log(`🎨 [Banana Debug] files=${difyFileIds.length} conversation=${conversation_id ? "reuse" : "new"}`)
    }

    // --- 2. 获取用户积分（用于预检查） ---
    const modelType = requestedModelType
    
    // 🔍 详细日志：查询用户积分
    console.log("🔍 [积分查询] 开始查询")
    
    // 🔥 修复：只查询存在的字段 credits 和 user_id（移除不存在的 total_spent）
    let { data: userCredits, error: creditsError } = await getSupabaseAdmin()
      .from("user_credits")
      .select("credits, user_id, is_pro")
      .eq("user_id", userId)
      .single()
    
    // 🔥 关键修复：如果用户不存在，先创建积分记录（赠送 1000 积分，与注册逻辑一致）
    // 🔥 移除 total_spent 字段（数据库中不存在）
    if (creditsError?.code === "PGRST116") {
      console.log("🆕 [新用户] user_credits 表中不存在，自动创建积分记录，赠送 1000 积分")
      
      const { data: newCredits, error: insertError } = await getSupabaseAdmin()
        .from("user_credits")
        .insert({ user_id: userId, credits: 1000, is_pro: false })
        .select()
        .single()
      
      if (insertError) {
        console.error(`❌ [新用户] 创建积分记录失败:`, insertError)
        // 尝试 upsert
        const { data: upsertData, error: upsertError } = await getSupabaseAdmin()
          .from("user_credits")
          .upsert({ user_id: userId, credits: 1000, is_pro: false })
          .select()
          .single()
        
        if (upsertError) {
          console.error(`❌ [新用户] Upsert 也失败:`, upsertError)
        } else {
          userCredits = upsertData
          creditsError = null
          console.log(`✅ [新用户] Upsert 成功，赠送 1000 积分:`, upsertData)
        }
      } else {
        userCredits = newCredits
        creditsError = null
        console.log(`✅ [新用户] 积分记录创建成功，赠送 1000 积分:`, newCredits)
      }
    } else if (creditsError) {
      console.error(`❌ [积分查询] 查询失败:`, creditsError)
      console.log(`📋 [调试] 错误代码: ${creditsError.code}, 错误信息: ${creditsError.message}`)
    } else {
      console.log(`✅ [积分查询] 成功: user_id=${userCredits?.user_id}, credits=${userCredits?.credits}`)
    }
    
    const currentCredits = userCredits?.credits || 0
    
    const estimatedMinCost = imageInputsForBilling
      ? calculateGptImageGatewayCredits(imageInputsForBilling)
      : getMinimumRequiredCredits(modelType)
    logPerf(requestId, "credit_check_done", apiStartedAt, { requiredCredits: estimatedMinCost })
    
    const trialPrecheck = await canUseTrialCredits(userId, estimatedMinCost)
    if (trialPrecheck.data?.blocked && trialPrecheck.data.reason === "survey_required") {
      console.warn(`🚫 [计费] 共创体验问卷未完成: user=${userId.slice(0, 8)}, required=${estimatedMinCost}`)
      return new Response(
        JSON.stringify({
          error: "请先完成今日问卷，解锁免费体验额度",
          surveyRequired: true,
          billing: {
            trialUsed: 0,
            realCreditsUsed: 0,
            remainingToday: trialPrecheck.data.remainingToday,
            surveyRequired: true,
          },
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      )
    }

    const hasActiveTrialForRequest = Boolean(trialPrecheck.data?.grantId)
    if (imageInputsForBilling && (billingModelType || "gpt-image-2") === "gpt-image-2") {
      const { data: userProfile } = await getSupabaseAdmin()
        .from("user_profiles")
        .select("email")
        .eq("user_id", userId)
        .maybeSingle()
      const membershipStatus = await resolveActiveMembershipStatus(getSupabaseAdmin(), userId, {
        email: auth.user!.email,
        phone: auth.user!.phone,
      })

      if (!hasActiveTrialForRequest && !canUseImage2({
        user_id: userId,
        email: typeof userProfile?.email === "string" ? userProfile.email : auth.user!.email,
        membership_status: membershipStatus,
      })) {
        console.warn(`🚫 [媒体权限] 用户无共创体验或订阅/白名单权限，不能使用 ${billingModelType || "gpt-image-2"}`)
        return new Response(
          JSON.stringify({
            error: "GPT Image 2 当前共创体验期内登录用户可用，请先登录后使用。",
            message: "GPT Image 2 当前共创体验期内登录用户可用，请先登录后使用。",
            code: "IMAGE2_ACCESS_DENIED",
            requestId,
            requiredMembership: "basic",
            allowlist: ["IMAGE2_WHITELIST_USER_IDS", "IMAGE2_WHITELIST_EMAILS"],
            action: "请先登录，或在体验期结束后升级会员",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        )
      }
    }

    const availableTrialForMinimum = trialPrecheck.data?.trialUsedAvailable || 0
    if (currentCredits + availableTrialForMinimum < estimatedMinCost) {
      console.warn(`🚫 [计费] 用户积分不足: 当前 ${currentCredits}`)
      return new Response(
        JSON.stringify({
          error: "当前积分不足",
          message: `当前功能至少需要 ${estimatedMinCost} 积分，当前剩余 ${currentCredits} 积分。请充值、升级会员或完成体验额度解锁后继续使用。`,
          required: estimatedMinCost,
          current: currentCredits,
          trialRemaining: availableTrialForMinimum,
          action: "请充值或升级会员",
        }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      )
    }
    
    console.log(`💰 [预检查] 模型: ${modelType} | 当前积分: ${currentCredits}`)

    if (model === "gemini-image") {
      console.log("🎨 [Gemini Image] 使用直连 Gemini 图片网关，绕过 Dify workflow")
      const geminiImageInputs = buildGeminiImageGatewayInputs(inputs)

      await updateTaskRun(taskRun.id, {
        status: "running",
        stage: "Gemini 图片网关生成中",
        progress: 35,
      })

      const gatewayResponse = await callGeminiImageGatewayDirect(effectiveQuery, inputs)
      const gatewayPayload = await gatewayResponse.clone().json().catch(() => ({}))

      if (!gatewayResponse.ok) {
        await updateTaskRun(taskRun.id, {
          status: "failed",
          stage: "Gemini 图片网关返回错误",
          progress: 100,
          errorMessage: typeof gatewayPayload?.error === "string" ? gatewayPayload.error : "Gemini 图像服务请求失败",
          errorCode: typeof gatewayPayload?.code === "string" ? gatewayPayload.code : `GEMINI_IMAGE_GATEWAY_${gatewayResponse.status}`,
          sanitizedError: sanitizeForTrace(gatewayPayload) as Record<string, unknown>,
        })

        return gatewayResponse
      }

      const { charged } = await chargeFixedImageCredits({
        userId,
        amount: estimatedMinCost,
        imageCount: geminiImageInputs.n,
        imageSize: geminiImageInputs.image_size,
        modelId: "gemini-image",
        keySource: "GEMINI_IMAGE_GATEWAY",
        gatewayName: "gemini-image-gateway",
        requestId: taskRun.requestId,
        conversationId: effectiveConvId || (typeof conversation_id === "string" ? conversation_id : null),
        messageId: typeof messageId === "string" ? messageId : null,
        rawProviderMetadata: {
          inputs: geminiImageInputs,
          provider: "google-gemini",
        },
      })

      if (!charged) {
        await updateTaskRun(taskRun.id, {
          status: "failed",
          stage: "图片生成完成但积分扣除失败",
          progress: 100,
          errorMessage: "积分扣除失败，本次结果未结算",
          errorCode: "IMAGE_CREDIT_DEDUCT_FAILED",
          sanitizedError: sanitizeForTrace(gatewayPayload) as Record<string, unknown>,
        })
        return Response.json({ error: "积分扣除失败，本次结果未结算" }, { status: 500 })
      }

      await updateTaskRun(taskRun.id, {
        status: "succeeded",
        stage: "图片生成完成",
        progress: 100,
        artifacts: extractArtifactsFromUnknown(gatewayPayload),
        metadata: {
          gateway_status: gatewayResponse.status,
          charged_credits: estimatedMinCost,
          source: "gemini_image_gateway",
        },
      })

      return Response.json(gatewayPayload, {
        headers: {
          "X-Request-Id": taskRun.requestId,
          "X-Trace-Id": taskRun.traceId,
        },
      })
    }

    if (isGptImageGatewayRequest) {
      console.log("🎨 [GPT Image] 使用直连图片网关，绕过 Dify chatflow")
      const imageInputs = imageInputsForBilling || buildGptImageV11Inputs(inputs)
      const imageBillingModel = (billingModelType || "gpt-image-2") as ModelType

      await updateTaskRun(taskRun.id, {
        status: "running",
        stage: "图片网关生成中",
        progress: 35,
      })

      if (async_image_task === true) {
        const { charged } = await chargeImageGatewayCredits({
          userId,
          amount: estimatedMinCost,
          inputs: imageInputs,
          billingModel: imageBillingModel,
          keySource,
          requestId: taskRun.requestId,
          conversationId: effectiveConvId || (typeof conversation_id === "string" ? conversation_id : null),
          messageId: typeof messageId === "string" ? messageId : null,
        })

        if (!charged) {
          await updateTaskRun(taskRun.id, {
            status: "failed",
            stage: "图片任务提交前积分扣除失败",
            progress: 100,
            errorMessage: "积分扣除失败，本次图片任务未提交",
            errorCode: "IMAGE_CREDIT_DEDUCT_FAILED",
          })
          return Response.json({ error: "积分扣除失败，本次图片任务未提交" }, { status: 500 })
        }

        try {
          const taskId = await startImageGatewayTask({
            query: effectiveQuery,
            inputs,
            userId,
            requestId: taskRun.requestId,
            traceId: taskRun.traceId,
          })
          const pollToken = signImageTaskPollToken({ requestId: taskRun.requestId, taskId, userId })

          return Response.json(
            {
              status: "running",
              imageTaskId: taskId,
              requestId: taskRun.requestId,
              pollToken,
              message: "图片任务已提交，正在生成。",
            },
            {
              headers: {
                "X-Request-Id": taskRun.requestId,
                "X-Trace-Id": taskRun.traceId,
              },
            },
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : "图片任务提交失败"
          const refund = await refundImageTaskCredits({
            userId,
            requestId: taskRun.requestId,
            reason: message,
            errorCode: "IMAGE_TASK_SUBMIT_FAILED",
            statusCode: 502,
          })

          await updateTaskRun(taskRun.id, {
            status: "failed",
            stage: "图片任务提交失败",
            progress: 100,
            errorMessage: message,
            errorCode: "IMAGE_TASK_SUBMIT_FAILED",
            metadata: {
              refund_status: refund.status,
              refund_amount: refund.amount || 0,
              refund_reference_id: refund.refundReferenceId || null,
            },
          })

          return Response.json(
            { error: message, code: "IMAGE_TASK_SUBMIT_FAILED", requestId: taskRun.requestId, refund },
            {
              status: 502,
              headers: {
                "X-Request-Id": taskRun.requestId,
                "X-Trace-Id": taskRun.traceId,
              },
            },
          )
        }
      }

      const gatewayResponse = await callImageGatewayDirect(effectiveQuery, inputs)
      const gatewayPayload = await gatewayResponse.clone().json().catch(() => ({}))

      if (!gatewayResponse.ok) {
        await updateTaskRun(taskRun.id, {
          status: "failed",
          stage: "图片网关返回错误",
          progress: 100,
          errorMessage: typeof gatewayPayload?.error === "string" ? gatewayPayload.error : "图片服务请求失败",
          errorCode: typeof gatewayPayload?.code === "string" ? gatewayPayload.code : `IMAGE_GATEWAY_${gatewayResponse.status}`,
          sanitizedError: sanitizeForTrace(gatewayPayload) as Record<string, unknown>,
        })

        return gatewayResponse
      }

      const { charged } = await chargeImageGatewayCredits({
        userId,
        amount: estimatedMinCost,
        inputs: imageInputs,
        billingModel: imageBillingModel,
        keySource,
        requestId: taskRun.requestId,
        conversationId: effectiveConvId || (typeof conversation_id === "string" ? conversation_id : null),
        messageId: typeof messageId === "string" ? messageId : null,
      })

      if (!charged) {
        await updateTaskRun(taskRun.id, {
          status: "failed",
          stage: "图片生成完成但积分扣除失败",
          progress: 100,
          errorMessage: "积分扣除失败，本次结果未结算",
          errorCode: "IMAGE_CREDIT_DEDUCT_FAILED",
          sanitizedError: sanitizeForTrace(gatewayPayload) as Record<string, unknown>,
        })
        return Response.json({ error: "积分扣除失败，本次结果未结算" }, { status: 500 })
      }

      await updateTaskRun(taskRun.id, {
        status: "succeeded",
        stage: "图片生成完成",
        progress: 100,
        artifacts: extractArtifactsFromUnknown(gatewayPayload),
        metadata: {
          gateway_status: gatewayResponse.status,
          charged_credits: estimatedMinCost,
          source: "direct_image_gateway",
        },
      })

      return Response.json(gatewayPayload, {
        headers: {
          "X-Request-Id": taskRun.requestId,
          "X-Trace-Id": taskRun.traceId,
        },
      })
    }

    // --- 3. 构造 Dify 请求函数 ---
    // 🔥 共享流状态：首字节探测 + 超时定时器（供 callDify 和 transformStream 共同访问）
    const streamStatus: {
      firstByteReceived: boolean
      timeoutId: ReturnType<typeof setTimeout> | null
      controller: AbortController | null
    } = { firstByteReceived: false, timeoutId: null, controller: null }
    const useBlockingDifyChat =
      process.env.DIFY_CHAT_FORCE_BLOCKING_MODE === "true" &&
      !WORKFLOW_MODELS.has(model || "") &&
      !isGptImageGatewayRequest &&
      model !== "banana-2-pro"

    const callDify = async (retryWithoutId = false) => {
        const currentConvId = retryWithoutId ? null : effectiveConvId;

        // 🎨 Dify app mode matters: Banana is a chatflow, while Gemini image and vocab-card use Workflow API.
        const isWorkflow = WORKFLOW_MODELS.has(model || "");
        const isWorkflowImageModel = model === "banana-2-pro" || model === "gemini-image";
        const isVocabCardWorkflow = model === "vocab-card";
        const isBananaChatflow = model === "banana-2-pro";
        const apiEndpoint = isWorkflow ? "/workflows/run" : "/chat-messages";

        let difyRequest: DifyWorkflowRequest | DifyChatRequest;

        if (isWorkflow) {
            // Dify 图像工作流参数格式（image_prompt）
            difyRequest = isVocabCardWorkflow
              ? {
                  inputs: buildVocabCardWorkflowInputs({ query: effectiveQuery, inputs }),
                  response_mode: "streaming",
                  user: userId || "default-user",
                }
              : {
                  inputs: isWorkflowImageModel
                    ? buildImageWorkflowInputs(effectiveQuery, inputs)
                    : {
                        image_prompt: effectiveQuery,
                        ...(inputs || {})
                    },
                  response_mode: "streaming",
                  user: userId || "default-user",
              }

            // 🔥 如果有文件，构造文件对象格式
            if (!isVocabCardWorkflow && difyFileIds.length > 0) {
                difyRequest.inputs.init_image = [{
                  type: 'image',
                  transfer_method: 'local_file',
                  upload_file_id: difyFileIds[0]
                }]
                console.log(`🎨 [Banana] 使用文件对象:`, difyRequest.inputs.init_image)
            }

            // 🎨 传递尺寸参数（如果有）
            if (!isVocabCardWorkflow && imageSize) {
                difyRequest.inputs.aspect_ratio = imageSize.ratio || "9:16"
                difyRequest.inputs.image_width = imageSize.width || 1080
                difyRequest.inputs.image_height = imageSize.height || 1920
                console.log(`🎨 [Banana] 图片尺寸: ${imageSize.ratio} (${imageSize.width}x${imageSize.height})`)
            }

            console.log(`🎨 [Workflow] request prepared: model=${model} files=${difyFileIds.length} hasImageSize=${Boolean(imageSize)}`)
        } else {
            // 💬 Chat API 格式
            const isGptImage2 = isGptImageGatewayRequest
            const normalizedCodexSkill = model === SUPER_ALL_IN_ONE_AGENT_MODEL ? buildCodexSkillInputs(inputs) : null
            const normalizedOpenClawSkill = model === "open-claw" ? buildOpenClawSkillInputs(inputs) : null
            const allInOneQuery = normalizedCodexSkill?.skillId
              ? buildCodexSkillQuery(effectiveQuery, normalizedCodexSkill.inputs)
              : effectiveQuery
            const chatInputs = isGptImage2
              ? buildGptImageV11DifyInputs(inputs)
              : isAllInOneAgent
                ? buildAllInOneAgentWorkflowInputs(
                    allInOneQuery,
                    normalizedCodexSkill ? normalizedCodexSkill.inputs : inputs,
                    fileUrls,
                  )
                : isBananaChatflow
                  ? buildImageWorkflowInputs(effectiveQuery, inputs)
                : normalizedOpenClawSkill
                  ? normalizedOpenClawSkill.inputs
                : workflowSkillId
                  ? {
                      ...(inputs || {}),
                      workflow_skill_id: workflowSkillId,
                      skill_id: workflowSkillId,
                      skill: workflowSkillId,
                      agent: workflowSkillId,
                      route: workflowSkillId,
                    }
                  : inputs || {}
            const difyQuery = model === "open-claw"
              ? buildOpenClawSkillQuery(effectiveQuery, chatInputs)
              : isGptImage2
                ? (query || "你好")
                : normalizedCodexSkill?.skillId
                  ? allInOneQuery
                : effectiveQuery

            if (isBananaChatflow && imageSize && chatInputs && typeof chatInputs === "object") {
                const bananaInputs = chatInputs as Record<string, unknown>
                bananaInputs.aspect_ratio = imageSize.ratio || "9:16"
                bananaInputs.image_width = imageSize.width || 1080
                bananaInputs.image_height = imageSize.height || 1920
                console.log(`🎨 [Banana] 图片尺寸: ${imageSize.ratio} (${imageSize.width}x${imageSize.height})`)
            }

            difyRequest = {
                inputs: chatInputs,
                query: difyQuery,
                response_mode: useBlockingDifyChat ? "blocking" : isGptImage2 ? "blocking" : "streaming",
                user: userId || "default-user",
                conversation_id: currentConvId,
            }

            if (model === "open-claw") {
                console.log(`[OpenClaw Skill] selected=${normalizedOpenClawSkill?.skillId || "none"} queryInjected=${Boolean(normalizedOpenClawSkill?.skillId)}`)
            }

            if (model === SUPER_ALL_IN_ONE_AGENT_MODEL) {
                console.log(`[Codex Skill] selected=${normalizedCodexSkill?.skillId || "none"} queryInjected=${Boolean(normalizedCodexSkill?.skillId)}`)
            }

            if (!isGptImage2 && difyFileIds.length > 0) {
                difyRequest.files = difyFileIds.map((id: string) => ({
                  type: 'image',
                  transfer_method: 'local_file',
                  upload_file_id: id
                } as const))
            }

            if (isGptImage2) {
                const imageInputsForLog = difyRequest.inputs as GptImageV11Inputs
                console.log(`[GPT Image V11] Chatflow request prepared: mode=${imageInputsForLog.mode} size=${imageInputsForLog.size} references=${imageInputsForLog.reference_image_urls.length} mask=${Boolean(imageInputsForLog.mask_image_url)}`)
            }
        }

        console.log(`🔗 [API端点] ${apiEndpoint} | 模式: ${isWorkflow ? 'Workflow' : 'Chat'}`)

        const firstByteTimeoutMs = useBlockingDifyChat
          ? model === "open-claw" || isAllInOneAgent
            ? OPENCLAW_FIRST_BYTE_TIMEOUT_MS
            : DEFAULT_DIFY_BLOCKING_RESPONSE_TIMEOUT_MS
          : isGptImageGatewayRequest
          ? GPT_IMAGE_BLOCKING_TIMEOUT_MS
          : model === "open-claw" || isAllInOneAgent
            ? OPENCLAW_FIRST_BYTE_TIMEOUT_MS
            : DEFAULT_DIFY_FIRST_BYTE_TIMEOUT_MS
        const timeoutStage = useBlockingDifyChat ? "Dify blocking 响应超时" : "Dify 首字节超时"
        const timeoutCode = useBlockingDifyChat ? "DIFY_BLOCKING_TIMEOUT" : "DIFY_FIRST_BYTE_TIMEOUT"
        const timeoutMessage = useBlockingDifyChat
          ? `请求超时：Dify 服务在 ${Math.round(firstByteTimeoutMs / 1000)} 秒内未完成响应`
          : `请求超时：Dify 服务在 ${Math.round(firstByteTimeoutMs / 1000)} 秒内未响应`

        // GPT Image 与 OpenClaw 大型 PPT 任务经常超过 120 秒才返回首字节。
        streamStatus.controller = new AbortController()
        streamStatus.timeoutId = setTimeout(() => {
            if (!streamStatus.firstByteReceived) {
                console.warn(`⏰ [Dify超时] ${Math.round(firstByteTimeoutMs / 1000)}秒内未完成${useBlockingDifyChat ? "blocking响应" : "首字节"}，中断请求 model=${model}`)
                streamStatus.controller?.abort()
            }
        }, firstByteTimeoutMs)

        try {
            fireAndForget("AI Task Trace running", updateTaskRun(taskRun.id, {
              status: "running",
              stage: isWorkflow ? "工作流已提交" : "Dify 会话已提交",
              progress: 8,
              conversationId: currentConvId,
            }))
            console.warn(`🚀 [Dify请求] 开始请求 Dify... model=${model} endpoint=${DIFY_BASE_URL}${apiEndpoint} requestId=${taskRun.requestId}`)
            logPerf(taskRun.requestId, "dify_request_start", apiStartedAt, { endpoint: apiEndpoint })
            const response = await internalDifyFetch(`${DIFY_BASE_URL}${apiEndpoint}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${selectedCredential}`,
                },
                body: JSON.stringify(difyRequest),
                signal: streamStatus.controller.signal,
            })
            console.warn(`✅ [Dify请求] 响应到达 status=${response.status} body=${response.body === null ? 'null' : 'ReadableStream'}`)

            if ((isGptImageGatewayRequest || useBlockingDifyChat) && !streamStatus.firstByteReceived) {
                streamStatus.firstByteReceived = true
                if (streamStatus.timeoutId) {
                    clearTimeout(streamStatus.timeoutId)
                    streamStatus.timeoutId = null
                }
            }

            return response
        } catch (error: unknown) {
            // 清理超时定时器
            if (streamStatus.timeoutId) {
                clearTimeout(streamStatus.timeoutId)
                streamStatus.timeoutId = null
            }

            // 判断是否为 AbortError（超时中断）
            const err = error instanceof Error ? error : null
	            if (err && (err.name === 'AbortError' || err.message.includes('abort'))) {
	                console.error(`❌ [Dify请求] 请求被中断（超时）:`, err.message)
	                await updateTaskRun(taskRun.id, {
	                  status: "timeout",
	                  stage: timeoutStage,
	                  progress: 100,
	                  errorMessage: err.message,
	                  errorCode: timeoutCode,
	                })
	                throw new Error(timeoutMessage)
	            }

            throw error
        }
    };

    // --- 4. 执行请求与智能容错（最多重试1次，防止死循环）---
    const MAX_RETRIES = 1;
    let retryCount = 0;
    let response = null;

    console.warn(`🚀 [Dify请求] 开始调用 Dify API...`)

    while (retryCount <= MAX_RETRIES) {
        const isRetry = retryCount > 0;
        if (isRetry) {
            console.warn(`🔄 [Dify重试] 第 ${retryCount} 次重试 (isNewSession=true)`);
        }

        response = await callDify(isRetry);
        console.warn(`📡 [Dify响应] 状态码: ${response.status}`)
        console.warn(`📡 [Dify响应] body类型: ${typeof response.body} | body是否为null: ${response.body === null}`)

        if (model === "banana-2-pro") {
            console.log(`🎨 [Banana] Dify响应头摘要:`, {
              contentType: response.headers.get("content-type") || undefined,
              hasRequestId: Boolean(response.headers.get("x-request-id")),
              hasTraceId: Boolean(response.headers.get("x-trace-id")),
            })
        }

        const shouldRetryWithNewConversation =
          retryCount === 0 && await shouldRetryDifyWithNewConversation(response, effectiveConvId)

        if (shouldRetryWithNewConversation) {
            retryCount++;
            console.warn(`⚠️ [会话隔离] Dify conversation_id 失效 (模型=${modelPrefix})，自动开启新会话重试...`);
            effectiveConvId = null;
            continue;
        }

        // 非 404/400 错误，或已经是重试后的结果，直接跳出
        break;
    }

    // 防御：确保 response 已赋值
    if (!response) {
        await updateTaskRun(taskRun.id, {
          status: "failed",
          stage: "无法获取 Dify 响应",
          progress: 100,
          errorMessage: "请求失败：无法获取响应",
          errorCode: "DIFY_NO_RESPONSE",
        })
        return new Response(JSON.stringify({ error: "请求失败：无法获取响应" }), { status: 500 })
    }

    if (!response.ok) {
        const errorText = await response.text()
        const isDifyCredentialInvalid = isDifyCredentialInvalidResponse(response.status, errorText)
        const handledErrorCode = isDifyCredentialInvalid ? "DIFY_CREDENTIAL_INVALID" : `DIFY_${response.status}`
        const handledErrorMessage = isDifyCredentialInvalid
          ? getDifyCredentialInvalidMessage(model, keySource)
          : sanitizeUpstreamErrorText(errorText, "服务暂时不可用，请稍后重试。")
        console.error(`❌ Dify API 最终报错 (${model}):`, {
          status: response.status,
          bodyLength: errorText.length,
          sanitizedBody: sanitizeForTrace(errorText),
          errorCode: handledErrorCode,
        })
        await updateTaskRun(taskRun.id, {
          status: "failed",
          stage: "Dify 返回错误",
          progress: 100,
          errorMessage: handledErrorMessage,
          errorCode: handledErrorCode,
          sanitizedError: { status: response.status, body: sanitizeForTrace(errorText) },
        })
        
        // 🔥 Banana 特殊错误处理
        if (model === "banana-2-pro") {
          console.error(`🎨 [Banana错误] 响应摘要:`, {
            status: response.status,
            statusText: response.statusText,
            bodyLength: errorText.length,
            baseUrl: DIFY_BASE_URL
          })
        }
        
        return new Response(
          JSON.stringify({
            error: handledErrorMessage,
            message: handledErrorMessage,
            code: handledErrorCode,
          }),
          { status: response.status },
        )
    }

    // 🎨 GPT Image V11 使用 Chatflow blocking 响应；兼容少数返回 workflow_run_id 的场景。
    if (isGptImageGatewayRequest) {
	        const result = await response.json()
	        const workflowRunId = result?.workflow_run_id
        const inlineStatus = result?.data?.status
        const inlineOutputs = result?.data?.outputs
        const inlineImageCount = extractWorkflowImageUrls(inlineOutputs).length
        const shouldPollWorkflowDetail =
          typeof workflowRunId === "string" &&
          (!inlineOutputs || inlineImageCount === 0 || !isWorkflowTerminalStatus(inlineStatus))

	        if (shouldPollWorkflowDetail) {
	          console.log(`🎨 [GPT Image 2] 首次响应未返回最终图片，开始轮询 workflow_run_id=${workflowRunId}`)
	          await updateTaskRun(taskRun.id, {
	            status: "running",
	            stage: "轮询 Dify 工作流详情",
	            progress: 55,
	            workflowRunId,
	          })
	          const workflowDetail = await pollWorkflowRunDetail({
            workflowRunId,
            baseUrl: DIFY_BASE_URL,
            credential: selectedCredential,
          })

	          if (workflowDetail) {
	            await updateTaskRun(taskRun.id, {
	              status: "succeeded",
	              stage: "图片生成完成",
	              progress: 100,
	              workflowRunId,
	              artifacts: extractArtifactsFromUnknown(workflowDetail),
	            })
              const imageInputs = imageInputsForBilling || buildGptImageV11Inputs(inputs)
              const imageBillingModel = (billingModelType || "gpt-image-2") as ModelType
              const imageCount = imageInputs.n || 1
              const imageDescription = `图片生成 - ${getModelDisplayName(imageBillingModel)} x${imageCount}`
              const imageBillingMetadata = createBillingAuditMetadata({
                userId,
                actionType: "image_generation",
                feature: imageBillingModel === "gpt-image-2" ? "image2" : "image",
                appId: keySource || "DIFY_GPT_IMAGE_API_KEY",
                workflowId: "gpt-image-2",
                modelId: imageBillingModel,
                requestedAppId: keySource || "DIFY_GPT_IMAGE_API_KEY",
                requestedWorkflowId: "gpt-image-2",
                requestedModelId: imageBillingModel,
                pricingVersion: PRICING_VERSION,
                usageSource: "fixed",
                estimated: false,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                chargedCredits: estimatedMinCost,
                requestId: taskRun.requestId,
                conversationId: effectiveConvId || (typeof conversation_id === "string" ? conversation_id : null),
                messageId: typeof messageId === "string" ? messageId : null,
                rawProviderMetadata: {
                  imageCount,
                  fixedCreditsPerImage: getGptImageGatewayCreditsPerImage(imageInputs),
                  imageSize: imageInputs.size,
                  imageQuality: imageInputs.quality,
                  inputs: imageInputs,
                },
                description: imageDescription,
              })
              const charged = await spendCredits(
                userId,
                estimatedMinCost,
                "consume",
                imageDescription,
                taskRun.requestId,
                imageBillingMetadata,
              )
              if (!charged) {
                await updateTaskRun(taskRun.id, {
                  status: "failed",
                  stage: "图片生成完成但积分扣除失败",
                  progress: 100,
                  errorMessage: "积分扣除失败，本次结果未结算",
                  errorCode: "IMAGE_CREDIT_DEDUCT_FAILED",
                })
                return Response.json({ error: "积分扣除失败，本次结果未结算" }, { status: 500 })
              }
	            return Response.json(
	              {
	                ...result,
	                data: workflowDetail,
	                requestId: taskRun.requestId,
	                traceId: taskRun.traceId,
	              },
	              {
	                headers: {
	                  "X-Request-Id": taskRun.requestId,
	                  "X-Trace-Id": taskRun.traceId,
	                },
	              },
	            )
	          }
	        }

	        await updateTaskRun(taskRun.id, {
	          status: isWorkflowTerminalStatus(inlineStatus) ? "succeeded" : "running",
	          stage: isWorkflowTerminalStatus(inlineStatus) ? "图片生成完成" : "等待图片结果",
	          progress: isWorkflowTerminalStatus(inlineStatus) ? 100 : 65,
	          workflowRunId: typeof workflowRunId === "string" ? workflowRunId : null,
	          artifacts: extractArtifactsFromUnknown(result),
	        })
        if (isWorkflowTerminalStatus(inlineStatus)) {
          const imageInputs = imageInputsForBilling || buildGptImageV11Inputs(inputs)
          const imageBillingModel = (billingModelType || "gpt-image-2") as ModelType
          const imageCount = imageInputs.n || 1
          const imageDescription = `图片生成 - ${getModelDisplayName(imageBillingModel)} x${imageCount}`
          const imageBillingMetadata = createBillingAuditMetadata({
            userId,
            actionType: "image_generation",
            feature: imageBillingModel === "gpt-image-2" ? "image2" : "image",
            appId: keySource || "DIFY_GPT_IMAGE_API_KEY",
            workflowId: "gpt-image-2",
            modelId: imageBillingModel,
            requestedAppId: keySource || "DIFY_GPT_IMAGE_API_KEY",
            requestedWorkflowId: "gpt-image-2",
            requestedModelId: imageBillingModel,
            pricingVersion: PRICING_VERSION,
            usageSource: "fixed",
            estimated: false,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            chargedCredits: estimatedMinCost,
            requestId: taskRun.requestId,
            conversationId: effectiveConvId || (typeof conversation_id === "string" ? conversation_id : null),
            messageId: typeof messageId === "string" ? messageId : null,
            rawProviderMetadata: {
              imageCount,
              fixedCreditsPerImage: getGptImageGatewayCreditsPerImage(imageInputs),
              imageSize: imageInputs.size,
              imageQuality: imageInputs.quality,
              inputs: imageInputs,
            },
            description: imageDescription,
          })
          const charged = await spendCredits(
            userId,
            estimatedMinCost,
            "consume",
            imageDescription,
            taskRun.requestId,
            imageBillingMetadata,
          )
          if (!charged) {
            await updateTaskRun(taskRun.id, {
              status: "failed",
              stage: "图片生成完成但积分扣除失败",
              progress: 100,
              errorMessage: "积分扣除失败，本次结果未结算",
              errorCode: "IMAGE_CREDIT_DEDUCT_FAILED",
            })
            return Response.json({ error: "积分扣除失败，本次结果未结算" }, { status: 500 })
          }
        }
	        return Response.json(
	          { ...result, requestId: taskRun.requestId, traceId: taskRun.traceId },
	          {
	            headers: {
	              "X-Request-Id": taskRun.requestId,
	              "X-Trace-Id": taskRun.traceId,
	            },
	          },
	        )
	    }

    console.log(`✅ [Dify请求] 成功，开始流式传输...`)

    // --- 5. 流式响应 + 智能扣费 + Banana 图片转存 ---
    // 创建一个 TransformStream 来处理流式数据并在结束时扣费
    let totalTokens = 0
    let promptTokens = 0
    let completionTokens = 0
    let conversationId = ""
    let fullResponseText = ""  // 🔥 收集完整响应内容用于验证
    let workflowImageUrls: string[] = []  // 🎨 收集工作流图像模型生成的图片 URL
    const isWorkflowImageModel = model === "banana-2-pro" || model === "gemini-image"
    let jsonBuffer = ""  // 🔥 JSON 行缓冲：跨 chunk 拼接不完整的 SSE 数据行
    let hasReceivedContent = false  // 🔥 标记是否收到了实际内容（用于判断是否扣费）
    let latestParsedUsage: ParsedDifyUsage | null = null
    let clientAborted = false
    let taskCompleted = false
    let workflowNodeFailure: { message: string; code: string } | null = null
    let allInOneDisplaySent = false
    let allInOneStreamedAnswer = false
    let finalNodeOutputText = ""
    let openClawFinalOutputText = ""
    let actualDifyResponseMode: "streaming" | "blocking" | "json_fallback" = useBlockingDifyChat ? "blocking" : "streaming"
    const bufferedNodeEvents: Array<{
      event: string
      title?: string
      node_id?: string
      status?: string
      workflow_run_id?: string
    }> = []

    // 🔥 扣费函数：流结束后根据实际 token 用量扣费
    const deductCredit = async () => {
      if (!userId) return
      try {
        // 计算实际扣费；文本统一按输入/输出 token 分开计费，不读取 Dify price 字段。
        const currentCost = calculateActualCost(
          model as ModelType,
          { totalTokens, inputTokens: promptTokens, outputTokens: completionTokens },
          {
            hasGeneratedImage: workflowImageUrls.length > 0,
            hasOutputContent: hasReceivedContent,
          }
        )

        if (currentCost <= 0) {
          console.warn("[Billing] 缺少 prompt_tokens / completion_tokens，跳过文本扣费")
          return
        }

        // 🔥 记录到 credit_transactions 表
        const reasonMap: Record<string, string> = {
          'standard': '作文批改',
          'teaching-pro': '教学评助手',
          'claude-opus': 'Claude 对话',
          'gpt-5': 'GPT-5.5 对话',
          'gemini-pro': 'Gemini 对话',
          'banana-2-pro': 'Banana 绘图',
          'gemini-image': 'Gemini 图像',
          'suno-v5': 'Suno 音乐',
          'open-claw': 'Open Claw 对话',
          'all-in-one-agent': '数学图片与动画生成器',
          'super-all-in-one-agent': '超级全能智能体',
        }
        const reason = reasonMap[model as string] || `使用 ${getModelDisplayName(model as ModelType)}`
        const description = workflowImageUrls.length > 0
          ? `${reason} (生成 ${workflowImageUrls.length} 张图片)`
          : `${reason} (输入 ${promptTokens} tokens / 输出 ${completionTokens} tokens)`

        const billingMetadata = createBillingAuditMetadata({
          userId,
          actionType: "consume",
          feature: workflowImageUrls.length > 0 ? "image" : "text",
          appId: keySource || null,
          workflowId: WORKFLOW_MODELS.has(model || "") ? (model || null) : null,
          modelId: model || "general-chat",
          requestedAppId: keySource || null,
          requestedWorkflowId: WORKFLOW_MODELS.has(model || "") ? (model || null) : null,
          requestedModelId: model || "general-chat",
          upstreamProvider: null,
          upstreamModel: null,
          upstreamGroup: null,
          upstreamRequestId: null,
          usageSource: latestParsedUsage?.usageSource,
          estimated: latestParsedUsage?.estimated ?? false,
          promptTokens,
          completionTokens,
          totalTokens,
          chargedCredits: currentCost,
          rawProviderMetadata: latestParsedUsage
            ? {
                usage: latestParsedUsage.rawUsage || null,
                finishReason: latestParsedUsage.finishReason || null,
                latency: latestParsedUsage.latency ?? null,
                timeToFirstToken: latestParsedUsage.timeToFirstToken ?? null,
                usageSource: latestParsedUsage.usageSource,
                estimated: latestParsedUsage.estimated,
                maxOutputTokens: configuredMaxOutputTokens,
              }
            : {
                maxOutputTokens: configuredMaxOutputTokens,
              },
          rawUsageJson: latestParsedUsage?.rawUsage || null,
          finishReason: latestParsedUsage?.finishReason || null,
          latency: latestParsedUsage?.latency ?? null,
          timeToFirstToken: latestParsedUsage?.timeToFirstToken ?? null,
          conversationId: conversationId || null,
          requestId: taskRun.requestId,
          description,
        })
        if (shouldAuditHighConsumptionTextCall(modelType, completionTokens, currentCost)) {
          console.warn("[Billing Audit] 高消耗文本调用:", {
            requestId: taskRun.requestId,
            model,
            promptTokens,
            completionTokens,
            totalTokens,
            currentCost,
            maxOutputTokens: configuredMaxOutputTokens,
          })
          await updateTaskRun(taskRun.id, {
            metadata: {
              high_consumption_text_call: true,
              max_output_tokens: configuredMaxOutputTokens,
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: totalTokens,
              charged_credits: currentCost,
            },
          }).catch((error) => console.warn("[Billing Audit] high consumption trace update failed:", error))
        }
        const success = await spendCredits(
          userId,
          currentCost,
          "consume",
          description,
          taskRun.requestId,
          billingMetadata,
        )
        if (!success) {
          console.error("[Billing] 扣费失败或积分不足")
          await recordBillingIssue(
            userId,
            currentCost,
            "billing_failed",
            `异常账单：${description}`,
            taskRun.requestId,
            billingMetadata,
          )
        }
      } catch (e) {
        console.error("[Billing] 扣费失败:", e)
      }
    }

    const applyBlockingDifyPayload = async (payload: unknown, controller: SseByteController) => {
      const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}
      const parsedUsage = parseDifyUsage(payload)
      latestParsedUsage = parsedUsage
      totalTokens = parsedUsage.totalTokens
      promptTokens = parsedUsage.promptTokens
      completionTokens = parsedUsage.completionTokens

      const rawConversationId = typeof record.conversation_id === "string"
        ? record.conversation_id
        : typeof (record.data as Record<string, unknown> | undefined)?.conversation_id === "string"
          ? String((record.data as Record<string, unknown>).conversation_id)
          : ""
      if (rawConversationId) conversationId = rawConversationId

      const rawAnswer = extractDifyTextOutput(payload)
      const answer = model === "open-claw"
        ? rewriteOpenClawMediaReferencesWithSignedUrls(rawAnswer, undefined, userId)
        : isAllInOneAgent
          ? normalizeAllInOneAgentDisplay(rawAnswer)
          : rawAnswer

      if (conversationId) {
        enqueueSseEvent(controller, {
          event: "conversation",
          conversation_id: conversationId,
        })
      }

      if (answer.trim()) {
        enqueueSseAnswer(controller, answer)
        fullResponseText = answer
        hasReceivedContent = true
      }

      enqueueSseEvent(controller, {
        event: "message_end",
        conversation_id: conversationId || undefined,
        metadata: {
          usage: parsedUsage.rawUsage || null,
          usage_source: parsedUsage.usageSource,
          estimated: parsedUsage.estimated,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
        },
      })

      if (conversationId) {
        await updateTaskRun(taskRun.id, {
          status: "running",
          stage: "消息生成完成，正在结算",
          conversationId,
          progress: 95,
          metadata: {
            dify_response_mode: "blocking",
            total_tokens: totalTokens,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
          },
        })
      }
    }

    const finalizeDifyChatResponse = async (stagePrefix = "任务完成") => {
      const shouldCharge = !workflowNodeFailure && hasReceivedContent && (promptTokens > 0 || completionTokens > 0 || workflowImageUrls.length > 0)
      console.log(`💰 [Billing] ${stagePrefix}，输入 ${promptTokens} tokens，输出 ${completionTokens} tokens，总 ${totalTokens} tokens，内容长度: ${fullResponseText.length}，hasReceivedContent: ${hasReceivedContent}`)
      if (shouldCharge) {
        await deductCredit()
      } else {
        console.warn(`⚠️ [Billing] ${stagePrefix}但无可结算 token，不扣费`)
      }

      const finalFailed = Boolean(workflowNodeFailure) || !hasReceivedContent
      taskCompleted = true
      await updateTaskRun(taskRun.id, {
        status: finalFailed ? "failed" : "succeeded",
        stage: workflowNodeFailure ? "OpenClaw 上游节点执行失败" : hasReceivedContent ? "任务完成" : "流结束但没有返回内容",
        progress: 100,
        conversationId: conversationId || undefined,
        artifacts: extractArtifactsFromText(fullResponseText),
        errorMessage: workflowNodeFailure?.message || (hasReceivedContent ? null : "流结束但没有返回内容"),
        errorCode: workflowNodeFailure?.code || (hasReceivedContent ? null : "EMPTY_STREAM"),
        metadata: {
          total_tokens: totalTokens,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          response_length: fullResponseText.length,
          has_received_content: hasReceivedContent,
          node_failure: workflowNodeFailure,
          dify_response_mode: actualDifyResponseMode,
        },
      })
      if (bufferedNodeEvents.length > 0) {
        fireAndForget("AI Task Trace node batch", replaceTaskNodeEvents(taskRun.id, bufferedNodeEvents))
      }
      logPerf(taskRun.requestId, "stream_end", apiStartedAt, {
        responseLength: fullResponseText.length,
        nodeEvents: bufferedNodeEvents.length,
        responseMode: actualDifyResponseMode,
      })
    }

    const responseContentType = response.headers.get("content-type") || ""
    const shouldWrapDifyResponseAsSse =
      useBlockingDifyChat ||
      (
        !responseContentType.toLowerCase().includes("text/event-stream") &&
        responseContentType.toLowerCase().includes("application/json")
      )

    if (shouldWrapDifyResponseAsSse) {
      actualDifyResponseMode = useBlockingDifyChat ? "blocking" : "json_fallback"
      console.log(`✅ [Dify请求] 成功，使用 ${actualDifyResponseMode} 响应包装为 SSE...`)
      const blockingPayload = await response.clone().json().catch(async () => {
        const text = await response.text().catch(() => "")
        return { answer: text }
      })
      const responseBody = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            enqueueSseStatus(controller, { stage: "已收到上游回复，正在整理结果", progress: 90 })
            await applyBlockingDifyPayload(blockingPayload, controller)
            await finalizeDifyChatResponse("blocking 响应结束")
            controller.close()
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            await updateTaskRun(taskRun.id, {
              status: "failed",
              stage: "blocking 响应处理失败",
              progress: 100,
              errorMessage: message,
              errorCode: "DIFY_BLOCKING_RESPONSE_FAILED",
              sanitizedError: sanitizeForTrace({ message }) as Record<string, unknown>,
            }).catch((traceError) => console.warn("[AI Task Trace] blocking failure update failed:", traceError))
            enqueueSseEvent(controller, {
              event: "error",
              message: "服务响应处理失败，请稍后重试",
              code: "DIFY_BLOCKING_RESPONSE_FAILED",
            })
            controller.close()
          }
        },
      })

      request.signal.addEventListener("abort", () => {
        if (taskCompleted) return
        clientAborted = true
        updateTaskRun(taskRun.id, {
          status: "cancelled",
          stage: "客户端连接中断",
          progress: hasReceivedContent ? 80 : 100,
          conversationId: conversationId || undefined,
          errorMessage: `浏览器或网络连接在 ${getTraceModelDisplayName(model)} 响应完成前中断`,
          errorCode: "CLIENT_STREAM_ABORTED",
          metadata: {
            response_length: fullResponseText.length,
            has_received_content: hasReceivedContent,
            model,
            dify_response_mode: actualDifyResponseMode,
          },
        }).catch((error) => console.warn("[AI Task Trace] client abort update failed:", error))
      }, { once: true })

      return new Response(responseBody, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
          "Content-Encoding": "none",
          "X-Request-Id": taskRun.requestId,
          "X-Trace-Id": taskRun.traceId,
          "X-Dify-Response-Mode": actualDifyResponseMode,
        },
      })
    }

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        // 🔥 首字节探测：当 transform 被调用时，说明流式数据已开始传输，取消 180s 超时
        if (!streamStatus.firstByteReceived) {
            streamStatus.firstByteReceived = true
            if (streamStatus.timeoutId) {
                clearTimeout(streamStatus.timeoutId)
                streamStatus.timeoutId = null
            }
            console.warn(`✅ [首字节探测] Dify 流式数据开始传输，已取消首字节超时定时器`)
            logPerf(taskRun.requestId, "dify_first_byte", apiStartedAt)
        }

        // 解析 chunk 提取 token 信息
        try {
          const text = new TextDecoder().decode(chunk)
          const outputText = model === "open-claw" ? rewriteOpenClawMediaReferencesWithSignedUrls(text, undefined, userId) : text
          const shouldBufferForDisplay = isAllInOneAgent
          const enqueueAllInOneDisplayOnce = (rawValue: string) => {
            if (!shouldBufferForDisplay || allInOneDisplaySent || !rawValue.trim()) return
            allInOneDisplaySent = true
            enqueueSseAnswer(controller, normalizeAllInOneAgentDisplay(rawValue))
          }

          // 传递数据给前端。词境记忆卡会在解析后只转发结构化卡片事件，避免 raw JSON 出现在页面。
          if (model !== "vocab-card" && !shouldBufferForDisplay) {
            controller.enqueue(new TextEncoder().encode(outputText))
          }

          // 🎨 Banana 调试：记录原始数据
          if (isWorkflowImageModel && text.trim()) {
            console.log(`🎨 [WorkflowImage流式] 收到数据块:`, { model, bytes: chunk.byteLength })
          }

          // 🔥 追加到缓冲区，然后只处理完整的行
          // 完整的 SSE 数据行格式：data: {...}\n
          // 可能被 TCP 包分割成多块传输，需要跨 chunk 缓冲
          jsonBuffer += outputText

          // 按换行分割，处理所有完整的行
          const lines = jsonBuffer.split("\n")
          // 保留最后一行（可能是未完成的，等待下一个 chunk）
          jsonBuffer = lines.pop() || ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6).trim()
            if (data === "[DONE]") continue

            // 🔥 JSON 完整性检查：确保 JSON 字符串完整（以 } 或 ] 结尾）
            // 如果不完整，说明 SSE 数据行被分割了，保留到缓冲区等待下一个 chunk
            const trimmed = data.trim()
            if (trimmed.length > 0 && !trimmed.endsWith("}") && !trimmed.endsWith("]")) {
              // JSON 不完整（被字节边界分割），放回缓冲区等待下一个 chunk
              jsonBuffer = line + "\n" + jsonBuffer
              continue
            }

            try {
              const json = JSON.parse(data)

              // 🎨 Banana 调试：记录所有事件
              if (isWorkflowImageModel) {
                console.log(`🎨 [WorkflowImage事件] 摘要:`, summarizeDifyEventForLog(json))
              }

	              // 🧠 记录工作流节点事件（用于前端思考过程显示）
	              if (json.event === 'node_started' || json.event === 'node_finished') {
	                console.log(`🧠 [工作流节点] ${json.event}: ${json.data?.title || json.title || '未知节点'}`)
	                const nodeData = json.data || {}
                  const nodeStatus = String(nodeData.status || json.status || "").toLowerCase()
                  const nodeTitle = String(nodeData.title || json.title || "正在处理")
                  if (json.event === "node_started") {
                    enqueueSseStatus(controller, {
                      stage: nodeTitle,
                      progress: hasReceivedContent ? 60 : 30,
                    })
                  }
                  if (model === "vocab-card") {
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(json)}\n\n`))
                  }
	                if (bufferedNodeEvents.length < 80) {
	                  bufferedNodeEvents.push({
	                    event: json.event,
	                    title: nodeTitle,
	                    node_id: nodeData.node_id || json.node_id,
	                    status: nodeData.status || json.status,
	                    workflow_run_id: nodeData.workflow_run_id || json.workflow_run_id,
	                  })
	                }
                  if (json.event === "node_finished" && ["failed", "error"].includes(nodeStatus)) {
                    const title = nodeTitle || "OpenClaw 节点"
                    const errorMessage = String(
                      nodeData.error ||
                      nodeData.error_message ||
                      json.error ||
                      json.message ||
                      `${title} 执行失败`
                    )
                    workflowNodeFailure = {
                      message: errorMessage,
                      code: model === "open-claw" ? "OPENCLAW_NODE_FAILED" : "DIFY_NODE_FAILED",
                    }
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                      event: "error",
                      error: errorMessage,
                      message: errorMessage,
                      code: workflowNodeFailure.code,
                    })}\n\n`))
                    updateTaskRun(taskRun.id, {
                      status: "failed",
                      stage: `${title} 执行失败`,
                      progress: 100,
                      workflowRunId: nodeData.workflow_run_id || json.workflow_run_id || null,
                      errorMessage,
                      errorCode: workflowNodeFailure.code,
                      sanitizedError: sanitizeForTrace({ node: title, status: nodeStatus, error: errorMessage }) as Record<string, unknown>,
	                    }).catch((error) => console.warn("[AI Task Trace] node failure update failed:", error))
	                  }
                    if (!hasReceivedContent) {
                      const finalNodeText = extractFinalNodeOutputText(json)
                      if (finalNodeText.trim()) {
                        finalNodeOutputText = finalNodeText
                        updateTaskRun(taskRun.id, {
                          status: "running",
                          stage: model === "open-claw" ? "已收到 OpenClaw 最终回复" : "已收到最终节点回复",
                          progress: 90,
                        }).catch((error) => console.warn("[AI Task Trace] final node update failed:", error))
                      }
                      if (model === "open-claw") {
                        const openClawFinalNodeText = extractOpenClawFinalNodeText(json)
                        if (openClawFinalNodeText.trim()) {
                          openClawFinalOutputText = openClawFinalNodeText
                        }
                      }
                    }
	              }

	              // 提取 conversation_id
	              if (json.conversation_id) {
	                conversationId = json.conversation_id
                  if (model === "vocab-card" && json.event !== "node_started" && json.event !== "node_finished") {
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                      event: json.event || "conversation",
                      conversation_id: conversationId,
                    })}\n\n`))
                  }
	                updateTaskRun(taskRun.id, {
	                  status: "running",
	                  conversationId,
	                  progress: hasReceivedContent ? 60 : 25,
	                }).catch((error) => console.warn("[AI Task Trace] conversation update failed:", error))
	              }

              // 🔥 收集响应文本内容（Chat API）
	              if (json.event === "message" && json.answer) {
	                fullResponseText += json.answer
	                hasReceivedContent = true
                  if (shouldBufferForDisplay && shouldStreamAllInOneAnswer(json)) {
                    allInOneStreamedAnswer = true
                    enqueueSseAnswer(controller, json.answer)
                  }
	                const artifacts = model === "open-claw" ? extractArtifactsFromText(fullResponseText) : []
	                if (artifacts.length > 0) {
	                  updateTaskRun(taskRun.id, {
	                    status: "running",
	                    stage: "已检测到生成文件",
	                    progress: 80,
	                    artifacts,
	                  }).catch((error) => console.warn("[AI Task Trace] artifact update failed:", error))
	                }

                // 🎨 工作流图片检测：提取图片 URL
                if (isWorkflowImageModel) {
                  // 匹配 Markdown 图片格式：![alt](url)
                  const imageRegex = /!\[.*?\]\((https?:\/\/[^\)]+)\)/g
                  const matches = json.answer.matchAll(imageRegex)
                  for (const match of matches) {
                    const imageUrl = match[1]
	                    if (!workflowImageUrls.includes(imageUrl)) {
	                      workflowImageUrls.push(imageUrl)
	                      console.log(`🎨 [WorkflowImage] 检测到图片 URL (message):`, { model, imageCount: workflowImageUrls.length })
	                    }
                  }
                }
              }

              // 🔥 收集 Workflow API 的文本响应（Banana 2 Pro）
              if (json.event === "text_chunk" || json.event === "agent_message") {
                const text = json.data?.text || json.text || ''
	                if (text) {
		                  fullResponseText += text
		                  hasReceivedContent = true
		                  console.log(`🎨 [Workflow文本] 收集到文本:`, { length: text.length })
	                  const artifacts = model === "open-claw" ? extractArtifactsFromText(fullResponseText) : []
	                  if (artifacts.length > 0) {
	                    updateTaskRun(taskRun.id, {
	                      status: "running",
	                      stage: "已检测到生成文件",
	                      progress: 80,
	                      artifacts,
	                    }).catch((error) => console.warn("[AI Task Trace] artifact update failed:", error))
	                  }
	                }
	              }

	              // 🔥 收集 Workflow 完成事件的输出文本
	              if (json.event === "workflow_finished") {
	                const workflowRunId = json.data?.workflow_run_id || json.workflow_run_id
	                if (json.data?.outputs) {
                  const outputs = json.data.outputs
                  if (model === "vocab-card") {
                    const safeOutputs = sanitizeVocabCardOutputs(outputs)
                    fullResponseText += JSON.stringify({ outputs: safeOutputs })
                    hasReceivedContent = true
                    console.log(`📚 [VocabCard] 收集到结构化 outputs`)
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                      event: "workflow_finished",
                      data: {
                        ...json.data,
                        outputs: safeOutputs,
                      },
                      outputs: safeOutputs,
                      frontend_card_json: safeOutputs.frontend_card_json,
                      current_word: safeOutputs.current_word,
                      word: safeOutputs.word,
                      answer: safeOutputs.answer,
                      conversation_id: conversationId || undefined,
                    })}\n\n`))
	                  } else {
                      const outputText = extractDifyTextOutput(outputs)
                      if (outputText) {
	                    fullResponseText += outputText
	                    hasReceivedContent = true
	                    console.log(`🎨 [Workflow完成] 收集到输出文本:`, { length: outputText.length })
                      if (shouldBufferForDisplay && !allInOneStreamedAnswer) {
                        enqueueAllInOneDisplayOnce(outputText)
                      }
                      }
		                  }
	                }
	                const parsedUsage = parseDifyUsage(json)
	                latestParsedUsage = parsedUsage
	                if (parsedUsage.totalTokens > 0) totalTokens = parsedUsage.totalTokens
	                if (parsedUsage.promptTokens > 0) promptTokens = parsedUsage.promptTokens
	                if (parsedUsage.completionTokens > 0) completionTokens = parsedUsage.completionTokens
	                updateTaskRun(taskRun.id, {
	                  status: "succeeded",
	                  stage: "工作流已完成",
	                  progress: 100,
	                  workflowRunId,
	                  artifacts: extractArtifactsFromUnknown(json.data?.outputs || json.outputs || fullResponseText),
	                }).catch((error) => console.warn("[AI Task Trace] workflow finish update failed:", error))
	              }

              // 🎨 处理 message_file 事件（图片文件）
              if (json.event === "message_file" && isWorkflowImageModel) {
                console.log(`🎨 [WorkflowImage] 收到 message_file 事件:`, summarizeDifyEventForLog(json))

                // Dify 返回的图片文件格式：{ type: "image", url: "..." }
                if (json.type === "image" && json.url) {
                  const imageUrl = json.url
	                  if (!workflowImageUrls.includes(imageUrl)) {
	                    workflowImageUrls.push(imageUrl)
	                    console.log(`🎨 [WorkflowImage] 检测到图片 URL (message_file):`, { model, imageCount: workflowImageUrls.length })

                    // 🔥 立即将图片 URL 以 Markdown 格式添加到响应中
                    fullResponseText += `\n\n![Generated Image](${imageUrl})`
                  }
                }
              }

              if (shouldBufferForDisplay && json.event === "message_end" && fullResponseText.trim() && !allInOneStreamedAnswer) {
                enqueueAllInOneDisplayOnce(fullResponseText)
              }
              if (model === "open-claw" && json.event === "message_end" && !hasReceivedContent && openClawFinalOutputText.trim()) {
                enqueueSseAnswer(controller, openClawFinalOutputText)
                fullResponseText = openClawFinalOutputText
                hasReceivedContent = true
              } else if (json.event === "message_end" && !hasReceivedContent && finalNodeOutputText.trim()) {
                const displayText = isAllInOneAgent ? normalizeAllInOneAgentDisplay(finalNodeOutputText) : finalNodeOutputText
                enqueueSseAnswer(controller, displayText)
                fullResponseText = displayText
                hasReceivedContent = true
              }

              // 🎨 处理 workflow_finished 事件（可能包含图片）
              if (json.event === "workflow_finished" && isWorkflowImageModel) {
                console.log(`🎨 [WorkflowImage] 收到 workflow_finished 事件:`, summarizeDifyEventForLog(json))

                // 检查是否有输出文件
                const workflowFiles = json.outputs?.files || json.data?.outputs?.files || []
                if (Array.isArray(workflowFiles)) {
                  for (const file of workflowFiles) {
                    if (file.type === "image" && file.url) {
                      const imageUrl = file.url
	                      if (!workflowImageUrls.includes(imageUrl)) {
	                        workflowImageUrls.push(imageUrl)
	                        console.log(`🎨 [WorkflowImage] 检测到图片 URL (workflow_finished):`, { model, imageCount: workflowImageUrls.length })

                        // 🔥 立即将图片 URL 以 Markdown 格式添加到响应中
                        fullResponseText += `\n\n![Generated Image](${imageUrl})`
                      }
                    }
                  }
                }
              }

	              // 提取 token 使用量（Dify 在 message_end 事件中返回）
		              if (json.event === "message_end" && json.metadata?.usage) {
		                const parsedUsage = parseDifyUsage(json)
		                latestParsedUsage = parsedUsage
		                totalTokens = parsedUsage.totalTokens
		                promptTokens = parsedUsage.promptTokens
		                completionTokens = parsedUsage.completionTokens
		                console.log(`📊 [Token统计] 输入: ${promptTokens}, 输出: ${completionTokens}, 总Token: ${totalTokens}`)
	                updateTaskRun(taskRun.id, {
	                  status: "running",
	                  stage: "消息生成完成，正在结算",
	                  progress: 95,
	                  metadata: { total_tokens: totalTokens, prompt_tokens: promptTokens, completion_tokens: completionTokens },
	                }).catch((error) => console.warn("[AI Task Trace] message_end update failed:", error))
	              }
            } catch (e) {
              // 🔥 只有真正 JSON 格式错误才记录（而不是被截断的数据）
              if (e instanceof SyntaxError) {
                // JSON 仍然不完整，放回缓冲区
                jsonBuffer = line + "\n" + jsonBuffer
              } else {
                console.error(`❌ [Transform解析] 事件解析失败:`, e, `| 数据:`, data?.substring(0, 100))
              }
            }
          }
        } catch (e) {
          console.error(`❌ [Transform] transform阶段异常:`, e)
          controller.enqueue(chunk)
        }
      },

      async flush(controller) {
        if (clientAborted) {
          console.warn("[Stream] 客户端连接已中断，跳过成功结算")
          return
        }
        // 🔥 处理缓冲区中剩余的未完成 JSON（流结束时的最后一条数据）
        if (jsonBuffer.trim().length > 0) {
          const line = jsonBuffer.trim()
          if (line.startsWith("data: ") && line !== "[DONE]") {
            const data = line.slice(6).trim()
            try {
              const json = JSON.parse(data)
              // 处理最后一条消息的文本收集
              if (json.event === "message" && json.answer) {
                fullResponseText += json.answer
              }
              if (json.conversation_id) {
                conversationId = json.conversation_id
              }
	              if (json.metadata?.usage) {
	                const parsedUsage = parseDifyUsage(json)
	                latestParsedUsage = parsedUsage
	                totalTokens = parsedUsage.totalTokens
	                promptTokens = parsedUsage.promptTokens
	                completionTokens = parsedUsage.completionTokens
	              }
            } catch (e) {
              // 流结束时的最后数据仍然不完整，静默忽略
              console.warn(`⚠️ [Flush] 缓冲区剩余数据解析失败:`, e)
            }
          }
        }

        // 🔥 流结束，触发扣费（仅当有实际内容时才扣费）
	        if (isAllInOneAgent && fullResponseText.trim() && !allInOneDisplaySent && !allInOneStreamedAnswer) {
	          allInOneDisplaySent = true
	          enqueueSseAnswer(controller, normalizeAllInOneAgentDisplay(fullResponseText))
	        }
        if (model === "open-claw" && !hasReceivedContent && openClawFinalOutputText.trim()) {
          enqueueSseAnswer(controller, openClawFinalOutputText)
          fullResponseText = openClawFinalOutputText
          hasReceivedContent = true
        } else if (!hasReceivedContent && finalNodeOutputText.trim()) {
          const displayText = isAllInOneAgent ? normalizeAllInOneAgentDisplay(finalNodeOutputText) : finalNodeOutputText
          enqueueSseAnswer(controller, displayText)
          fullResponseText = displayText
          hasReceivedContent = true
        }
	        console.log(`💰 [Billing] 流结束，输入 ${promptTokens} tokens，输出 ${completionTokens} tokens，总 ${totalTokens} tokens，内容长度: ${fullResponseText.length}，hasReceivedContent: ${hasReceivedContent}`)
	        if (!workflowNodeFailure && hasReceivedContent && (promptTokens > 0 || completionTokens > 0 || workflowImageUrls.length > 0)) {
	          deductCredit().catch(e => console.error("[Billing] 扣费异步异常:", e))
	        } else {
	          console.warn(`⚠️ [Billing] 流结束但无可结算 token，不扣费`)
	        }
          const finalFailed = Boolean(workflowNodeFailure) || !hasReceivedContent
          taskCompleted = true
	        updateTaskRun(taskRun.id, {
	          status: finalFailed ? "failed" : "succeeded",
	          stage: workflowNodeFailure ? "OpenClaw 上游节点执行失败" : hasReceivedContent ? "任务完成" : "流结束但没有返回内容",
	          progress: 100,
	          conversationId: conversationId || undefined,
	          artifacts: extractArtifactsFromText(fullResponseText),
	          errorMessage: workflowNodeFailure?.message || (hasReceivedContent ? null : "流结束但没有返回内容"),
	          errorCode: workflowNodeFailure?.code || (hasReceivedContent ? null : "EMPTY_STREAM"),
	          metadata: {
	            total_tokens: totalTokens,
	            prompt_tokens: promptTokens,
	            completion_tokens: completionTokens,
	            response_length: fullResponseText.length,
	            has_received_content: hasReceivedContent,
              node_failure: workflowNodeFailure,
	          },
	        }).catch((error) => console.warn("[AI Task Trace] flush update failed:", error))
	        if (bufferedNodeEvents.length > 0) {
	          fireAndForget("AI Task Trace node batch", replaceTaskNodeEvents(taskRun.id, bufferedNodeEvents))
	        }
	        logPerf(taskRun.requestId, "stream_end", apiStartedAt, {
	          responseLength: fullResponseText.length,
	          nodeEvents: bufferedNodeEvents.length,
	        })
	      }

    })

    const addLongTaskHeartbeat = (body: ReadableStream<Uint8Array>) => {
      const encoder = new TextEncoder()
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
      let heartbeatId: ReturnType<typeof setInterval> | null = null
      let closed = false
      const heartbeatLabel = isAllInOneAgent
        ? "all-in-one-keepalive"
        : model === "open-claw"
          ? "openclaw-keepalive"
          : "dify-keepalive"

      const stopHeartbeat = () => {
        closed = true
        if (heartbeatId) {
          clearInterval(heartbeatId)
          heartbeatId = null
        }
      }

      return new ReadableStream<Uint8Array>({
        start(controller) {
          reader = body.getReader()
          heartbeatId = setInterval(() => {
            if (closed) return
            try {
              controller.enqueue(encoder.encode(`: ${heartbeatLabel} ${Date.now()}\n\n`))
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                event: "status",
                stage: "连接正常，任务仍在处理中",
                heartbeat: Date.now(),
              })}\n\n`))
            } catch {
              stopHeartbeat()
            }
          }, 15_000)

          ;(async () => {
            try {
              while (true) {
                const { done, value } = await reader!.read()
                if (done) break
                if (value) controller.enqueue(value)
              }
              stopHeartbeat()
              controller.close()
            } catch (error) {
              stopHeartbeat()
              controller.error(error)
            }
          })()
        },
        async cancel(reason) {
          stopHeartbeat()
          await reader?.cancel(reason).catch(() => undefined)
        },
      })
    }

    // 返回经过 transform 处理的流
    const transformedBody = response.body?.pipeThrough(transformStream)
    if (!transformedBody) {
      console.error(`❌ [Stream错误] pipeThrough返回undefined! response.body=${response.body === null ? 'null' : 'not-null'}`)
      return new Response(JSON.stringify({ error: "Dify响应体为空，服务端流处理失败" }), { status: 502 })
    }
    const responseBody = addLongTaskHeartbeat(transformedBody)
    request.signal.addEventListener("abort", () => {
      if (taskCompleted) return
      clientAborted = true
      const modelLabel = getTraceModelDisplayName(model)
      if (streamStatus.timeoutId) {
        clearTimeout(streamStatus.timeoutId)
        streamStatus.timeoutId = null
      }
      streamStatus.controller?.abort()
      updateTaskRun(taskRun.id, {
        status: "cancelled",
        stage: "客户端连接中断",
        progress: hasReceivedContent ? 80 : 100,
        conversationId: conversationId || undefined,
        errorMessage: `浏览器或网络连接在 ${modelLabel} 响应完成前中断`,
        errorCode: "CLIENT_STREAM_ABORTED",
        metadata: {
          response_length: fullResponseText.length,
          has_received_content: hasReceivedContent,
          model,
        },
      }).catch((error) => console.warn("[AI Task Trace] client abort update failed:", error))
    }, { once: true })
	    console.warn(`✅ [Stream开始] 开始返回流式响应给前端，body locked: ${transformedBody.locked}`)
	    return new Response(responseBody, {
	        headers: {
	          "Content-Type": "text/event-stream",
	          "Cache-Control": "no-cache",
	          "Connection": "keep-alive",
	          "X-Accel-Buffering": "no",
	          "Content-Encoding": "none",
	          "X-Request-Id": taskRun.requestId,
	          "X-Trace-Id": taskRun.traceId,
	        },
	    })

	  } catch (error: unknown) {
	    const err = error instanceof Error ? error : new Error(String(error))
	    console.error("❌ 后端致命错误:", err.message);
	    const fallbackRequestId = request.headers.get("X-Request-Id")
	    if (fallbackRequestId) {
	      await updateTaskRun(fallbackRequestId, {
	        status: "failed",
	        stage: "服务端致命错误",
	        progress: 100,
	        errorMessage: err.message,
	        errorCode: "DIFY_FATAL",
	        sanitizedError: sanitizeForTrace({ message: err.message, stack: err.stack }) as Record<string, unknown>,
	      })
	    }
	    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
	  }
}
