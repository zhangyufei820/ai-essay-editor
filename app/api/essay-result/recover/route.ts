import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { getTaskRunForUser } from "@/lib/ai-task-trace"
import { getDifyCredentialForModel } from "@/lib/dify-credentials"
import { selectRecoveredEssayResult } from "@/lib/essay-result-recovery"
import { internalDifyFetch } from "@/lib/internal-dify-fetch"
import { withTimeout } from "@/lib/server-timeout"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await withTimeout(requireUser(request), 5_000, "essay-result.auth")
  if (auth.response) return auth.response

  const requestId = request.nextUrl.searchParams.get("requestId") || ""
  if (!/^chat_[\da-f-]{20,60}$/i.test(requestId)) {
    return NextResponse.json({ error: "无效的任务编号" }, { status: 400 })
  }

  const task = await withTimeout(getTaskRunForUser({ userId: auth.user!.id, taskId: requestId }), 5_000, "essay-result.task")
  if (!task || task.model !== "standard" || task.kind !== "dify") {
    return NextResponse.json({ error: "没有可恢复的作文批改任务" }, { status: 404 })
  }
  if (!task.conversation_id) return NextResponse.json({ ready: false }, { headers: { "Cache-Control": "no-store" } })

  const { credential } = getDifyCredentialForModel("standard")
  if (!credential) return NextResponse.json({ ready: false }, { status: 503 })
  const baseUrl = (process.env.DIFY_INTERNAL_URL || process.env.DIFY_BASE_URL || "https://api.dify.ai/v1").replace(/\/$/, "")
  const url = new URL(`${baseUrl}/messages`)
  url.searchParams.set("user", auth.user!.id)
  url.searchParams.set("conversation_id", task.conversation_id)
  url.searchParams.set("limit", "100")

  try {
    const response = await internalDifyFetch(url.toString(), {
      headers: { Authorization: `Bearer ${credential}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return NextResponse.json({ ready: false }, { status: 503 })
    const payload = await response.json()
    const answer = selectRecoveredEssayResult(payload?.data, task)
    return NextResponse.json(answer ? { ready: true, answer, sessionId: task.session_id } : { ready: false }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    console.warn("[Essay Recovery] Upstream lookup failed", {
      requestId,
      message: error instanceof Error ? error.name : "unknown",
    })
    return NextResponse.json({ ready: false }, { status: 503 })
  }
}
