import { requireLearningUserId } from "@/lib/learning-user"
import { rejectUntrustedOrigin } from "@/lib/security/request"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function POST(request: NextRequest) {
  const originRejected = rejectUntrustedOrigin(request)
  if (originRejected) return originRejected

  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response
    // IP 限流：30次/分钟
    const { getClientIP, checkIpRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(request)
    const limitResult = checkIpRateLimit(ip, 30)
    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }
    return NextResponse.json(
      { error: "邀请奖励仅在完成受邀注册确认后自动结算" },
      { status: 409 },
    )
  } catch (error) {
    console.error("[推荐处理] 错误:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
