/**
 * 🔊 TTS (Text-to-Speech) API 路由
 *
 * 功能：
 * 1. 接收前端文字输入
 * 2. 调用 Dify TTS API 获取音频
 * 3. 返回音频数据给前端
 */

import { NextRequest, NextResponse } from "next/server"
import { internalDifyFetch } from "@/lib/internal-dify-fetch"
import { requireUser } from "@/lib/auth/verified-user"
import { getDifyCredentialForModel } from "@/lib/dify-credentials"

export const runtime = "nodejs"
export const maxDuration = 60

const TTS_NOT_ENABLED_STATUS = 501

// Dify API 配置
const DIFY_BASE_URL = process.env.DIFY_INTERNAL_URL
  || process.env.DIFY_BASE_URL
  || "https://api.dify.ai"

// 获取模型对应的 API Key
function getDifyApiKey(model?: string): { credential: string; source: string } {
  return getDifyCredentialForModel(model || "general-chat", process.env)
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request)
    if (auth.response) return auth.response
    // IP 限流：30次/分钟
    const { getClientIP, checkIpRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(request)
    const limitResult = checkIpRateLimit(ip, 30)
    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }
    const { text, model } = await request.json()

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "文本内容不能为空" },
        { status: 400 }
      )
    }

    const { credential: apiKey, source: keySource } = getDifyApiKey(model)

    if (!apiKey) {
      return NextResponse.json(
        { error: "语音服务暂时不可用，请稍后重试。" },
        { status: 500 }
      )
    }

    // 调用 Dify TTS API
    // 注意：DIFY_BASE_URL 已经是完整路径（含/v1），不需要再加
    const difyUrl = DIFY_BASE_URL.includes('/v1')
      ? `${DIFY_BASE_URL}/text-to-audio`
      : `${DIFY_BASE_URL}/v1/text-to-audio`
    const difyResponse = await internalDifyFetch(difyUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: text.substring(0, 500), // 限制文本长度
        user: "tts-user",
        streaming: false
      })
    })

    if (!difyResponse.ok) {
      const errorText = await difyResponse.text()
      if (errorText.toLowerCase().includes("tts is not enabled")) {
        return NextResponse.json(
          { error: "当前模型未开启语音朗读", code: "TTS_NOT_ENABLED" },
          { status: TTS_NOT_ENABLED_STATUS }
        )
      }

      console.error("❌ [TTS] Dify API 错误:", difyResponse.status, errorText)
      return NextResponse.json(
        { error: "语音服务暂时不可用，请稍后重试。" },
        { status: difyResponse.status }
      )
    }

    // 获取音频数据
    const audioBuffer = await difyResponse.arrayBuffer()

    // 返回音频数据
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "private, no-store"
      }
    })
  } catch (error) {
    console.error("❌ [TTS] 错误:", error)
    return NextResponse.json(
      { error: "语音服务暂时不可用，请稍后重试。" },
      { status: 500 }
    )
  }
}
