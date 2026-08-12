import { NextResponse, type NextRequest } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { internalDifyFetch } from "@/lib/internal-dify-fetch"
import { applyRateLimit } from "@/lib/rate-limit"
import { extractDifyWorkflowOutputs, runDifyWorkflow } from "@/lib/dify-workflow-client"
import { createBillingAuditMetadata, recordBillingIssue } from "@/lib/credits"
import { chargeCreditsSafely } from "@/lib/billing"
import { calculateTextCredits, parseDifyUsage, PRICING_VERSION } from "@/lib/pricing"
import { getUserEntitlementSummary } from "@/lib/user-entitlements"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 180

const DIFY_BASE_URL = (process.env.DIFY_INTERNAL_URL || process.env.DIFY_BASE_URL || "https://api.dify.ai/v1").replace(/\/+$/, "")
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
const TARGET_MODELS = new Set(["gpt-image-2", "nano_banana"])
const MAX_PROMPT_CHARS = 8000
const REVERSE_PROMPT_MODEL_ID = "image-prompt-reverse"
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"])
const STREAM_HEARTBEAT_MS = 8_000

type ReverseSuccessPayload = {
  ok: true
  prompt: string
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function isHtmlErrorContent(value: unknown) {
  if (typeof value !== "string") return false
  const text = value.trim().toLowerCase()
  return (
    text.startsWith("<!doctype html") ||
    text.startsWith("<html") ||
    text.includes("<title>shenxiang.school | 502: bad gateway</title>") ||
    (text.includes("cloudflare") && text.includes("bad gateway"))
  )
}

function sanitizeReverseError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "")
  if (!raw || isHtmlErrorContent(raw)) return "图像提示词反推服务暂时不可用，请稍后重试"
  return raw
    .replace(/Dify\s*API/gi, "图像提示词服务")
    .replace(/Dify/gi, "图像提示词服务")
    .replace(/CHATFLOW_REVERSE_FAILED:\d+/g, "")
    .replace(/WORKFLOW_APP_FAILED:\d+/g, "")
    .trim() || "图像提示词反推服务暂时不可用，请稍后重试"
}

function sniffImageType(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return "image/png"
  if (bytes.length >= 12) {
    const header = String.fromCharCode(...bytes.slice(0, 12))
    if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") return "image/webp"
  }
  if (bytes.length >= 6) {
    const header = String.fromCharCode(...bytes.slice(0, 6))
    if (header === "GIF87a" || header === "GIF89a") return "image/gif"
  }
  return ""
}

async function isAllowedImageFile(file: File) {
  if (ALLOWED_IMAGE_TYPES.has(file.type)) return true
  const name = typeof file.name === "string" ? file.name.toLowerCase() : ""
  if (Array.from(ALLOWED_IMAGE_EXTENSIONS).some((extension) => name.endsWith(extension))) return true

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  return ALLOWED_IMAGE_TYPES.has(sniffImageType(header))
}

async function uploadFileToDify(file: File, userId: string, apiKey: string) {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("user", userId)

  const response = await internalDifyFetch(`${DIFY_BASE_URL}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })

  const payload = await response.json().catch(() => ({}))
  const id = readString(asRecord(payload).id) || readString(asRecord(asRecord(payload).data).id)

  if (!response.ok || !id) {
    const message = readString(asRecord(payload).message)
      || readString(asRecord(payload).error)
      || `DIFY_FILE_UPLOAD_FAILED:${response.status}`
    throw new Error(message)
  }

  return id
}

async function runReverseChatflow(apiKey: string, userId: string, inputs: Record<string, unknown>) {
  const imageFile = asRecord(inputs.image)
  const chatInputs = {
    target_model: inputs.target_model,
    model: inputs.model,
    "gpt-image-2": inputs["gpt-image-2"],
    nano_banana: inputs.nano_banana,
    output_language: inputs.output_language,
    instruction: inputs.instruction,
  }

  const response = await internalDifyFetch(`${DIFY_BASE_URL}/chat-messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      inputs: chatInputs,
      query: "请根据我上传的图片反推出可用于图像生成的详细提示词。",
      response_mode: "blocking",
      user: userId,
      files: [imageFile],
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = readString(asRecord(payload).message)
      || readString(asRecord(payload).error)
      || `CHATFLOW_REVERSE_FAILED:${response.status}`
    throw new Error(message)
  }
  return payload as Record<string, unknown>
}

function extractPromptFromPayload(payload: unknown) {
  const root = asRecord(payload)
  const data = asRecord(root.data)
  const outputs = {
    ...extractDifyWorkflowOutputs(payload),
    ...asRecord(root.outputs),
    ...asRecord(data.outputs),
  }

  const prompt = [
    root.reverse_prompt,
    root.prompt,
    root.result,
    root.text,
    root.answer,
    outputs.reverse_prompt,
    outputs.image_prompt,
    outputs.prompt,
    outputs.result,
    outputs.text,
    outputs.answer,
    data.answer,
  ].map(readString).find(Boolean) || ""

  return prompt
    .replace(/^```(?:text|markdown|json)?/i, "")
    .replace(/```$/i, "")
    .trim()
    .slice(0, MAX_PROMPT_CHARS)
}

function buildReverseInputs(uploadFileId: string, targetModel: string) {
  const imageFile = {
    type: "image",
    transfer_method: "local_file",
    upload_file_id: uploadFileId,
  }

  return {
    image: imageFile,
    input_image: imageFile,
    upload_file_id: uploadFileId,
    target_model: targetModel,
    model: targetModel,
    "gpt-image-2": targetModel === "gpt-image-2",
    nano_banana: targetModel === "nano_banana",
    output_language: "zh-CN",
    instruction: "请根据上传图片反推出可用于图像生成的详细提示词，只返回提示词正文。",
  }
}

function createJsonLineEncoder(controller: ReadableStreamDefaultController<Uint8Array>) {
  const encoder = new TextEncoder()
  return (event: Record<string, unknown>) => {
    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
  }
}

async function processReverseRequest(
  file: File,
  targetModel: string,
  userId: string,
  realCreditUserId: string,
  apiKey: string,
  emit?: (event: Record<string, unknown>) => void,
): Promise<ReverseSuccessPayload | NextResponse> {
  emit?.({ type: "progress", progress: 32, stage: "正在上传图片" })
  const uploadFileId = await uploadFileToDify(file, userId, apiKey)
  const inputs = buildReverseInputs(uploadFileId, targetModel)
  let workflowRunId: string | undefined
  let taskId: string | undefined
  let rawPayload: Record<string, unknown>

  emit?.({ type: "progress", progress: 48, stage: "图片已上传，正在等待反推结果" })
  try {
    rawPayload = await runReverseChatflow(apiKey, userId, inputs)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/app mode matches|workflow|CHATFLOW_REVERSE_FAILED:404/i.test(message)) {
      throw error
    }
    emit?.({ type: "progress", progress: 56, stage: "正在切换兼容调用方式" })
    const workflow = await runDifyWorkflow({
      apiKey,
      inputs,
      user: userId,
      responseMode: "blocking",
      timeoutMs: 150_000,
    })
    workflowRunId = workflow.workflowRunId
    taskId = workflow.taskId
    rawPayload = {
      ...workflow.raw,
      outputs: workflow.outputs,
      data: {
        ...asRecord(workflow.raw.data),
        outputs: workflow.outputs,
      },
    }
  }

  emit?.({ type: "progress", progress: 88, stage: "已收到反推结果，正在整理并扣费" })
  const prompt = extractPromptFromPayload(rawPayload)

  if (!prompt || isHtmlErrorContent(prompt)) {
    return NextResponse.json({ error: "反推结果为空，请换一张图片重试", code: "EMPTY_REVERSE_PROMPT" }, { status: 502 })
  }

  const parsedUsage = parseDifyUsage({
    ...rawPayload,
    text: prompt,
  })
  const tokenCredits = calculateTextCredits({
    ...parsedUsage,
    outputText: prompt,
    hasOutput: true,
  })
  const billingReferenceId = `image-prompt-reverse:${workflowRunId || taskId || readString(rawPayload.message_id) || Date.now()}`
  const billingMetadata = createBillingAuditMetadata({
    userId,
    actionType: "consume",
    feature: "image_prompt_reverse",
    appId: "DIFY_IMAGE_PROMPT_REVERSE_API_KEY",
    workflowId: workflowRunId || null,
    modelId: REVERSE_PROMPT_MODEL_ID,
    requestedAppId: "DIFY_IMAGE_PROMPT_REVERSE_API_KEY",
    requestedWorkflowId: workflowRunId || null,
    requestedModelId: targetModel,
    pricingVersion: PRICING_VERSION,
    usageSource: parsedUsage.usageSource,
    estimated: parsedUsage.estimated,
    promptTokens: parsedUsage.promptTokens,
    completionTokens: parsedUsage.completionTokens,
    totalTokens: parsedUsage.totalTokens,
    chargedCredits: tokenCredits,
    rawUsageJson: parsedUsage.rawUsage || null,
    finishReason: parsedUsage.finishReason || null,
    latency: parsedUsage.latency ?? null,
    timeToFirstToken: parsedUsage.timeToFirstToken ?? null,
    rawProviderMetadata: {
      targetModel,
      taskId: taskId || null,
      workflowRunId: workflowRunId || null,
      messageId: readString(rawPayload.message_id) || null,
    },
    description: "图像提示词反推",
  })
  const charged = await chargeCreditsSafely(
    userId,
    tokenCredits,
    "consume",
    "图像提示词反推",
    billingReferenceId,
    billingMetadata,
    { realCreditUserId },
  )

  if (!charged) {
    await recordBillingIssue(
      userId,
      tokenCredits,
      "consume",
      "异常账单：图像提示词反推",
      billingReferenceId,
      billingMetadata,
    )
    return NextResponse.json({ error: "积分不足，无法反推提示词" }, { status: 402 })
  }

  return {
    ok: true,
    prompt,
  }
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = applyRateLimit(request, {
    keyPrefix: "image-prompt-reverse",
    maxRequests: 12,
    windowMs: 60 * 1000,
  })
  if (rateLimitResponse) return rateLimitResponse

  const auth = await requireUser(request)
  if (auth.response) return auth.response
  const entitlement = await getUserEntitlementSummary(auth.user!.id, {
    email: auth.user!.email || null,
    phone: auth.user!.phone || null,
    metadata: auth.user!.metadata || null,
  })
  const realCreditUserId = entitlement?.entitlementUserId || auth.user!.id

  const apiKey = process.env.DIFY_IMAGE_PROMPT_REVERSE_API_KEY || ""
  if (!apiKey) {
    return NextResponse.json({ error: "图像提示词反推服务暂未配置", code: "REVERSE_KEY_MISSING" }, { status: 503 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "请求体格式错误", code: "BAD_FORM_DATA" }, { status: 400 })
  }

  const file = formData.get("image")
  const targetModel = readString(formData.get("target_model")) || "gpt-image-2"

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请先上传一张图片", code: "IMAGE_REQUIRED" }, { status: 400 })
  }
  if (!(await isAllowedImageFile(file))) {
    return NextResponse.json({ error: "仅支持 JPG、PNG、WebP 或 GIF 图片", code: "INVALID_IMAGE_TYPE" }, { status: 415 })
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "图片不能超过 12MB，请压缩后再上传", code: "IMAGE_TOO_LARGE" }, { status: 413 })
  }
  if (!TARGET_MODELS.has(targetModel)) {
    return NextResponse.json({ error: "生成方式参数错误，请刷新页面后重试", code: "INVALID_TARGET_MODEL" }, { status: 400 })
  }

  const wantsStream = request.nextUrl.searchParams.get("stream") === "1"
  if (wantsStream) {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = createJsonLineEncoder(controller)
        let heartbeat: ReturnType<typeof setInterval> | null = null

        try {
          emit({ type: "progress", progress: 24, stage: "任务已开始" })
          heartbeat = setInterval(() => {
            emit({ type: "progress", progress: 76, stage: "反推仍在进行，请稍候" })
          }, STREAM_HEARTBEAT_MS)
          const result = await processReverseRequest(file, targetModel, auth.user!.id, realCreditUserId, apiKey, emit)
          if (heartbeat) clearInterval(heartbeat)
          if (result instanceof NextResponse) {
            const payload = await result.json().catch(() => ({ error: "处理失败，请稍后重试。" }))
            emit({ type: "error", ...payload, status: result.status })
          } else {
            emit({ type: "done", progress: 100, ...result })
          }
        } catch (error) {
          if (heartbeat) clearInterval(heartbeat)
          console.error("[ImagePromptReverse] failed:", error instanceof Error ? error.message : error)
          emit({ type: "error", error: sanitizeReverseError(error), code: "REVERSE_FAILED", status: 502 })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    })
  }

  try {
    const result = await processReverseRequest(file, targetModel, auth.user!.id, realCreditUserId, apiKey)
    if (result instanceof NextResponse) return result
    return NextResponse.json(result)
  } catch (error) {
    console.error("[ImagePromptReverse] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: sanitizeReverseError(error), code: "REVERSE_FAILED" }, { status: 502 })
  }
}
