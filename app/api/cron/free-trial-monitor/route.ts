import { NextResponse, type NextRequest } from "next/server"
import { runFreeTrialMonitor } from "@/lib/free-trial-monitor"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const authorization = request.headers.get("authorization") || ""
  const token = authorization.replace(/^Bearer\s+/i, "").trim()
  return token === cronSecret
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 })
  }

  try {
    const result = await runFreeTrialMonitor()
    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      checks: result.checks,
      actions: result.actions,
      incidentsCreated: result.incidentsCreated,
    }, { status: result.ok ? 200 : 500 })
  } catch (error) {
    logger.error("[cron/free-trial-monitor] failed", error)
    return NextResponse.json({ ok: false, status: "failed", error: "monitor_failed" }, { status: 500 })
  }
}
