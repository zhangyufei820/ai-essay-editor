/**
 * 🖌 v2 闪卡复习入口页
 *
 * 视觉：
 *   - 今日待复习数 + 已掌握数（朱印章数字）
 *   - "开始复习" CTA → 进入 FlashcardTemplate 翻卡流程
 *   - "生成新卡片" → 跳到 /chat/vocab-card
 *   - 底部成就进度条
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { Plus } from "lucide-react"
import { IconEnglish, IconHistory } from "@/components/icons/v2"
import { cn } from "@/lib/utils"
import { ButtonV2 } from "@/components/ui/v2/button"
import { CardV2, CardV2Content } from "@/components/ui/v2/card"
import { ProgressV2 } from "@/components/ui/v2/progress"
import { SealStamp } from "@/components/ui/v2/seal"
import { InkReveal, InkStagger, InkStaggerItem } from "@/components/motion/InkMotion"

export interface FlashcardsPageV2Props {
  /** 今日待复习数 */
  dueCount?: number
  /** 已掌握总数 */
  masteredCount?: number
  /** 总卡片数 */
  totalCount?: number
  /** 今日已复习 */
  todayReviewed?: number
  /** 连续复习天数 */
  streakDays?: number
  /** 开始复习回调 */
  onStartReview?: () => void
  className?: string
}

export function FlashcardsPageV2({
  dueCount = 0,
  masteredCount = 0,
  totalCount = 0,
  todayReviewed = 0,
  streakDays = 0,
  onStartReview,
  className,
}: FlashcardsPageV2Props) {
  const masteryPercent = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0

  return (
    <div
      data-slot="v2-flashcards-page"
      className={cn(
        "mx-auto w-full max-w-3xl px-4 py-10 md:py-16",
        "font-[var(--font-sans-v2)]",
        className
      )}
    >
      {/* 页面标题 */}
      <InkReveal as="header" className="mb-10">
        <h1 className="font-[var(--font-display)] text-[clamp(28px,5vw,40px)] font-black leading-[1.1] text-[var(--ink-800)]">
          闪卡复习
        </h1>
        <p className="mt-2 text-[15px] leading-[1.7] text-[var(--ink-600)]">
          间隔重复法帮你把知识点从短期记忆推到长期记忆。
        </p>
      </InkReveal>

      {/* 数据卡三联 */}
      <InkStagger stagger={0.08} className="grid gap-4 sm:grid-cols-3 mb-10">
        <InkStaggerItem>
          <StatCard
            label="今日待复习"
            value={dueCount}
            icon={<IconHistory className="size-4" />}
            tone="seal"
          />
        </InkStaggerItem>
        <InkStaggerItem>
          <StatCard
            label="已掌握"
            value={masteredCount}
            icon={<IconEnglish className="size-4" />}
            tone="ink"
          />
        </InkStaggerItem>
        <InkStaggerItem>
          <StatCard
            label="连续复习"
            value={`${streakDays} 天`}
            icon={
              <SealStamp size="xs" rotate={-3} className="size-6">
                {streakDays}
              </SealStamp>
            }
            tone="ink"
          />
        </InkStaggerItem>
      </InkStagger>

      {/* 掌握进度 */}
      <InkReveal as="div" delay={0.1} className="mb-10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-semibold text-[var(--ink-700)]">
            总体掌握度
          </span>
          <span className="font-[var(--font-mono-v2)] text-[13px] font-bold text-[var(--ink-800)] tabular-nums">
            {masteryPercent}%
          </span>
        </div>
        <ProgressV2 value={masteryPercent} />
        <p className="mt-2 text-[12px] text-[var(--ink-500)]">
          已掌握 {masteredCount} / 总计 {totalCount} 张卡片
        </p>
      </InkReveal>

      {/* CTA 双按钮 */}
      <InkReveal as="div" delay={0.14} className="flex flex-wrap gap-3 justify-center">
        <ButtonV2
          variant="seal"
          size="lg"
          onClick={onStartReview}
          disabled={dueCount === 0}
          className="min-w-[180px]"
        >
          <IconHistory className="size-4" />
          {dueCount > 0 ? `开始复习 (${dueCount})` : "今日已完成"}
        </ButtonV2>

        <ButtonV2 asChild variant="outline" size="lg">
          <Link href="/chat/vocab-card" prefetch={false}>
            <Plus className="size-4" />
            生成新卡片
          </Link>
        </ButtonV2>
      </InkReveal>

      {/* 今日统计 */}
      {todayReviewed > 0 ? (
        <InkReveal as="div" delay={0.18} className="mt-8 text-center">
          <p className="text-[13px] text-[var(--ink-500)]">
            今日已复习 <span className="font-[var(--font-mono-v2)] font-bold text-[var(--ink-800)]">{todayReviewed}</span> 张卡片
          </p>
        </InkReveal>
      ) : null}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  tone = "ink",
}: {
  label: string
  value: string | number
  icon?: React.ReactNode
  tone?: "ink" | "seal"
}) {
  return (
    <CardV2 variant="paper" className="text-center">
      <CardV2Content className="flex flex-col items-center gap-2 py-6">
        <div className={cn(
          "flex size-10 items-center justify-center rounded-full",
          tone === "seal" ? "bg-[var(--seal-50)] text-[var(--seal-500)]" : "bg-[var(--ink-50)] text-[var(--ink-700)]"
        )}>
          {icon}
        </div>
        <div className={cn(
          "font-[var(--font-mono-v2)] text-[28px] font-bold tabular-nums",
          tone === "seal" ? "text-[var(--seal-500)]" : "text-[var(--ink-800)]"
        )}>
          {value}
        </div>
        <div className="text-[12px] text-[var(--ink-500)]">{label}</div>
      </CardV2Content>
    </CardV2>
  )
}
