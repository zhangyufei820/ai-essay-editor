"use client"
/* eslint-disable @next/next/no-img-element -- Generated previews can be local proxy URLs, SVGs, or signed media URLs. */

import { ExternalLink, FileText } from "lucide-react"
import { memo, useMemo } from "react"

import { proxifyGeneratedImagePreviewUrl } from "@/components/chat/image-generation/gpt-image-v11"
import { OpenClawHtmlPreview } from "@/components/chat/OpenClawHtmlPreview"
import { getGeneratedFilePreviewKind, getGeneratedFilePreviewUrl } from "@/lib/generated-file-preview"
import { cn } from "@/lib/utils"

function fileLabel(src: string, fallback?: string) {
  if (fallback?.trim()) return fallback.trim()
  const rawName = src.split("/").pop()?.split(/[?#]/, 1)[0] || "生成文件"
  try {
    return decodeURIComponent(rawName)
  } catch {
    return rawName
  }
}

export const GeneratedFilePreview = memo(function GeneratedFilePreview({
  src,
  title,
  className,
}: {
  src: string
  title?: string
  className?: string
}) {
  const previewUrl = useMemo(() => getGeneratedFilePreviewUrl(src), [src])
  const previewKind = useMemo(() => getGeneratedFilePreviewKind(src), [src])
  const label = useMemo(() => fileLabel(previewUrl, title), [previewUrl, title])

  if (previewKind === "presentation") {
    return <OpenClawHtmlPreview src={previewUrl} title={label} className={className} />
  }

  if (previewKind === "image") {
    return (
      <div className={cn("my-3 overflow-hidden rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] shadow-sm", className)}>
        <img
          src={proxifyGeneratedImagePreviewUrl(previewUrl, 1200)}
          alt={label}
          className="max-h-[640px] w-full object-contain bg-[var(--paper-50)]"
          loading="lazy"
        />
      </div>
    )
  }

  if (previewKind === "inline") {
    return (
      <div className={cn("my-3 overflow-hidden rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] shadow-sm", className)}>
        <div className="flex items-center gap-3 border-b border-[var(--paper-100)] bg-[var(--paper-50)] px-3 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--paper-50)] text-[var(--ink-500)]">
            <FileText className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink-700)]">{label}</span>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--paper-50)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-600)] no-underline shadow-sm transition-colors hover:bg-[var(--paper-100)]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            打开预览
          </a>
        </div>
        <iframe
          src={previewUrl}
          title={label}
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          className="h-[520px] w-full border-0 bg-[var(--paper-50)]"
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <div className={cn("my-3 flex max-w-full items-center gap-3 rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] px-3 py-2.5 text-[var(--ink-700)]", className)}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--paper-50)] text-[var(--ink-500)]">
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-[var(--ink-500)]">文件已生成</span>
      </span>
      <a
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--paper-50)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-600)] no-underline shadow-sm transition-colors hover:bg-[var(--paper-100)]"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        打开预览
      </a>
    </div>
  )
})
