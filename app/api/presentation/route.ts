import { NextResponse, type NextRequest } from "next/server"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { checkIpRateLimit, createRateLimitResponse, getClientIP } from "@/lib/rate-limit"
import { callToolsDifyChat } from "@/lib/tools-dify-client"
import { rejectUntrustedOrigin } from "@/lib/security/request"

export const maxDuration = 90

function buildPresentationPrompt(content: string, template?: string) {
  return `请把下面素材整理成一份可直接制作 PPT 的演示文稿大纲。

要求：
1. 返回 Markdown。
2. 至少包含 6 页幻灯片，每页包含标题、讲解要点、建议配图或板书。
3. 如果适合课堂教学，请补充互动问题和练习页。
4. 不要返回虚假的 Google Slides 或下载链接。

模板偏好：${template || "classroom"}

素材：
${content}`
}

async function generatePresentationOutline(content: string, template?: string) {
  const apiKey = process.env.DIFY_PRESENTATION_API_KEY || ""

  if (apiKey) {
    const dify = await callToolsDifyChat({
      apiKey,
      query: buildPresentationPrompt(content, template),
      inputs: { content, template: template || "classroom", tool: "presentation" },
      user: "tools-presentation",
    })
    if (dify.ok) return { provider: "dify", content: dify.content, raw: dify.raw }
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("演示文稿工具未配置 DIFY_PRESENTATION_API_KEY 或 OpenAI API Key")
  }

  const { text } = await generateText({
    model: openai(process.env.TOOLS_PRESENTATION_MODEL || "gpt-5-mini") as any,
    prompt: buildPresentationPrompt(content, template),
    maxTokens: 4000,
    temperature: 0.4,
  })

  return { provider: "openai", content: text }
}

export async function POST(req: NextRequest) {
  try {
    const originRejection = rejectUntrustedOrigin(req)
    if (originRejection) return originRejection

    const ip = getClientIP(req)
    const limitResult = checkIpRateLimit(ip, 30)
    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }

    const { content, template } = await req.json()
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "内容不能为空" }, { status: 400 })
    }

    const outline = await generatePresentationOutline(content.trim(), typeof template === "string" ? template : undefined)
    return NextResponse.json({
      success: true,
      presentation: {
        title: "演示文稿大纲",
        provider: outline.provider,
        format: "markdown-outline",
        content: outline.content,
      },
    })
  } catch (error) {
    console.error("[Tools Presentation] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "演示文稿生成失败" },
      { status: 500 },
    )
  }
}
