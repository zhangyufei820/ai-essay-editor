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

const DEFAULT_OMNIVOICE_GATEWAY_URL = "http://172.23.0.1:8010"

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
  if (/^https?:\/\//i.test(audioUrl)) return audioUrl
  return `${getGatewayUrl()}${audioUrl.startsWith("/") ? "" : "/"}${audioUrl}`
}

export async function listOmniVoices() {
  if (!getGatewayApiKey()) {
    return { ok: false, voices: [] as OmniVoiceInfo[], error: "OMNIVOICE_GATEWAY_API_KEY 未配置" }
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
    return { ok: false, job: null, error: "OMNIVOICE_GATEWAY_API_KEY 未配置" }
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
    return { ok: false, job: null, error: "OMNIVOICE_GATEWAY_API_KEY 未配置" }
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

function normalizeOmniJob(job: OmniVoiceJob): OmniVoiceJob {
  return {
    ...job,
    audio_url: absolutizeAudioUrl(job.audio_url),
  }
}
