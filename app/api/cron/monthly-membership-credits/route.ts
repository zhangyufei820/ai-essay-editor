import { NextRequest, NextResponse } from "next/server"
import { grantDueAnnualMembershipCredits } from "@/lib/membership-monthly-grants"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.MONTHLY_CREDITS_CRON_SECRET
  if (!secret) return false

  const authorization = request.headers.get("authorization") || ""
  const headerSecret = request.headers.get("x-cron-secret") || ""
  return authorization === `Bearer ${secret}` || headerSecret === secret
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1" ||
    request.nextUrl.searchParams.get("dryRun") === "true"

  const result = await grantDueAnnualMembershipCredits({ dryRun })
  return NextResponse.json({ ok: result.errors.length === 0, dryRun, ...result })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
