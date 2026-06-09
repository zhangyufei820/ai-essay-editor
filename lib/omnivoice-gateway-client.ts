import { internalDifyFetch } from "@/lib/internal-dify-fetch"

export type OmniVoiceInfo = {
  voice_id: string
  name: string
  language?: string
  description?: string
  enabled?: boolean
}

export type OmniVoiceJob = {
  job_id: string
  status: "queued" | "running" | "succeeded" | "failed"
  progress?: number
  audio_url?: string | null
  error?: string | null
  filename?: string | null
  mime_type?: string | null
  duration_seconds?: number | null
  voice_id?: string | null
}

const DEFAULT_OMNIVOICE_GATEWAY_URL = "http://omnivoice-gateway:8000"
const MEDIA_ROUTE = "/api/omnivoice/media"

function getGatewayUrl() {
  return (process.env.OMNIVOICE_GATEWAY_URL || DEFAULT_OMNIVOICE_GATEWAY_URL).replace(/\/+$/, "")
}

function getGatewayApiKey() {
  return process.env.OMNIVOICE_GATEWAY_API_KEY || process.env.VOICE_GATEWAY_API_KEY || ""
}

function getHeaders() {
  const apiKey = getGatewayApiKey()
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "X-API-Key": apiKey } : {}),
  }
}

function absolutizeAudioUrl(audioUrl: string | null | undefined) {
  if (!audioUrl) return null
  const filename = extractMediaFilename(audioUrl)
  if (filename) return `${MEDIA_ROUTE}/${encodeURIComponent(filename)}`
  if (/^https?:\/\//i.test(audioUrl)) return audioUrl
  return `${getGatewayUrl()}${audioUrl.startsWith("/") ? "" : "/"}${audioUrl}`
}

function extractMediaFilename(audioUrl: string) {
  try {
    const url = /^https?:\/\//i.test(audioUrl)
      ? new URL(audioUrl)
      : new URL(audioUrl, "http://gateway.local")
    const match = url.pathname.match(/\/media\/([^/?#]+)$/)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    const match = audioUrl.match(/\/media\/([^/?#]+)$/)
    return match ? decodeURIComponent(match[1]) : null
  }
}

export async function listOmniVoices() {
  if (!getGatewayApiKey()) {
    return { ok: false, voices: [] as OmniVoiceInfo[], error: "语音服务暂时不可用，请稍后重试。" }
  }

  const response = await internalDifyFetch(`${getGatewayUrl()}/v1/voices`, {
    headers: getHeaders(),
  })
  const payload = await response.json().catch(() => ({})) as { voices?: OmniVoiceInfo[]; error?: { message?: string } }
  if (!response.ok) {
    return { ok: false, voices: [] as OmniVoiceInfo[], error: payload.error?.message || "获取音色列表失败" }
  }
  return { ok: true, voices: (payload.voices || []).filter((voice) => voice.enabled !== false), error: null }
}

export async function createOmniTtsJob(input: {
  text: string
  voiceId?: string
  language?: string
  speed?: number
  emotion?: string
  format?: "mp3" | "wav" | "flac" | "opus"
}) {
  if (!getGatewayApiKey()) {
    return { ok: false, job: null, error: "语音服务暂时不可用，请稍后重试。" }
  }

  const response = await internalDifyFetch(`${getGatewayUrl()}/v1/tts`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      text: input.text,
      voice_id: input.voiceId || undefined,
      language: input.language || "zh-CN",
      speed: input.speed || 1,
      emotion: input.emotion || "friendly",
      format: input.format || "mp3",
      return_mode: "url",
      sync: false,
    }),
  })

  const payload = await response.json().catch(() => ({})) as Partial<OmniVoiceJob> & { error?: { message?: string } }
  if (!response.ok || !payload.job_id) {
    return { ok: false, job: null, error: payload.error?.message || "创建语音任务失败" }
  }

  return { ok: true, job: normalizeOmniJob(payload as OmniVoiceJob), error: null }
}

export async function getOmniTtsJob(jobId: string) {
  if (!getGatewayApiKey()) {
    return { ok: false, job: null, error: "语音服务暂时不可用，请稍后重试。" }
  }

  const response = await internalDifyFetch(`${getGatewayUrl()}/v1/jobs/${encodeURIComponent(jobId)}`, {
    headers: getHeaders(),
  })
  const payload = await response.json().catch(() => ({})) as OmniVoiceJob & { error?: { message?: string } }
  if (!response.ok || !payload.job_id) {
    return { ok: false, job: null, error: payload.error?.message || "查询语音任务失败" }
  }

  return { ok: true, job: normalizeOmniJob(payload), error: null }
}

export async function fetchOmniMedia(
  filename: string,
  options: { range?: string; method?: "GET" | "HEAD" } = {},
) {
  if (!getGatewayApiKey()) {
    return { ok: false, status: 503, headers: new Headers(), body: null, error: "语音服务暂时不可用，请稍后重试。" }
  }

  const headers: Record<string, string> = {
    ...(getGatewayApiKey() ? { "X-API-Key": getGatewayApiKey() } : {}),
  }
  if (options.range) headers.Range = options.range

  const response = await internalDifyFetch(`${getGatewayUrl()}/media/${encodeURIComponent(filename)}`, {
    method: options.method || "GET",
    headers,
  })

  if (!response.ok || (!response.body && options.method !== "HEAD")) {
    return {
      ok: false,
      status: response.status || 502,
      headers: new Headers(),
      body: null,
      error: "音频文件读取失败",
    }
  }

  const headersOut = buildMediaHeaders(response, filename)
  return {
    ok: true,
    status: response.status,
    headers: headersOut,
    body: options.method === "HEAD" ? null : response.body,
    error: null,
  }
}

function normalizeOmniJob(job: OmniVoiceJob): OmniVoiceJob {
  return {
    ...job,
    audio_url: absolutizeAudioUrl(job.audio_url),
  }
}

function buildMediaHeaders(response: Response, filename: string) {
  const headers = new Headers()
  const contentType = response.headers.get("content-type") || mimeTypeFromFilename(filename)
  headers.set("Content-Type", contentType)
  headers.set("Accept-Ranges", response.headers.get("accept-ranges") || "bytes")
  headers.set("Cache-Control", "private, max-age=3600")
  headers.set("X-Content-Type-Options", "nosniff")

  for (const headerName of ["content-length", "content-range", "etag", "last-modified"]) {
    const value = response.headers.get(headerName)
    if (value) headers.set(headerName, value)
  }

  return headers
}

function mimeTypeFromFilename(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase()
  if (ext === "mp3") return "audio/mpeg"
  if (ext === "flac") return "audio/flac"
  if (ext === "opus") return "audio/ogg"
  return "audio/wav"
}
