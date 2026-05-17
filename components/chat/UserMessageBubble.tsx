"use client"
/* eslint-disable @next/next/no-img-element -- Dynamic/user-generated/external image surfaces: keep native img to preserve sizing, blob/data/proxy URLs, payment QR codes, and chat preview behavior. */

/**
 * 用户消息气泡组件
 *
 * 特性：
 * - 悬浮显示复制和编辑按钮
 * - 静奢风极简设计
 * - 编辑功能：重新填充输入框
 */

import { Copy, Check, Pencil, X, FileText } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface UserMessageBubbleProps {
  content: string
  files?: Array<{
    name: string
    type?: string
    preview?: string
    data?: string
    gatewayUrl?: string
    modelUrl?: string
    difyFileId?: string
  }>
  onEdit?: (content: string, files?: UserMessageBubbleProps["files"]) => void
  onSend?: (content: string, files?: UserMessageBubbleProps["files"]) => void
}

export function UserMessageBubble({ content, files, onEdit, onSend }: UserMessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 复制功能
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      toast.success('已复制')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      toast.error('复制失败')
    }
  }

  // 编辑功能
  const handleEdit = () => {
    setEditContent(content)
    setIsEditing(true)
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditContent(content)
  }

  // 提交编辑
  const handleSubmitEdit = () => {
    if (editContent.trim()) {
      onEdit?.(editContent, files)
      onSend?.(editContent, files)
    }
    setIsEditing(false)
  }

  // 自动聚焦编辑框
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length)
    }
  }, [isEditing])

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmitEdit()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  return (
    <div className="group w-full">
      <div
        className={cn(
          "rounded-[var(--radius-soft)] bg-[var(--ink-700)] px-4 py-3 text-white shadow-[var(--shadow-paper)] transition-all duration-200",
          isEditing
            ? "border border-[var(--seal-500)] ring-2 ring-[var(--seal-500)]/30"
            : "border border-[var(--ink-700)]"
        )}
      >
        {/* 文件预览 */}
        {files && files.length > 0 && (
          <div className="mb-2 sm:mb-2.5 flex flex-wrap gap-1.5 sm:gap-2">
            {files.map((file, idx) => (
              <div
                key={idx}
            className="relative overflow-hidden rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)]/70"
              >
                {file.preview ? (
                  <div className="h-20 w-20">
                    <img src={file.preview} alt={file.name} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex min-w-[132px] items-center gap-2 px-3 py-2 text-[11px] sm:text-xs text-[var(--ink-600)]">
                    <FileText className="h-4 w-4 text-[var(--ink-400)]" />
                    <span className="max-w-[84px] truncate">{file.name}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 编辑模式 */}
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full min-h-[60px] max-h-[200px] p-2 text-[13px] sm:text-sm resize-none rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)]/80 focus:outline-none focus:ring-2 focus:ring-[var(--ink-500)]/20"
              style={{ color: "white" }}
              placeholder="编辑消息..."
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={handleCancelEdit}
                className="px-3 py-1.5 text-xs text-[var(--ink-500)] hover:text-[var(--ink-700)] hover:bg-[var(--paper-100)] rounded-[var(--radius-pill)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={handleSubmitEdit}
                className="px-3 py-1.5 text-xs text-white rounded-[var(--radius-pill)] transition-colors"
                style={{ backgroundColor: "var(--seal-500)" }}
              >
                发送
              </button>
            </div>
          </div>
        ) : (
          <div
            className="whitespace-pre-wrap text-[13px] sm:text-sm"
            style={{ lineHeight: 1.6 }}
          >
            {content}
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="mt-1 flex items-center justify-end gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 group-active:opacity-100 sm:mt-2 sm:gap-1.5">
          <button
            onClick={handleCopy}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-400)] transition-colors duration-150 hover:bg-[var(--paper-100)] hover:text-[var(--ink-700)] focus-visible:bg-[var(--paper-100)] focus-visible:text-[var(--ink-700)] focus-visible:outline-none touch-manipulation sm:h-9 sm:w-9"
            title="复制消息"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[var(--seal-500)] sm:h-4 sm:w-4" />
            ) : (
              <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            )}
          </button>
          <button
            onClick={handleEdit}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-400)] transition-colors duration-150 hover:bg-[var(--paper-100)] hover:text-[var(--ink-700)] focus-visible:bg-[var(--paper-100)] focus-visible:text-[var(--ink-700)] focus-visible:outline-none touch-manipulation sm:h-9 sm:w-9"
            title="编辑消息"
          >
            <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
