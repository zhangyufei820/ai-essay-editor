import { NextRequest, NextResponse } from "next/server"
import { reconcileStaleAiTaskRuns } from "@/lib/ai-task-reconcile"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.AI_TASK_RECONCILE_CRON_SECRET
  if (!secret) return false

  const authorization = request.headers.get("authorization") || ""
  const headerSecret = request.headers.get("x-cron-secret") || ""
  return authorization === `Bearer ${secret}` || headerSecret === secret
}

function readPositiveNumber(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function handle(request: NextRequest, options: { allowApply: boolean }) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const applyRequested = params.get("apply") === "1" || params.get("apply") === "true"
  const dryRunRequested = params.get("dryRun") === "1" || params.get("dryRun") === "true"
  const dryRun = !options.allowApply || !applyRequested || dryRunRequested
  const olderThanMinutes = readPositiveNumber(params.get("olderThanMinutes"), 60)
  const limit = readPositiveNumber(params.get("limit"), 100)

  const result = await reconcileStaleAiTaskRuns({
    dryRun,
    olderThanMs: olderThanMinutes * 60 * 1000,
    limit,
  })

  return NextResponse.json({ ok: result.errors.length === 0, ...result })
}

export async function GET(request: NextRequest) {
  return handle(request, { allowApply: false })
}

export async function POST(request: NextRequest) {
  return handle(request, { allowApply: true })
}
