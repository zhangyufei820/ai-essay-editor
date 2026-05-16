import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireLearningUserId } from "@/lib/learning-user"
import { awardShareCredits } from "@/lib/sharing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ shareCode: string }> }

export async function POST(request: NextRequest, context: Context) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response
    const userId = auth.userId!
    const { shareCode } = await context.params
    const body = await request.json().catch(() => ({}))
    const channel = typeof body.channel === "string" ? body.channel.slice(0, 24) : "external"
    const today = new Date().toISOString().slice(0, 10)
    const supabase = getSupabaseAdmin()

    const { data: content, error } = await supabase
      .from("shared_contents")
      .select("id,user_id,share_out_count")
      .eq("share_code", shareCode)
      .eq("status", "published")
      .maybeSingle()
    if (error) throw error
    if (!content) return NextResponse.json({ error: "分享内容不存在" }, { status: 404 })

    const nextCount = Number(content.share_out_count || 0) + 1
    await supabase.from("shared_contents").update({ share_out_count: nextCount }).eq("id", content.id)
    const reward = await awardShareCredits(
      supabase,
      userId,
      content.id,
      `external_share_${channel}_${today}`,
      3,
      "转发创作广场作品奖励",
    ).catch(() => ({ awarded: false, credits: 0, reason: "reward_error" }))

    return NextResponse.json({ success: true, share_out_count: nextCount, reward })
  } catch (error) {
    console.error("[ExternalShare] failed:", error)
    return NextResponse.json({ error: "记录外部分享失败" }, { status: 500 })
  }
}
