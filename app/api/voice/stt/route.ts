import { NextRequest, NextResponse } from "next/server"
import { getClientIP, checkIpRateLimit, createRateLimitResponse } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 120

const VOICE_GATEWAY_URL = (process.env.VOICE_GATEWAY_URL || "http://voice-gateway:8080").replace(/\/+$/, "")
const MAX_AUDIO_BYTES = 25 * 1024 * 1024
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "video/webm",
])

export async function POST(request: NextRequest) {
  const ip = getClientIP(request)
  const limitResult = checkIpRateLimit(ip, 20)
  if (!limitResult.allowed) {
    return createRateLimitResponse(limitResult.retryAfter!)
  }

  try {
    const contentLength = Number(request.headers.get("content-length") || 0)
    if (contentLength > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "音频文件过大" }, { status: 413 })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少音频文件" }, { status: 400 })
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "音频文件过大" }, { status: 413 })
    }
    if (file.type && !ALLOWED_AUDIO_TYPES.has(file.type)) {
      return NextResponse.json({ error: `不支持的音频格式: ${file.type}` }, { status: 400 })
    }

    const upstreamForm = new FormData()
    upstreamForm.append("file", file, file.name || "recording.webm")
    upstreamForm.append("language", typeof formData.get("language") === "string" ? String(formData.get("language")) : "en")

    const target = formData.get("target")
    const prompt = typeof target === "string" && target.trim()
      ? `The learner is reading this English word or sentence: ${target.trim()}`
      : "The learner is speaking English."
    upstreamForm.append("prompt", prompt)

    const response = await fetch(`${VOICE_GATEWAY_URL}/voice/stt`, {
      method: "POST",
      body: upstreamForm,
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      return NextResponse.json(
        { error: payload.error || "语音识别失败", details: payload.details },
        { status: response.status },
      )
    }

    return NextResponse.json({
      text: typeof payload.text === "string" ? payload.text : "",
      model: payload.model,
    })
  } catch (error) {
    console.error("❌ [Voice STT] 错误:", error)
    return NextResponse.json({ error: "语音识别服务暂不可用" }, { status: 503 })
  }
}
