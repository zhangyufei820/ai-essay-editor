"use client"

import {
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle,
  ProgressV2 as Progress
} from "@/components/ui/v2"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { BarChart3, BookOpenCheck, Gem, Target, TrendingUp, Flame } from "lucide-react"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"

const SUBJECT_NAMES: Record<string, string> = {
  math: "数学",
  english: "英语",
  physics: "物理",
  chemistry: "化学",
  biology: "生物",
  history: "历史",
  geography: "地理",
  politics: "政治",
  other: "其他",
}

type DashboardData = {
  progress: {
    total_xp: number
    level: number
    current_streak: number
    longest_streak: number
    subject_mastery: Record<string, number>
    achievements: string[]
  }
  weekly_stats: {
    total_minutes: number
    total_xp: number
  }
  due_cards_count: number
  recent_mistakes: Array<{
    id?: string
    subject?: string | null
    topic?: string | null
    question?: string | null
  }>
  daily_activity: Array<{ date: string; minutes: number }>
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value.slice(5)
  return date.toLocaleDateString("zh-CN", { weekday: "short" })
}

function masteryAverage(subjectMastery: Record<string, number>) {
  const values = Object.values(subjectMastery).filter((value) => Number.isFinite(value))
  if (!values.length) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 rounded-[var(--radius-sharp)] border border-[var(--paper-200)]/70 bg-[var(--paper-100)]" />
        ))}
      </div>
      <div className="h-80 rounded-[var(--radius-sharp)] border border-[var(--paper-200)]/70 bg-[var(--paper-100)]" />
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="h-72 rounded-[var(--radius-sharp)] border border-[var(--paper-200)]/70 bg-[var(--paper-100)]" />
        <div className="h-72 rounded-[var(--radius-sharp)] border border-[var(--paper-200)]/70 bg-[var(--paper-100)]" />
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
}) {
  return (
    <Card className="gap-3 rounded-[var(--radius-sharp)] py-5">
      <CardContent className="flex items-start justify-between gap-3 px-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--ink-500)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-normal text-[var(--ink-900)]">{value}</p>
          <p className="mt-1 text-xs text-[var(--ink-500)]">{detail}</p>
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-soft)] bg-[var(--ink-50)] text-[var(--ink-700)] dark:bg-[var(--ink-900)]/50 dark:text-[var(--ink-200)]">
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch("/api/dashboard", {
          headers: await getVerifiedAuthHeaders(),
          cache: "no-store",
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.error || "学习看板暂不可用")
        }
        if (!cancelled) setData(payload as DashboardData)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "学习看板暂不可用")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDashboard()
    return () => {
      cancelled = true
    }
  }, [])

  const subjectMastery = useMemo(() => data?.progress.subject_mastery || {}, [data?.progress.subject_mastery])
  const masteryEntries = useMemo(
    () => Object.entries(subjectMastery).filter(([, value]) => Number.isFinite(value)),
    [subjectMastery],
  )
  const averageMastery = masteryAverage(subjectMastery)
  const totalXp = data?.progress.total_xp || 0
  const nextLevelXp = 1000 - (totalXp % 1000 || 1000)
  const todayXp = data?.weekly_stats.total_xp || 0
  const maxMinutes = Math.max(1, ...(data?.daily_activity || []).map((day) => day.minutes))
  const dailyGoalPercent = clampPercent((todayXp / 100) * 100)

  return (
    <main className="min-h-screen bg-[var(--paper-50)] px-4 py-6 text-[var(--ink-900)] dark:bg-[var(--paper-50)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium text-[var(--ink-700)] dark:text-[var(--ink-200)]">学习看板</p>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl font-[var(--font-display)]">今天的学习状态</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-500)]">
                查看 XP、连续打卡、待复习闪卡和最近薄弱点。
              </p>
            </div>
            <Button asChild className="w-fit">
              <Link href="/flashcards">开始复习</Link>
            </Button>
          </div>
        </header>

        {loading ? <SkeletonDashboard /> : null}

        {!loading && error ? (
          <Card className="rounded-[var(--radius-sharp)]">
            <CardContent className="py-10">
              <p className="font-medium text-destructive">{error}</p>
              <p className="mt-2 text-sm text-[var(--ink-500)]">请确认已登录，或稍后刷新重试。</p>
            </CardContent>
          </Card>
        ) : null}

        {!loading && !error && data ? (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                icon={<Flame className="size-5" />}
                label="连续打卡"
                value={`${data.progress.current_streak} 天`}
                detail={`最长 ${data.progress.longest_streak} 天`}
              />
              <StatCard
                icon={<TrendingUp className="size-5" />}
                label="累计 XP"
                value={`${totalXp} XP`}
                detail={`本周 +${data.weekly_stats.total_xp}`}
              />
              <StatCard
                icon={<BookOpenCheck className="size-5" />}
                label="当前等级"
                value={`Lv.${data.progress.level}`}
                detail={`距下一级还需 ${nextLevelXp} XP`}
              />
              <StatCard
                icon={<Gem className="size-5" />}
                label="综合掌握度"
                value={`${averageMastery}%`}
                detail="来自各科掌握度均值"
              />
            </section>

            <Card className="rounded-[var(--radius-sharp)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="size-5 text-[var(--ink-700)] dark:text-[var(--ink-200)]" />
                  学习时长趋势
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-64 items-end gap-3 sm:gap-4">
                  {data.daily_activity.map((day) => {
                    const height = Math.max(8, Math.round((day.minutes / maxMinutes) * 100))
                    return (
                      <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                        <span className="text-xs tabular-nums text-[var(--ink-500)]">{day.minutes} 分</span>
                        <div className="flex h-44 w-full items-end rounded-t-lg bg-[var(--ink-50)] dark:bg-[var(--ink-900)]/30">
                          <div
                            className="w-full rounded-t-lg bg-[var(--ink-500)] transition-[height] duration-300"
                            style={{ height: `${height}%` }}
                            aria-label={`${day.date} 学习 ${day.minutes} 分钟`}
                          />
                        </div>
                        <span className="text-xs text-[var(--ink-500)]">{formatDateLabel(day.date)}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <Card className="rounded-[var(--radius-sharp)]">
                <CardHeader>
                  <CardTitle className="text-lg">各科掌握度</CardTitle>
                </CardHeader>
                <CardContent>
                  {masteryEntries.length ? (
                    <div className="space-y-5">
                      {masteryEntries.map(([subject, value]) => (
                        <div key={subject} className="grid grid-cols-[72px_1fr_44px] items-center gap-3">
                          <span className="text-sm font-medium">{SUBJECT_NAMES[subject] || subject}</span>
                          <Progress value={clampPercent(value)} className="h-2 bg-[var(--paper-200)] dark:bg-[var(--ink-800)]" />
                          <span className="text-right text-sm tabular-nums text-[var(--ink-500)]">{clampPercent(value)}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-[var(--radius-soft)] border border-dashed border-[var(--paper-200)] bg-[var(--paper-100)] p-5 text-sm text-[var(--ink-500)]">
                      暂无数据，开始学习后这里会显示你的掌握度
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-[var(--radius-sharp)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Target className="size-5 text-[var(--ink-700)] dark:text-[var(--ink-200)]" />
                    今日待办
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <Link href="/flashcards" className="flex items-center justify-between rounded-[var(--radius-soft)] border border-[var(--paper-200)]/70 p-4 transition-colors hover:bg-accent">
                    <span className="font-medium">{data.due_cards_count} 张闪卡待复习</span>
                    <span className="text-sm text-[var(--ink-700)] dark:text-[var(--ink-200)]">去复习</span>
                  </Link>
                  <Link href="#" className="flex items-center justify-between rounded-[var(--radius-soft)] border border-[var(--paper-200)]/70 p-4 transition-colors hover:bg-accent">
                    <span className="font-medium">{data.recent_mistakes.length} 道错题待巩固</span>
                    <span className="text-sm text-[var(--ink-500)]">稍后开放</span>
                  </Link>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">每日目标</span>
                      <span className="text-[var(--ink-500)]">{Math.min(todayXp, 100)} / 100 XP</span>
                    </div>
                    <Progress value={dailyGoalPercent} className="h-2 bg-[var(--paper-200)] dark:bg-[var(--ink-800)]" />
                  </div>
                </CardContent>
              </Card>
            </section>

            <Card className="rounded-[var(--radius-sharp)]">
              <CardHeader>
                <CardTitle className="text-lg">错题热点</CardTitle>
              </CardHeader>
              <CardContent>
                {data.recent_mistakes.length ? (
                  <div className="divide-y divide-border/70">
                    {data.recent_mistakes.slice(0, 5).map((mistake, index) => (
                      <div key={mistake.id || index} className="grid gap-2 py-4 sm:grid-cols-[140px_1fr] sm:items-start">
                        <div className="text-sm text-[var(--ink-500)]">
                          <span className="font-medium text-[var(--ink-900)]">{SUBJECT_NAMES[mistake.subject || ""] || mistake.subject || "其他"}</span>
                          {mistake.topic ? <span className="ml-2">{mistake.topic}</span> : null}
                        </div>
                        <p className="text-sm leading-6">{(mistake.question || "").slice(0, 50)}{(mistake.question || "").length > 50 ? "..." : ""}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-[var(--radius-soft)] bg-[var(--ink-50)] p-5 text-sm font-medium text-[var(--ink-800)] dark:bg-[var(--ink-900)]/40 dark:text-[var(--ink-100)]">
                    太棒了，暂无错题！
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </main>
  )
}
