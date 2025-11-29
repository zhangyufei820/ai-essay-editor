import { NextResponse } from "next/server"

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { content, provider = "google-slides", template } = await req.json()

    if (!content) {
      return NextResponse.json({ error: "内容不能为空" }, { status: 400 })
    }

    // 生成演示文稿
    const presentation = await generatePresentation(content, provider, template)

    return NextResponse.json({
      success: true,
      presentation,
    })
  } catch (error) {
    console.error("[v0] Presentation generation error:", error)
    return NextResponse.json({ error: "演示文稿生成失败" }, { status: 500 })
  }
}

async function generatePresentation(content: unknown, provider: string, template?: string) {
  // 实际实现中会调用 Google Slides API 或 Microsoft Graph API
  return {
    id: "presentation-id",
    url: "https://docs.google.com/presentation/d/...",
    provider,
    template,
    slideCount: 10,
  }
}
