import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { getClientIP, checkIpRateLimit, createRateLimitResponse } from "@/lib/rate-limit"
import { resolveVoiceTtsPayload } from "@/lib/voice-tts-request"

export const runtime = "nodejs"
export const maxDuration = 90

const VOICE_GATEWAY_URL = (process.env.VOICE_GATEWAY_URL || "http://voice-gateway:8080").replace(/\/+$/, "")
const MAX_TEXT_LENGTH = 600

function getPronunciationInstructions(text: string) {
  const isShortWord = /^[A-Za-z][A-Za-z'-]{0,30}$/.test(text.trim())
  if (isShortWord) {
    return "Speak the English word slowly and clearly in standard American English. Pause briefly, then repeat it once naturally for pronunciation learning."
  }
  return "Speak slowly and clearly in standard English pronunciation for a Chinese language learner."
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth.response) return auth.response

  const ip = getClientIP(request)
  const limitResult = checkIpRateLimit(ip, 30)
  if (!limitResult.allowed) {
    return createRateLimitResponse(limitResult.retryAfter!)
  }

  try {
    const body = await request.json()
    const payload = resolveVoiceTtsPayload(body, MAX_TEXT_LENGTH)
    const text = payload.text
    if (!text) {
      return NextResponse.json({ error: "文本内容不能为空" }, { status: 400 })
    }

    const response = await fetch(`${VOICE_GATEWAY_URL}/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: payload.voice,
        format: payload.format,
        instructions: payload.instructions
          ? payload.instructions
          : getPronunciationInstructions(text),
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: payload.error || "语音生成失败", details: payload.details },
        { status: response.status },
      )
    }

    const audio = await response.arrayBuffer()
    return new NextResponse(audio, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "audio/mpeg",
        "Content-Length": audio.byteLength.toString(),
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    console.error("❌ [Voice TTS] 错误:", error)
    return NextResponse.json({ error: "语音服务暂不可用" }, { status: 503 })
  }
}
