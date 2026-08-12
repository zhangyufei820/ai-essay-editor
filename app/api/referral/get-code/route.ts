import { createUserReferralCode, getReferralStats } from "@/lib/credits"
import { requireLearningUserId } from "@/lib/learning-user"
import { checkMembership } from "@/app/api/user/membership/route"
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
    const membershipResponse = await checkMembership(auth.auth.user!.id, {
      phone: auth.auth.user!.phone || null,
      email: auth.auth.user!.email || null,
    })
    const membership = await membershipResponse.json().catch(() => null)
    if (!membership?.isPaidMember) {
      return NextResponse.json({ error: "会员专属邀请权益尚未开启" }, { status: 403 })
    }
    const userId = auth.userId!

    console.log(`[推荐码API] 获取或创建推荐码，用户ID: ${userId}`)

    // 调用 lib/credits 中的函数创建推荐码
    const code = await createUserReferralCode(userId)

    if (code) {
      const stats = await getReferralStats(userId)
      return NextResponse.json({ 
        success: true,
        code: code,
        uses: stats.uses,
        totalReward: stats.totalReward,
      })
    } else {
      return NextResponse.json({ error: "Failed to create referral code" }, { status: 500 })
    }
  } catch (error) {
    console.error("[推荐码API] 错误:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
