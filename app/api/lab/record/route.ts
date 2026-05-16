import { NextResponse, type NextRequest } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { isPhetSimId } from "@/lib/phet/phet-utils"
import { recordPhetUsage } from "@/lib/phet/phet-progress"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function readDurationSeconds(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(86_400, Math.max(0, Math.floor(numeric)))
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth.response) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "请求体格式错误", code: "INVALID_JSON" }, { status: 400 })
  }

  const simId = typeof body.sim_id === "string" ? body.sim_id : ""
  if (!isPhetSimId(simId)) {
    return NextResponse.json({ error: "未知的 PhET 实验", code: "INVALID_SIM_ID" }, { status: 400 })
  }

  try {
    const result = await recordPhetUsage({
      userId: auth.user!.id,
      simId,
      durationSeconds: readDurationSeconds(body.duration_seconds),
      completed: body.completed === true,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[PhET Lab] record failed:", error)
    const message = error instanceof Error && error.message === "缺少 Supabase 配置"
      ? "实验室记录服务未配置"
      : "实验室记录失败"
    const status = message === "实验室记录服务未配置" ? 503 : 500
    return NextResponse.json({ error: message, code: "PHET_RECORD_FAILED" }, { status })
  }
}
