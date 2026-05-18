/**
 * 🖌 v2 chat 工作台 — 整合容器
 *
 * 这是 chat 页面外层的 v2 视觉骨架，负责：
 *   - 顶部模型抽屉触发器
 *   - 中部消息列表（用户气泡 + AI 产物模板交替）
 *   - 底部 Composer
 *
 * 业务侧依然由 enhanced-chat-interface.tsx 控制（数据流、SSE、扣费）。
 * 本组件只做"展示层 v2"的视觉重构，不接管业务逻辑。
 *
 * 用法（PR8 上线后切换）：
 *   <ChatWorkspaceV2
 *     selectedModel={model}
 *     onSelectModel={setModel}
 *     messages={messages}
 *     onSend={sendMessage}
 *     isStreaming={loading}
 *   />
 */

"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChatComposerV2 } from "./ChatComposerV2"
import { ModelDrawerV2 } from "./ModelDrawerV2"
import { UserMessageV2 } from "./UserMessageV2"
import { AssistantMessageV2 } from "./AssistantMessageV2"
import { EmptyStateV2 } from "@/components/ui/v2/empty-state"
import type { ChatMessageV2 } from "./types"

export interface ChatWorkspaceV2Props {
  selectedModel?: string | null
  onSelectModel?: (model: string) => void
  isMember?: boolean

  messages?: ChatMessageV2[]
  isStreaming?: boolean

  /** 发送消息（业务侧接 SSE） */
  onSend?: (text: string) => void
  onAttach?: () => void
  onCamera?: () => void
  onRecord?: () => void
  attachments?: Array<{ id: string; name: string; size?: number }>
  onRemoveAttachment?: (id: string) => void

  /** Markdown 渲染（外部传入） */
  renderMarkdown?: (raw: string) => React.ReactNode

  /** 消息卡工具栏回调 */
  onCopy?: (text: string) => void
  onExportPDF?: () => void
  onShare?: () => void
  onAskFollowup?: () => void
  onPlayAudio?: () => void

  className?: string
}

export function ChatWorkspaceV2({
  selectedModel,
  onSelectModel,
  isMember,
  messages = [],
  isStreaming,
  onSend,
  onAttach,
  onCamera,
  onRecord,
  attachments,
  onRemoveAttachment,
  renderMarkdown,
  onCopy,
  onExportPDF,
  onShare,
  onAskFollowup,
  onPlayAudio,
  className,
}: ChatWorkspaceV2Props) {
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // 自动滚到底部
  React.useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages.length, isStreaming])

  return (
    <div
      data-slot="v2-chat-workspace"
      className={cn(
        "flex h-full w-full flex-col bg-[var(--paper-50)] text-[var(--ink-900)]",
        className
      )}
    >
      {/* 顶部模型选择器 */}
      <header className="border-b border-[var(--paper-200)] bg-[var(--paper-50)]/85 px-4 py-2 backdrop-blur-md md:px-6">
        <ModelDrawerV2
          selectedModel={selectedModel}
          onSelect={onSelectModel}
          isMember={isMember}
        />
      </header>

      {/* 消息流 */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-6 md:px-6">
        {messages.length === 0 && !isStreaming ? (
          <EmptyStateV2
            title="上传作文 / 试卷 / 错题"
            description="先选一个智能体，然后上传材料，AI 会生成可读、可改、可分享的报告。"
          />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {messages.map((m) =>
              m.role === "user" ? (
                <UserMessageV2
                  key={m.id}
                  content={m.content}
                  attachments={m.attachments?.filter(
                    (a): a is { type: "image" | "file"; url: string; name?: string } =>
                      a.type === "image" || a.type === "file"
                  )}
                  createdAt={m.createdAt}
                />
              ) : (
                <AssistantMessageV2
                  key={m.id}
                  message={m}
                  renderMarkdown={renderMarkdown}
                  onCopy={onCopy}
                  onExportPDF={onExportPDF}
                  onShare={onShare}
                  onAskFollowup={onAskFollowup}
                  onPlayAudio={onPlayAudio}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* 输入框 */}
      <footer className="border-t border-[var(--paper-200)] bg-[var(--paper-50)] px-4 py-3 md:px-6">
        <ChatComposerV2
          isStreaming={isStreaming}
          onSend={onSend}
          onAttach={onAttach}
          onCamera={onCamera ?? onAttach}
          onRecord={onRecord}
          attachments={attachments}
          onRemoveAttachment={onRemoveAttachment}
        />
      </footer>
    </div>
  )
}
