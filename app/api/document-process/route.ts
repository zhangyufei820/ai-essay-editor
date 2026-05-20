import { NextResponse, type NextRequest } from "next/server"
import { callEssayAiSuite, type DocumentExtractResult } from "@/lib/essay-ai-suite-client"
import { checkIpRateLimit, createRateLimitResponse, getClientIP } from "@/lib/rate-limit"
import { rejectUntrustedOrigin } from "@/lib/security/request"

export const runtime = "nodejs"
export const maxDuration = 120

function arrayBufferToBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString("base64")
}

function isTextLike(file: File) {
  const type = file.type || ""
  const name = file.name.toLowerCase()
  return (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("markdown") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv") ||
    name.endsWith(".json")
  )
}

export async function POST(req: NextRequest) {
  const originRejection = rejectUntrustedOrigin(req)
  if (originRejection) return originRejection

  const ip = getClientIP(req)
  const limitResult = checkIpRateLimit(ip, 30)
  if (!limitResult.allowed) {
    return createRateLimitResponse(limitResult.retryAfter!)
  }

  try {
    const formData = await req.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "未上传文件" }, { status: 400 })
    }

    const body = isTextLike(file)
      ? {
          file_name: file.name,
          mime_type: file.type || "text/plain",
          text: await file.text(),
        }
      : {
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          content_base64: arrayBufferToBase64(await file.arrayBuffer()),
        }

    const result = await callEssayAiSuite<DocumentExtractResult>("/api/doc/extract", body)
    if (!result.ok || !result.result) {
      return NextResponse.json(
        {
          error: result.error || "文档提取网关暂不可用",
          gateway: "essay-ai-suite",
        },
        { status: 502 },
      )
    }

    if (result.result.status !== "success") {
      return NextResponse.json(
        {
          error: result.result.error || "文档未能提取文本",
          gateway: "essay-ai-suite",
          result: result.result,
        },
        { status: 422 },
      )
    }

    return NextResponse.json({
      success: true,
      gateway: "essay-ai-suite",
      fileName: result.result.file_name || file.name,
      fileType: result.result.mime_type || file.type,
      extractedText: result.result.text,
      wordCount: result.result.char_count,
      provider: result.result.provider,
    })
  } catch (error) {
    console.error("[Tools Document] error:", error)
    return NextResponse.json({ error: "文档处理失败" }, { status: 500 })
  }
}
