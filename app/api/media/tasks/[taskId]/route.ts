import { NextResponse, type NextRequest } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { getTaskRunForUser, normalizeMediaTask } from "@/lib/ai-task-trace"
import { refreshMediaTask } from "@/lib/media-task-refresh"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ taskId: string }> }

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireUser(request)
  if (auth.response) return auth.response

  const { taskId } = await context.params
  const decodedTaskId = decodeURIComponent(taskId || "").trim()
  if (!decodedTaskId) {
    return NextResponse.json({ success: false, error: "缺少任务 ID" }, { status: 400 })
  }

  const task = await getTaskRunForUser({
    userId: auth.user!.id,
    taskId: decodedTaskId,
  })

  if (!task) {
    return NextResponse.json({ success: false, error: "任务不存在或无权访问" }, { status: 404 })
  }

  const refreshedTask = await refreshMediaTask(task).catch((error) => {
    console.warn("[Media Task] refresh skipped:", error instanceof Error ? error.message : error)
    return task
  })

  return NextResponse.json({
    success: true,
    task: normalizeMediaTask(refreshedTask),
  })
}
