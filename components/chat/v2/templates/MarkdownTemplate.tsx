/**
 * 🖌 v2 默认 Markdown 模板
 *
 * 通用 fallback：把任何文本/markdown 包到一份"批改稿样式"中。
 * 实际渲染交给现有 EnhancedMarkdown 组件，由本组件套上 v2 外壳。
 */

import * as React from "react"
import { Copy, FileDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { ButtonV2 } from "@/components/ui/v2/button"
import type { RawMarkdownArtifact } from "../types"

export interface MarkdownTemplateProps {
  artifact: RawMarkdownArtifact
  /** 让外部传入已渲染的 Markdown JSX（避免本组件依赖具体渲染库） */
  renderedContent?: React.ReactNode
  className?: string
  onCopy?: () => void
  onExportPDF?: () => void
}

export function MarkdownTemplate({
  artifact,
  renderedContent,
  className,
  onCopy,
  onExportPDF,
}: MarkdownTemplateProps) {
  return (
    <article
      data-slot="v2-markdown"
      className={cn(
        "w-full max-w-3xl",
        "bg-white text-[var(--ink-900)]",
        "border border-[var(--paper-200)] rounded-[var(--radius-sharp)]",
        "shadow-[var(--shadow-paper)]",
        "font-[var(--font-sans-v2)]",
        className
      )}
    >
      <div className="px-6 py-5 sm:px-8 sm:py-7 prose-content max-w-none">
        {renderedContent ?? (
          <pre className="whitespace-pre-wrap font-[var(--font-sans-v2)] text-[15px] leading-[1.8] text-[var(--ink-800)]">
            {artifact.rawMarkdown}
          </pre>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--paper-200)] px-6 py-3 sm:px-8 bg-[var(--paper-50)]">
        <ButtonV2 variant="ghost" size="sm" onClick={onCopy}>
          <Copy className="size-3.5" /> 复制
        </ButtonV2>
        <ButtonV2 variant="outline" size="sm" onClick={onExportPDF}>
          <FileDown className="size-3.5" /> 导出 PDF
        </ButtonV2>
      </div>
    </article>
  )
}
