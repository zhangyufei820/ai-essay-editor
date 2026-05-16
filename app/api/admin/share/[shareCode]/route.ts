import { NextResponse, type NextRequest } from "next/server"
import { verifyAdminToken } from "@/lib/admin-auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { awardShareCredits, publicShareSelect, type SharedContentRow, toPublicShare } from "@/lib/sharing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ shareCode: string }> }

export async function PUT(request: NextRequest, context: Context) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (!token) return NextResponse.json({ error: "未授权访问" }, { status: 401 })
    const ok = await verifyAdminToken(token)
    if (!ok) return NextResponse.json({ error: "无管理员权限" }, { status: 403 })

    const { shareCode } = await context.params
    const body = await request.json().catch(() => ({}))
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.is_featured === "boolean") updates.is_featured = body.is_featured
    if (typeof body.is_pinned === "boolean") updates.is_pinned = body.is_pinned
    if (body.status === "published" || body.status === "under_review" || body.status === "hidden") updates.status = body.status
    if (!Object.keys(updates).some((key) => key !== "updated_at")) {
      return NextResponse.json({ error: "没有可更新字段" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("shared_contents")
      .update(updates)
      .eq("share_code", shareCode)
      .select(publicShareSelect())
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: "分享内容不存在" }, { status: 404 })

    const share = data as unknown as SharedContentRow
    let reward = null
    if (updates.is_featured === true) {
      reward = await awardShareCredits(supabase, share.user_id, share.id, "featured", 20, "作品被精选奖励").catch(() => null)
    }

    return NextResponse.json({ share: toPublicShare(share), reward })
  } catch (error) {
    console.error("[AdminShare] failed:", error)
    return NextResponse.json({ error: "更新分享内容失败" }, { status: 500 })
  }
}
