/**
 * 🖌 v2 作文批改稿模板
 *
 * 视觉灵感：印刷批改稿
 *   - 顶部宋体大标题
 *   - 朱印评分章
 *   - 段落带"问题 / 建议 / 训练"三段式
 *   - 底部行动栏：复制 / 导出 PDF / 分享 / 继续追问
 */

"use client"

import * as React from "react"
import { Sparkles } from "lucide-react"
import { IconCopy, IconExportPdf, IconFollowup, IconShare } from "@/components/icons/v2"
import { ButtonV2 } from "@/components/ui/v2/button"
import { ScoreSeal, SealStamp } from "@/components/ui/v2/seal"
import { EnhancedMarkdown } from "@/components/chat/EnhancedMarkdown"
import { cleanLLMText } from "@/lib/text-sanitizer"
import { cn } from "@/lib/utils"
import type { EssayReviewArtifact } from "../types"

export interface EssayReviewTemplateProps {
  artifact: EssayReviewArtifact
  className?: string
  onCopy?: () => void
  onExportPDF?: () => void
  onShare?: () => void
  onAskFollowup?: () => void
}

export function EssayReviewTemplate({
  artifact,
  className,
  onCopy,
  onExportPDF,
  onShare,
  onAskFollowup,
}: EssayReviewTemplateProps) {
  return (
    <article
      data-slot="v2-essay-review"
      className={cn(
        "relative w-full max-w-3xl overflow-hidden",
        "bg-white text-[var(--ink-900)]",
        "border border-[var(--paper-200)] rounded-[var(--radius-sharp)]",
        "shadow-[var(--shadow-paper)]",
        "font-[var(--font-sans-v2)]",
        className
      )}
    >
      {/* 顶部 Banner */}
      <header className="relative border-b-2 border-double border-[var(--ink-700)] bg-[var(--paper-50)] px-6 py-5 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--ink-500)]">
          作文批改报告
        </p>
        <h1 className="mt-1 font-[var(--font-display)] text-[28px] font-black leading-tight text-[var(--ink-800)] sm:text-[32px]">
          {artifact.title}
        </h1>
        {(artifact.grade || artifact.wordCount) ? (
          <p className="mt-1 text-[12px] text-[var(--ink-500)]">
            {[
              artifact.grade,
              typeof artifact.wordCount === "number" ? `${artifact.wordCount} 字` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}

        {/* 角落朱印 "已批阅" */}
        <div
          aria-hidden="true"
          className="absolute right-3 top-3"
        >
          <SealStamp size="sm" rotate={-8}>
            已批阅
          </SealStamp>
        </div>
      </header>

      {/* 评分大章 */}
      {artifact.score ? (
        <section className="border-b border-[var(--paper-200)] px-6 py-6 sm:px-8 sm:py-8 flex items-center gap-6">
          <ScoreSeal
            score={artifact.score.value.toFixed(1)}
            total={artifact.score.total}
            size={92}
          />
          <div>
            <h2 className="font-[var(--font-display)] text-[16px] font-bold text-[var(--ink-800)] sm:text-[18px]">
              评分总览
            </h2>
            {artifact.summary ? (
              <p className="mt-2 text-[14px] leading-[1.7] text-[var(--ink-700)]">
                {artifact.summary}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 问题诊断 */}
      {artifact.diagnosis && artifact.diagnosis.length > 0 ? (
        <section className="border-b border-[var(--paper-200)] px-6 py-6 sm:px-8 sm:py-8">
          <h2 className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-800)]">
            一、问题诊断
          </h2>
          <ul className="mt-4 space-y-3">
            {artifact.diagnosis.map((item, idx) => (
              <li
                key={idx}
                className="rounded-[var(--radius-soft)] bg-[var(--paper-100)] p-4"
              >
                <h3 className="font-[var(--font-display)] text-[15px] font-bold text-[var(--ink-800)]">
                  {idx + 1}. {item.title}
                </h3>
                <p className="mt-1 text-[14px] leading-[1.7] text-[var(--ink-700)]">
                  {item.detail}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 修改建议 + 训练任务 */}
      {(artifact.suggestions?.length || artifact.trainingTasks?.length) ? (
        <section className="grid gap-6 border-b border-[var(--paper-200)] px-6 py-6 sm:grid-cols-2 sm:px-8 sm:py-8 sm:gap-8">
          {artifact.suggestions?.length ? (
            <div>
              <h2 className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-800)]">
                二、修改建议
              </h2>
              <ul className="mt-4 space-y-2">
                {artifact.suggestions.map((s, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-[14px] leading-[1.7] text-[var(--ink-700)]">
                    <Sparkles className="mt-0.5 size-3 shrink-0 text-[var(--seal-500)]" aria-hidden="true" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {artifact.trainingTasks?.length ? (
            <div>
              <h2 className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-800)]">
                三、今日训练
              </h2>
              <ul className="mt-4 space-y-2">
                {artifact.trainingTasks.map((t, idx) => (
                  <li
                    key={idx}
                    className="rounded-[var(--radius-soft)] bg-[var(--seal-50)]/60 px-3 py-2 text-[14px] leading-[1.7] text-[var(--seal-600)]"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 终稿 */}
      {artifact.finalDraft ? (
        <section className="border-b border-[var(--paper-200)] px-6 py-6 sm:px-8 sm:py-8">
          <h2 className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-800)]">
            四、修改后定稿
          </h2>
          <div className="mt-4 whitespace-pre-line rounded-[var(--radius-soft)] bg-[var(--paper-100)] p-4 text-[15px] leading-[1.9] text-[var(--ink-800)]">
            {artifact.finalDraft}
          </div>
        </section>
      ) : null}

      {/* 完整模型返回 */}
      {artifact.rawMarkdown ? (
        <section className="border-b border-[var(--paper-200)] px-6 py-6 sm:px-8 sm:py-8">
          <h2 className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-800)]">
            完整批改内容
          </h2>
          <div className="mt-4 rounded-[var(--radius-soft)] bg-[var(--paper-50)] px-4 py-3">
            <EnhancedMarkdown content={cleanLLMText(artifact.rawMarkdown)} />
          </div>
        </section>
      ) : null}

      {/* 工具栏 */}
      <footer className="flex flex-wrap items-center gap-2 px-6 py-4 sm:px-8 bg-[var(--paper-50)]">
        <ButtonV2 variant="ghost" size="sm" onClick={onCopy}>
          <IconCopy className="size-3.5" aria-hidden="true" /> 复制
        </ButtonV2>
        <ButtonV2 variant="seal" size="sm" onClick={onExportPDF}>
          <IconExportPdf className="size-3.5" aria-hidden="true" /> 导出 PDF
        </ButtonV2>
        <ButtonV2 variant="outline" size="sm" onClick={onShare}>
          <IconShare className="size-3.5" aria-hidden="true" /> 分享
        </ButtonV2>
        {onAskFollowup ? (
          <ButtonV2 variant="ghost" size="sm" onClick={onAskFollowup}>
            <IconFollowup className="size-3.5" aria-hidden="true" /> 继续追问
          </ButtonV2>
        ) : null}
      </footer>

      {/* 底部水印 */}
      <div className="absolute bottom-2 right-3 font-[var(--font-display)] text-[10px] text-[var(--ink-300)] tracking-widest">
        沈翔智学
      </div>
    </article>
  )
}
