import "server-only"

import { internalDifyFetch } from "@/lib/internal-dify-fetch"
import { sanitizeForTrace } from "@/lib/ai-task-trace"
import { sanitizePublicAiError } from "@/lib/chat-error-sanitizer"

export const RELAYDANCE_DEFAULT_MODEL = "doubao-seedance-2-0-720p"

export type RelayDanceCreateInput = {
  prompt: string
  model?: string
  seconds?: string | number
  ratio?: string
  resolution?: string
  generate_audio?: boolean
  watermark?: boolean | null
  first_frame_url?: string | null
  last_frame_url?: string | null
}

export type RelayDanceGatewayResponse = {
  success?: boolean
  status_code?: number
  provider_code?: string
  message?: string
  task_id?: string
  status?: string
  progress?: number | null
  video_url?: string
  video_urls?: string[]
  warnings?: string[]
  data?: unknown
  provider_response?: Record<string, unknown>
  error?: unknown
}

export type RelayDanceClientResult = {
  ok: boolean
  status: number
  payload: RelayDanceGatewayResponse
  error: string | null
}

const DEFAULT_RELAYDANCE_GATEWAY_URL = "http://relaydance-video-gateway:8000"

function getGatewayUrl() {
  return (process.env.RELAYDANCE_GATEWAY_URL || DEFAULT_RELAYDANCE_GATEWAY_URL).replace(/\/+$/, "")
}

function getGatewayApiKey() {
  return process.env.RELAYDANCE_GATEWAY_API_KEY || ""
}

function assertConfigured() {
  const apiKey = getGatewayApiKey()
  if (!apiKey) {
    throw new Error("RELAYDANCE_GATEWAY_CONFIG_MISSING:RELAYDANCE_GATEWAY_API_KEY")
  }
  return { baseUrl: getGatewayUrl(), apiKey }
}

async function readGatewayJson(response: Response): Promise<RelayDanceGatewayResponse> {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as RelayDanceGatewayResponse
  } catch {
    return { success: false, message: text.slice(0, 500) }
  }
}

function messageFromGateway(payload: RelayDanceGatewayResponse) {
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message.trim()
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error.trim()
  if (payload.error && typeof payload.error === "object") {
    const error = payload.error as Record<string, unknown>
    if (typeof error.message === "string" && error.message.trim()) return error.message.trim()
    if (typeof error.code === "string" && error.code.trim()) return error.code.trim()
  }
  return "视频服务请求失败"
}

function normalizeGatewayResult(response: Response, payload: RelayDanceGatewayResponse): RelayDanceClientResult {
  const providerOk = payload.success !== false
  const ok = response.ok && providerOk
  return {
    ok,
    status: response.status,
    payload: sanitizeForTrace(payload) as RelayDanceGatewayResponse,
    error: ok ? null : sanitizePublicAiError(messageFromGateway(payload), "视频服务暂时不可用，请稍后重试。"),
  }
}

export async function createRelayDanceVideo(input: RelayDanceCreateInput): Promise<RelayDanceClientResult> {
  const config = assertConfigured()
  const response = await internalDifyFetch(`${config.baseUrl}/api/v1/video/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Gateway-Key": config.apiKey,
    },
    body: JSON.stringify({
      prompt: input.prompt,
      model: input.model || RELAYDANCE_DEFAULT_MODEL,
      seconds: String(input.seconds || "5"),
      ratio: input.ratio || "16:9",
      resolution: input.resolution || "720p",
      generate_audio: Boolean(input.generate_audio),
      watermark: input.watermark ?? undefined,
      first_frame_url: input.first_frame_url || undefined,
      last_frame_url: input.last_frame_url || undefined,
    }),
  })
  return normalizeGatewayResult(response, await readGatewayJson(response))
}

export async function getRelayDanceVideoTask(taskId: string): Promise<RelayDanceClientResult> {
  const config = assertConfigured()
  const response = await internalDifyFetch(`${config.baseUrl}/api/v1/videos/${encodeURIComponent(taskId)}`, {
    headers: {
      "X-Gateway-Key": config.apiKey,
    },
  })
  return normalizeGatewayResult(response, await readGatewayJson(response))
}
