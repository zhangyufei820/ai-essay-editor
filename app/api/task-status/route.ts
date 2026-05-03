import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { getTaskRunsForUser } from "@/lib/ai-task-trace"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth.response) return auth.response
  const userId = auth.user!.id

  const requestId = request.nextUrl.searchParams.get("requestId")
  const sessionId = request.nextUrl.searchParams.get("sessionId")
  const limit = Number(request.nextUrl.searchParams.get("limit") || 10)

  const tasks = await getTaskRunsForUser({
    userId,
    requestId,
    sessionId,
    limit: Number.isFinite(limit) ? Math.min(50, Math.max(1, Math.round(limit))) : 10,
  })

  return NextResponse.json({ tasks })
}
