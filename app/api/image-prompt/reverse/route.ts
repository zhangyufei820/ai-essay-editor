import { NextResponse, type NextRequest } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { internalDifyFetch } from "@/lib/internal-dify-fetch"
import { applyRateLimit } from "@/lib/rate-limit"
import { extractDifyWorkflowOutputs, runDifyWorkflow } from "@/lib/dify-workflow-client"
import { createBillingAuditMetadata, recordBillingIssue } from "@/lib/credits"
import { calculateTextCredits, parseDifyUsage, PRICING_VERSION } from "@/lib/pricing"
import { consumeWithTrialCredits } from "@/lib/trial-credits"

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

function isAllowedImageFile(file: File) {
  if (ALLOWED_IMAGE_TYPES.has(file.type)) return true
  const name = typeof file.name === "string" ? file.name.toLowerCase() : ""
  return Array.from(ALLOWED_IMAGE_EXTENSIONS).some((extension) => name.endsWith(extension))
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

function createBillingPayload(result: {
  trialUsed?: number
  realCreditsUsed?: number
  remainingToday?: number
  blocked?: boolean
  reason?: string | null
} | null) {
  return {
    trialUsed: result?.trialUsed || 0,
    realCreditsUsed: result?.realCreditsUsed || 0,
    remainingToday: result?.remainingToday || 0,
    surveyRequired: Boolean(result?.blocked && result.reason === "survey_required"),
  }
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

export async function POST(request: NextRequest) {
  const rateLimitResponse = applyRateLimit(request, {
    keyPrefix: "image-prompt-reverse",
    maxRequests: 12,
    windowMs: 60 * 1000,
  })
  if (rateLimitResponse) return rateLimitResponse

  const auth = await requireUser(request)
  if (auth.response) return auth.response

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
  if (!isAllowedImageFile(file)) {
    return NextResponse.json({ error: "仅支持 JPG、PNG、WebP 或 GIF 图片", code: "INVALID_IMAGE_TYPE" }, { status: 415 })
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "图片不能超过 12MB，请压缩后再上传", code: "IMAGE_TOO_LARGE" }, { status: 413 })
  }
  if (!TARGET_MODELS.has(targetModel)) {
    return NextResponse.json({ error: "参数错误：target_model 仅支持 gpt-image-2 或 nano_banana", code: "INVALID_TARGET_MODEL" }, { status: 400 })
  }

  try {
    const uploadFileId = await uploadFileToDify(file, auth.user!.id, apiKey)
    const inputs = buildReverseInputs(uploadFileId, targetModel)
    const workflow = await runDifyWorkflow({
      apiKey,
      inputs,
      user: auth.user!.id,
      responseMode: "blocking",
      timeoutMs: 150_000,
    })

    const prompt = extractPromptFromPayload({ outputs: workflow.outputs, data: { outputs: workflow.outputs } })
      || extractPromptFromPayload(workflow.raw)

    if (!prompt || isHtmlErrorContent(prompt)) {
      return NextResponse.json({ error: "反推结果为空，请换一张图片重试", code: "EMPTY_REVERSE_PROMPT" }, { status: 502 })
    }

    const parsedUsage = parseDifyUsage({
      ...workflow.raw,
      outputs: workflow.outputs,
      data: {
        ...asRecord(workflow.raw.data),
        outputs: workflow.outputs,
      },
      text: prompt,
    })
    const tokenCredits = calculateTextCredits({
      ...parsedUsage,
      outputText: prompt,
      hasOutput: true,
    })
    const billingReferenceId = `image-prompt-reverse:${workflow.workflowRunId || workflow.taskId || Date.now()}`
    const billingMetadata = createBillingAuditMetadata({
      userId: auth.user!.id,
      actionType: "consume",
      feature: "image_prompt_reverse",
      appId: "DIFY_IMAGE_PROMPT_REVERSE_API_KEY",
      workflowId: workflow.workflowRunId || null,
      modelId: REVERSE_PROMPT_MODEL_ID,
      requestedAppId: "DIFY_IMAGE_PROMPT_REVERSE_API_KEY",
      requestedWorkflowId: workflow.workflowRunId || null,
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
        taskId: workflow.taskId || null,
        workflowRunId: workflow.workflowRunId || null,
      },
      description: "图像提示词反推",
    })
    const billingResult = await consumeWithTrialCredits({
      userId: auth.user!.id,
      amount: tokenCredits,
      actionType: "consume",
      description: "图像提示词反推",
      referenceId: billingReferenceId,
      metadata: {
        feature: "image_prompt_reverse",
        targetModel,
      },
      billingMetadata,
    })
    const billing = createBillingPayload(billingResult)

    if (billingResult.blocked && billingResult.reason === "survey_required") {
      return NextResponse.json({
        error: "请先完成今日问卷，解锁免费体验额度",
        surveyRequired: true,
        billing,
      }, { status: 402 })
    }

    if (!billingResult.success) {
      await recordBillingIssue(
        auth.user!.id,
        tokenCredits,
        "consume",
        "异常账单：图像提示词反推",
        billingReferenceId,
        billingMetadata,
      )
      return NextResponse.json({ error: "积分不足，无法反推提示词", billing }, { status: 402 })
    }

    return NextResponse.json({
      ok: true,
      prompt,
      target_model: targetModel,
      workflowRunId: workflow.workflowRunId,
      taskId: workflow.taskId,
      billing,
    })
  } catch (error) {
    console.error("[ImagePromptReverse] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "图像提示词反推服务暂时不可用，请稍后重试", code: "REVERSE_FAILED" }, { status: 502 })
  }
}
