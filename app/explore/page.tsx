"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Compass, Loader2, Plus, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ContentCard, type ContentCardShare } from "@/components/sharing/ContentCard"

const CATEGORIES = [
  ["all", "全部"],
  ["essay_review", "作文批改"],
  ["image", "AI 绘画"],
  ["flashcard_deck", "闪卡集"],
  ["manim_video", "数学动画"],
  ["ppt_summary", "PPT"],
  ["agent_conversation", "智能体"],
  ["quiz_result", "练习"],
] as const

const SORTS = [
  ["latest", "最新"],
  ["popular", "最热"],
  ["featured", "精选"],
] as const

export default function ExplorePage() {
  const [category, setCategory] = useState("all")
  const [sort, setSort] = useState("latest")
  const [items, setItems] = useState<ContentCardShare[]>([])
  const [leaderboard, setLeaderboard] = useState<ContentCardShare[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [listResponse, leaderboardResponse] = await Promise.all([
        fetch(`/api/explore?category=${category}&sort=${sort}`, { cache: "no-store" }),
        fetch("/api/explore/leaderboard?period=week", { cache: "no-store" }),
      ])
      const listPayload = await listResponse.json().catch(() => ({}))
      const leaderboardPayload = await leaderboardResponse.json().catch(() => ({}))
      if (!listResponse.ok) throw new Error(listPayload?.error || "创作广场暂不可用")
      setItems(listPayload.items || [])
      setLeaderboard(leaderboardPayload.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "创作广场暂不可用")
    } finally {
      setLoading(false)
    }
  }, [category, sort])

  useEffect(() => {
    load()
  }, [load])

  return (
    <main className="min-h-screen bg-[#f7faf7] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><Compass className="size-4" />创作广场</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal sm:text-3xl">发现大家的 AI 学习作品</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">浏览作文批改、AI 图像、闪卡、智能体对话等优质作品，也可以把自己的成果分享出来。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/my/shares">我的分享</Link>
            </Button>
            <Button asChild>
              <Link href="/chat">
                <Plus className="mr-2 size-4" />
                创作并分享
              </Link>
            </Button>
          </div>
        </header>

        <section className="flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setCategory(value)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm transition ${category === value ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200"}`}
            >
              {label}
            </button>
          ))}
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-full border border-slate-200 bg-white p-1">
            {SORTS.map(([value, label]) => (
              <button
                key={value}
                onClick={() => setSort(value)}
                className={`rounded-full px-4 py-2 text-sm transition ${sort === value ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {leaderboard.length ? (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Trophy className="size-4 text-amber-500" />
              本周热门：<Link className="font-medium text-emerald-700 hover:underline" href={`/share/${leaderboard[0].share_code}`}>{leaderboard[0].title}</Link>
            </div>
          ) : null}
        </section>

        {loading ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-slate-500">
            <Loader2 className="mr-2 size-5 animate-spin" />
            加载作品中
          </div>
        ) : null}

        {!loading && error ? (
          <div className="rounded-xl border border-rose-200 bg-white p-6 text-rose-600">{error}</div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <p className="font-medium text-slate-900">还没有作品</p>
            <p className="mt-2 text-sm text-slate-600">从聊天、闪卡或图片生成页面分享第一个作品。</p>
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => <ContentCard key={item.share_code} share={item} />)}
        </section>
      </div>
    </main>
  )
}
