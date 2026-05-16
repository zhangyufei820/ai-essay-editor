import { NextRequest, NextResponse } from "next/server"
import { settleStaleImageTasks } from "@/lib/image-task-refunds"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.IMAGE_TASKS_CRON_SECRET
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
  const olderThanMinutes = Number(request.nextUrl.searchParams.get("olderThanMinutes") || 15)
  const limit = Number(request.nextUrl.searchParams.get("limit") || 50)

  const result = await settleStaleImageTasks({
    dryRun,
    olderThanMs: Number.isFinite(olderThanMinutes) ? Math.max(5, olderThanMinutes) * 60 * 1000 : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  })

  return NextResponse.json({ ok: result.errors.length === 0, dryRun, ...result })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
