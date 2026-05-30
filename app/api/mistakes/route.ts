import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireLearningUserId } from "@/lib/learning-user"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SUBJECTS = new Set(["math", "english", "chinese", "physics", "chemistry", "biology", "history", "geography", "politics", "problem", "other"])

const createMistakeSchema = z.object({
  subject: z.string().trim().min(1).max(50).optional(),
  topic: z.string().trim().max(200).optional(),
  question: z.string().trim().min(1).max(8000),
  correct_answer: z.string().trim().min(1).max(8000),
  user_answer: z.string().trim().max(8000).optional(),
  explanation: z.string().trim().max(8000).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  source: z.string().trim().max(80).optional(),
})

function normalizeSubject(subject: string | undefined) {
  const value = subject?.trim().toLowerCase() || "other"
  return SUBJECTS.has(value) ? value : "other"
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response
    const userId = auth.userId!

    const parsed = createMistakeSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "错题参数不完整或格式无效" }, { status: 400 })
    }

    const input = parsed.data
    const subject = normalizeSubject(input.subject)
    const question = input.question.trim()
    const supabase = getSupabaseAdmin()

    const { data: existing, error: existingError } = await supabase
      .from("mistake_book")
      .select("id")
      .eq("user_id", userId)
      .eq("question", question)
      .eq("mastered", false)
      .maybeSingle()

    if (existingError) throw existingError
    if (existing?.id) {
      return NextResponse.json({ mistake: existing, existing: true })
    }

    const { data, error } = await supabase
      .from("mistake_book")
      .insert({
        user_id: userId,
        subject,
        topic: input.topic || null,
        question,
        correct_answer: input.correct_answer.trim(),
        user_answer: input.user_answer || null,
        explanation: input.explanation || null,
        difficulty: input.difficulty || 3,
      })
      .select("id,subject,topic,question,created_at")
      .single()

    if (error) throw error

    return NextResponse.json({ mistake: data, existing: false })
  } catch (error) {
    console.error("[Mistakes] create failed:", error)
    const isConfigError = error instanceof Error && error.message === "缺少 Supabase 配置"
    return NextResponse.json(
      { error: isConfigError ? "错题本服务未配置" : "保存错题失败" },
      { status: isConfigError ? 503 : 500 },
    )
  }
}
