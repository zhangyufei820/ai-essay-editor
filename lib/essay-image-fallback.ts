import "server-only"

import { createHmac, timingSafeEqual } from "crypto"

import { isValidEssayCorrectionResult } from "@/lib/essay-correction-result"
import {
  callEssayAiSuite,
  type EssayAiSuiteResponse,
  type OcrResult,
} from "@/lib/essay-ai-suite-client"
import { internalDifyFetch } from "@/lib/internal-dify-fetch"

const ESSAY_AI_SUITE_OCR_TIMEOUT_MS = 20_000
const LLM_GATEWAY_OCR_TIMEOUT_MS = 25_000
const ESSAY_AI_SUITE_GRADE_TIMEOUT_MS = 35_000
const DIRECT_ESSAY_GRADE_TIMEOUT_MS = 30_000
const DIRECT_ESSAY_GRADE_ATTEMPTS = 2
const DIRECT_ESSAY_GRADE_MODEL = "gpt-5.5"
const DIRECT_ESSAY_GRADE_PROMPT_VERSION = "direct-essay-grading-v1"
const ESSAY_OCR_MODEL = "sx-chinese-text"
const MAX_IMAGE_BASE64_LENGTH = 24 * 1024 * 1024
const MIN_ESSAY_OCR_CONTENT_CHARS = 12

const OCR_FAILURE_PATTERNS = [
  /^(?:抱歉|对不起)[，,\s]*(?:我|当前|暂时)?(?:无法|不能)/i,
  /(?:无法|不能|未能)(?:识别|读取|提取|看清)(?:图片|图像|作文|文字|内容)/i,
  /(?:未|没有)(?:识别|检测|提取)到(?:作文|文字|文本|内容)/i,
  /(?:图片|图像)(?:过于)?(?:模糊|不清晰|无法读取|无法识别)/i,
  /请(?:重新|再次)(?:拍摄|上传)/i,
  /(?:识别|处理)(?:过程)?(?:失败|出错|超时)/i,
  /(?:服务|模型|系统).{0,20}(?:不可用|异常|错误|超时)/i,
  /请稍后重试/i,
  /(?:ocr|image|text).{0,20}(?:failed|failure|error|unavailable)/i,
  /(?:unable|cannot|can't|could not).{0,24}(?:read|recognize|extract|transcribe)/i,
  /no\s+(?:readable\s+)?text\s+(?:was\s+)?(?:found|detected|recognized)/i,
]

export const MAX_ESSAY_OCR_TEXT_LENGTH = 20_000
export const ESSAY_OCR_TEXT_TOKEN_TTL_MS = 15 * 60 * 1000

type EssayOcrTextTokenPayload = {
  v: 1
  kind: "essay-ocr-text"
  userHash: string
  fileHash: string
  textHash: string
  expiresAt: number
}

export type ExtractEssayTextFromImageParams = {
  fileId: string
  imageBase64: string
  fileName?: string
  mimeType?: string
}

export type EssayImageOcrResult = {
  text: string
  provider: "essay-ai-suite" | "llm-gateway"
}

export type EssayOcrTextTokenParams = {
  userId: string
  fileId: string
  text: string
  now?: number
}

export type GetVerifiedEssayOcrTextFromAttachmentsParams = {
  userId: string
  fileIds: unknown
  fileAttachments: unknown
}

export type VerifiedEssayOcrText = {
  text: string
  fileIds: string[]
}

export type GradeEssayWithFallbackParams = {
  text: string
  essayId?: string
  studentName?: string
  gradeLevel?: string
  genre?: string
  metadata?: Record<string, unknown>
  options?: Record<string, unknown>
  signal?: AbortSignal
}

export type EssayFallbackGradeResult = {
  markdownReport: string
  provider: "llm"
  model: string | null
  promptVersion: string | null
}

type EssayGradeResult = {
  status?: unknown
  provider?: unknown
  markdown_report?: unknown
  model?: unknown
  prompt_version?: unknown
}

type OpenAiChatResponse = {
  model?: unknown
  choices?: Array<{
    finish_reason?: unknown
    message?: {
      content?: unknown
    }
  }>
}

export class EssayImageFallbackError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = "EssayImageFallbackError"
  }
}

function readRequiredString(value: unknown, code: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new EssayImageFallbackError(code)
  }
  return value.trim()
}

function normalizeText(value: string) {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
}

function normalizeOcrText(value: unknown) {
  if (typeof value !== "string") return ""
  return normalizeText(value)
}

export function isUsableEssayOcrText(value: unknown, options?: { truncated?: boolean }) {
  const text = normalizeOcrText(value)
  if (
    options?.truncated
    || !text
    || text.length >= MAX_ESSAY_OCR_TEXT_LENGTH
    || OCR_FAILURE_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    return false
  }

  const contentChars = text.match(/[A-Za-z0-9\u3400-\u9fff]/g)?.length || 0
  return contentChars >= MIN_ESSAY_OCR_CONTENT_CHARS
}

function readUsableEssayOcrText(value: unknown, options?: { truncated?: boolean }) {
  return isUsableEssayOcrText(value, options) ? normalizeOcrText(value) : ""
}

function normalizeMimeType(value: string | undefined) {
  const normalized = value?.trim().toLowerCase()
  if (normalized && /^image\/(?:jpeg|png|webp|gif)$/.test(normalized)) return normalized
  return "image/jpeg"
}

function parseImageInput(params: ExtractEssayTextFromImageParams) {
  const fileId = readRequiredString(params.fileId, "ESSAY_OCR_FILE_ID_REQUIRED")
  const imageValue = readRequiredString(params.imageBase64, "ESSAY_OCR_IMAGE_REQUIRED")
  const dataUrl = imageValue.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i)
  const imageBase64 = (dataUrl?.[2] || imageValue).replace(/\s+/g, "")

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64) || imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
    throw new EssayImageFallbackError("ESSAY_OCR_IMAGE_INVALID")
  }

  return {
    fileId,
    imageBase64,
    mimeType: normalizeMimeType(dataUrl?.[1] || params.mimeType),
  }
}

function readOpenAiText(content: unknown) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""

  return content
    .map((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) return ""
      const text = (part as Record<string, unknown>).text
      return typeof text === "string" ? text : ""
    })
    .filter(Boolean)
    .join("\n")
}

async function callSuiteOcr(
  params: ReturnType<typeof parseImageInput> & Pick<ExtractEssayTextFromImageParams, "fileName">,
): Promise<string> {
  const response = await callEssayAiSuite<OcrResult>(
    "/api/ocr/image",
    {
      image_id: params.fileId,
      ...(params.fileName ? { file_name: params.fileName } : {}),
      image_base64: params.imageBase64,
    },
    ESSAY_AI_SUITE_OCR_TIMEOUT_MS,
  )
  if (
    !response.ok
    || response.result?.status !== "success"
    || response.result.provider !== "openai-compatible-vision"
  ) {
    return ""
  }
  return readUsableEssayOcrText(response.result.text)
}

function getLlmGatewayConfig() {
  const baseUrl = process.env.LLM_GATEWAY_BASE_URL?.trim().replace(/\/+$/, "") || ""
  const apiKey = process.env.LITELLM_MASTER_KEY?.trim() || ""
  return { baseUrl, apiKey }
}

async function callGatewayOcr(params: ReturnType<typeof parseImageInput>) {
  const { baseUrl, apiKey } = getLlmGatewayConfig()
  if (!baseUrl || !apiKey) {
    throw new EssayImageFallbackError("ESSAY_OCR_GATEWAY_NOT_CONFIGURED")
  }

  let response: Response
  try {
    response = await internalDifyFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ESSAY_OCR_MODEL,
        temperature: 0,
        max_tokens: 10_000,
        messages: [
          {
            role: "system",
            content: "你是作文 OCR 助手。只转写图片中的学生作文正文，保留自然段，不补写、不点评、不输出说明。",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "请逐字识别作文正文，只输出纯文本。" },
              {
                type: "image_url",
                image_url: {
                  url: `data:${params.mimeType};base64,${params.imageBase64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(LLM_GATEWAY_OCR_TIMEOUT_MS),
    })
  } catch {
    throw new EssayImageFallbackError("ESSAY_OCR_GATEWAY_FAILED")
  }

  if (!response.ok) {
    throw new EssayImageFallbackError("ESSAY_OCR_GATEWAY_FAILED")
  }

  const payload = await response.json().catch(() => null) as OpenAiChatResponse | null
  const choice = payload?.choices?.[0]
  const text = readUsableEssayOcrText(
    readOpenAiText(choice?.message?.content),
    {
      truncated: typeof choice?.finish_reason === "string"
        && choice.finish_reason.trim().toLowerCase() === "length",
    },
  )
  if (!text) {
    throw new EssayImageFallbackError("ESSAY_OCR_UNUSABLE_RESULT")
  }
  return text
}

export async function extractEssayTextFromImage(
  params: ExtractEssayTextFromImageParams,
): Promise<EssayImageOcrResult> {
  const image = parseImageInput(params)

  try {
    const suiteText = await callSuiteOcr({ ...image, fileName: params.fileName })
    if (suiteText) {
      return { text: suiteText, provider: "essay-ai-suite" }
    }
  } catch {
    // The gateway below is the independent OCR fallback.
  }

  return {
    text: await callGatewayOcr(image),
    provider: "llm-gateway",
  }
}

function getOcrSigningSecret() {
  return process.env.ESSAY_OCR_SIGNING_SECRET?.trim()
    || process.env.LITELLM_MASTER_KEY?.trim()
    || process.env.ESSAY_AI_SUITE_API_TOKEN?.trim()
    || ""
}

function hmac(secret: string, purpose: string, value: string, encoding: "hex" | "base64url" = "hex") {
  return createHmac("sha256", secret)
    .update(`essay-ocr:${purpose}:`)
    .update(value, "utf8")
    .digest(encoding)
}

function encodeTokenPayload(payload: EssayOcrTextTokenPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

function decodeTokenPayload(encoded: string): Partial<EssayOcrTextTokenPayload> | null {
  if (!encoded || encoded.length > 2048) return null
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Partial<EssayOcrTextTokenPayload>
      : null
  } catch {
    return null
  }
}

function safeTimingEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function tokenBinding(secret: string, params: EssayOcrTextTokenParams) {
  const userId = typeof params.userId === "string" ? params.userId.trim() : ""
  const fileId = typeof params.fileId === "string" ? params.fileId.trim() : ""
  const text = typeof params.text === "string" ? params.text : ""
  if (
    !userId
    || !fileId
    || userId.length > 1024
    || fileId.length > 1024
    || !isUsableEssayOcrText(text)
  ) {
    return null
  }

  return {
    userHash: hmac(secret, "user", userId),
    fileHash: hmac(secret, "file", fileId),
    textHash: hmac(secret, "text", text),
  }
}

export function signEssayOcrTextToken(params: EssayOcrTextTokenParams) {
  const secret = getOcrSigningSecret()
  const binding = secret ? tokenBinding(secret, params) : null
  if (!secret || !binding) return ""

  const now = Number.isFinite(params.now) ? params.now! : Date.now()
  const encoded = encodeTokenPayload({
    v: 1,
    kind: "essay-ocr-text",
    ...binding,
    expiresAt: now + ESSAY_OCR_TEXT_TOKEN_TTL_MS,
  })
  return `${encoded}.${hmac(secret, "signature", encoded, "base64url")}`
}

export function verifyEssayOcrTextToken(
  token: string | null | undefined,
  params: EssayOcrTextTokenParams,
) {
  const secret = getOcrSigningSecret()
  const binding = secret ? tokenBinding(secret, params) : null
  if (!secret || !binding || !token || token.length > 4096) return false

  const [encoded, signature, extra] = token.split(".")
  if (!encoded || !signature || extra !== undefined) return false

  const expectedSignature = hmac(secret, "signature", encoded, "base64url")
  if (!safeTimingEqual(signature, expectedSignature)) return false

  const payload = decodeTokenPayload(encoded)
  const now = Number.isFinite(params.now) ? params.now! : Date.now()
  const expiresAt = typeof payload?.expiresAt === "number" ? payload.expiresAt : 0
  return payload?.v === 1
    && payload.kind === "essay-ocr-text"
    && payload.userHash === binding.userHash
    && payload.fileHash === binding.fileHash
    && payload.textHash === binding.textHash
    && expiresAt > now
    && expiresAt <= now + ESSAY_OCR_TEXT_TOKEN_TTL_MS
}

export function getVerifiedEssayOcrTextFromAttachments(
  params: GetVerifiedEssayOcrTextFromAttachmentsParams,
): VerifiedEssayOcrText | null {
  const userId = typeof params.userId === "string" ? params.userId.trim() : ""
  if (!userId || !Array.isArray(params.fileIds) || !Array.isArray(params.fileAttachments)) {
    return null
  }

  const requestedFileIds = params.fileIds.map((value) => (
    typeof value === "string" ? value.trim() : ""
  ))
  if (
    requestedFileIds.length === 0
    || requestedFileIds.some((fileId) => !fileId)
    || new Set(requestedFileIds).size !== requestedFileIds.length
  ) {
    return null
  }

  const requestedFileIdSet = new Set(requestedFileIds)
  const attachmentByFileId = new Map<string, Record<string, unknown>>()

  for (const value of params.fileAttachments) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const attachment = value as Record<string, unknown>
    const fileId = typeof attachment.id === "string" ? attachment.id.trim() : ""
    if (!fileId || !requestedFileIdSet.has(fileId)) continue
    // Duplicate metadata for one Dify id is ambiguous and therefore cannot
    // establish a complete, trustworthy multi-page essay.
    if (attachmentByFileId.has(fileId)) return null
    attachmentByFileId.set(fileId, attachment)
  }

  const pageTexts: string[] = []
  for (const fileId of requestedFileIds) {
    const attachment = attachmentByFileId.get(fileId)
    if (!attachment) return null

    const mimeType = typeof attachment.mimeType === "string" ? attachment.mimeType.trim() : ""
    const extractedText = typeof attachment.extractedText === "string" ? attachment.extractedText : ""
    const extractedTextToken = typeof attachment.extractedTextToken === "string"
      ? attachment.extractedTextToken.trim()
      : ""
    if (
      !/^image\/[a-z0-9.+-]+$/i.test(mimeType)
      || !extractedText.trim()
      || !extractedTextToken
      || !verifyEssayOcrTextToken(extractedTextToken, { userId, fileId, text: extractedText })
    ) {
      return null
    }

    const normalizedText = readUsableEssayOcrText(extractedText)
    if (!normalizedText) return null
    pageTexts.push(normalizedText)
  }

  const text = pageTexts.join("\n\n")
  if (!text || text.length > MAX_ESSAY_OCR_TEXT_LENGTH) return null
  return { text, fileIds: requestedFileIds }
}

function buildGradeRequest(params: GradeEssayWithFallbackParams) {
  const text = normalizeText(params.text)
  if (!isUsableEssayOcrText(text)) {
    throw new EssayImageFallbackError("ESSAY_FALLBACK_TEXT_INVALID")
  }

  return {
    text,
    ...(params.essayId?.trim() ? { essay_id: params.essayId.trim() } : {}),
    ...(params.studentName?.trim() ? { student_name: params.studentName.trim() } : {}),
    ...(params.gradeLevel?.trim() ? { grade_level: params.gradeLevel.trim() } : {}),
    ...(params.genre?.trim() ? { genre: params.genre.trim() } : {}),
    ...(params.metadata ? { metadata: params.metadata } : {}),
    ...(params.options ? { options: params.options } : {}),
  }
}

function getDirectEssayGradeConfig() {
  const baseUrl = process.env.SHENXIANG_NEW_API_BASE_URL?.trim().replace(/\/+$/, "") || ""
  const apiKey = process.env.SHENXIANG_NEW_API_TEXT_API_KEY?.trim() || ""
  return { baseUrl, apiKey }
}

async function callDirectEssayGrade(
  gradeRequest: ReturnType<typeof buildGradeRequest>,
  signal?: AbortSignal,
): Promise<EssayFallbackGradeResult | null> {
  const { baseUrl, apiKey } = getDirectEssayGradeConfig()
  if (!baseUrl || !apiKey) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DIRECT_ESSAY_GRADE_TIMEOUT_MS)
  const abortFromCaller = () => controller.abort(signal?.reason)
  if (signal?.aborted) abortFromCaller()
  else signal?.addEventListener("abort", abortFromCaller, { once: true })

  try {
    const response = await internalDifyFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DIRECT_ESSAY_GRADE_MODEL,
        max_tokens: 1_400,
        messages: [
          {
            role: "system",
            content: [
              "你是中小学作文阅卷老师。",
              "仅输出简洁 Markdown 批改报告，不输出推理过程。",
              "必须包含综合评分（大于 0 且满分 100）、总评、主要优点、关键问题、修改建议和润色示范。",
              "第一行必须严格使用“综合评分：XX/100分”，不要给这一行添加 Markdown 加粗标记。",
              "报告控制在 900 字以内，评价必须基于原文，不得声称未收到或无法识别作文。",
            ].join(""),
          },
          {
            role: "user",
            content: [
              "请批改以下作文。",
              `学段：${gradeRequest.grade_level || "未指定"}`,
              `文体：${gradeRequest.genre || "未指定"}`,
              "",
              gradeRequest.text,
            ].join("\n"),
          },
        ],
      }),
      signal: controller.signal,
    })
    if (!response.ok || signal?.aborted) return null

    const payload = await response.json().catch(() => null) as OpenAiChatResponse | null
    const choice = payload?.choices?.[0]
    const markdownReport = normalizeText(readOpenAiText(choice?.message?.content))
    if (
      String(choice?.finish_reason || "").toLowerCase() === "length"
      || !isValidEssayCorrectionResult(markdownReport)
    ) {
      return null
    }

    return {
      markdownReport,
      provider: "llm",
      model: typeof payload?.model === "string" && payload.model.trim()
        ? payload.model.trim()
        : DIRECT_ESSAY_GRADE_MODEL,
      promptVersion: DIRECT_ESSAY_GRADE_PROMPT_VERSION,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", abortFromCaller)
  }
}

export async function gradeEssayWithFallback(
  params: GradeEssayWithFallbackParams,
): Promise<EssayFallbackGradeResult> {
  if (params.signal?.aborted) {
    throw new EssayImageFallbackError("ESSAY_FALLBACK_GRADE_ABORTED")
  }

  const gradeRequest = buildGradeRequest(params)
  for (let attempt = 0; attempt < DIRECT_ESSAY_GRADE_ATTEMPTS; attempt += 1) {
    const directResult = await callDirectEssayGrade(gradeRequest, params.signal)
    if (params.signal?.aborted) {
      throw new EssayImageFallbackError("ESSAY_FALLBACK_GRADE_ABORTED")
    }
    if (directResult) return directResult
  }

  let response: EssayAiSuiteResponse<EssayGradeResult>
  try {
    response = await callEssayAiSuite<EssayGradeResult>(
      "/api/essay/grade-single",
      gradeRequest,
      ESSAY_AI_SUITE_GRADE_TIMEOUT_MS,
      params.signal,
    )
  } catch {
    if (params.signal?.aborted) {
      throw new EssayImageFallbackError("ESSAY_FALLBACK_GRADE_ABORTED")
    }
    throw new EssayImageFallbackError("ESSAY_FALLBACK_GRADE_FAILED")
  }

  if (params.signal?.aborted) {
    throw new EssayImageFallbackError("ESSAY_FALLBACK_GRADE_ABORTED")
  }

  const result = response.result
  const markdownReport = typeof result?.markdown_report === "string"
    ? result.markdown_report.trim()
    : ""
  if (
    !response.ok
    || result?.status !== "success"
    || result.provider !== "llm"
    || !isValidEssayCorrectionResult(markdownReport)
  ) {
    throw new EssayImageFallbackError("ESSAY_FALLBACK_GRADE_INVALID")
  }

  return {
    markdownReport,
    provider: "llm",
    model: typeof result.model === "string" && result.model.trim() ? result.model.trim() : null,
    promptVersion: typeof result.prompt_version === "string" && result.prompt_version.trim()
      ? result.prompt_version.trim()
      : null,
  }
}
