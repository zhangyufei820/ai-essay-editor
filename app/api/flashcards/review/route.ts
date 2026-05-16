import { NextResponse, type NextRequest } from "next/server"
import { sm2 } from "@/lib/spaced-repetition"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireLearningUserId } from "@/lib/learning-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"


type FlashcardRow = {
  id: string
  user_id: string
  question: string
  answer: string
  difficulty: number | null
  ease_factor: number | null
  interval_days: number | null
  repetitions: number | null
  times_correct: number | null
  times_wrong: number | null
  subject: string | null
}

function readQuality(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 5) return null
  return numeric
}

async function incrementReviewedCount(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from("user_progress")
    .select("total_flashcards_reviewed")
    .eq("user_id", userId)
    .maybeSingle()

  await supabase.from("user_progress").upsert({
    user_id: userId,
    total_flashcards_reviewed: (data?.total_flashcards_reviewed || 0) + 1,
    updated_at: new Date().toISOString(),
  })
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

    const cardId = typeof body.card_id === "string" ? body.card_id.trim() : ""
    const quality = readQuality(body.quality)
    if (!cardId || quality === null) {
      return NextResponse.json({ error: "card_id 和 0-5 整数 quality 为必填项" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: card, error: cardError } = await supabase
      .from("flashcards")
      .select("*")
      .eq("id", cardId)
      .eq("user_id", userId)
      .maybeSingle()

    if (cardError) throw cardError
    if (!card) {
      return NextResponse.json({ error: "闪卡不存在" }, { status: 404 })
    }

    const row = card as FlashcardRow
    const next = sm2(quality, row.repetitions || 0, row.ease_factor || 2.5, row.interval_days || 1)
    const isCorrect = quality >= 3
    const now = new Date().toISOString()

    const { error: updateError } = await supabase
      .from("flashcards")
      .update({
        ease_factor: next.easeFactor,
        interval_days: next.interval,
        repetitions: next.repetitions,
        next_review: next.nextReview.toISOString(),
        last_review: now,
        times_correct: (row.times_correct || 0) + (isCorrect ? 1 : 0),
        times_wrong: (row.times_wrong || 0) + (isCorrect ? 0 : 1),
      })
      .eq("id", row.id)
      .eq("user_id", userId)

    if (updateError) throw updateError

    if (!isCorrect) {
      const { data: existingMistake } = await supabase
        .from("mistake_book")
        .select("id")
        .eq("user_id", userId)
        .eq("question", row.question)
        .eq("mastered", false)
        .maybeSingle()

      if (!existingMistake) {
        await supabase.from("mistake_book").insert({
          user_id: userId,
          subject: row.subject || "other",
          question: row.question,
          correct_answer: row.answer,
          difficulty: row.difficulty || 3,
        })
      }
    }

    await incrementReviewedCount(userId)

    return NextResponse.json({
      next_review: next.nextReview.toISOString(),
      interval_days: next.interval,
      is_correct: isCorrect,
    })
  } catch (error) {
    console.error("[FlashcardsReview] failed:", error)
    const message = error instanceof Error && error.message === "缺少 Supabase 配置"
      ? "闪卡复习服务未配置"
      : "提交复习结果失败"
    return NextResponse.json({ error: message }, { status: message === "闪卡复习服务未配置" ? 503 : 500 })
  }
}
