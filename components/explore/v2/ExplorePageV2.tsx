"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Eye, Heart, MessageCircle, RefreshCw, Share2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { ButtonV2 } from "@/components/ui/v2/button"
import { BadgeV2 } from "@/components/ui/v2/badge"
import { CardV2, CardV2Content } from "@/components/ui/v2/card"
import { LoadingStateV2 } from "@/components/ui/v2/loading-state"

export interface ExploreItem {
  id: string
  title: string
  content_type?: string
  type_label?: string
  preview_text?: string
  previewText?: string
  thumbnail_url?: string | null
  authorName?: string
  like_count?: number
  likeCount?: number
  view_count?: number
  viewCount?: number
  comment_count?: number
  commentCount?: number
  share_code?: string
  shareCode?: string
  is_featured?: boolean
  isFeatured?: boolean
  created_at?: string | null
}

type SortKey = "latest" | "popular" | "featured"

const CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "essay_review", label: "作文批改" },
  { key: "image", label: "图像" },
  { key: "flashcard_deck", label: "闪卡" },
  { key: "agent_conversation", label: "智能体对话" },
  { key: "conversation", label: "AI 对话" },
]

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "latest", label: "最新" },
  { key: "popular", label: "热门" },
  { key: "featured", label: "精选" },
]

export function ExplorePageV2({ className }: { className?: string }) {
  const [items, setItems] = React.useState<ExploreItem[]>([])
  const [activeCategory, setActiveCategory] = React.useState("all")
  const [sort, setSort] = React.useState<SortKey>("latest")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  const loadItems = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({
        category: activeCategory,
        sort,
        pageSize: "18",
      })
      const response = await fetch(`/api/explore?${params.toString()}`, { cache: "no-store" })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result?.error || "创作广场加载失败")
      }
      setItems(Array.isArray(result.items) ? result.items : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "创作广场加载失败")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [activeCategory, sort])

  React.useEffect(() => {
    loadItems()
  }, [loadItems])

  return (
    <div
      data-slot="v2-explore-page"
      className={cn("mx-auto w-full max-w-7xl px-4 py-10 md:px-6 md:py-14 font-[var(--font-sans-v2)]", className)}
    >
      <header className="mb-8 grid gap-6 rounded-[var(--radius-sharp)] border border-[var(--ink-200)] bg-[linear-gradient(180deg,var(--ink-50),var(--paper-50))] p-5 shadow-[0_22px_70px_rgba(16,55,35,0.10)] md:grid-cols-[1fr_auto] md:p-7">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--ink-200)] bg-[var(--paper-50)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-700)]">
            <Sparkles className="size-3.5" aria-hidden="true" />
            创作广场
          </span>
          <h1 className="mt-4 font-[var(--font-display)] text-[clamp(30px,5vw,46px)] font-black leading-[1.08] text-[var(--ink-900)]">
            看见真实作品，
            <br className="hidden sm:block" />
            也把你的创作放进广场。
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-[1.8] text-[var(--ink-600)] sm:text-[16px]">
            这里汇总公开分享的作文批改、图像作品、闪卡和智能体对话。作品来自用户真实创作，不再是空白占位页。
          </p>
        </div>
        <div className="flex items-end gap-3 md:flex-col md:justify-end">
          <ButtonV2 asChild size="lg">
            <Link href="/agents">
              去智能体广场
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </ButtonV2>
          <ButtonV2 asChild variant="outline">
            <Link href="/chat/gpt-image-2">
              开始创作
            </Link>
          </ButtonV2>
        </div>
      </header>

      <div className="mb-6 flex flex-col gap-3 border-b border-[var(--paper-200)] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                "rounded-[var(--radius-pill)] border px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150",
                activeCategory === cat.key
                  ? "border-[var(--ink-700)] bg-[var(--ink-700)] text-white"
                  : "border-[var(--paper-300)] bg-[var(--paper-100)] text-[var(--ink-600)] hover:border-[var(--ink-300)] hover:bg-[var(--ink-50)]"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {SORTS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSort(item.key)}
              className={cn(
                "rounded-[var(--radius-pill)] px-3 py-1.5 text-[13px] font-semibold transition-colors",
                sort === item.key
                  ? "bg-[var(--paper-100)] text-[var(--ink-800)] shadow-[inset_0_0_0_1px_var(--ink-300)]"
                  : "text-[var(--ink-500)] hover:bg-[var(--paper-100)]"
              )}
            >
              {item.label}
            </button>
          ))}
          <ButtonV2 variant="ghost" size="icon-sm" onClick={loadItems} aria-label="刷新创作广场">
            <RefreshCw className="size-4" aria-hidden="true" />
          </ButtonV2>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center">
          <LoadingStateV2 label="正在读取创作广场..." />
        </div>
      ) : error ? (
        <EmptyExploreState title="创作广场暂时无法加载" description={error} actionLabel="重新加载" onAction={loadItems} />
      ) : items.length === 0 ? (
        <EmptyExploreState
          title="这个分类还没有公开作品"
          description="你可以从智能体对话或图像创作中分享作品，发布后会出现在这里。"
          actionLabel="去创作"
          href="/agents"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <ExploreCard key={item.id} item={item} featured={index === 0 || Boolean(item.is_featured || item.isFeatured)} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyExploreState({
  title,
  description,
  actionLabel,
  href,
  onAction,
}: {
  title: string
  description: string
  actionLabel: string
  href?: string
  onAction?: () => void
}) {
  const action = href ? (
    <ButtonV2 asChild>
      <Link href={href}>{actionLabel}</Link>
    </ButtonV2>
  ) : (
    <ButtonV2 onClick={onAction}>{actionLabel}</ButtonV2>
  )

  return (
    <div className="grid min-h-[360px] place-items-center rounded-[var(--radius-sharp)] border border-dashed border-[var(--ink-200)] bg-[var(--ink-50)] p-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-[var(--radius-soft)] border border-[var(--ink-200)] bg-[var(--paper-50)] text-[var(--ink-700)]">
          <Share2 className="size-5" aria-hidden="true" />
        </div>
        <h2 className="font-[var(--font-display)] text-[22px] font-bold text-[var(--ink-800)]">{title}</h2>
        <p className="mt-2 text-[14px] leading-[1.7] text-[var(--ink-500)]">{description}</p>
        <div className="mt-5">{action}</div>
      </div>
    </div>
  )
}

function ExploreCard({ item, featured }: { item: ExploreItem; featured: boolean }) {
  const shareCode = item.share_code || item.shareCode || item.id
  const label = item.type_label || item.content_type || "学习作品"
  const preview = item.preview_text || item.previewText || "这份作品尚未生成摘要。"
  const viewCount = item.view_count ?? item.viewCount ?? 0
  const likeCount = item.like_count ?? item.likeCount ?? 0
  const commentCount = item.comment_count ?? item.commentCount ?? 0
  const createdAt = item.created_at ? new Date(item.created_at).toLocaleDateString("zh-CN") : ""

  return (
    <Link
      href={`/share/${shareCode}`}
      prefetch={false}
      className="group block h-full rounded-[var(--radius-sharp)] outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)]"
    >
      <CardV2 variant="paper" interactive className={cn("h-full overflow-hidden", featured ? "border-[var(--ink-300)]" : "")}>
        {item.thumbnail_url ? (
          <div className="relative aspect-[16/10] overflow-hidden border-b border-[var(--paper-200)] bg-[var(--paper-100)]">
            <Image
              src={item.thumbnail_url}
              alt={item.title}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          </div>
        ) : null}
        <CardV2Content className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <BadgeV2 variant={featured ? "seal" : "paper"}>{featured ? "精选" : label}</BadgeV2>
            {createdAt ? <span className="text-[12px] text-[var(--ink-400)]">{createdAt}</span> : null}
          </div>
          <div>
            <h3 className="line-clamp-2 font-[var(--font-display)] text-[18px] font-bold leading-[1.35] text-[var(--ink-800)]">
              {item.title || "未命名作品"}
            </h3>
            <p className="mt-2 line-clamp-3 text-[13px] leading-[1.7] text-[var(--ink-500)]">
              {preview}
            </p>
          </div>
          <div className="mt-auto flex items-center gap-4 text-[12px] text-[var(--ink-500)]">
            <span className="flex items-center gap-1"><Eye className="size-3" aria-hidden="true" />{viewCount}</span>
            <span className="flex items-center gap-1"><Heart className="size-3" aria-hidden="true" />{likeCount}</span>
            <span className="flex items-center gap-1"><MessageCircle className="size-3" aria-hidden="true" />{commentCount}</span>
            <span className="ml-auto flex items-center gap-1 font-semibold text-[var(--ink-700)]">
              查看
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </div>
        </CardV2Content>
      </CardV2>
    </Link>
  )
}
