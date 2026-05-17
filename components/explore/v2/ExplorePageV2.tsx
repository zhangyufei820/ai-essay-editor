/**
 * 🖌 v2 创作广场入口页
 *
 * 视觉：作品长廊（masonry grid）+ hover 朱印浮现
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { Eye, Heart, MessageCircle, Share2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ButtonV2 } from "@/components/ui/v2/button"
import { BadgeV2 } from "@/components/ui/v2/badge"
import { CardV2 } from "@/components/ui/v2/card"
import { InkReveal, InkStagger, InkStaggerItem } from "@/components/motion/InkMotion"
import { SealStamp } from "@/components/ui/v2/seal"

export interface ExploreItem {
  id: string
  title: string
  type: string
  previewText?: string
  authorName?: string
  likeCount?: number
  viewCount?: number
  commentCount?: number
  shareCode?: string
  isFeatured?: boolean
}

export interface ExplorePageV2Props {
  items?: ExploreItem[]
  categories?: Array<{ key: string; label: string }>
  activeCategory?: string
  onCategoryChange?: (key: string) => void
  className?: string
}

export function ExplorePageV2({
  items = [],
  categories = [
    { key: "all", label: "全部" },
    { key: "essay", label: "作文" },
    { key: "flashcard", label: "闪卡" },
    { key: "image", label: "图像" },
    { key: "music", label: "音乐" },
  ],
  activeCategory = "all",
  onCategoryChange,
  className,
}: ExplorePageV2Props) {
  return (
    <div
      data-slot="v2-explore-page"
      className={cn("mx-auto w-full max-w-7xl px-4 py-10 md:px-6 md:py-16 font-[var(--font-sans-v2)]", className)}
    >
      <InkReveal as="header" className="mb-8">
        <h1 className="font-[var(--font-display)] text-[clamp(28px,5vw,40px)] font-black leading-[1.1] text-[var(--ink-800)]">
          创作广场
        </h1>
        <p className="mt-2 text-[15px] leading-[1.7] text-[var(--ink-600)]">
          发现大家用 AI 创作的作文批改、闪卡、图像和智能体对话。
        </p>
      </InkReveal>

      {/* 分类筛选 */}
      <InkReveal as="div" delay={0.06} className="mb-8 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => onCategoryChange?.(cat.key)}
            className={cn(
              "px-3 py-1.5 rounded-[var(--radius-pill)] text-[13px] font-medium transition-colors duration-150",
              activeCategory === cat.key
                ? "bg-[var(--ink-700)] text-white"
                : "bg-[var(--paper-100)] text-[var(--ink-600)] border border-[var(--paper-300)] hover:bg-[var(--ink-50)]"
            )}
          >
            {cat.label}
          </button>
        ))}
      </InkReveal>

      {/* 作品网格 */}
      {items.length === 0 ? (
        <div className="py-20 text-center text-[var(--ink-500)]">暂无内容</div>
      ) : (
        <InkStagger stagger={0.05} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <InkStaggerItem key={item.id}>
              <ExploreCard item={item} />
            </InkStaggerItem>
          ))}
        </InkStagger>
      )}
    </div>
  )
}

function ExploreCard({ item }: { item: ExploreItem }) {
  return (
    <Link
      href={`/share/${item.shareCode ?? item.id}`}
      prefetch={false}
      className="group block outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)] rounded-[var(--radius-sharp)]"
    >
      <CardV2 variant="paper" interactive className="relative h-full overflow-hidden">
        {/* 朱印悬浮 — hover 时出现 */}
        <div
          className="absolute right-3 top-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-10"
          aria-hidden="true"
        >
          <SealStamp size="xs" rotate={8} label="赞" />
        </div>

        {/* 精选标签 */}
        {item.isFeatured ? (
          <div className="absolute left-3 top-3 z-10">
            <BadgeV2 variant="seal">精选</BadgeV2>
          </div>
        ) : null}

        <div className="px-5 pt-5 pb-4">
          <BadgeV2 variant="paper" className="mb-3">{item.type}</BadgeV2>

          <h3 className="font-[var(--font-display)] text-[16px] font-bold leading-[1.4] text-[var(--ink-800)] line-clamp-2">
            {item.title}
          </h3>

          {item.previewText ? (
            <p className="mt-2 text-[13px] leading-[1.6] text-[var(--ink-600)] line-clamp-3">
              {item.previewText}
            </p>
          ) : null}

          {/* 底部 meta */}
          <div className="mt-4 flex items-center gap-4 text-[12px] text-[var(--ink-500)]">
            {item.authorName ? (
              <span className="font-medium">{item.authorName}</span>
            ) : null}
            <span className="flex items-center gap-1"><Eye className="size-3" />{item.viewCount ?? 0}</span>
            <span className="flex items-center gap-1"><Heart className="size-3" />{item.likeCount ?? 0}</span>
            <span className="flex items-center gap-1"><MessageCircle className="size-3" />{item.commentCount ?? 0}</span>
          </div>
        </div>
      </CardV2>
    </Link>
  )
}
