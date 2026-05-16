import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { CONTENT_TYPE_LABELS } from "@/lib/sharing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ shareCode: string }> }

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function wrapText(text: string, maxChars: number) {
  const clean = text.replace(/\s+/g, " ").trim()
  const lines: string[] = []
  for (let index = 0; index < clean.length && lines.length < 3; index += maxChars) {
    lines.push(clean.slice(index, index + maxChars))
  }
  return lines
}

export async function GET(_request: NextRequest, context: Context) {
  const { shareCode } = await context.params
  let title = "沈翔智学创作广场"
  let label = "AI 学习作品"
  let preview = "发现大家用 AI 创作的作文批改、闪卡、图像和智能体对话。"

  try {
    const { data } = await getSupabaseAdmin()
      .from("shared_contents")
      .select("title,content_type,preview_text")
      .eq("share_code", shareCode)
      .in("visibility", ["public", "unlisted"])
      .eq("status", "published")
      .maybeSingle()

    if (data) {
      title = String(data.title || title)
      label = CONTENT_TYPE_LABELS[String(data.content_type)] || label
      preview = String(data.preview_text || preview)
    }
  } catch (error) {
    console.error("[ShareOG] load failed:", error)
  }

  const titleLines = wrapText(title, 18)
  const previewLines = wrapText(preview, 30)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#F7FAF7"/>
  <rect x="64" y="64" width="1072" height="502" rx="36" fill="white" stroke="#DDEEE4" stroke-width="2"/>
  <circle cx="1000" cy="150" r="96" fill="#DCFCE7"/>
  <circle cx="1068" cy="492" r="120" fill="#ECFDF5"/>
  <rect x="112" y="112" width="170" height="44" rx="22" fill="#DCFCE7"/>
  <text x="136" y="141" fill="#15803D" font-family="Arial, 'PingFang SC', sans-serif" font-size="24" font-weight="700">${escapeXml(label)}</text>
  <text x="112" y="236" fill="#14532D" font-family="Arial, 'PingFang SC', sans-serif" font-size="56" font-weight="800">
    ${titleLines.map((line, index) => `<tspan x="112" dy="${index === 0 ? 0 : 72}">${escapeXml(line)}</tspan>`).join("")}
  </text>
  <text x="112" y="444" fill="#475569" font-family="Arial, 'PingFang SC', sans-serif" font-size="30" font-weight="400">
    ${previewLines.map((line, index) => `<tspan x="112" dy="${index === 0 ? 0 : 42}">${escapeXml(line)}</tspan>`).join("")}
  </text>
  <text x="112" y="530" fill="#15803D" font-family="Arial, 'PingFang SC', sans-serif" font-size="28" font-weight="700">shenxiang.school · 创作广场</text>
</svg>`

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  })
}
