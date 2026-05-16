/**
 * 🖌 v2 错题诊断海报模板
 *
 * A4 比例（4:3）卡片：
 *   - 顶部标题 + 学生信息
 *   - 中央大圆环（弱点 TOP 3）
 *   - 下方训练计划清单
 *   - 底部"今日训练"朱印章
 */

"use client"

import * as React from "react"
import { Download, Share2, AlertTriangle } from "lucide-react"
import { ButtonV2 } from "@/components/ui/v2/button"
import { SealStamp } from "@/components/ui/v2/seal"
import { cn } from "@/lib/utils"
import type { WorksheetDiagnosisArtifact } from "../types"

export interface WorksheetPosterTemplateProps {
  artifact: WorksheetDiagnosisArtifact
  className?: string
  onDownload?: () => void
  onShare?: () => void
}

export function WorksheetPosterTemplate({
  artifact,
  className,
  onDownload,
  onShare,
}: WorksheetPosterTemplateProps) {
  const accuracy =
    artifact.totalQuestions && artifact.totalQuestions > 0
      ? Math.round(((artifact.totalQuestions - (artifact.wrongCount ?? 0)) / artifact.totalQuestions) * 100)
      : null

  return (
    <article
      data-slot="v2-worksheet-poster"
      className={cn(
        "relative w-full max-w-2xl overflow-hidden",
        "bg-[var(--paper-50)] text-[var(--ink-900)]",
        "border-2 border-[var(--ink-700)] rounded-[var(--radius-sharp)]",
        "shadow-[var(--shadow-elevated)]",
        "font-[var(--font-sans-v2)]",
        className
      )}
    >
      {/* 顶部 banner */}
      <header className="relative border-b-2 border-double border-[var(--ink-700)] px-6 py-5 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--ink-500)]">
          错题诊断海报
        </p>
        <h1 className="mt-1 font-[var(--font-display)] text-[26px] font-black leading-tight text-[var(--ink-800)] sm:text-[30px]">
          {[artifact.subject, artifact.grade].filter(Boolean).join(" · ") || "学习诊断"}
        </h1>
        {/* 朱印 */}
        <div aria-hidden="true" className="absolute right-3 top-3">
          <SealStamp size="sm" rotate={-8}>
            训练
          </SealStamp>
        </div>
      </header>

      {/* 数据栏 */}
      {(artifact.totalQuestions !== undefined || artifact.wrongCount !== undefined) ? (
        <section className="grid grid-cols-3 gap-2 border-b border-[var(--paper-200)] bg-[var(--paper-100)] px-6 py-5 text-center">
          <Stat label="总题数" value={artifact.totalQuestions ?? "—"} />
          <Stat label="错题" value={artifact.wrongCount ?? "—"} tone="seal" />
          <Stat label="正确率" value={accuracy != null ? `${accuracy}%` : "—"} tone="ink" />
        </section>
      ) : null}

      {/* 弱点 TOP */}
      {artifact.weakPoints && artifact.weakPoints.length > 0 ? (
        <section className="border-b border-[var(--paper-200)] px-6 py-6 sm:px-8">
          <h2 className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-800)] flex items-center gap-2">
            <AlertTriangle className="size-4 text-[var(--seal-500)]" aria-hidden="true" />
            薄弱点 TOP {artifact.weakPoints.length}
          </h2>
          <ul className="mt-4 space-y-2">
            {artifact.weakPoints.slice(0, 5).map((wp, idx) => (
              <li
                key={idx}
                className="flex items-baseline gap-3 rounded-[var(--radius-soft)] bg-[var(--seal-50)]/60 px-3 py-2.5"
              >
                <span className="font-[var(--font-mono-v2)] text-[12px] font-bold text-[var(--seal-500)]">
                  #{idx + 1}
                </span>
                <span className="flex-1 font-[var(--font-display)] text-[15px] font-bold text-[var(--ink-800)]">
                  {wp.topic}
                </span>
                <span className="font-[var(--font-mono-v2)] text-[12px] text-[var(--seal-500)]">
                  错 {wp.wrongOf}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 训练计划 */}
      {artifact.trainingPlan && artifact.trainingPlan.length > 0 ? (
        <section className="border-b border-[var(--paper-200)] px-6 py-6 sm:px-8">
          <h2 className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-800)]">
            今日训练计划
          </h2>
          <ul className="mt-4 space-y-3">
            {artifact.trainingPlan.map((plan, idx) => (
              <li key={idx}>
                <h3 className="font-[var(--font-display)] text-[14px] font-bold text-[var(--ink-700)]">
                  {idx + 1}. {plan.topic}
                </h3>
                <ul className="mt-1.5 space-y-1 pl-4">
                  {plan.tasks.map((task, ti) => (
                    <li
                      key={ti}
                      className="text-[13px] leading-[1.7] text-[var(--ink-600)] before:content-['·'] before:mr-2 before:text-[var(--ink-300)]"
                    >
                      {task}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 工具栏 */}
      <footer className="flex flex-wrap items-center gap-2 px-6 py-4 bg-[var(--paper-100)]">
        <ButtonV2 variant="seal" size="sm" onClick={onDownload}>
          <Download className="size-3.5" aria-hidden="true" />
          下载海报
        </ButtonV2>
        <ButtonV2 variant="outline" size="sm" onClick={onShare}>
          <Share2 className="size-3.5" aria-hidden="true" />
          分享给家长
        </ButtonV2>
      </footer>

      <div className="absolute bottom-2 right-3 font-[var(--font-display)] text-[10px] text-[var(--ink-300)] tracking-widest">
        沈翔智学
      </div>
    </article>
  )
}

function Stat({
  label,
  value,
  tone = "ink",
}: {
  label: string
  value: string | number
  tone?: "ink" | "seal"
}) {
  return (
    <div>
      <div
        className={cn(
          "font-[var(--font-mono-v2)] text-[24px] font-bold tabular-nums sm:text-[28px]",
          tone === "ink" ? "text-[var(--ink-800)]" : "text-[var(--seal-500)]"
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-[var(--ink-500)]">
        {label}
      </div>
    </div>
  )
}
