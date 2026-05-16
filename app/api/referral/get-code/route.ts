import { createUserReferralCode } from "@/lib/credits"
import { requireUser } from "@/lib/auth/verified-user"
import { checkMembership } from "@/app/api/user/membership/route"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

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
    const { userId: requestedUserId } = await request.json().catch(() => ({}))
    let userId = auth.user!.id

    if (requestedUserId && requestedUserId !== userId) {
      const membershipResponse = await checkMembership(userId, [
        auth.user!.phone || '',
        auth.user!.email || '',
        typeof auth.user!.metadata?.phone === 'string' ? auth.user!.metadata.phone : '',
        typeof auth.user!.metadata?.mobile === 'string' ? auth.user!.metadata.mobile : '',
      ])
      const membership = await membershipResponse.json().catch(() => null)
      if (membership?.userId !== requestedUserId && !membership?.relatedUserIds?.includes(requestedUserId)) {
        return NextResponse.json({ error: "Cannot create referral code for another user" }, { status: 403 })
      }
      userId = requestedUserId
    }

    console.log(`[推荐码API] 获取或创建推荐码，用户ID: ${userId}`)

    // 调用 lib/credits 中的函数创建推荐码
    const code = await createUserReferralCode(userId)

    if (code) {
      return NextResponse.json({ 
        success: true,
        code: code,
        uses: 0
      })
    } else {
      return NextResponse.json({ error: "Failed to create referral code" }, { status: 500 })
    }
  } catch (error) {
    console.error("[推荐码API] 错误:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
