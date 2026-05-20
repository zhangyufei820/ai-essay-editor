import { NextResponse, type NextRequest } from "next/server"
import { checkIpRateLimit, createRateLimitResponse, getClientIP } from "@/lib/rate-limit"
import { rejectUntrustedOrigin } from "@/lib/security/request"
import { createOmniTtsJob } from "@/lib/omnivoice-gateway-client"

export const runtime = "nodejs"
export const maxDuration = 30

const MAX_TTS_TEXT_LENGTH = 1200

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export async function POST(request: NextRequest) {
  const originRejection = rejectUntrustedOrigin(request)
  if (originRejection) return originRejection

  const ip = getClientIP(request)
  const limitResult = checkIpRateLimit(ip, 30)
  if (!limitResult.allowed) return createRateLimitResponse(limitResult.retryAfter!)

  try {
    const body = await request.json()
    const text = readText(body.text).slice(0, MAX_TTS_TEXT_LENGTH)
    if (!text) {
      return NextResponse.json({ error: "请输入要转换成语音的文字" }, { status: 400 })
    }

    const speed = Number(body.speed)
    const result = await createOmniTtsJob({
      text,
      voiceId: readText(body.voice_id) || readText(body.voiceId) || undefined,
      language: readText(body.language) || "zh-CN",
      emotion: readText(body.emotion) || "friendly",
      speed: Number.isFinite(speed) ? Math.min(4, Math.max(0.25, speed)) : 1,
      format: "mp3",
    })

    if (!result.ok || !result.job) {
      return NextResponse.json({ error: result.error || "语音任务创建失败" }, { status: 502 })
    }

    return NextResponse.json({ success: true, job: result.job })
  } catch (error) {
    console.error("[OmniVoice TTS] create failed:", error)
    return NextResponse.json({ error: "语音任务创建失败" }, { status: 500 })
  }
}
