import { NextResponse, type NextRequest } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { checkIpRateLimit, createRateLimitResponse, getClientIP } from "@/lib/rate-limit"
import { rejectUntrustedOrigin } from "@/lib/security/request"
import { getOmniTtsJob } from "@/lib/omnivoice-gateway-client"

export const runtime = "nodejs"
export const maxDuration = 30

type Context = { params: Promise<{ jobId: string }> }

export async function GET(request: NextRequest, context: Context) {
  const originRejection = rejectUntrustedOrigin(request)
  if (originRejection) return originRejection

  const auth = await requireUser(request)
  if (auth.response) return auth.response

  const ip = getClientIP(request)
  const limitResult = checkIpRateLimit(ip, 60)
  if (!limitResult.allowed) return createRateLimitResponse(limitResult.retryAfter!)

  const { jobId } = await context.params
  if (!jobId) {
    return NextResponse.json({ error: "缺少语音任务 ID" }, { status: 400 })
  }

  const result = await getOmniTtsJob(jobId)
  if (!result.ok || !result.job) {
    return NextResponse.json({ error: result.error || "语音任务查询失败" }, { status: 502 })
  }

  return NextResponse.json({ success: true, job: result.job })
}
