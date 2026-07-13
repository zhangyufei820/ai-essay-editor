import { type NextRequest, NextResponse } from "next/server"

import { requireUser } from "@/lib/auth/verified-user"
import { type EntitlementIdentity, getUserEntitlementSummary } from "@/lib/user-entitlements"
import { checkIpRateLimit, createRateLimitResponse, getClientIP } from "@/lib/rate-limit"
import { rejectUntrustedOrigin } from "@/lib/security/request"

export const dynamic = "force-dynamic"

export async function checkMembership(userId: string, identity: EntitlementIdentity = {}) {
  const entitlement = await getUserEntitlementSummary(userId, {
    email: identity.email || null,
    phone: identity.phone || null,
  })

  if (!entitlement) {
    return NextResponse.json({
      isPaidMember: false,
      orderCount: 0,
      latestOrder: null,
      userId,
      relatedUserIds: [userId],
      type: "免费",
    })
  }

  return NextResponse.json({
    isPaidMember: entitlement.isPro,
    orderCount: entitlement.latestMembershipOrder ? 1 : 0,
    latestOrder: entitlement.latestMembershipOrder,
    userId: entitlement.entitlementUserId,
    relatedUserIds: entitlement.relatedUserIds,
    type: entitlement.membershipStatus || entitlement.latestMembershipOrder?.product_id || "免费",
  })
}

function verifiedIdentity(user: NonNullable<Awaited<ReturnType<typeof requireUser>>["user"]>) {
  return {
    email: user.email || null,
    phone: user.phone || null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request)
    if (auth.response) return auth.response

    const requestedUserId = request.nextUrl.searchParams.get("user_id")
    if (requestedUserId && requestedUserId !== auth.user!.id) {
      return NextResponse.json({ error: "无权查询该用户会员状态" }, { status: 403 })
    }

    return checkMembership(auth.user!.id, verifiedIdentity(auth.user!))
  } catch (error) {
    console.error("[会员状态] 查询失败:", error)
    return NextResponse.json({ error: "查询会员状态失败" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originRejection = rejectUntrustedOrigin(request)
  if (originRejection) return originRejection

  const ip = getClientIP(request)
  const limitResult = checkIpRateLimit(ip, 30)
  if (!limitResult.allowed) return createRateLimitResponse(limitResult.retryAfter!)

  try {
    const auth = await requireUser(request)
    if (auth.response) return auth.response

    const body = await request.json().catch(() => ({})) as { userId?: unknown }
    if (typeof body.userId === "string" && body.userId && body.userId !== auth.user!.id) {
      return NextResponse.json({ error: "无权查询该用户会员状态" }, { status: 403 })
    }

    return checkMembership(auth.user!.id, verifiedIdentity(auth.user!))
  } catch (error) {
    console.error("[会员状态] 查询失败:", error)
    return NextResponse.json({ error: "查询会员状态失败" }, { status: 500 })
  }
}
