"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Search } from "lucide-react"
import { IconChat, IconEssay, IconHistory } from "@/components/icons/v2"
import { BadgeV2 as Badge, ButtonV2 as Button, CardV2 as Card, LoadingStateV2 } from "@/components/ui/v2"
import { ModelLogo, type ModelKey } from "@/components/ModelLogo"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"
import { buildChatSessionRouteFromSession, resolveChatSessionRouteModel } from "@/lib/chat-session-routes"
import { cn } from "@/lib/utils"

type ChatSession = {
  id: string
  title?: string | null
  preview?: string | null
  processing_mode?: string | null
  ai_provider?: string | null
  ai_model?: string | null
  created_at: string
}

type EssayReview = {
  id: string
  original_text?: string | null
  writer_style?: string | null
  score?: number | null
  created_at: string
}

type HistoryItem =
  | { type: "session"; id: string; title: string; preview: string; model: string; createdAt: string; href: string }
  | { type: "review"; id: string; title: string; preview: string; score?: number | null; writerStyle?: string | null; createdAt: string }

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  standard: "作文批改",
  "general-chat": "网站助手",
  "gpt-5": "ChatGPT 5.4",
  "claude-opus": "Claude Opus",
  "gemini-pro": "Gemini Pro",
  "gemini-image": "Gemini 图像",
  "grok-4.2": "Grok 4.2",
  "open-claw": "OpenClaw",
  "quanquan-math": "全学段数学",
  "quanquan-english": "全学段英语",
  "vocab-card": "词境记忆卡",
  problem: "题目解析",
  "beike-pro": "备课 Pro",
  banzhuren: "班主任助手",
  "all-in-one-agent": "全能智能体",
  "suno-v5": "Suno V5",
  "banana-2-pro": "Banana 2 Pro",
  "gpt-image-2": "GPT Image 2",
  "gpt-image-1": "GPT Image 1",
  "ai-writing-paper": "论文写作",
  "zhongying-essay": "中英作文",
  "reading-report": "读书报告",
  "experiment-report": "实验报告",
  "study-abroad": "留学文书",
  "resume-optimize": "简历优化",
  "speech-defense": "演讲答辩",
  "school-wechat": "校园文案",
}

function hasLocalUser() {
  if (typeof window === "undefined") return false
  try {
    const user = JSON.parse(window.localStorage.getItem("currentUser") || "null")
    return Boolean(user?.id || user?.sub || user?.userId || user?.user_id)
  } catch {
    return false
  }
}

function formatDay(date: string) {
  const value = new Date(date)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (value.toDateString() === today.toDateString()) return "今天"
  if (value.toDateString() === yesterday.toDateString()) return "昨天"
  return value.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })
}

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
}

function cleanText(value: string | null | undefined, fallback: string) {
  const text = (value || "").replace(/\s+/g, " ").trim()
  return text || fallback
}

function normalizeSession(session: ChatSession): HistoryItem {
  const model = resolveChatSessionRouteModel(session)
  return {
    type: "session",
    id: session.id,
    title: cleanText(session.title, MODEL_DISPLAY_NAMES[model] || "AI 对话"),
    preview: cleanText(session.preview, "继续打开这次对话，查看完整上下文和生成结果。"),
    model,
    createdAt: session.created_at,
    href: buildChatSessionRouteFromSession(session),
  }
}

function normalizeReview(review: EssayReview): HistoryItem {
  const text = cleanText(review.original_text, "作文批改记录")
  return {
    type: "review",
    id: review.id,
    title: text.slice(0, 42),
    preview: text,
    score: review.score,
    writerStyle: review.writer_style,
    createdAt: review.created_at,
  }
}

function groupItems(items: HistoryItem[]) {
  return items.reduce<Array<{ day: string; items: HistoryItem[] }>>((groups, item) => {
    const day = formatDay(item.createdAt)
    const current = groups.find((group) => group.day === day)
    if (current) current.items.push(item)
    else groups.push({ day, items: [item] })
    return groups
  }, [])
}

export default function HistoryPage() {
  const [sessions, setSessions] = React.useState<ChatSession[]>([])
  const [reviews, setReviews] = React.useState<EssayReview[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loggedIn, setLoggedIn] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<"all" | "session" | "review">("all")

  const loadHistory = React.useCallback(async () => {
    setLoading(true)
    const localLogin = hasLocalUser()
    setLoggedIn(localLogin)
    try {
      const headers = await getVerifiedAuthHeaders()
      const [sessionsRes, reviewsRes] = await Promise.all([
        fetch("/api/chat-session?limit=50", { headers }),
        fetch("/api/save-essay-review", { headers }),
      ])

      if (sessionsRes.status === 401 && reviewsRes.status === 401) {
        setLoggedIn(false)
        setSessions([])
        setReviews([])
        return
      }

      if (sessionsRes.ok) {
        const result = await sessionsRes.json().catch(() => ({}))
        const nextSessions = Array.isArray(result.sessions) ? result.sessions : []
        setSessions(nextSessions)
        if (nextSessions.length > 0 || headers.Authorization) setLoggedIn(true)
      } else {
        setSessions([])
      }

      if (reviewsRes.ok) {
        const result = await reviewsRes.json().catch(() => ({}))
        setReviews(Array.isArray(result.reviews) ? result.reviews : [])
      } else {
        setReviews([])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const allItems = React.useMemo(() => {
    return [...sessions.map(normalizeSession), ...reviews.map(normalizeReview)]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [sessions, reviews])

  const filteredItems = allItems.filter((item) => {
    if (filter !== "all" && item.type !== filter) return false
    const keyword = query.trim().toLowerCase()
    if (!keyword) return true
    const haystack = `${item.title} ${item.preview} ${item.type === "session" ? MODEL_DISPLAY_NAMES[item.model] || item.model : item.writerStyle || ""}`.toLowerCase()
    return haystack.includes(keyword)
  })

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--paper-50)]">
        <LoadingStateV2 label="正在同步你的历史记录..." />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[var(--paper-50)] px-4 py-8 font-[var(--font-sans-v2)] text-[var(--ink-900)] md:px-6 md:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 grid gap-4 rounded-[var(--radius-sharp)] border border-[var(--ink-200)] bg-[linear-gradient(180deg,var(--ink-50),var(--paper-50))] p-5 shadow-[0_22px_70px_rgba(16,55,35,0.09)] md:grid-cols-[1fr_auto] md:p-7">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--ink-200)] bg-[var(--paper-50)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-700)]">
              <IconHistory className="size-3.5" aria-hidden="true" />
              历史记录
            </span>
            <h1 className="mt-4 font-[var(--font-display)] text-[clamp(30px,5vw,44px)] font-black leading-[1.08] text-[var(--ink-900)]">
              你的学习与创作，都按时间收好。
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-[1.8] text-[var(--ink-600)]">
              对话、图像工作区、智能体任务和作文批改会统一映射到这里，方便继续上一次任务。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 md:min-w-[300px]">
            <StatCard label="全部" value={allItems.length} />
            <StatCard label="对话" value={sessions.length} />
            <StatCard label="批改" value={reviews.length} />
          </div>
        </header>

        {!loggedIn ? (
          <Card className="p-8 text-center">
            <h2 className="font-[var(--font-display)] text-[24px] font-bold text-[var(--ink-800)]">登录后查看完整历史</h2>
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-[1.7] text-[var(--ink-500)]">
              历史记录按账号同步。登录后可以继续所有已保存的对话和批改任务。
            </p>
            <div className="mt-5">
              <Button asChild>
                <Link href="/login">去登录</Link>
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <div className="mb-5 flex flex-col gap-3 rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-100)] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-400)]" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索标题、摘要或模型"
                  className="h-10 w-full rounded-[var(--radius-pill)] border border-[var(--paper-300)] bg-[var(--paper-50)] pl-9 pr-4 text-[14px] text-[var(--ink-800)] outline-none transition focus:border-[var(--ink-400)]"
                />
              </div>
              <div className="flex items-center gap-2">
                {[
                  { key: "all", label: "全部" },
                  { key: "session", label: "对话" },
                  { key: "review", label: "批改" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFilter(item.key as typeof filter)}
                    className={cn(
                      "rounded-[var(--radius-pill)] px-3 py-2 text-[13px] font-semibold transition-colors",
                      filter === item.key
                        ? "bg-[var(--ink-700)] text-white"
                        : "text-[var(--ink-600)] hover:bg-[var(--ink-50)]"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
                <Button variant="ghost" size="icon-sm" onClick={loadHistory} aria-label="刷新历史记录">
                  <IconHistory className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <Card className="p-8 text-center">
                <h2 className="font-[var(--font-display)] text-[22px] font-bold text-[var(--ink-800)]">没有匹配的历史记录</h2>
                <p className="mt-2 text-[14px] text-[var(--ink-500)]">换个关键词，或回到智能体广场开始新的任务。</p>
                <div className="mt-5">
                  <Button asChild>
                    <Link href="/agents">去智能体广场</Link>
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="space-y-6">
                {groupItems(filteredItems).map((group) => (
                  <section key={group.day}>
                    <div className="mb-3 flex items-center gap-3">
                      <h2 className="font-[var(--font-display)] text-[20px] font-bold text-[var(--ink-800)]">{group.day}</h2>
                      <span className="h-px flex-1 bg-[var(--paper-200)]" />
                      <span className="text-[12px] text-[var(--ink-400)]">{group.items.length} 条</span>
                    </div>
                    <div className="grid gap-3">
                      {group.items.map((item) => (
                        <HistoryRow key={`${item.type}-${item.id}`} item={item} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-3 text-center">
      <div className="font-[var(--font-display)] text-[24px] font-black text-[var(--ink-800)]">{value}</div>
      <div className="text-[12px] font-semibold text-[var(--ink-500)]">{label}</div>
    </div>
  )
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const isSession = item.type === "session"
  const model = isSession ? item.model : "standard"
  const label = isSession ? MODEL_DISPLAY_NAMES[model] || model : "作文批改"
  const content = (
    <Card className="group h-full overflow-hidden border-[var(--paper-200)] bg-[var(--paper-50)] transition-all hover:border-[var(--ink-300)] hover:shadow-[var(--shadow-elevated)]">
      <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <div className="flex size-11 items-center justify-center rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--ink-50)] text-[var(--ink-700)]">
          {isSession ? (
            <ModelLogo modelKey={model as ModelKey} size="md" />
          ) : (
            <IconEssay className="size-5" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="line-clamp-1 font-[var(--font-display)] text-[17px] font-bold text-[var(--ink-800)]">
              {item.title}
            </h3>
            <Badge variant={isSession ? "paper" : "seal"}>{label}</Badge>
            {!isSession && item.score ? <Badge variant="paper">{item.score} 分</Badge> : null}
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-[1.6] text-[var(--ink-500)]">{item.preview}</p>
          <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--ink-400)]">
            <IconHistory className="size-3.5" aria-hidden="true" />
            {formatTime(item.createdAt)}
            {!isSession && item.writerStyle ? <span>· {item.writerStyle}</span> : null}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {isSession ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ink-700)]">
              继续
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          ) : (
            <IconChat className="size-4 text-[var(--ink-400)]" aria-hidden="true" />
          )}
        </div>
      </div>
    </Card>
  )

  if (!isSession) return content
  return (
    <Link href={item.href} prefetch={false} className="block rounded-[var(--radius-sharp)] outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)]">
      {content}
    </Link>
  )
}
