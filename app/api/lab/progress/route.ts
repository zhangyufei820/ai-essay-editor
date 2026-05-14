import { NextResponse, type NextRequest } from "next/server"
import { getVerifiedUser } from "@/lib/auth/verified-user"
import { loadPhetProgress } from "@/lib/phet/phet-progress"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const user = await getVerifiedUser(request)
  if (!user) {
    return NextResponse.json({
      completed_sim_ids: [],
      recent_sim_ids: [],
      achievements: [],
      streak_days: 0,
      total_uses: 0,
    })
  }

  try {
    return NextResponse.json(await loadPhetProgress(user.id))
  } catch (error) {
    console.error("[PhET Lab] progress failed:", error)
    return NextResponse.json({ error: "实验室进度暂不可用", code: "PHET_PROGRESS_FAILED" }, { status: 500 })
  }
}
