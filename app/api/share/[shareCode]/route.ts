import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getVerifiedUser } from "@/lib/auth/verified-user"
import { requireLearningUserId } from "@/lib/learning-user"
import { publicShareSelect, type SharedContentRow, toPublicShare } from "@/lib/sharing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ shareCode: string }> }

async function findShare(shareCode: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("shared_contents")
    .select(publicShareSelect())
    .eq("share_code", shareCode)
    .in("visibility", ["public", "unlisted"])
    .eq("status", "published")
    .maybeSingle()

  if (error) throw error
  return data as SharedContentRow | null
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { shareCode } = await context.params
    const data = await findShare(shareCode)
    if (!data) return NextResponse.json({ error: "分享内容不存在或已下线" }, { status: 404 })

    const supabase = getSupabaseAdmin()
    const verifiedUser = await getVerifiedUser(request)
    let liked = false
    if (verifiedUser?.id) {
      const { data: like } = await supabase
        .from("content_likes")
        .select("id")
        .eq("content_id", data.id)
        .eq("user_id", verifiedUser.id)
        .maybeSingle()
      liked = Boolean(like)
    }

    await supabase
      .from("shared_contents")
      .update({ view_count: Number(data.view_count || 0) + 1 })
      .eq("id", data.id)

    return NextResponse.json({ share: toPublicShare({ ...data, view_count: Number(data.view_count || 0) + 1 }, liked) })
  } catch (error) {
    console.error("[ShareDetail] GET failed:", error)
    return NextResponse.json({ error: "获取分享详情失败" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response
    const userId = auth.userId!
    const { shareCode } = await context.params

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("shared_contents")
      .update({ status: "hidden", updated_at: new Date().toISOString() })
      .eq("share_code", shareCode)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: "分享不存在或无权删除" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[ShareDetail] DELETE failed:", error)
    return NextResponse.json({ error: "删除分享失败" }, { status: 500 })
  }
}
