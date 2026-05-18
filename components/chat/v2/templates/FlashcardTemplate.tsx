/**
 * 🖌 v2 闪卡模板
 *
 * 翻面卡片：点击翻转看背面
 */

"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { ButtonV2 } from "@/components/ui/v2/button"
import { cn } from "@/lib/utils"
import type { FlashcardArtifact } from "../types"
import { IconHistory } from "@/components/icons/v2"

export interface FlashcardTemplateProps {
  artifact: FlashcardArtifact
  className?: string
}

export function FlashcardTemplate({ artifact, className }: FlashcardTemplateProps) {
  const [index, setIndex] = React.useState(0)
  const [flipped, setFlipped] = React.useState(false)

  if (!artifact.cards || artifact.cards.length === 0) {
    return (
      <p className="text-[14px] text-[var(--ink-500)]">未生成闪卡。</p>
    )
  }

  const current = artifact.cards[index]
  const total = artifact.cards.length

  function next() {
    setFlipped(false)
    setIndex((prev) => (prev + 1) % total)
  }
  function prev() {
    setFlipped(false)
    setIndex((prev) => (prev - 1 + total) % total)
  }

  return (
    <div
      data-slot="v2-flashcard-deck"
      className={cn(
        "w-full max-w-md mx-auto font-[var(--font-sans-v2)]",
        className
      )}
    >
      {/* 进度 */}
      <div className="mb-3 flex items-center justify-between text-[12px] text-[var(--ink-500)]">
        <span className="font-[var(--font-mono-v2)] tabular-nums">
          {index + 1} / {total}
        </span>
        <span>点击卡片翻面</span>
      </div>

      {/* 卡片 */}
      <button
        type="button"
        onClick={() => setFlipped((v) => !v)}
        className={cn(
          "relative block aspect-[3/2] w-full overflow-hidden",
          "rounded-[var(--radius-card)] border border-[var(--paper-200)]",
          "bg-white text-[var(--ink-900)]",
          "shadow-[var(--shadow-elevated)]",
          "transition-transform duration-500 ease-[var(--ease-paper-fold)]",
          "[transform-style:preserve-3d]",
          flipped && "[transform:rotateY(180deg)]"
        )}
        aria-label={flipped ? "卡片背面" : "卡片正面"}
      >
        {/* 正面 */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-6 [backface-visibility:hidden]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-500)]">
            题面
          </p>
          <p className="mt-3 font-[var(--font-display)] text-[22px] font-bold text-[var(--ink-800)] text-center">
            {current.front}
          </p>
          {current.hint ? (
            <p className="mt-3 text-[12px] text-[var(--ink-400)] italic">
              提示：{current.hint}
            </p>
          ) : null}
        </div>

        {/* 背面 */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-6 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-[var(--ink-50)]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--seal-500)]">
            答案
          </p>
          <p className="mt-3 font-[var(--font-display)] text-[20px] font-bold text-[var(--ink-800)] text-center leading-[1.5]">
            {current.back}
          </p>
        </div>
      </button>

      {/* 控制 */}
      <div className="mt-4 flex items-center justify-between">
        <ButtonV2 variant="ghost" size="sm" onClick={prev} aria-label="上一张">
          <ChevronLeft className="size-4" /> 上一张
        </ButtonV2>
        <ButtonV2
          variant="outline"
          size="sm"
          onClick={() => setFlipped((v) => !v)}
          aria-label="翻面"
        >
          <IconHistory className="size-3.5" />
          翻面
        </ButtonV2>
        <ButtonV2 variant="primary" size="sm" onClick={next} aria-label="下一张">
          下一张 <ChevronRight className="size-4" />
        </ButtonV2>
      </div>
    </div>
  )
}
