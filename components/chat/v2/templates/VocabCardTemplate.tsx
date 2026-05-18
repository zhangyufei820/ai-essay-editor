/**
 * 🖌 v2 词境记忆卡模板
 *
 * 视觉：单词卡片正面（朱印小章在右上）
 */

"use client"

import * as React from "react"
import { IconListen } from "@/components/icons/v2"
import { ButtonV2 } from "@/components/ui/v2/button"
import { SealStamp } from "@/components/ui/v2/seal"
import { cn } from "@/lib/utils"
import type { VocabCardArtifact } from "../types"

export interface VocabCardTemplateProps {
  artifact: VocabCardArtifact
  className?: string
  onPlayAudio?: () => void
}

export function VocabCardTemplate({
  artifact,
  className,
  onPlayAudio,
}: VocabCardTemplateProps) {
  return (
    <article
      data-slot="v2-vocab-card"
      className={cn(
        "relative w-full max-w-md overflow-hidden",
        "bg-[var(--paper-50)] border border-[var(--paper-200)]",
        "rounded-[var(--radius-card)] shadow-[var(--shadow-elevated)]",
        "font-[var(--font-sans-v2)]",
        className
      )}
    >
      {/* 朱印章 */}
      <div aria-hidden="true" className="absolute right-3 top-3">
        <SealStamp size="xs" rotate={6}>
          词
        </SealStamp>
      </div>

      <div className="px-6 pt-7 pb-6 text-center">
        {/* 单词 */}
        <h1 className="font-[var(--font-display)] text-[42px] font-black leading-tight text-[var(--ink-800)]">
          {artifact.word}
        </h1>

        {/* 音标 + 发音 */}
        {artifact.pronunciation ? (
          <div className="mt-1 flex items-center justify-center gap-2">
            <p className="font-[var(--font-mono-v2)] text-[14px] text-[var(--ink-500)]">
              /{artifact.pronunciation}/
            </p>
            {onPlayAudio ? (
              <ButtonV2
                variant="ghost"
                size="icon-sm"
                onClick={onPlayAudio}
                aria-label="播放发音"
              >
                <IconListen className="size-4" />
              </ButtonV2>
            ) : null}
          </div>
        ) : null}

        {/* 释义 */}
        {artifact.meaning ? (
          <div className="mt-5 rounded-[var(--radius-soft)] bg-[var(--ink-50)] px-4 py-3 text-left">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-500)]">
              释义
            </p>
            <p className="mt-1 text-[15px] leading-[1.7] text-[var(--ink-800)]">
              {artifact.meaning}
            </p>
          </div>
        ) : null}

        {/* 例句 */}
        {artifact.examples && artifact.examples.length > 0 ? (
          <div className="mt-4 text-left">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-500)]">
              例句
            </p>
            <ul className="mt-2 space-y-2">
              {artifact.examples.map((ex, idx) => (
                <li
                  key={idx}
                  className="rounded-[var(--radius-soft)] bg-[var(--paper-100)] px-3 py-2 text-[13px] leading-[1.7] text-[var(--ink-700)]"
                >
                  {ex}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* 记忆故事 */}
        {artifact.story ? (
          <div className="mt-4 rounded-[var(--radius-soft)] border border-dashed border-[var(--seal-300)] bg-[var(--seal-50)]/40 px-4 py-3 text-left">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--seal-500)]">
              记忆故事
            </p>
            <p className="mt-1 font-[var(--font-display)] text-[13px] leading-[1.7] text-[var(--ink-800)]">
              {artifact.story}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  )
}
