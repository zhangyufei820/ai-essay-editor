import { internalDifyFetch } from "@/lib/internal-dify-fetch"
import { sanitizePublicAiError } from "@/lib/chat-error-sanitizer"

const DIFY_BASE_URL = (process.env.DIFY_INTERNAL_URL
  || process.env.DIFY_BASE_URL
  || "https://api.dify.ai/v1").replace(/\/+$/, "")

export type ToolsDifyResult = {
  ok: boolean
  content: string
  raw?: Record<string, unknown>
  error?: string
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function extractDifyContent(payload: Record<string, unknown>) {
  const answer = readString(payload.answer)
  if (answer) return answer

  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown>
    : {}
  const outputs = data.outputs && typeof data.outputs === "object" && !Array.isArray(data.outputs)
    ? data.outputs as Record<string, unknown>
    : payload.outputs && typeof payload.outputs === "object" && !Array.isArray(payload.outputs)
      ? payload.outputs as Record<string, unknown>
      : {}

  for (const key of ["answer", "text", "content", "result", "output", "markdown"]) {
    const value = readString(outputs[key])
    if (value) return value
  }

  return ""
}

export async function callToolsDifyChat(input: {
  apiKey: string
  query: string
  inputs?: Record<string, unknown>
  user?: string
  timeoutMs?: number
}): Promise<ToolsDifyResult> {
  if (!input.apiKey) {
    return { ok: false, content: "", error: "工具服务暂时不可用，请稍后重试。" }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs || 120_000)

  try {
    const response = await internalDifyFetch(`${DIFY_BASE_URL}/chat-messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        inputs: input.inputs || {},
        query: input.query,
        response_mode: "blocking",
        user: input.user || "tools-workbench",
        auto_generate_name: false,
      }),
      signal: controller.signal,
    })

    const text = await response.text()
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(text) as Record<string, unknown>
    } catch {
      payload = { answer: text }
    }

    if (!response.ok) {
      const rawError = readString(payload.message) || readString(payload.error) || `Dify request failed: ${response.status}`
      return {
        ok: false,
        content: "",
        raw: payload,
        error: sanitizePublicAiError(rawError, "工具服务暂时不可用，请稍后重试。"),
      }
    }

    const content = extractDifyContent(payload)
    return {
      ok: Boolean(content),
      content,
      raw: payload,
      error: content ? undefined : "工具服务没有返回可展示内容，请稍后重试。",
    }
  } catch (error) {
    const rawError = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      content: "",
      error: error instanceof Error && error.name === "AbortError"
        ? "工具服务响应超时，请稍后重试。"
        : sanitizePublicAiError(rawError, "工具服务暂时不可用，请稍后重试。"),
    }
  } finally {
    clearTimeout(timeout)
  }
}
