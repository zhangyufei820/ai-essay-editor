import { NextResponse, type NextRequest } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type LearningSession = {
  started_at: string | null
  duration_seconds: number | null
  xp_earned: number | null
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value)
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function lastSevenDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - index))
    return dateKey(date)
  })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request)
    if (auth.response) return auth.response

    const userId = auth.user!.id
    if (!isUuid(userId)) {
      return NextResponse.json(
        { error: "学习看板仅支持已同步的 Supabase 用户账号", code: "UNSUPPORTED_USER_ID" },
        { status: 400 },
      )
    }

    const supabase = getSupabaseAdmin()
    const since = new Date()
    since.setDate(since.getDate() - 7)

    const [progressResult, weeklyResult, dueCardsResult, mistakesResult] = await Promise.all([
      supabase.from("user_progress").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("learning_sessions")
        .select("started_at, duration_seconds, xp_earned")
        .eq("user_id", userId)
        .gte("started_at", since.toISOString())
        .order("started_at", { ascending: true }),
      supabase
        .from("flashcards")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .lte("next_review", new Date().toISOString()),
      supabase
        .from("mistake_book")
        .select("*")
        .eq("user_id", userId)
        .eq("mastered", false)
        .order("created_at", { ascending: false })
        .limit(5),
    ])

    if (progressResult.error) throw progressResult.error
    if (weeklyResult.error) throw weeklyResult.error
    if (dueCardsResult.error) throw dueCardsResult.error
    if (mistakesResult.error) throw mistakesResult.error

    const progress = progressResult.data || {}
    const weeklySessions = (weeklyResult.data || []) as LearningSession[]
    const totalSeconds = weeklySessions.reduce((sum, row) => sum + (row.duration_seconds || 0), 0)
    const totalXp = weeklySessions.reduce((sum, row) => sum + (row.xp_earned || 0), 0)
    const minutesByDate = new Map(lastSevenDays().map((day) => [day, 0]))

    for (const session of weeklySessions) {
      if (!session.started_at) continue
      const day = session.started_at.slice(0, 10)
      minutesByDate.set(day, (minutesByDate.get(day) || 0) + Math.ceil((session.duration_seconds || 0) / 60))
    }

    return NextResponse.json({
      progress: {
        total_xp: progress.total_xp || 0,
        level: progress.level || 1,
        current_streak: progress.current_streak || 0,
        longest_streak: progress.longest_streak || 0,
        subject_mastery: progress.subject_mastery || {},
        achievements: progress.achievements || [],
      },
      weekly_stats: {
        total_minutes: Math.ceil(totalSeconds / 60),
        total_xp: totalXp,
      },
      due_cards_count: dueCardsResult.count || 0,
      recent_mistakes: mistakesResult.data || [],
      daily_activity: Array.from(minutesByDate.entries()).map(([date, minutes]) => ({ date, minutes })),
    })
  } catch (error) {
    console.error("[Dashboard] GET failed:", error)
    const isConfigError = error instanceof Error && error.message === "缺少 Supabase 配置"
    return NextResponse.json(
      { error: isConfigError ? "学习看板服务未配置" : "获取学习看板失败" },
      { status: isConfigError ? 503 : 500 },
    )
  }
}
