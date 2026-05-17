/**
 * 🖌 v2 拍卷诊断入口页
 *
 * 视觉：
 *   - 大标题（宋体）"上传试卷，看见薄弱点"
 *   - 居中上传区（虚线边框 + 拖拽 + 点击）
 *   - 底部"开始诊断"朱印按钮
 *   - 结果用 WorksheetPosterTemplate 渲染（已在 PR5 实现）
 */

"use client"

import * as React from "react"
import { Camera, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { ButtonV2 } from "@/components/ui/v2/button"
import { InkReveal } from "@/components/motion/InkMotion"

export interface DiagnosisPageV2Props {
  /** 上传回调（交给业务侧） */
  onUpload?: (files: FileList) => void
  /** 开始诊断 */
  onAnalyze?: () => void
  /** 当前已上传文件 */
  files?: Array<{ name: string; previewUrl?: string }>
  /** 诊断中 */
  isAnalyzing?: boolean
  /** 选择的科目 */
  subject?: string
  onSubjectChange?: (subject: string) => void
  /** 选择的年级 */
  grade?: string
  onGradeChange?: (grade: string) => void
  className?: string
}

const SUBJECTS = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "政治"]
const GRADES = ["小学", "初一", "初二", "初三", "高一", "高二", "高三"]

export function DiagnosisPageV2({
  onUpload,
  onAnalyze,
  files = [],
  isAnalyzing,
  subject,
  onSubjectChange,
  grade,
  onGradeChange,
  className,
}: DiagnosisPageV2Props) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files.length > 0) {
      onUpload?.(e.dataTransfer.files)
    }
  }

  return (
    <div
      data-slot="v2-diagnosis-page"
      className={cn(
        "mx-auto w-full max-w-3xl px-4 py-10 md:py-16",
        "font-[var(--font-sans-v2)]",
        className
      )}
    >
      <InkReveal as="header" className="mb-10 text-center">
        <h1 className="font-[var(--font-display)] text-[clamp(28px,5vw,44px)] font-black leading-[1.1] text-[var(--ink-800)]">
          上传试卷，看见薄弱点
        </h1>
        <p className="mt-3 text-[15px] leading-[1.7] text-[var(--ink-600)] max-w-xl mx-auto">
          拍照上传试卷图片（最多 9 张），AI 归因错题并生成训练建议海报。
        </p>
      </InkReveal>

      {/* 科目 + 年级选择 */}
      <InkReveal as="div" delay={0.08} className="mb-6 flex flex-wrap items-center justify-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--ink-500)]">科目</span>
          <div className="flex flex-wrap gap-1.5">
            {SUBJECTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSubjectChange?.(s)}
                className={cn(
                  "px-2.5 py-1 rounded-[var(--radius-pill)] text-[12px] font-medium transition-colors duration-150",
                  subject === s
                    ? "bg-[var(--ink-700)] text-white"
                    : "bg-[var(--paper-100)] text-[var(--ink-600)] border border-[var(--paper-300)] hover:bg-[var(--ink-50)]"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--ink-500)]">年级</span>
          <div className="flex flex-wrap gap-1.5">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onGradeChange?.(g)}
                className={cn(
                  "px-2.5 py-1 rounded-[var(--radius-pill)] text-[12px] font-medium transition-colors duration-150",
                  grade === g
                    ? "bg-[var(--ink-700)] text-white"
                    : "bg-[var(--paper-100)] text-[var(--ink-600)] border border-[var(--paper-300)] hover:bg-[var(--ink-50)]"
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </InkReveal>

      {/* 上传区 */}
      <InkReveal as="div" delay={0.12}>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-4",
            "min-h-[240px] rounded-[var(--radius-card)]",
            "border-2 border-dashed border-[var(--ink-300)]/50",
            "bg-[var(--paper-100)]/60",
            "transition-colors duration-200",
            "hover:border-[var(--ink-500)] hover:bg-[var(--ink-50)]/40"
          )}
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-[var(--ink-50)] text-[var(--ink-700)]">
            {files.length > 0 ? (
              <Camera className="size-6" />
            ) : (
              <Upload className="size-6" />
            )}
          </div>
          <div className="text-center">
            <p className="font-[var(--font-display)] text-[16px] font-bold text-[var(--ink-700)]">
              {files.length > 0
                ? `已选 ${files.length} 张图片`
                : "点击上传或拖入试卷图片"}
            </p>
            <p className="mt-1 text-[12px] text-[var(--ink-500)]">
              支持 JPG / PNG / PDF · 最多 9 张 · 单张不超过 10MB
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onUpload?.(e.target.files)
              }
            }}
          />
        </div>

        {/* 已上传预览 */}
        {files.length > 0 ? (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {files.map((f, idx) => (
              <div
                key={idx}
                className="relative aspect-square overflow-hidden rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)]"
              >
                {f.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.previewUrl} alt={f.name} className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-[11px] text-[var(--ink-500)]">
                    {f.name.slice(0, 8)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </InkReveal>

      {/* 开始诊断 */}
      <InkReveal as="div" delay={0.16} className="mt-8 text-center">
        <ButtonV2
          variant="seal"
          size="lg"
          onClick={onAnalyze}
          disabled={files.length === 0 || isAnalyzing}
          className="min-w-[200px]"
        >
          {isAnalyzing ? "诊断中..." : "开始诊断"}
        </ButtonV2>
        <p className="mt-3 text-[12px] text-[var(--ink-400)]">
          约 45 秒 · 结果可下载为训练海报
        </p>
      </InkReveal>
    </div>
  )
}
