"use client"

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
  }>
  onEdit?: (content: string, files?: UserMessageBubbleProps["files"]) => void
  onSend?: (content: string, files?: UserMessageBubbleProps["files"]) => void
}

// 静奢风配色
const BUBBLE_BG = "#f8fafc"
const BORDER_COLOR = "#e5e5e5"
const TEXT_COLOR = "#333333"

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
    if (editContent.trim() && editContent !== content) {
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
    <div className="w-full">
      <div
        className={cn(
          "rounded-2xl px-4 py-3 transition-all duration-200",
          isEditing
            ? "ring-2 ring-blue-500/50"
            : "shadow-sm"
        )}
        style={{
          backgroundColor: BUBBLE_BG,
          border: `1px solid ${isEditing ? '#3b82f6' : BORDER_COLOR}`,
          borderRadius: '18px 4px 18px 18px',
        }}
      >
        {/* 文件预览 */}
        {files && files.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {files.map((file, idx) => (
              <div
                key={idx}
                className="relative overflow-hidden rounded-xl border border-gray-200 bg-white/70"
              >
                {file.preview ? (
                  <div className="h-20 w-20">
                    <img src={file.preview} alt={file.name} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex min-w-[132px] items-center gap-2 px-3 py-2 text-xs text-gray-600">
                    <FileText className="h-4 w-4 text-gray-400" />
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
              className="w-full min-h-[60px] max-h-[200px] p-2 text-sm resize-none rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              style={{ color: TEXT_COLOR }}
              placeholder="编辑消息..."
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={handleCancelEdit}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={handleSubmitEdit}
                className="px-3 py-1.5 text-xs text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
              >
                发送
              </button>
            </div>
          </div>
        ) : (
          <div
            className="whitespace-pre-wrap text-sm"
            style={{ lineHeight: 1.6, color: TEXT_COLOR }}
          >
            {content}
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            onClick={handleCopy}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/88 text-slate-500 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-700"
            title="复制消息"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={handleEdit}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/88 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300"
            title="编辑消息"
          >
            <Pencil className="h-4 w-4" />
            编辑消息
          </button>
        </div>
      )}
    </div>
  )
}
