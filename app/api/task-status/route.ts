import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { getTaskRunsForUser, normalizeMediaTask, toPublicTaskRun } from "@/lib/ai-task-trace"
import { isOperationTimeoutError, withTimeout } from "@/lib/server-timeout"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const AUTH_TIMEOUT_MS = 5_000
const TASK_STATUS_QUERY_TIMEOUT_MS = 4_000

export async function GET(request: NextRequest) {
  try {
    const auth = await withTimeout(requireUser(request), AUTH_TIMEOUT_MS, "task-status.auth")
    if (auth.response) return auth.response
    const userId = auth.user!.id

    const requestId = request.nextUrl.searchParams.get("requestId")
    const sessionId = request.nextUrl.searchParams.get("sessionId")
    const limit = Number(request.nextUrl.searchParams.get("limit") || 10)

    const tasks = await withTimeout(getTaskRunsForUser({
      userId,
      requestId,
      sessionId,
      limit: Number.isFinite(limit) ? Math.min(50, Math.max(1, Math.round(limit))) : 10,
    }), TASK_STATUS_QUERY_TIMEOUT_MS, "task-status.query")

    const publicTasks = tasks.map(toPublicTaskRun)

    return NextResponse.json({
      tasks: publicTasks,
      mediaTasks: tasks.map(normalizeMediaTask),
    })
  } catch (error) {
    if (isOperationTimeoutError(error)) {
      return NextResponse.json({
        tasks: [],
        mediaTasks: [],
        degraded: true,
        code: "TASK_STATUS_UNAVAILABLE",
      }, { status: 503 })
    }
    throw error
  }
}
