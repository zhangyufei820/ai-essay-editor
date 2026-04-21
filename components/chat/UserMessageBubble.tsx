"use client"

/**
 * 用户消息气泡组件
 *
 * 特性：
 * - 悬浮显示复制和编辑按钮
 * - 静奢风极简设计
 * - 编辑功能：重新填充输入框
 */

import { Copy, Check, Pencil, X } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

interface UserMessageBubbleProps {
  content: string
  files?: Array<{
    name: string
    preview?: string
  }>
  onEdit?: (content: string) => void
  onSend?: (content: string) => void
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
      onEdit?.(editContent)
      onSend?.(editContent)
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
    <div className="relative group w-full">
      {/* 操作按钮 - 悬浮显示 */}
      <AnimatePresence>
        {!isEditing && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute -top-8 right-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-white/95 backdrop-blur-sm shadow-md border border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            <button
              onClick={handleCopy}
              className="p-1.5 rounded hover:bg-gray-100 transition-colors"
              title="复制"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-gray-500" />
              )}
            </button>
            <button
              onClick={handleEdit}
              className="p-1.5 rounded hover:bg-gray-100 transition-colors"
              title="重新编辑"
            >
              <Pencil className="w-3.5 h-3.5 text-gray-500" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 消息内容 */}
      <div
        className={cn(
          "rounded-2xl px-4 py-3 transition-all duration-200",
          isEditing
            ? "ring-2 ring-blue-500/50"
            : "hover:shadow-md"
        )}
        style={{
          backgroundColor: BUBBLE_BG,
          border: `1px solid ${isEditing ? '#3b82f6' : BORDER_COLOR}`,
          borderRadius: '18px 4px 18px 18px',
        }}
      >
        {/* 文件预览 */}
        {files && files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {files.map((file, idx) => (
              <div
                key={idx}
                className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200"
              >
                {file.preview ? (
                  <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 text-xs text-gray-500">
                    📎
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
    </div>
  )
}
