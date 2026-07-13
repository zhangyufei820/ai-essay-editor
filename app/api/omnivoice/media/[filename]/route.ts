import { NextResponse, type NextRequest } from "next/server"
import { checkIpRateLimit, createRateLimitResponse, getClientIP } from "@/lib/rate-limit"
import { rejectUntrustedOrigin } from "@/lib/security/request"
import { fetchOmniMedia } from "@/lib/omnivoice-gateway-client"
import { requireUser } from "@/lib/auth/verified-user"
import { isOmniVoiceMediaOwner, SAFE_OMNIVOICE_AUDIO_FILENAME } from "@/lib/omnivoice-job-ownership"

export const runtime = "nodejs"
export const maxDuration = 30

type Context = { params: Promise<{ filename: string }> }

export async function GET(request: NextRequest, context: Context) {
  return proxyMedia(request, context)
}

export async function HEAD(request: NextRequest, context: Context) {
  return proxyMedia(request, context, true)
}

async function proxyMedia(request: NextRequest, context: Context, headOnly = false) {
  const originRejection = rejectUntrustedOrigin(request)
  if (originRejection) return originRejection

  const auth = await requireUser(request)
  if (auth.response) return auth.response

  const ip = getClientIP(request)
  const limitResult = checkIpRateLimit(ip, 120)
  if (!limitResult.allowed) return createRateLimitResponse(limitResult.retryAfter!)

  const { filename } = await context.params
  const decodedFilename = decodeURIComponent(filename || "")
  if (
    !SAFE_OMNIVOICE_AUDIO_FILENAME.test(decodedFilename) ||
    !await isOmniVoiceMediaOwner(decodedFilename, auth.user!.id)
  ) {
    return NextResponse.json({ error: "音频文件不存在" }, { status: 404 })
  }

  const range = request.headers.get("range") || undefined
  const upstream = await fetchOmniMedia(decodedFilename, { range, method: headOnly ? "HEAD" : "GET" })
  if (!upstream.ok) {
    return NextResponse.json({ error: "音频文件读取失败" }, { status: upstream.status })
  }

  return new Response(headOnly ? null : upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  })
}
