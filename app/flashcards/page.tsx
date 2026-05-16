"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import { ArrowLeft, CheckCircle2, Loader2, RotateCcw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ShareDialog } from "@/components/sharing/ShareDialog"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"

const SUBJECT_OPTIONS = [
  { value: "math", label: "数学" },
  { value: "english", label: "英语" },
  { value: "physics", label: "物理" },
  { value: "chemistry", label: "化学" },
  { value: "biology", label: "生物" },
  { value: "history", label: "历史" },
  { value: "geography", label: "地理" },
  { value: "politics", label: "政治" },
  { value: "other", label: "其他" },
]

type Flashcard = {
  id: string
  question: string
  answer: string
  difficulty?: number | null
  tags?: string[] | null
  subject?: string | null
}

type GeneratedDeck = {
  deck_name: string
  subject: string
  cards: Array<{
    question?: string
    answer?: string
    difficulty?: number
    tags?: string[]
    type?: string
  }>
  count: number
}

function MarkdownMath({ content }: { content: string }) {
  return (
    <div className="markdown-body max-w-none text-inherit [&_p:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-[#f7faf7] px-4 py-8 dark:bg-background">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="h-[360px] animate-pulse rounded-2xl border border-border/70 bg-muted/50" />
      </div>
    </main>
  )
}

function GenerateCardsPanel({ onGenerated }: { onGenerated: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState("")
  const [subject, setSubject] = useState("math")
  const [count, setCount] = useState(10)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lastGenerated, setLastGenerated] = useState<GeneratedDeck | null>(null)

  async function handleGenerate() {
    if (!notes.trim()) {
      setMessage("请先粘贴笔记内容")
      return
    }

    try {
      setSubmitting(true)
      setMessage(null)
      const response = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getVerifiedAuthHeaders()),
        },
        body: JSON.stringify({
          notes_content: notes,
          subject,
          card_count: count,
          difficulty_level: "basic",
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || "生成闪卡失败")
      setNotes("")
      setLastGenerated({
        deck_name: payload.deck_name || `${subject}-${new Date().toISOString().slice(0, 10)}`,
        subject,
        cards: Array.isArray(payload.cards) ? payload.cards : [],
        count: Number(payload.count || 0),
      })
      setMessage(`已生成 ${payload.count || 0} 张闪卡`)
      await onGenerated()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成闪卡失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-4 py-5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="flex items-center gap-2 font-semibold">
            <Sparkles className="size-5 text-emerald-600" />
            从笔记生成闪卡
          </span>
          <span className="text-sm text-muted-foreground">{open ? "收起" : "展开"}</span>
        </button>

        {open ? (
          <div className="space-y-4">
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={8000}
              rows={5}
              placeholder="粘贴你的笔记内容..."
              className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-emerald-500"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-emerald-500"
              >
                {SUBJECT_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <select
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-emerald-500"
              >
                {[5, 10, 15, 20].map((value) => (
                  <option key={value} value={value}>{value} 张</option>
                ))}
              </select>
            </div>
            <Button onClick={handleGenerate} disabled={submitting} className="min-h-11 w-full sm:w-auto">
              {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              生成闪卡
            </Button>
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            {lastGenerated ? (
              <ShareDialog
                title={lastGenerated.deck_name}
                contentType="flashcard_deck"
                contentData={{
                  deck_name: lastGenerated.deck_name,
                  total_cards: lastGenerated.count,
                  cards: lastGenerated.cards,
                }}
                description={`我用 AI 生成了 ${lastGenerated.count} 张复习闪卡，适合课后自测。`}
                subject={lastGenerated.subject}
                tags={["闪卡", "复习"]}
              />
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default function FlashcardsPage() {
  const [cards, setCards] = useState<Flashcard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [earnedXp, setEarnedXp] = useState(0)
  const [finished, setFinished] = useState(false)
  const [startedAt, setStartedAt] = useState(() => Date.now())

  const total = cards.length
  const currentCard = cards[index]
  const progress = total ? Math.round((reviewed / total) * 100) : 0

  const currentTags = useMemo(() => (currentCard?.tags || []).slice(0, 4), [currentCard])

  async function loadCards() {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch("/api/flashcards/due", {
        headers: await getVerifiedAuthHeaders(),
        cache: "no-store",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || "获取闪卡失败")
      setCards(payload.cards || [])
      setIndex(0)
      setFlipped(false)
      setReviewed(0)
      setCorrect(0)
      setEarnedXp(0)
      setFinished((payload.cards || []).length === 0)
      setStartedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取闪卡失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCards()
  }, [])

  async function recordSession(nextReviewed: number, nextCorrect: number) {
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    const response = await fetch("/api/user/progress", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await getVerifiedAuthHeaders()),
      },
      body: JSON.stringify({
        session_type: "flashcard",
        items_completed: nextReviewed,
        items_correct: nextCorrect,
        duration_seconds: durationSeconds,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (response.ok) setEarnedXp(payload.xp_earned || 0)
  }

  async function handleReview(quality: number) {
    if (!currentCard || reviewing) return
    try {
      setReviewing(true)
      const response = await fetch("/api/flashcards/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getVerifiedAuthHeaders()),
        },
        body: JSON.stringify({ card_id: currentCard.id, quality }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || "提交复习结果失败")

      const nextReviewed = reviewed + 1
      const nextCorrect = correct + (quality >= 3 ? 1 : 0)
      setReviewed(nextReviewed)
      setCorrect(nextCorrect)

      if (nextReviewed >= total) {
        await recordSession(nextReviewed, nextCorrect)
        setFinished(true)
        return
      }

      setIndex((value) => value + 1)
      setFlipped(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交复习结果失败")
    } finally {
      setReviewing(false)
    }
  }

  if (loading) return <LoadingState />

  return (
    <main className="min-h-screen bg-[#f7faf7] px-4 py-6 dark:bg-background sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/dashboard" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" />
              返回看板
            </Link>
            <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">闪卡复习</h1>
            <p className="mt-2 text-sm text-muted-foreground">翻开答案后，按真实记忆程度自评。</p>
          </div>
          <Button variant="outline" onClick={loadCards} className="w-fit">
            <RotateCcw className="mr-2 size-4" />
            刷新
          </Button>
        </header>

        {error ? (
          <Card className="rounded-2xl border-destructive/40">
            <CardContent className="py-5 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        {!finished && currentCard ? (
          <>
            <section className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>已完成 {reviewed} / 总共 {total} 张</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className="h-full rounded-full bg-blue-500 transition-[width] duration-300" style={{ width: `${progress}%` }} />
              </div>
            </section>

            <section className="mx-auto w-full max-w-lg">
              <button
                type="button"
                onClick={() => setFlipped(true)}
                className="card-container block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                aria-label={flipped ? "闪卡答案" : "点击卡片查看答案"}
              >
                <div className={`card-inner ${flipped ? "flipped" : ""}`}>
                  <div className="card-face card-front">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <div className="flex flex-wrap gap-2">
                        {currentTags.length ? currentTags.map((tag) => (
                          <span key={tag} className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{tag}</span>
                        )) : <span className="rounded-full bg-muted px-2 py-1">未标记</span>}
                      </div>
                      <span>{"★".repeat(currentCard.difficulty || 3)}{"☆".repeat(5 - (currentCard.difficulty || 3))}</span>
                    </div>
                    <div className="flex flex-1 items-center justify-center py-10 text-center text-2xl font-semibold leading-10">
                      <MarkdownMath content={currentCard.question} />
                    </div>
                    <p className="text-center text-sm text-muted-foreground">点击卡片查看答案</p>
                  </div>

                  <div className="card-face card-back">
                    <div className="flex flex-1 items-center justify-center py-10 text-center text-lg leading-8">
                      <MarkdownMath content={currentCard.answer} />
                    </div>
                    <p className="text-center text-sm text-muted-foreground">根据刚才的回忆情况选择</p>
                  </div>
                </div>
              </button>

              {flipped ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Button disabled={reviewing} onClick={() => handleReview(1)} className="min-h-12 bg-rose-500 hover:bg-rose-600">
                    😰 忘了
                  </Button>
                  <Button disabled={reviewing} onClick={() => handleReview(3)} className="min-h-12 bg-amber-500 hover:bg-amber-600">
                    🤔 模糊
                  </Button>
                  <Button disabled={reviewing} onClick={() => handleReview(5)} className="min-h-12 bg-emerald-600 hover:bg-emerald-700">
                    😊 记住了
                  </Button>
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <Card className="rounded-2xl">
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <CheckCircle2 className="size-7" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold">今日复习完成 🎉</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  复习了 {reviewed} 张，答对 {correct} 张，获得 {earnedXp} XP
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild>
                  <Link href="/dashboard">返回看板</Link>
                </Button>
                <Button variant="outline" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}>
                  生成新闪卡
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <GenerateCardsPanel onGenerated={loadCards} />
      </div>

      <style jsx>{`
        .card-container {
          perspective: 1000px;
        }
        .card-inner {
          position: relative;
          width: 100%;
          min-height: 340px;
          transition: transform 0.5s, scale 0.2s;
          transform-style: preserve-3d;
          scale: 1;
        }
        .card-container:hover .card-inner {
          scale: 1.02;
        }
        .card-inner.flipped {
          transform: rotateY(180deg);
        }
        .card-face {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          min-height: 340px;
          width: 100%;
          backface-visibility: hidden;
          border: 1px solid hsl(var(--border));
          border-radius: 1rem;
          background: hsl(var(--card));
          color: hsl(var(--card-foreground));
          box-shadow: 0 18px 45px rgba(15, 23, 42, 0.12);
          padding: 1.25rem;
        }
        .card-back {
          transform: rotateY(180deg);
        }
      `}</style>
    </main>
  )
}
