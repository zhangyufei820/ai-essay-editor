import { NextResponse, type NextRequest } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { internalDifyFetch } from "@/lib/internal-dify-fetch"
import { applyRateLimit } from "@/lib/rate-limit"
import { getPublicAiLabel } from "@/lib/public-ai-labels"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const DIFY_BASE_URL = (process.env.DIFY_INTERNAL_URL || process.env.DIFY_BASE_URL || "https://api.dify.ai/v1").replace(/\/+$/, "")
const MAX_PROMPT_CHARS = 4000
const MAX_OPTIMIZED_CHARS = 8000

type OptimizeRequestBody = {
  prompt?: unknown
  mode?: unknown
  model?: unknown
  aspect_ratio?: unknown
  size?: unknown
  quality?: unknown
  image_count?: unknown
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function extractOptimizedPrompt(payload: unknown): string {
  const root = asRecord(payload)
  const data = asRecord(root.data)
  const outputs = {
    ...asRecord(root.outputs),
    ...asRecord(data.outputs),
  }

  const direct =
    readString(root.optimized_prompt) ||
    readString(root.prompt) ||
    readString(root.answer) ||
    readString(root.text) ||
    readString(root.result) ||
    readString(outputs.optimized_prompt) ||
    readString(outputs.prompt) ||
    readString(outputs.text) ||
    readString(outputs.result) ||
    readString(data.answer)

  if (!direct) return ""

  return direct
    .replace(/^```(?:json|text|markdown)?/i, "")
    .replace(/```$/i, "")
    .trim()
    .slice(0, MAX_OPTIMIZED_CHARS)
}

function buildInputs(body: OptimizeRequestBody) {
  const prompt = readString(body.prompt)
  const model = readString(body.model) || "gpt-image-2"
  const targetModelName = getPublicAiLabel(model, "图像创作")
  return {
    prompt,
    original_prompt: prompt,
    task: "optimize_image_prompt",
    scenario: "shenxiang_image2_prompt_box",
    mode: readString(body.mode) || "image_generate",
    model,
    aspect_ratio: readString(body.aspect_ratio),
    size: readString(body.size),
    quality: readString(body.quality),
    image_count: Number.isFinite(Number(body.image_count)) ? Number(body.image_count) : 1,
    output_language: "zh-CN",
    instruction:
      `请把用户的中文图像生成提示词优化成更适合 ${targetModelName} 的可执行提示词。保留用户原意，不添加违背原意的主体；补充主体、构图、镜头、光线、材质、风格、细节、画幅和负面约束。只返回优化后的提示词正文。`,
  }
}

async function callChatApp(apiKey: string, userId: string, body: OptimizeRequestBody) {
  const inputs = buildInputs(body)
  const response = await internalDifyFetch(`${DIFY_BASE_URL}/chat-messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      inputs,
      query: inputs.prompt,
      response_mode: "blocking",
      user: userId,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(readString(asRecord(payload).message) || `CHAT_APP_FAILED:${response.status}`)
  return payload
}

async function callWorkflowApp(apiKey: string, userId: string, body: OptimizeRequestBody) {
  const response = await internalDifyFetch(`${DIFY_BASE_URL}/workflows/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      inputs: buildInputs(body),
      response_mode: "blocking",
      user: userId,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(readString(asRecord(payload).message) || `WORKFLOW_APP_FAILED:${response.status}`)
  return payload
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = applyRateLimit(request, {
    keyPrefix: "image-prompt-optimize",
    maxRequests: 20,
    windowMs: 60 * 1000,
  })
  if (rateLimitResponse) return rateLimitResponse

  const auth = await requireUser(request)
  if (auth.response) return auth.response

  let body: OptimizeRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "请求体格式错误", code: "BAD_JSON" }, { status: 400 })
  }

  const prompt = readString(body.prompt)
  if (!prompt) {
    return NextResponse.json({ error: "请输入要优化的提示词", code: "EMPTY_PROMPT" }, { status: 400 })
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json({ error: `提示词不能超过 ${MAX_PROMPT_CHARS} 字`, code: "PROMPT_TOO_LONG" }, { status: 400 })
  }

  const apiKey = process.env.DIFY_IMAGE_PROMPT_OPTIMIZER_API_KEY || ""
  if (!apiKey) {
    return NextResponse.json({ error: "提示词优化服务暂未配置", code: "OPTIMIZER_KEY_MISSING" }, { status: 503 })
  }

  try {
    let payload: unknown
    try {
      payload = await callChatApp(apiKey, auth.user!.id, body)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/not found|workflow|app_unavailable|CHAT_APP_FAILED:404|CHAT_APP_FAILED:400/i.test(message)) {
        throw error
      }
      payload = await callWorkflowApp(apiKey, auth.user!.id, body)
    }

    const optimizedPrompt = extractOptimizedPrompt(payload)
    if (!optimizedPrompt) {
      return NextResponse.json({ error: "提示词优化结果为空，请稍后重试", code: "EMPTY_OPTIMIZED_PROMPT" }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      optimized_prompt: optimizedPrompt,
    })
  } catch (error) {
    console.error("[ImagePromptOptimize] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "提示词优化服务暂时不可用，请稍后重试", code: "OPTIMIZER_FAILED" }, { status: 502 })
  }
}
