import { NextResponse, type NextRequest } from "next/server"
import { spendCredits } from "@/lib/credits"
import {
  createDeckName,
  normalizeCardCount,
  normalizeDifficultyLevel,
  normalizeSubject,
  parseGeneratedFlashcards,
} from "@/lib/flashcards"
import { runDifyWorkflow } from "@/lib/dify-workflow-client"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireLearningUserId } from "@/lib/learning-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GENERATION_COST = 1


function normalizeNotes(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function readCardsJson(outputs: Record<string, unknown>) {
  return outputs.cards_json ?? outputs.text ?? outputs.result
}

async function incrementAiGenerationCount(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from("user_progress")
    .select("total_ai_generations")
    .eq("user_id", userId)
    .maybeSingle()

  await supabase.from("user_progress").upsert({
    user_id: userId,
    total_ai_generations: (data?.total_ai_generations || 0) + 1,
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

    const notesContent = normalizeNotes(body.notes_content)
    if (!notesContent) {
      return NextResponse.json({ error: "notes_content 为必填项" }, { status: 400 })
    }
    if (notesContent.length > 8000) {
      return NextResponse.json({ error: "notes_content 不能超过 8000 字符" }, { status: 400 })
    }

    const subject = normalizeSubject(body.subject)
    if (!subject) {
      return NextResponse.json({ error: "subject 参数无效" }, { status: 400 })
    }

    const cardCount = normalizeCardCount(body.card_count)
    const difficultyLevel = normalizeDifficultyLevel(body.difficulty_level)
    const apiKey = process.env.DIFY_API_KEY_NOTES_TO_CARDS || ""
    if (!apiKey) {
      return NextResponse.json({ error: "Notes-to-Cards 工作流 API Key 未配置" }, { status: 503 })
    }

    const charged = await spendCredits(
      userId,
      GENERATION_COST,
      "consume",
      "AI 生成闪卡",
      `flashcards:${Date.now()}`,
      {
        feature: "flashcards",
        actionType: "consume",
        modelId: "notes-to-cards",
        chargedCredits: GENERATION_COST,
        description: "AI 生成闪卡",
        rawProviderMetadata: {
          subject,
          cardCount,
          difficultyLevel,
        },
      },
    )

    if (!charged) {
      return NextResponse.json({ error: "积分不足，无法生成闪卡" }, { status: 402 })
    }

    const result = await runDifyWorkflow({
      apiKey,
      inputs: {
        notes_content: notesContent,
        subject,
        card_count: cardCount,
        difficulty_level: difficultyLevel,
      },
      responseMode: "blocking",
      user: userId,
    })

    const cards = parseGeneratedFlashcards(readCardsJson(result.outputs))
    if (!cards) {
      return NextResponse.json({ error: "AI 生成的闪卡格式异常，请重试" }, { status: 502 })
    }

    const deckName = createDeckName(subject)
    const now = new Date().toISOString()
    const rows = cards.slice(0, cardCount).map((card) => ({
      user_id: userId,
      deck_name: deckName,
      question: card.question,
      answer: card.answer,
      difficulty: card.difficulty,
      tags: card.tags,
      card_type: card.type,
      next_review: now,
      subject,
    }))

    const supabase = getSupabaseAdmin()
    const { data: insertedCards, error: insertError } = await supabase
      .from("flashcards")
      .insert(rows)
      .select("*")

    if (insertError) {
      console.error("[FlashcardsGenerate] insert failed:", insertError)
      return NextResponse.json({ error: "保存闪卡失败" }, { status: 500 })
    }

    await incrementAiGenerationCount(userId)

    return NextResponse.json({
      deck_name: deckName,
      cards: insertedCards || [],
      count: insertedCards?.length || 0,
    })
  } catch (error) {
    console.error("[FlashcardsGenerate] failed:", error)
    const message = error instanceof Error && error.message === "缺少 Supabase 配置"
      ? "闪卡生成服务未配置"
      : "生成闪卡失败"
    return NextResponse.json({ error: message }, { status: message === "闪卡生成服务未配置" ? 503 : 500 })
  }
}
