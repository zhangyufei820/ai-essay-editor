import { type NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { checkIpRateLimit, createRateLimitResponse, getClientIP } from "@/lib/rate-limit"
import { callEssayAiSuite, type OcrResult } from "@/lib/essay-ai-suite-client"
import { rejectUntrustedOrigin } from "@/lib/security/request"

export const runtime = "nodejs"
export const maxDuration = 120

type OcrImagePayload = {
  image_id?: string
  file_name?: string
  image_base64?: string
  text?: string
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function normalizeImageInput(value: unknown, index: number): OcrImagePayload | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    const dataUrl = trimmed.match(/^data:([^;,]+);base64,(.+)$/i)
    if (dataUrl?.[2]) {
      return {
        image_id: `image_${index + 1}`,
        file_name: `uploaded-${index + 1}.${dataUrl[1]?.includes("jpeg") ? "jpg" : "png"}`,
        image_base64: dataUrl[2],
      }
    }
    return {
      image_id: `image_${index + 1}`,
      text: trimmed,
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return {
    image_id: readString(record.image_id) || `image_${index + 1}`,
    file_name: readString(record.file_name),
    image_base64: readString(record.image_base64),
    text: readString(record.text),
  }
}

export async function POST(req: NextRequest) {
  const originRejection = rejectUntrustedOrigin(req)
  if (originRejection) return originRejection

  const auth = await requireUser(req)
  if (auth.response) return auth.response

  const ip = getClientIP(req)
  const limitResult = checkIpRateLimit(ip, 30)
  if (!limitResult.allowed) {
    return createRateLimitResponse(limitResult.retryAfter!)
  }

  try {
    const body = await req.json()
    const images = Array.isArray(body.images)
      ? body.images.map(normalizeImageInput).filter(Boolean) as OcrImagePayload[]
      : [normalizeImageInput(body, 0)].filter(Boolean) as OcrImagePayload[]

    if (!images.length) {
      return NextResponse.json({ error: "请上传图片，或提供 image_base64/text 测试内容" }, { status: 400 })
    }

    const path = images.length === 1 ? "/api/ocr/image" : "/api/ocr/batch"
    const payload = images.length === 1 ? images[0] : { images }
    const result = await callEssayAiSuite<OcrResult>(path, payload)

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error || "OCR 服务暂不可用",
        },
        { status: 502 },
      )
    }

    const results = result.results || (result.result ? [result.result] : [])
    const failed = results.filter((item) => item.status !== "success")
    if (failed.length) {
      return NextResponse.json(
        {
          error: failed[0]?.error || "OCR 识别失败",
          results,
        },
        { status: 422 },
      )
    }

    return NextResponse.json({
      success: true,
      text: results.map((item) => item.text).filter(Boolean).join("\n\n"),
      results,
    })
  } catch (error) {
    console.error("[Tools OCR] error:", error)
    return NextResponse.json({ error: "OCR 处理失败" }, { status: 500 })
  }
}
