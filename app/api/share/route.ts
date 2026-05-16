import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireLearningUserId } from "@/lib/learning-user"
import {
  awardShareCredits,
  generateUniqueShareCode,
  normalizeSharePayload,
  publicShareSelect,
  type SharedContentRow,
  toPublicShare,
} from "@/lib/sharing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response
    const userId = auth.userId!

    const supabase = getSupabaseAdmin()
    const { data, error, count } = await supabase
      .from("shared_contents")
      .select(publicShareSelect(), { count: "exact" })
      .eq("user_id", userId)
      .neq("status", "hidden")
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) {
      console.error("[Share] list failed:", error)
      return NextResponse.json({ error: "获取我的分享失败" }, { status: 500 })
    }

    return NextResponse.json({ shares: (data || []).map((row: any) => toPublicShare(row)), total_count: count || 0 })
  } catch (error) {
    console.error("[Share] GET exception:", error)
    const isConfigError = error instanceof Error && error.message === "缺少 Supabase 配置"
    return NextResponse.json(
      { error: isConfigError ? "分享服务未配置" : "获取我的分享失败" },
      { status: isConfigError ? 503 : 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response
    const userId = auth.userId!

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 })
    }

    const payload = normalizeSharePayload(body)
    if (!payload.title || !payload.contentData || Object.keys(payload.contentData).length === 0) {
      return NextResponse.json({ error: "分享标题和内容不能为空" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const shareCode = await generateUniqueShareCode(supabase)
    const { data, error } = await supabase
      .from("shared_contents")
      .insert({
        user_id: userId,
        content_type: payload.contentType,
        title: payload.title,
        description: payload.description,
        content_data: payload.contentData,
        thumbnail_url: payload.thumbnailUrl,
        preview_text: payload.previewText,
        subject: payload.subject,
        tags: payload.tags,
        ai_model_used: payload.aiModelUsed,
        visibility: payload.visibility,
        share_code: shareCode,
        status: "published",
      })
      .select(publicShareSelect())
      .single()

    if (error) {
      console.error("[Share] create failed:", error)
      if (error.code === "42P01") {
        return NextResponse.json({ error: "分享数据表尚未创建，请先执行迁移" }, { status: 503 })
      }
      return NextResponse.json({ error: "创建分享失败" }, { status: 500 })
    }

    const share = data as unknown as SharedContentRow
    const reward = await awardShareCredits(
      supabase,
      userId,
      share.id,
      "create_share",
      5,
      "分享到创作广场奖励",
    ).catch((rewardError) => {
      console.error("[Share] reward failed:", rewardError)
      return { awarded: false, credits: 0, reason: "reward_error" }
    })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.shenxiang.school"
    return NextResponse.json({
      success: true,
      shareCode: share.share_code,
      shareId: share.share_code,
      shareUrl: `${baseUrl}/share/${share.share_code}`,
      share: toPublicShare(share),
      reward: {
        credits: reward.credits,
        awarded: reward.awarded,
        message: reward.awarded ? `分享成功，获得 ${reward.credits} 积分` : "分享成功",
      },
    }, { status: 201 })
  } catch (error) {
    console.error("[Share] POST exception:", error)
    const isConfigError = error instanceof Error && error.message === "缺少 Supabase 配置"
    return NextResponse.json(
      { error: isConfigError ? "分享服务未配置" : "创建分享失败" },
      { status: isConfigError ? 503 : 500 },
    )
  }
}
