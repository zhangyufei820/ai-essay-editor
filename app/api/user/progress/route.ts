import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireLearningUserId } from "@/lib/learning-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type UserProgressRow = {
  user_id: string
  total_xp: number | null
  level: number | null
  current_streak: number | null
  longest_streak: number | null
  last_study_date: string | null
  total_study_minutes: number | null
  total_sessions: number | null
  total_flashcards_reviewed: number | null
  total_quizzes_completed: number | null
  total_ai_generations: number | null
  subject_mastery: Record<string, unknown> | null
  achievements: string[] | null
  updated_at: string | null
}


function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function yesterdayString() {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  return date.toISOString().slice(0, 10)
}

function readInteger(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(0, Math.floor(numeric))
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

async function loadOrCreateProgress(userId: string): Promise<UserProgressRow> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("user_progress")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) throw error
  if (data) return data as UserProgressRow

  const { error: upsertError } = await supabase
    .from("user_progress")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true })

  if (upsertError) throw upsertError

  const { data: created, error: selectError } = await supabase
    .from("user_progress")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (selectError) throw selectError
  return created as UserProgressRow
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response
    const userId = auth.userId!

    const progress = await loadOrCreateProgress(userId)
    return NextResponse.json({ progress })
  } catch (error) {
    console.error("[UserProgress] GET failed:", error)
    const isConfigError = error instanceof Error && error.message === "缺少 Supabase 配置"
    return NextResponse.json(
      { error: isConfigError ? "学习进度服务未配置" : "获取学习进度失败" },
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

    const sessionType = optionalString(body.session_type)
    if (!sessionType) {
      return NextResponse.json({ error: "session_type 为必填项" }, { status: 400 })
    }

    const itemsCompleted = readInteger(body.items_completed)
    const itemsCorrect = Math.min(readInteger(body.items_correct), itemsCompleted || readInteger(body.items_correct))
    const durationSeconds = Math.min(86_400, readInteger(body.duration_seconds))
    const xpEarned = itemsCorrect * 10 + (itemsCompleted >= 10 ? 50 : 0)

    const progress = await loadOrCreateProgress(userId)
    const today = todayString()
    const yesterday = yesterdayString()
    const currentStreak = progress.current_streak || 0
    const newStreak = progress.last_study_date === today
      ? currentStreak
      : progress.last_study_date === yesterday
        ? currentStreak + 1
        : 1
    const newLongestStreak = Math.max(newStreak, progress.longest_streak || 0)
    const newTotalXp = (progress.total_xp || 0) + xpEarned
    const newLevel = Math.floor(newTotalXp / 1000) + 1
    const newTotalMinutes = (progress.total_study_minutes || 0) + Math.ceil(durationSeconds / 60)
    const newTotalSessions = (progress.total_sessions || 0) + 1

    const supabase = getSupabaseAdmin()
    const [{ error: updateError }, { error: sessionError }] = await Promise.all([
      supabase
        .from("user_progress")
        .update({
          total_xp: newTotalXp,
          level: newLevel,
          current_streak: newStreak,
          longest_streak: newLongestStreak,
          last_study_date: today,
          total_sessions: newTotalSessions,
          total_study_minutes: newTotalMinutes,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId),
      supabase.from("learning_sessions").insert({
        user_id: userId,
        session_type: sessionType,
        subject: optionalString(body.subject),
        topic: optionalString(body.topic),
        duration_seconds: durationSeconds,
        items_completed: itemsCompleted,
        items_correct: itemsCorrect,
        xp_earned: xpEarned,
        ended_at: new Date().toISOString(),
      }),
    ])

    if (updateError) {
      console.error("[UserProgress] update failed:", updateError)
      return NextResponse.json({ error: "更新学习进度失败" }, { status: 500 })
    }
    if (sessionError) {
      console.error("[UserProgress] session insert failed:", sessionError)
      return NextResponse.json({ error: "记录学习会话失败" }, { status: 500 })
    }

    return NextResponse.json({
      xp_earned: xpEarned,
      new_streak: newStreak,
      new_level: newLevel,
      total_xp: newTotalXp,
    })
  } catch (error) {
    console.error("[UserProgress] POST failed:", error)
    const isConfigError = error instanceof Error && error.message === "缺少 Supabase 配置"
    return NextResponse.json(
      { error: isConfigError ? "学习进度服务未配置" : "更新学习进度失败" },
      { status: isConfigError ? 503 : 500 },
    )
  }
}
