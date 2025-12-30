/**
 * 📝 沈翔学校 - 聊天输入组件 (ChatInput)
 * 
 * 聊天输入区域的封装组件，整合输入框、附件上传、发送按钮等功能。
 * 支持多行输入、文件上传、模型选择等交互。
 */

"use client"

import { useRef, useEffect, useState, type KeyboardEvent, type ChangeEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Paperclip, X, Loader2, ChevronDown, FileText, Image as ImageIcon } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { brandColors, slateColors } from "@/lib/design-tokens"

// ============================================
// 类型定义
// ============================================

interface UploadedFile {
  name: string
  preview?: string
  type?: string
}

interface ChatInputProps {
  /** 输入框的值 */
  value: string
  /** 值变化回调 */
  onChange: (value: string) => void
  /** 提交回调 */
  onSubmit: () => void
  /** 文件上传回调 */
  onFileUpload?: (files: FileList) => void
  /** 已上传的文件列表 */
  uploadedFiles?: UploadedFile[]
  /** 移除文件回调 */
  onRemoveFile?: (index: number) => void
  /** 是否正在加载 */
  isLoading?: boolean
  /** 是否禁用 */
  disabled?: boolean
  /** 占位符文本 */
  placeholder?: string
  /** 当前模型名称 */
  modelName?: string
  /** 模型点击回调 */
  onModelClick?: () => void
  /** 是否显示模型选择器 */
  showModelSelector?: boolean
  /** 模型颜色 */
  modelColor?: string
  /** 自定义类名 */
  className?: string
}

// ============================================
// 附件预览卡片
// ============================================

function FilePreviewCard({ 
  file, 
  index, 
  onRemove 
}: { 
  file: UploadedFile
  index: number
  onRemove: (index: number) => void 
}) {
  const isImage = file.type?.startsWith("image/") || file.preview

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8, x: -20 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.8, x: -20 }}
      transition={{ duration: 0.2 }}
      className="relative flex items-center gap-2 rounded-lg px-3 py-2 shrink-0"
      style={{ backgroundColor: slateColors[50] }}
    >
      {/* 文件图标/预览 */}
      {isImage && file.preview ? (
        <div className="h-8 w-8 rounded overflow-hidden shrink-0">
          <img 
            src={file.preview} 
            alt={file.name} 
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div 
          className="h-8 w-8 rounded flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${brandColors[600]}15` }}
        >
          <FileText className="h-4 w-4" style={{ color: brandColors[600] }} />
        </div>
      )}
      
      {/* 文件名 */}
      <span 
        className="text-sm max-w-[100px] truncate"
        style={{ color: slateColors[600] }}
      >
        {file.name}
      </span>
      
      {/* 删除按钮 */}
      <button
        onClick={() => onRemove(index)}
        className="ml-1 p-0.5 rounded-full transition-colors hover:bg-red-100"
      >
        <X className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
      </button>
    </motion.div>
  )
}

// ============================================
// 主组件
// ============================================

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onFileUpload,
  uploadedFiles = [],
  onRemoveFile,
  isLoading = false,
  disabled = false,
  placeholder = "输入内容开始对话...",
  modelName,
  onModelClick,
  showModelSelector = false,
  modelColor = brandColors[900],
  className
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  // 自动调整高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      const scrollHeight = textareaRef.current.scrollHeight
      textareaRef.current.style.height = `${Math.min(scrollHeight, 160)}px`
    }
  }, [value])

  // 自动聚焦
  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [disabled])

  // 键盘事件处理
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && (value.trim() || uploadedFiles.length > 0)) {
        onSubmit()
      }
    }
  }

  // 文件选择处理
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileUpload?.(e.target.files)
      // 清空 input 以便重复选择同一文件
      e.target.value = ""
    }
  }

  // 是否可以提交
  const canSubmit = !isLoading && !disabled && (value.trim() || uploadedFiles.length > 0)

  return (
    <div
      className={cn(
        "relative rounded-3xl bg-white border transition-all duration-300",
        isFocused 
          ? "shadow-[0_4px_12px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.12),0_20px_56px_rgba(0,0,0,0.12)] ring-1" 
          : "shadow-[0_2px_8px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08),0_16px_48px_rgba(0,0,0,0.08)]",
        className
      )}
      style={{ 
        borderColor: isFocused ? `${brandColors[900]}20` : slateColors[100],
        ['--ring-color' as string]: `${brandColors[900]}10`
      }}
    >
      {/* 工具栏 */}
      {showModelSelector && (
        <div 
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: slateColors[50] }}
        >
          {/* 模型选择器 */}
          <button
            type="button"
            onClick={onModelClick}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-slate-50"
          >
            <div 
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: modelColor }}
            />
            <span 
              className="text-xs font-medium"
              style={{ color: slateColors[600] }}
            >
              {modelName || "选择模型"}
            </span>
            <ChevronDown 
              className="h-3 w-3 opacity-50"
              style={{ color: slateColors[400] }}
            />
          </button>

          {/* 附件按钮 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || disabled}
          >
            <Paperclip className="h-4 w-4" style={{ color: slateColors[400] }} />
          </Button>
        </div>
      )}

      {/* 附件预览区 */}
      <AnimatePresence mode="popLayout">
        {uploadedFiles.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div 
              className="flex gap-2 px-4 py-3 overflow-x-auto border-b scrollbar-thin"
              style={{ borderColor: slateColors[50] }}
            >
              <AnimatePresence mode="popLayout">
                {uploadedFiles.map((file, index) => (
                  <FilePreviewCard
                    key={`${file.name}-${index}`}
                    file={file}
                    index={index}
                    onRemove={onRemoveFile || (() => {})}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 输入区域 */}
      <div className="flex items-end gap-3 p-3">
        {/* 附件按钮（工具栏隐藏时显示） */}
        {!showModelSelector && (
          <div className="flex flex-col items-center gap-1 shrink-0">
            <span className="text-[10px] font-medium" style={{ color: slateColors[400] }}>
              文件上传
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-xl"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || disabled}
            >
              <Paperclip className="h-5 w-5" style={{ color: slateColors[400] }} />
            </Button>
          </div>
        )}

        {/* 文本输入框 */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={disabled ? "请先登录..." : placeholder}
          disabled={disabled || isLoading}
          className={cn(
            "flex-1 min-h-[48px] max-h-[160px] resize-none border-0 bg-transparent",
            "text-[15px] leading-relaxed focus-visible:ring-0 p-2"
          )}
          style={{ color: slateColors[700] }}
          rows={1}
        />

        {/* 发送按钮 */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="text-[10px] font-medium" style={{ color: slateColors[400] }}>
            发送
          </span>
          <motion.button
            type="button"
            whileHover={canSubmit ? { scale: 1.02, y: -1 } : {}}
            whileTap={canSubmit ? { scale: 0.98 } : {}}
            disabled={!canSubmit}
            onClick={onSubmit}
            className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center",
              "text-white transition-all duration-200",
              !canSubmit && "opacity-40 cursor-not-allowed"
            )}
            style={{ 
              backgroundColor: brandColors[900],
              boxShadow: canSubmit 
                ? `0 4px 12px ${brandColors[900]}40` 
                : "none"
            }}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </motion.button>
        </div>
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt"
        onChange={handleFileChange}
      />
    </div>
  )
}

export default ChatInput
