import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireLearningUserId } from "@/lib/learning-user"
import { awardShareCredits } from "@/lib/sharing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ shareCode: string }> }

async function findContent(shareCode: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("shared_contents")
    .select("id,user_id,comment_count")
    .eq("share_code", shareCode)
    .eq("status", "published")
    .maybeSingle()
  if (error) throw error
  return data
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { shareCode } = await context.params
    const content = await findContent(shareCode)
    if (!content) return NextResponse.json({ comments: [], total_count: 0 })

    const { data, error, count } = await getSupabaseAdmin()
      .from("content_comments")
      .select("id,content_id,user_id,parent_id,comment_text,like_count,status,created_at", { count: "exact" })
      .eq("content_id", content.id)
      .eq("status", "published")
      .order("created_at", { ascending: true })
      .limit(100)

    if (error) throw error
    return NextResponse.json({ comments: data || [], total_count: count || 0 })
  } catch (error) {
    console.error("[ShareComments] GET failed:", error)
    return NextResponse.json({ error: "获取评论失败" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response
    const userId = auth.userId!
    const { shareCode } = await context.params
    const content = await findContent(shareCode)
    if (!content) return NextResponse.json({ error: "分享内容不存在" }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const commentText = typeof body.comment_text === "string" ? body.comment_text.trim() : ""
    if (commentText.length < 2 || commentText.length > 500) {
      return NextResponse.json({ error: "评论长度需为 2-500 字" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("content_comments")
      .insert({
        content_id: content.id,
        user_id: userId,
        parent_id: typeof body.parent_id === "string" ? body.parent_id : null,
        comment_text: commentText,
      })
      .select("id,content_id,user_id,parent_id,comment_text,like_count,status,created_at")
      .single()

    if (error) throw error
    const nextCount = Number(content.comment_count || 0) + 1
    await supabase.from("shared_contents").update({ comment_count: nextCount }).eq("id", content.id)

    const rewards = []
    rewards.push(await awardShareCredits(supabase, userId, content.id, `comment_written_${data.id}`, 2, "评论创作广场作品奖励").catch(() => ({ awarded: false, credits: 0 })))
    if (nextCount === 1 && content.user_id !== userId) {
      rewards.push(await awardShareCredits(supabase, content.user_id, content.id, "first_comment_received", 2, "作品首次收到评论奖励").catch(() => ({ awarded: false, credits: 0 })))
    }

    return NextResponse.json({ comment: data, comment_count: nextCount, rewards }, { status: 201 })
  } catch (error) {
    console.error("[ShareComments] POST failed:", error)
    return NextResponse.json({ error: "发表评论失败" }, { status: 500 })
  }
}
