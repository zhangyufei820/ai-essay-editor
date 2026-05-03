import { NextRequest, NextResponse } from "next/server"
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
  ModelType,
  MODEL_COSTS,
  LUXURY_THRESHOLD,
  getModelDisplayName
} from "@/lib/pricing"
import { assertSecureTlsConfiguration } from "@/lib/runtime-security"
import { internalDifyFetch } from "@/lib/internal-dify-fetch"
import { getDifyCredentialForModel } from "@/lib/dify-credentials"
import { rewriteOpenClawMediaReferences } from "@/lib/openclaw-media"
import { rewriteOpenClawMediaReferencesWithSignedUrls } from "@/lib/openclaw-media-server"
import {
  appendTaskNodeEvent,
  createRequestId,
  createTaskRun,
  extractArtifactsFromText,
  extractArtifactsFromUnknown,
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

const GPT_IMAGE_V11_DEFAULT_INPUTS: GptImageV11Inputs = {
  aspect_ratio: "1:1",
  size: "1024x1024",
  model: "gpt-image-1",
  quality: "medium",
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
  size: ["auto", "original_1k", "original_2k", "original_4k", "1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "1152x2048", "3840x2160", "2160x3840"],
  model: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"],
  quality: ["auto", "low", "medium", "high"],
  output_format: ["png", "jpeg", "webp"],
  background: ["auto", "opaque", "transparent"],
  moderation: ["auto", "low"],
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
    size: pickEnum(record.size, GPT_IMAGE_V11_ALLOWED.size, GPT_IMAGE_V11_DEFAULT_INPUTS.size),
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

const WORKFLOW_MODELS = new Set(["banana-2-pro", "vocab-card"])

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

// 默认的基础配置
const DIFY_BASE_URL = process.env.DIFY_INTERNAL_URL
  || process.env.DIFY_BASE_URL
  || "https://api.dify.ai/v1"
const DEFAULT_DIFY_FIRST_BYTE_TIMEOUT_MS = 120_000
const OPENCLAW_FIRST_BYTE_TIMEOUT_MS = 900_000
const GPT_IMAGE_BLOCKING_TIMEOUT_MS = 300_000
const GPT_IMAGE_GATEWAY_TIMEOUT_MS = 540_000
const IMAGE_GATEWAY_URL = (process.env.DIFY_IMAGE_GATEWAY_URL || "http://dify-image-gateway:8001").replace(/\/+$/, "")
// 🔥 作文批改（standard）使用专用的 ESSAY_CORRECTION_API_KEY
const DEFAULT_DIFY_KEY = process.env.ESSAY_CORRECTION_API_KEY || process.env.DIFY_API_KEY 

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

  return {
    prompt: query || "生成图片",
    mode: imageInputs.mode,
    model: imageInputs.model,
    size: imageInputs.size,
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

function createImageGatewayResponse(payload: unknown) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}
  const success = record.success !== false
  const statusCode = typeof record.status_code === "number" ? record.status_code : success ? 200 : 502
  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : {}
  const imageUrls = extractWorkflowImageUrls(data)
  const detail = record.detail && typeof record.detail === "object" ? record.detail as Record<string, unknown> : {}
  const requestPayload = detail.request_payload && typeof detail.request_payload === "object" ? detail.request_payload as Record<string, unknown> : {}
  const referenceImageUrls = Array.isArray(requestPayload.reference_image_urls) ? requestPayload.reference_image_urls : []
  const message = typeof record.message === "string" ? record.message : success ? "图片生成成功" : "图片生成失败"
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
    return Response.json({ error: message, data: record }, { status: statusCode >= 400 ? statusCode : 502 })
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

async function callImageGatewayDirect(query: string, inputs: unknown) {
  const gatewayToken = process.env.DIFY_IMAGE_GATEWAY_TOKEN || DEFAULT_DIFY_KEY || ""
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
      payload = { success: false, message: text.slice(0, 500), status_code: response.status }
    }

    if (!response.ok) {
      return Response.json({ error: "图片服务请求失败", data: payload }, { status: response.status })
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

async function startImageGatewayTask(params: {
  query: string
  inputs: unknown
  userId: string
  requestId: string
  traceId: string
}) {
  const gatewayToken = process.env.DIFY_IMAGE_GATEWAY_TOKEN || DEFAULT_DIFY_KEY || ""
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
    userId: params.userId,
    promptLength: params.query.length,
    requestId: params.requestId,
    traceId: params.traceId,
  })

  return taskId
}

export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("imageTaskId")
  if (!taskId) {
    return Response.json({ error: "缺少图片任务 ID" }, { status: 400 })
  }

  const headerUserId = request.headers.get("X-User-Id")
  const requestId = request.nextUrl.searchParams.get("requestId") || request.headers.get("X-Request-Id")
  const gatewayToken = process.env.DIFY_IMAGE_GATEWAY_TOKEN || DEFAULT_DIFY_KEY || ""
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
    if (requestId) {
      await updateTaskRun(requestId, {
        status: "failed",
        stage: "图片任务不存在或已过期",
        progress: 100,
        upstreamTaskId: taskId,
        errorMessage: "图片任务不存在或已过期",
        errorCode: "IMAGE_TASK_NOT_FOUND",
        sanitizedError: sanitizeForTrace(task) as Record<string, unknown>,
      })
    }
    return Response.json({ error: "图片任务不存在或已过期" }, { status: response.status || 404 })
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
        },
      })
    }
    return Response.json(
      {
        status: "failed",
        taskId,
        requestId,
        elapsedMs,
        error: errorMessage,
        data: task?.error_payload || {},
      },
      { status: statusCode },
    )
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
    assertSecureTlsConfiguration()

    // IP 限流：30次/分钟
    const { getClientIP, checkIpRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(request)
    const limitResult = checkIpRateLimit(ip, 30)
    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }
    // 🔐 从 header 获取用户身份（middleware 已验证）
    const headerUserId = request.headers.get("X-User-Id")
    
    const body = await request.json()
    const { query, conversation_id, fileIds, userId: bodyUserId, inputs, model, imageSize, estimatedCost, async_image_task, sessionId, messageId } = body
    const difyFileIds = Array.isArray(fileIds)
      ? fileIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : []
    const fileUrls = pickUrlStrings(body.fileUrls)

    const modelPrefix = model || "standard"
    let effectiveConvId = normalizeDifyConversationId(conversation_id, modelPrefix)
    
    console.log(`🔍 [Dify-Chat] 接收请求: model=${model || "standard"} files=${difyFileIds.length} urls=${fileUrls.length}`)
    
    // 优先使用 header 中的 userId（更安全），其次使用 body 中的
    const userId = headerUserId || bodyUserId
    
    // 🔐 二次验证：确保有用户身份
    if (!userId) {
      console.warn("🚫 [Dify-Chat] 未授权访问被拦截")
      return new Response(JSON.stringify({ error: "未授权访问，请先登录" }), { status: 401 })
    }

    const requestId = request.headers.get("X-Request-Id") || body.requestId || createRequestId(model === "gpt-image-2" ? "img" : "chat")
    const taskKind = model === "gpt-image-2" ? "image" : model === "open-claw" ? "openclaw" : "dify"
    const taskRun = await createTaskRun({
      userId,
      sessionId: typeof sessionId === "string" ? sessionId : null,
      messageId: typeof messageId === "string" ? messageId : null,
      model: model || "standard",
      kind: taskKind,
      requestId,
      stage: "请求已接收",
      metadata: {
        file_count: difyFileIds.length,
        file_url_count: fileUrls.length,
        prompt_length: typeof query === "string" ? query.length : 0,
        async_image_task: async_image_task === true,
      },
    })

    if (model !== "gpt-image-2" && fileUrls.length > 0 && difyFileIds.length === 0) {
      console.warn(`🚫 [Dify-Chat] 非图片生成模型拒绝 remote_url 附件: model=${model || "standard"} urls=${fileUrls.length}`)
      return new Response(
        JSON.stringify({ error: "文件上传缺少 Dify 文件 ID，请重新上传文件后再试" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    console.log(`🔄 [切换模型] 用户: ${userId} | 目标模型: ${model || "默认标准版"} | conversation=${effectiveConvId ? "reuse" : "new"}`)

    // --- 1. 钥匙分发中心 (彻底分离通道) ---
    const { credential: selectedCredential, source: keySource } = getDifyCredentialForModel(model, process.env, DEFAULT_DIFY_KEY)

    // 安全检查：防止忘配 Key
    if (!selectedCredential) {
        console.error(`❌ 严重错误: 模型 ${model} 的凭据未配置！环境变量 ${keySource} 为空`);
        return new Response(JSON.stringify({ 
          error: `配置错误：${model} 模型凭据未设置`,
          details: `请在 Vercel 环境变量中配置 ${keySource}`
        }), { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
    }
    
    // 🔥 Banana 专用调试日志
    if (model === "banana-2-pro") {
      console.log(`🎨 [Banana Debug] files=${difyFileIds.length} conversation=${conversation_id ? "reuse" : "new"}`)
    }

    // --- 2. 获取用户积分（用于预检查） ---
    const modelType = (model || "standard") as ModelType
    
    // 🔍 详细日志：查询用户积分
    console.log(`🔍 [积分查询] 开始查询用户: ${userId}`)
    
    // 🔥 修复：只查询存在的字段 credits 和 user_id（移除不存在的 total_spent）
    let { data: userCredits, error: creditsError } = await getSupabaseAdmin()
      .from("user_credits")
      .select("credits, user_id")
      .eq("user_id", userId)
      .single()
    
    // 🔥 关键修复：如果用户不存在，先创建积分记录（赠送 1000 积分，与注册逻辑一致）
    // 🔥 移除 total_spent 字段（数据库中不存在）
    if (creditsError?.code === "PGRST116") {
      console.log(`🆕 [新用户] 用户 ${userId} 在 user_credits 表中不存在，自动创建积分记录，赠送 1000 积分`)
      
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
    
    // 预估最低消费（用于预检查）
    const estimatedMinCost = 5  // 最低 5 积分
    
    if (currentCredits < estimatedMinCost) {
      console.warn(`🚫 [计费] 用户 ${userId} 积分不足: 当前 ${currentCredits}`)
      return new Response(
        JSON.stringify({ error: "积分不足", required: estimatedMinCost, current: currentCredits }), 
        { status: 402 }
      )
    }
    
    console.log(`💰 [预检查] 用户: ${userId} | 模型: ${modelType} | 当前积分: ${currentCredits}`)

    if (model === "gpt-image-2") {
      console.log("🎨 [GPT Image] 使用直连图片网关，绕过 Dify HTTP 节点超时")
      if (async_image_task === true) {
        const taskId = await startImageGatewayTask({
          query,
          inputs,
          userId,
          requestId: taskRun.id,
          traceId: taskRun.traceId,
        })

        return Response.json(
          {
            status: "running",
            imageTaskId: taskId,
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

      const directResponse = await callImageGatewayDirect(query, inputs)
      if (directResponse.ok) {
        const payload = await directResponse.clone().json().catch(() => ({}))
        await updateTaskRun(taskRun.id, {
          status: "succeeded",
          stage: "图片生成完成",
          progress: 100,
          artifacts: extractArtifactsFromUnknown(payload),
        })
      } else {
        const payload = await directResponse.clone().json().catch(() => ({}))
        await updateTaskRun(taskRun.id, {
          status: "failed",
          stage: "图片生成失败",
          progress: 100,
          errorMessage: typeof payload?.error === "string" ? payload.error : "图片服务请求失败",
          errorCode: "IMAGE_GATEWAY_DIRECT_FAILED",
          sanitizedError: sanitizeForTrace(payload) as Record<string, unknown>,
        })
      }
      directResponse.headers.set("X-Request-Id", taskRun.requestId)
      directResponse.headers.set("X-Trace-Id", taskRun.traceId)
      return directResponse
    }

    // --- 3. 构造 Dify 请求函数 ---
    // 🔥 共享流状态：首字节探测 + 超时定时器（供 callDify 和 transformStream 共同访问）
    const streamStatus: {
      firstByteReceived: boolean
      timeoutId: ReturnType<typeof setTimeout> | null
      controller: AbortController | null
    } = { firstByteReceived: false, timeoutId: null, controller: null }

    const callDify = async (retryWithoutId = false) => {
        const currentConvId = retryWithoutId ? null : effectiveConvId;

        // 🎨 Banana 与词境记忆卡使用 Workflow API；GPT Image V11 使用 Chatflow query + inputs。
        const isWorkflow = WORKFLOW_MODELS.has(model || "");
        const isVocabCardWorkflow = model === "vocab-card";
        const apiEndpoint = isWorkflow ? "/workflows/run" : "/chat-messages";

        let difyRequest: DifyWorkflowRequest | DifyChatRequest;

        if (isWorkflow) {
            // Dify Banana 参数格式（image_prompt）
            difyRequest = isVocabCardWorkflow
              ? {
                  inputs: buildVocabCardWorkflowInputs({ query, inputs }),
                  response_mode: "streaming",
                  user: userId || "default-user",
                }
              : {
                  inputs: {
                      image_prompt: query || "",
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
            const isGptImage2 = model === "gpt-image-2"
            difyRequest = {
                inputs: isGptImage2 ? buildGptImageV11Inputs(inputs) : inputs || {},
                query: query || "你好",
                response_mode: isGptImage2 ? "blocking" : "streaming",
                user: userId || "default-user",
                conversation_id: currentConvId,
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

        const firstByteTimeoutMs = model === "gpt-image-2"
          ? GPT_IMAGE_BLOCKING_TIMEOUT_MS
          : model === "open-claw"
            ? OPENCLAW_FIRST_BYTE_TIMEOUT_MS
            : DEFAULT_DIFY_FIRST_BYTE_TIMEOUT_MS

        // GPT Image 与 OpenClaw 大型 PPT 任务经常超过 120 秒才返回首字节。
        streamStatus.controller = new AbortController()
        streamStatus.timeoutId = setTimeout(() => {
            if (!streamStatus.firstByteReceived) {
                console.warn(`⏰ [Dify超时] ${Math.round(firstByteTimeoutMs / 1000)}秒内未收到首字节，中断请求 model=${model}`)
                streamStatus.controller?.abort()
            }
        }, firstByteTimeoutMs)

        try {
            await updateTaskRun(taskRun.id, {
              status: "running",
              stage: isWorkflow ? "工作流已提交" : "Dify 会话已提交",
              progress: 8,
              conversationId: currentConvId,
            })
            console.warn(`🚀 [Dify请求] 开始请求 Dify... model=${model} endpoint=${DIFY_BASE_URL}${apiEndpoint} requestId=${taskRun.requestId}`)
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

            if (model === "gpt-image-2" && !streamStatus.firstByteReceived) {
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
	                  stage: "Dify 首字节超时",
	                  progress: 100,
	                  errorMessage: err.message,
	                  errorCode: "DIFY_FIRST_BYTE_TIMEOUT",
	                })
	                throw new Error(`请求超时：Dify 服务在 ${Math.round(firstByteTimeoutMs / 1000)} 秒内未响应`)
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
            console.log(`🎨 [Banana] Dify响应头:`, Object.fromEntries(response.headers.entries()))
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
        console.error(`❌ Dify API 最终报错 (${model}):`, errorText)
        await updateTaskRun(taskRun.id, {
          status: "failed",
          stage: "Dify 返回错误",
          progress: 100,
          errorMessage: errorText.slice(0, 1000),
          errorCode: `DIFY_${response.status}`,
          sanitizedError: { status: response.status, body: sanitizeForTrace(errorText) },
        })
        
        // 🔥 Banana 特殊错误处理
        if (model === "banana-2-pro") {
          console.error(`🎨 [Banana错误] 完整错误信息:`, {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            baseUrl: DIFY_BASE_URL
          })
        }
        
        return new Response(JSON.stringify({ error: `Dify Error: ${errorText}` }), { status: response.status })
    }

    // 🎨 GPT Image V11 使用 Chatflow blocking 响应；兼容少数返回 workflow_run_id 的场景。
    if (model === "gpt-image-2") {
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
    let conversationId = ""
    let fullResponseText = ""  // 🔥 收集完整响应内容用于验证
    let bananaImageUrls: string[] = []  // 🎨 收集 Banana 生成的图片 URL
    let jsonBuffer = ""  // 🔥 JSON 行缓冲：跨 chunk 拼接不完整的 SSE 数据行
    let hasReceivedContent = false  // 🔥 标记是否收到了实际内容（用于判断是否扣费）

    // 🔥 扣费函数：流结束后根据实际 token 用量扣费
    const deductCredit = async () => {
      if (!userId) return
      try {
        const supabaseAdmin = getSupabaseAdmin()

        // 计算实际扣费
        const currentCost = calculateActualCost(
          model as ModelType,
          { totalTokens },
          { hasGeneratedImage: bananaImageUrls.length > 0 }
        )

        // 获取当前积分
        const { data } = await supabaseAdmin
          .from('user_credits')
          .select('credits')
          .eq('user_id', userId)
          .single()

        if (!data) {
          console.error("[Billing] 无法获取用户积分信息")
          return
        }

        const currentCredits = data.credits
        const newCredits = Math.max(0, currentCredits - currentCost)

        // 🔥 使用条件更新防止并发竞态
        const updateResult = await supabaseAdmin
          .from('user_credits')
          .update({ credits: newCredits })
          .eq('user_id', userId)
          .eq('credits', currentCredits)  // 🔥 关键：只有在积分未变时才更新
          .select('credits')
          .single()

        if (updateResult.error || !updateResult.data) {
          console.error("[Billing] 扣费更新失败或被并发跳过:", updateResult.error)
          return
        }

        console.log(`[Billing] 扣费成功 (-${currentCost}积分，${totalTokens} tokens)，用户 ${userId} 剩余: ${newCredits}`)

        // 🔥 记录到 credit_transactions 表
        const reasonMap: Record<string, string> = {
          'standard': '作文批改',
          'teaching-pro': '教学评助手',
          'claude-opus': 'Claude 对话',
          'gpt-5': 'GPT-5.4 对话',
          'gemini-pro': 'Gemini 对话',
          'banana-2-pro': 'Banana 绘图',
          'suno-v5': 'Suno 音乐',
          'open-claw': 'Open Claw 对话',
        }
        const reason = reasonMap[model as string] || `使用 ${getModelDisplayName(model as ModelType)}`
        const description = bananaImageUrls.length > 0
          ? `${reason} (生成 ${bananaImageUrls.length} 张图片)`
          : reason

        const { error: txError } = await supabaseAdmin.from('credit_transactions').insert({
          user_id: userId,
          amount: -currentCost,
          type: 'consume',
          description,
          balance_before: currentCredits,
          balance_after: newCredits
        })

        if (txError) {
          console.error("[Billing] 记录交易失败:", txError)
        }
      } catch (e) {
        console.error("[Billing] 扣费失败:", e)
      }
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
        }

        // 解析 chunk 提取 token 信息
        try {
          const text = new TextDecoder().decode(chunk)
          const outputText = model === "open-claw" ? rewriteOpenClawMediaReferencesWithSignedUrls(text) : text

          // 传递数据给前端。词境记忆卡会在解析后只转发结构化卡片事件，避免 raw JSON 出现在页面。
          if (model !== "vocab-card") {
            controller.enqueue(new TextEncoder().encode(outputText))
          }

          // 🎨 Banana 调试：记录原始数据
          if (model === "banana-2-pro" && text.trim()) {
            console.log(`🎨 [Banana流式] 收到数据块:`, text.substring(0, 200))
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
              if (model === "banana-2-pro") {
                console.log(`🎨 [Banana事件] ${json.event}:`, JSON.stringify(json).substring(0, 300))
              }

	              // 🧠 记录工作流节点事件（用于前端思考过程显示）
	              if (json.event === 'node_started' || json.event === 'node_finished') {
	                console.log(`🧠 [工作流节点] ${json.event}: ${json.data?.title || json.title || '未知节点'}`)
	                const nodeData = json.data || {}
                  if (model === "vocab-card") {
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(json)}\n\n`))
                  }
	                appendTaskNodeEvent(taskRun.id, {
	                  event: json.event,
	                  title: nodeData.title || json.title || "未知节点",
	                  node_id: nodeData.node_id || json.node_id,
	                  status: nodeData.status || json.status,
	                  workflow_run_id: nodeData.workflow_run_id || json.workflow_run_id,
	                }).catch((error) => console.warn("[AI Task Trace] node append failed:", error))
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
	                const artifacts = model === "open-claw" ? extractArtifactsFromText(fullResponseText) : []
	                if (artifacts.length > 0) {
	                  updateTaskRun(taskRun.id, {
	                    status: "running",
	                    stage: "已检测到生成文件",
	                    progress: 80,
	                    artifacts,
	                  }).catch((error) => console.warn("[AI Task Trace] artifact update failed:", error))
	                }

                // 🎨 Banana 图片检测：提取图片 URL
                if (model === "banana-2-pro") {
                  // 匹配 Markdown 图片格式：![alt](url)
                  const imageRegex = /!\[.*?\]\((https?:\/\/[^\)]+)\)/g
                  const matches = json.answer.matchAll(imageRegex)
                  for (const match of matches) {
                    const imageUrl = match[1]
                    if (!bananaImageUrls.includes(imageUrl)) {
                      bananaImageUrls.push(imageUrl)
                      console.log(`🎨 [Banana] 检测到图片 URL (message): ${imageUrl}`)
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
	                  console.log(`🎨 [Workflow文本] 收集到文本: ${text.substring(0, 50)}...`)
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
                  } else if (outputs.text) {
                    fullResponseText += outputs.text
                    hasReceivedContent = true
                    console.log(`🎨 [Workflow完成] 收集到输出文本: ${outputs.text.substring(0, 50)}...`)
                  } else if (outputs.result) {
                    fullResponseText += outputs.result
                    hasReceivedContent = true
	                    console.log(`🎨 [Workflow完成] 收集到结果文本: ${outputs.result.substring(0, 50)}...`)
	                  }
	                }
	                const workflowTokens =
	                  Number(json.data?.total_tokens || json.total_tokens || json.data?.metadata?.usage?.total_tokens || 0)
	                if (Number.isFinite(workflowTokens) && workflowTokens > 0) {
	                  totalTokens = workflowTokens
	                }
	                updateTaskRun(taskRun.id, {
	                  status: "succeeded",
	                  stage: "工作流已完成",
	                  progress: 100,
	                  workflowRunId,
	                  artifacts: extractArtifactsFromUnknown(json.data?.outputs || json.outputs || fullResponseText),
	                }).catch((error) => console.warn("[AI Task Trace] workflow finish update failed:", error))
	              }

              // 🎨 处理 message_file 事件（图片文件）
              if (json.event === "message_file" && model === "banana-2-pro") {
                console.log(`🎨 [Banana] 收到 message_file 事件:`, JSON.stringify(json))

                // Dify 返回的图片文件格式：{ type: "image", url: "..." }
                if (json.type === "image" && json.url) {
                  const imageUrl = json.url
                  if (!bananaImageUrls.includes(imageUrl)) {
                    bananaImageUrls.push(imageUrl)
                    console.log(`🎨 [Banana] 检测到图片 URL (message_file): ${imageUrl}`)

                    // 🔥 立即将图片 URL 以 Markdown 格式添加到响应中
                    fullResponseText += `\n\n![Generated Image](${imageUrl})`
                  }
                }
              }

              // 🎨 处理 workflow_finished 事件（可能包含图片）
              if (json.event === "workflow_finished" && model === "banana-2-pro") {
                console.log(`🎨 [Banana] 收到 workflow_finished 事件:`, JSON.stringify(json))

                // 检查是否有输出文件
                if (json.outputs && json.outputs.files) {
                  for (const file of json.outputs.files) {
                    if (file.type === "image" && file.url) {
                      const imageUrl = file.url
                      if (!bananaImageUrls.includes(imageUrl)) {
                        bananaImageUrls.push(imageUrl)
                        console.log(`🎨 [Banana] 检测到图片 URL (workflow_finished): ${imageUrl}`)

                        // 🔥 立即将图片 URL 以 Markdown 格式添加到响应中
                        fullResponseText += `\n\n![Generated Image](${imageUrl})`
                      }
                    }
                  }
                }
              }

              // 提取 token 使用量（Dify 在 message_end 事件中返回）
	              if (json.event === "message_end" && json.metadata?.usage) {
	                totalTokens = json.metadata.usage.total_tokens || 0
	                console.log(`📊 [Token统计] 总Token: ${totalTokens}`)
	                updateTaskRun(taskRun.id, {
	                  status: "running",
	                  stage: "消息生成完成，正在结算",
	                  progress: 95,
	                  metadata: { total_tokens: totalTokens },
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
              if (json.metadata?.usage?.total_tokens) {
                totalTokens = json.metadata.usage.total_tokens
              }
            } catch (e) {
              // 流结束时的最后数据仍然不完整，静默忽略
              console.warn(`⚠️ [Flush] 缓冲区剩余数据解析失败:`, e)
            }
          }
        }

        // 🔥 流结束，触发扣费（仅当有实际内容时才扣费）
        console.log(`💰 [Billing] 流结束，实际使用 ${totalTokens} tokens，内容长度: ${fullResponseText.length}，hasReceivedContent: ${hasReceivedContent}`)
	        if (hasReceivedContent && totalTokens > 0) {
	          deductCredit().catch(e => console.error("[Billing] 扣费异步异常:", e))
	        } else {
	          console.warn(`⚠️ [Billing] 流结束但无实际内容，不扣费`)
	        }
	        updateTaskRun(taskRun.id, {
	          status: hasReceivedContent ? "succeeded" : "failed",
	          stage: hasReceivedContent ? "任务完成" : "流结束但没有返回内容",
	          progress: 100,
	          conversationId: conversationId || undefined,
	          artifacts: extractArtifactsFromText(fullResponseText),
	          errorMessage: hasReceivedContent ? null : "流结束但没有返回内容",
	          errorCode: hasReceivedContent ? null : "EMPTY_STREAM",
	          metadata: {
	            total_tokens: totalTokens,
	            response_length: fullResponseText.length,
	            has_received_content: hasReceivedContent,
	          },
	        }).catch((error) => console.warn("[AI Task Trace] flush update failed:", error))
	      }

    })

    // 返回经过 transform 处理的流
    const transformedBody = response.body?.pipeThrough(transformStream)
    if (!transformedBody) {
      console.error(`❌ [Stream错误] pipeThrough返回undefined! response.body=${response.body === null ? 'null' : 'not-null'}`)
      return new Response(JSON.stringify({ error: "Dify响应体为空，服务端流处理失败" }), { status: 502 })
    }
	    console.warn(`✅ [Stream开始] 开始返回流式响应给前端，body locked: ${transformedBody.locked}`)
	    return new Response(transformedBody, {
	        headers: {
	          "Content-Type": "text/event-stream",
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
