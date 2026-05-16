/**
 * 🖌 v2 AI 消息气泡
 *
 * 与 UserMessage 不同 — AI 输出**不是聊天泡**，是一份学习产物。
 * 根据 message.artifact.type 选择对应的产物模板：
 *   - essay-review     → EssayReviewTemplate
 *   - worksheet        → WorksheetPosterTemplate
 *   - vocab-card       → VocabCardTemplate
 *   - flashcard        → FlashcardTemplate
 *   - markdown         → MarkdownTemplate（默认 fallback）
 *
 * 流式状态：使用 InkBrush 加载指示器
 */

"use client"

import * as React from "react"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { InkBrush, InkReveal } from "@/components/motion/InkMotion"
import { LoadingStateV2 } from "@/components/ui/v2/loading-state"
import {
  EssayReviewTemplate,
  FlashcardTemplate,
  MarkdownTemplate,
  VocabCardTemplate,
  WorksheetPosterTemplate,
} from "./templates"
import type { ChatMessageV2 } from "./types"

export interface AssistantMessageV2Props {
  message: ChatMessageV2
  /** 自定义 markdown 渲染（外部传入避免硬依赖具体库） */
  renderMarkdown?: (raw: string) => React.ReactNode
  className?: string
  onCopy?: (text: string) => void
  onExportPDF?: () => void
  onShare?: () => void
  onAskFollowup?: () => void
  onPlayAudio?: () => void
}

export function AssistantMessageV2({
  message,
  renderMarkdown,
  className,
  onCopy,
  onExportPDF,
  onShare,
  onAskFollowup,
  onPlayAudio,
}: AssistantMessageV2Props) {
  const isStreaming = message.streaming

  // 流式中且没有内容 → 显示加载状态
  if (isStreaming && !message.content && !message.artifact) {
    return (
      <div className={cn("flex w-full", className)} data-slot="v2-assistant-msg">
        <div className="max-w-3xl w-full">
          <AgentBadge />
          <LoadingStateV2 label="AI 正在批改..." />
        </div>
      </div>
    )
  }

  return (
    <InkReveal as="div" className={cn("flex w-full", className)}>
      <div className="max-w-3xl w-full" data-slot="v2-assistant-msg">
        <AgentBadge />

        {message.artifact ? (
          <ArtifactSwitch
            artifact={message.artifact}
            renderMarkdown={renderMarkdown}
            onCopy={() => onCopy?.(message.content)}
            onExportPDF={onExportPDF}
            onShare={onShare}
            onAskFollowup={onAskFollowup}
            onPlayAudio={onPlayAudio}
          />
        ) : (
          <MarkdownTemplate
            artifact={{ type: "markdown", rawMarkdown: message.content }}
            renderedContent={
              renderMarkdown ? renderMarkdown(message.content) : undefined
            }
            onCopy={() => onCopy?.(message.content)}
            onExportPDF={onExportPDF}
          />
        )}

        {/* 流式中状态条 */}
        {isStreaming ? (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--ink-500)] font-[var(--font-sans-v2)]">
            <InkBrush className="h-4 w-12" />
            正在生成...
          </div>
        ) : null}
      </div>
    </InkReveal>
  )
}

function AgentBadge() {
  return (
    <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--ink-500)] font-[var(--font-sans-v2)] font-semibold">
      <Sparkles className="size-3 text-[var(--seal-500)]" aria-hidden="true" />
      沈翔智学 · AI 输出
    </div>
  )
}

interface ArtifactSwitchProps {
  artifact: NonNullable<ChatMessageV2["artifact"]>
  renderMarkdown?: (raw: string) => React.ReactNode
  onCopy?: () => void
  onExportPDF?: () => void
  onShare?: () => void
  onAskFollowup?: () => void
  onPlayAudio?: () => void
}

function ArtifactSwitch({
  artifact,
  renderMarkdown,
  onCopy,
  onExportPDF,
  onShare,
  onAskFollowup,
  onPlayAudio,
}: ArtifactSwitchProps) {
  switch (artifact.type) {
    case "essay-review":
      return (
        <EssayReviewTemplate
          artifact={artifact}
          onCopy={onCopy}
          onExportPDF={onExportPDF}
          onShare={onShare}
          onAskFollowup={onAskFollowup}
        />
      )
    case "worksheet-diagnosis":
      return (
        <WorksheetPosterTemplate
          artifact={artifact}
          onDownload={onExportPDF}
          onShare={onShare}
        />
      )
    case "vocab-card":
      return <VocabCardTemplate artifact={artifact} onPlayAudio={onPlayAudio} />
    case "flashcard":
      return <FlashcardTemplate artifact={artifact} />
    case "markdown":
    default:
      return (
        <MarkdownTemplate
          artifact={artifact}
          renderedContent={
            renderMarkdown ? renderMarkdown(artifact.rawMarkdown) : undefined
          }
          onCopy={onCopy}
          onExportPDF={onExportPDF}
        />
      )
  }
}
