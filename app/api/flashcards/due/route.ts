import { NextResponse, type NextRequest } from "next/server"
import { requireLearningUserId } from "@/lib/learning-user"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response
    const userId = auth.userId!

    const { data, error, count } = await getSupabaseAdmin()
      .from("flashcards")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .lte("next_review", new Date().toISOString())
      .order("next_review", { ascending: true })
      .limit(20)

    if (error) {
      console.error("[FlashcardsDue] query failed:", error)
      return NextResponse.json({ error: "获取待复习闪卡失败" }, { status: 500 })
    }

    return NextResponse.json({ cards: data || [], total_due: count || 0 })
  } catch (error) {
    console.error("[FlashcardsDue] failed:", error)
    const message = error instanceof Error && error.message === "缺少 Supabase 配置"
      ? "闪卡复习服务未配置"
      : "获取待复习闪卡失败"
    return NextResponse.json({ error: message }, { status: message === "闪卡复习服务未配置" ? 503 : 500 })
  }
}
