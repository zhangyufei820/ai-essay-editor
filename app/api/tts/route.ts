/**
 * 🔊 TTS (Text-to-Speech) API 路由
 *
 * 功能：
 * 1. 接收前端文字输入
 * 2. 调用 Dify TTS API 获取音频
 * 3. 返回音频数据给前端
 */

import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

// Dify API 配置
const DIFY_BASE_URL = process.env.DIFY_INTERNAL_URL
  || process.env.DIFY_BASE_URL
  || "https://api.dify.ai"

// 获取模型对应的 API Key
function getDifyApiKey(model?: string): string {
  const DEFAULT_DIFY_KEY = process.env.ESSAY_CORRECTION_API_KEY || process.env.DIFY_API_KEY || ""

  switch (model) {
    case "teaching-pro":
      return process.env.DIFY_TEACHING_PRO_API_KEY || DEFAULT_DIFY_KEY
    case "gpt-5":
      return process.env.DIFY_API_KEY_GPT5 || DEFAULT_DIFY_KEY
    case "claude-opus":
      return process.env.DIFY_API_KEY_CLAUDE || DEFAULT_DIFY_KEY
    case "gemini-pro":
      return process.env.DIFY_API_KEY_GEMINI || DEFAULT_DIFY_KEY
    case "grok-4.2":
      return process.env.DIFY_API_KEY_GROK42 || DEFAULT_DIFY_KEY
    case "open-claw":
      return process.env.DIFY_API_KEY_OPENCLAW || DEFAULT_DIFY_KEY
    default:
      return DEFAULT_DIFY_KEY
  }
}

export async function POST(request: NextRequest) {
  try {
    const { text, model } = await request.json()

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "文本内容不能为空" },
        { status: 400 }
      )
    }

    const apiKey = getDifyApiKey(model)

    if (!apiKey) {
      return NextResponse.json(
        { error: "API Key 未配置" },
        { status: 500 }
      )
    }

    // 调用 Dify TTS API
    const difyResponse = await fetch(`${DIFY_BASE_URL}/v1/text-to-audio`, {
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
      console.error("❌ [TTS] Dify API 错误:", difyResponse.status, errorText)
      return NextResponse.json(
        { error: "TTS 请求失败" },
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
        "Cache-Control": "public, max-age=3600"
      }
    })
  } catch (error) {
    console.error("❌ [TTS] 错误:", error)
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 }
    )
  }
}
