/**
 * 🖌 v2 chat 输入框
 *
 * 三件套：📎 上传 / 🎤 录音 / ⏎ 朱印发送
 *
 * 行为合同：
 *   - 父组件提供 onSend(text, files)
 *   - Enter 发送，Shift+Enter 换行
 *   - 上传 / 录音 仅触发回调，本组件不实现上传逻辑
 */

"use client"

import * as React from "react"
import { Camera, X } from "lucide-react"
import { IconMic, IconSend, IconUpload } from "@/components/icons/v2"
import { cn } from "@/lib/utils"
import { TextareaV2 } from "@/components/ui/v2/textarea"
import { ButtonV2 } from "@/components/ui/v2/button"
import { BrushDots } from "@/components/ui/v2/loading-state"

export interface ChatComposerV2Props {
  placeholder?: string
  /** 当 streaming 时按钮显示加载小点 */
  isStreaming?: boolean
  /** 发送回调 */
  onSend?: (text: string) => void
  /** 上传按钮回调 */
  onAttach?: () => void
  /** 相机按钮回调 */
  onCamera?: () => void
  /** 录音按钮回调 */
  onRecord?: () => void
  /** 已选附件 */
  attachments?: Array<{ id: string; name: string; size?: number }>
  /** 移除附件 */
  onRemoveAttachment?: (id: string) => void
  className?: string
  disabled?: boolean
}

export function ChatComposerV2({
  placeholder = "上传作文图片或粘贴文字…",
  isStreaming,
  onSend,
  onAttach,
  onCamera,
  onRecord,
  attachments,
  onRemoveAttachment,
  className,
  disabled,
}: ChatComposerV2Props) {
  const [text, setText] = React.useState("")
  const ref = React.useRef<HTMLTextAreaElement>(null)

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    if (!text.trim()) return
    onSend?.(text.trim())
    setText("")
    ref.current?.focus()
  }

  return (
    <div
      data-slot="v2-chat-composer"
      className={cn(
        "w-full max-w-3xl mx-auto",
        "rounded-[var(--radius-card)] bg-white",
        "border border-[var(--paper-200)] shadow-[var(--shadow-paper)]",
        "transition-[border-color,box-shadow] duration-200",
        "focus-within:border-[var(--ink-500)] focus-within:[box-shadow:var(--shadow-focus-ink)]",
        className
      )}
    >
      {/* 附件预览 */}
      {attachments && attachments.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-b border-[var(--paper-200)] px-3 py-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--paper-100)] px-2 py-1 text-[12px] text-[var(--ink-700)] font-[var(--font-sans-v2)]"
            >
              <span className="truncate max-w-[120px]">{att.name}</span>
              <button
                type="button"
                onClick={() => onRemoveAttachment?.(att.id)}
                className="size-4 inline-flex items-center justify-center rounded-full text-[var(--ink-500)] hover:bg-[var(--paper-300)]"
                aria-label={`移除 ${att.name}`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-1 p-2">
        <ButtonV2
          variant="ghost"
          size="icon-sm"
          onClick={onAttach}
          aria-label="上传文件"
          disabled={disabled}
        >
          <IconUpload className="size-4" />
        </ButtonV2>
        <ButtonV2
          variant="ghost"
          size="icon-sm"
          onClick={onCamera ?? onAttach}
          aria-label="拍照上传"
          disabled={disabled || (!onCamera && !onAttach)}
        >
          <Camera className="size-4" />
        </ButtonV2>
        <ButtonV2
          variant="ghost"
          size="icon-sm"
          onClick={onRecord}
          aria-label="语音输入"
          disabled={disabled}
        >
          <IconMic className="size-4" />
        </ButtonV2>

        <TextareaV2
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "resize-none border-0 bg-transparent shadow-none",
            "focus-visible:bg-transparent focus-visible:[box-shadow:none]",
            "min-h-[44px] py-2 px-2 leading-[1.6]"
          )}
          disabled={disabled}
        />

        <ButtonV2
          variant="seal"
          size="icon"
          onClick={submit}
          aria-label="发送"
          disabled={disabled || !text.trim()}
        >
          {isStreaming ? <BrushDots /> : <IconSend className="size-4" />}
        </ButtonV2>
      </div>

      {/* 提示 */}
      <div className="flex items-center justify-between border-t border-[var(--paper-200)] px-3 py-2 text-[11px] text-[var(--ink-400)] font-[var(--font-sans-v2)]">
        <span>Enter 发送 · Shift+Enter 换行</span>
        <span className="font-[var(--font-mono-v2)]">{text.length} / 2000</span>
      </div>
    </div>
  )
}
