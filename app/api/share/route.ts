import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getClientIP, checkIpRateLimit, createRateLimitResponse } from "@/lib/rate-limit"
import {
  awardShareCredits,
  generateUniqueShareCode,
  normalizeSharePayload,
  toPublicShare,
  type SharedContentRow,
} from "@/lib/sharing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const ip = getClientIP(request)
  const limitResult = checkIpRateLimit(ip, 30)
  if (!limitResult.allowed) {
    return createRateLimitResponse(limitResult.retryAfter!)
  }

  try {
    const auth = await requireUser(request)
    if (auth.response) return auth.response
    const userId = auth.user!.id
    const body = await request.json().catch(() => ({}))
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "分享内容不能为空" }, { status: 400 })
    }

    const payload = normalizeSharePayload(body as Record<string, unknown>)
    if (!payload.title.trim()) {
      return NextResponse.json({ error: "分享标题不能为空" }, { status: 400 })
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
        like_count: 0,
        comment_count: 0,
        view_count: 0,
        share_out_count: 0,
        credits_earned: 0,
      })
      .select("*")
      .single()

    if (error) {
      console.error("[Share] create failed:", error)
      if (error.code === "42P01") {
        return NextResponse.json({ error: "分享功能暂未开放，请联系管理员" }, { status: 503 })
      }
      return NextResponse.json({ error: "创建分享失败" }, { status: 500 })
    }

    let reward = { awarded: false, credits: 0, reason: "skipped" }
    try {
      reward = await awardShareCredits(
        supabase,
        userId,
        data.id,
        "create_share",
        5,
        "分享到创作广场获得积分奖励",
      )
    } catch (rewardError) {
      console.error("[Share] reward failed:", rewardError)
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.shenxiang.school").replace(/\/+$/, "")
    const publicShare = toPublicShare(data as SharedContentRow)
    return NextResponse.json({
      success: true,
      shareId: shareCode,
      shareCode,
      shareUrl: `${baseUrl}/share/${shareCode}`,
      title: publicShare.title,
      share: publicShare,
      reward: {
        credits: reward.credits,
        message: reward.awarded
          ? `分享成功，获得 ${reward.credits} 积分奖励`
          : reward.reason === "daily_limit"
            ? "分享成功，今日分享奖励已达上限"
            : "分享成功",
      },
    })
  } catch (error) {
    console.error("[Share] POST failed:", error)
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}
