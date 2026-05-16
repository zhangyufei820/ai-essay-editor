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
    const supabase = getSupabaseAdmin()

    const { data: content, error: contentError } = await supabase
      .from("shared_contents")
      .select("id,user_id,like_count")
      .eq("share_code", shareCode)
      .eq("status", "published")
      .maybeSingle()

    if (contentError) throw contentError
    if (!content) return NextResponse.json({ error: "分享内容不存在" }, { status: 404 })
    if (content.user_id === userId) return NextResponse.json({ error: "不能给自己的作品点赞" }, { status: 400 })

    const { data: existing } = await supabase
      .from("content_likes")
      .select("id")
      .eq("content_id", content.id)
      .eq("user_id", userId)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase.from("content_likes").delete().eq("id", existing.id)
      if (error) throw error
      const nextCount = Math.max(0, Number(content.like_count || 0) - 1)
      await supabase.from("shared_contents").update({ like_count: nextCount }).eq("id", content.id)
      return NextResponse.json({ liked: false, like_count: nextCount })
    }

    const { error: insertError } = await supabase.from("content_likes").insert({ content_id: content.id, user_id: userId })
    if (insertError) throw insertError
    const nextCount = Number(content.like_count || 0) + 1
    await supabase.from("shared_contents").update({ like_count: nextCount }).eq("id", content.id)

    const rewards = []
    rewards.push(await awardShareCredits(supabase, userId, content.id, `like_given_${userId}`, 1, "点赞创作广场作品奖励").catch(() => ({ awarded: false, credits: 0 })))
    if ([10, 50, 100].includes(nextCount)) {
      const milestoneCredits = nextCount === 10 ? 5 : nextCount === 50 ? 15 : 30
      rewards.push(await awardShareCredits(supabase, content.user_id, content.id, `like_milestone_${nextCount}`, milestoneCredits, `作品获得 ${nextCount} 个赞奖励`).catch(() => ({ awarded: false, credits: 0 })))
    }

    return NextResponse.json({ liked: true, like_count: nextCount, rewards })
  } catch (error) {
    console.error("[ShareLike] failed:", error)
    return NextResponse.json({ error: "点赞失败" }, { status: 500 })
  }
}
