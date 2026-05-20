import { NextResponse, type NextRequest } from "next/server"
import { checkIpRateLimit, createRateLimitResponse, getClientIP } from "@/lib/rate-limit"
import { rejectUntrustedOrigin } from "@/lib/security/request"
import { listOmniVoices } from "@/lib/omnivoice-gateway-client"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(request: NextRequest) {
  const originRejection = rejectUntrustedOrigin(request)
  if (originRejection) return originRejection

  const ip = getClientIP(request)
  const limitResult = checkIpRateLimit(ip, 60)
  if (!limitResult.allowed) return createRateLimitResponse(limitResult.retryAfter!)

  const result = await listOmniVoices()
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "音色列表不可用" }, { status: 503 })
  }

  return NextResponse.json({ success: true, voices: result.voices })
}
