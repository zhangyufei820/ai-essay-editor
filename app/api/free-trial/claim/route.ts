import { NextResponse, type NextRequest } from "next/server"
import { claimFreeTrial, getUserTrialStatus } from "@/lib/free-trial"
import { logger } from "@/lib/logger"
import { requireUser } from "@/lib/auth/verified-user"
import { rejectUntrustedOrigin } from "@/lib/security/request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const originRejected = rejectUntrustedOrigin(request)
  if (originRejected) return originRejected

  try {
    const auth = await requireUser(request)
    if (auth.response) return auth.response

    const userId = auth.user!.id
    const grantResult = await claimFreeTrial(userId)
    const trialStatus = await getUserTrialStatus(userId)

    if (!grantResult.success) {
      logger.warn("[free-trial/claim] claim failed", { userId, error: grantResult.error })
      return NextResponse.json(
        {
          ok: false,
          trialStatus: trialStatus.data,
          message: "领取体验资格失败，请稍后重试",
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      trialStatus: trialStatus.data,
      message: grantResult.data?.grant_type === "campaign"
        ? "60 天共创体验资格已生效"
        : "你已有有效体验资格",
    })
  } catch (error) {
    logger.error("[free-trial/claim] unexpected error", error)
    return NextResponse.json(
      { ok: false, trialStatus: null, message: "领取体验资格失败，请稍后重试" },
      { status: 500 },
    )
  }
}
