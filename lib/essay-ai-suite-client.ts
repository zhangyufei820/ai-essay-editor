import { internalDifyFetch } from "@/lib/internal-dify-fetch"

const DEFAULT_ESSAY_AI_SUITE_URL = "http://172.23.0.1:3100"

export type EssayAiSuiteResponse<T> = {
  ok: boolean
  result?: T
  results?: T[]
  total?: number
  failed?: number
  error?: string
}

export type DocumentExtractResult = {
  document_id: string
  file_name?: string
  mime_type?: string
  text: string
  char_count: number
  provider: "local-text" | "external"
  status: "success" | "failed"
  error: string | null
}

export type OcrResult = {
  image_id: string
  file_name?: string
  text: string
  confidence: number | null
  provider: "passthrough" | "openai-compatible-vision" | "stub"
  status: "success" | "failed"
  error: string | null
}

type JsonBody = Record<string, unknown>

function getEssayAiSuiteUrl() {
  return (process.env.ESSAY_AI_SUITE_URL || DEFAULT_ESSAY_AI_SUITE_URL).replace(/\/+$/, "")
}

function getEssayAiSuiteHeaders() {
  const token = process.env.ESSAY_AI_SUITE_API_TOKEN || process.env.ESSAY_AI_SUITE_TOKEN || ""
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function callEssayAiSuite<T>(
  path: string,
  body: JsonBody,
  timeoutMs = 120_000,
): Promise<EssayAiSuiteResponse<T>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await internalDifyFetch(`${getEssayAiSuiteUrl()}${path}`, {
      method: "POST",
      headers: getEssayAiSuiteHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => ({})) as EssayAiSuiteResponse<T>
    if (!response.ok) {
      return {
        ok: false,
        error: payload.error || `essay-ai-suite request failed: ${response.status}`,
      }
    }

    return payload
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.name === "AbortError"
        ? "essay-ai-suite 请求超时"
        : error instanceof Error
          ? error.message
          : String(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

export function getEssayAiSuiteConfigStatus() {
  return {
    url: getEssayAiSuiteUrl(),
    hasToken: Boolean(process.env.ESSAY_AI_SUITE_API_TOKEN || process.env.ESSAY_AI_SUITE_TOKEN),
  }
}
