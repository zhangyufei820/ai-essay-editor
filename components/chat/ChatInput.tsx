/**
 * 📝 沈翔学校 - 聊天输入组件 (ChatInput)
 * 
 * 聊天输入区域的封装组件，整合输入框、附件上传、发送按钮等功能。
 * 支持多行输入、文件上传、模型选择等交互。
 */

"use client"

import {
  useRef,
  useEffect,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
} from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Paperclip, X, Loader2, ChevronDown, FileText, Image as ImageIcon, Mic, MicOff } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { brandColors, slateColors } from "@/lib/design-tokens"
import { ModelSelector, type Model } from "./ModelSelector"

// ============================================
// Web Speech API 类型定义
// ============================================
type SpeechRecognitionEvent = {
  resultIndex: number
  results: {
    [key: number]: {
      [key: number]: { transcript: string; confidence: number }
      isFinal: boolean
      length: number
    }
    length: number
  }
}

type SpeechRecognitionErrorEvent = {
  error: string
  message: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: (event: SpeechRecognitionEvent) => void
  onerror: (event: SpeechRecognitionErrorEvent) => void
  onend: () => void
  onstart: () => void
  start: () => void
  stop: () => void
  abort: () => void
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

// ============================================
// 类型定义
// ============================================

interface UploadedFile {
  name: string
  preview?: string
  type?: string
  size?: number
}

interface ChatInputProps {
  /** 输入框的值 */
  value: string
  /** 值变化回调 */
  onChange: (value: string) => void
  /** 提交回调 */
  onSubmit: (event: FormEvent) => void
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
  /** 当前模型 key（showModelSelector=true 时使用 ModelSelector） */
  selectedModel?: string
  /** 模型点击回调 */
  onModelClick?: () => void
  /** 是否显示模型选择器 */
  showModelSelector?: boolean
  /** 模型列表（showModelSelector=true 时必需） */
  models?: Model[]
  /** 模型切换回调（showModelSelector=true 时必需） */
  onModelChange?: (model: string) => void
  /** 模型颜色 */
  modelColor?: string
  /** 自定义类名 */
  className?: string
}

function createFileList(files: File[]): FileList | null {
  if (files.length === 0 || typeof DataTransfer === "undefined") return null

  const dataTransfer = new DataTransfer()
  files.forEach((file) => dataTransfer.items.add(file))
  return dataTransfer.files
}

function nameClipboardFile(file: File, index: number): File {
  if (file.name) return file

  const extension = file.type.split("/")[1]?.split("+")[0] || "png"
  return new File([file], `pasted-image-${Date.now()}-${index}.${extension}`, {
    type: file.type || "image/png",
    lastModified: Date.now(),
  })
}

function getClipboardFiles(dataTransfer: DataTransfer): File[] {
  const directFiles = Array.from(dataTransfer.files)
  if (directFiles.length > 0) {
    return directFiles.map(nameClipboardFile)
  }

  return Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .map(nameClipboardFile)
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
  const sizeLabel = typeof file.size === "number" && file.size > 0
    ? file.size < 1024 * 1024
      ? `${(file.size / 1024).toFixed(1)} KB`
      : `${(file.size / 1024 / 1024).toFixed(1)} MB`
    : "已上传"

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8, x: -20 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.8, x: -20 }}
      transition={{ duration: 0.2 }}
      className="relative flex min-w-[180px] max-w-[240px] shrink-0 items-center gap-2 rounded-lg px-3 py-2"
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
      
      <div className="min-w-0 flex-1">
        <span
          className="block truncate text-sm font-medium leading-5"
          style={{ color: slateColors[700] }}
        >
          {file.name}
        </span>
        <span className="block truncate text-[11px] leading-4 text-slate-400">
          已上传 · {sizeLabel}
        </span>
      </div>
      
      {/* 删除按钮 */}
      <button
        onClick={() => onRemove(index)}
        className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-red-100"
        aria-label={`移除文件 ${file.name}`}
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
  selectedModel,
  onModelClick,
  showModelSelector = false,
  modelColor = brandColors[900],
  models = [],
  onModelChange,
  className
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const dragDepthRef = useRef(0)
  const isMobileInputMode = isFocused || value.trim().length > 0

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
    if (!disabled && textareaRef.current && window.innerWidth >= 768) {
      textareaRef.current.focus()
    }
  }, [disabled])

  const handleSubmit = () => {
    if (!canSubmit) return
    textareaRef.current?.blur()
    setIsFocused(false)
    onSubmit({ preventDefault: () => undefined } as FormEvent)
  }

  // 键盘事件处理
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (!isLoading && (value.trim() || uploadedFiles.length > 0)) {
        e.preventDefault()
        handleSubmit()
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

  const uploadFiles = (files: File[]) => {
    if (!onFileUpload || disabled || isLoading || files.length === 0) return false

    const fileList = createFileList(files)
    if (!fileList) return false

    onFileUpload(fileList)
    return true
  }

  const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const files = getClipboardFiles(event.clipboardData)
    if (files.length === 0) return

    uploadFiles(files)
  }

  const handleDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!onFileUpload || disabled || isLoading) return

    const hasFiles = Array.from(event.dataTransfer.types).includes("Files")
    if (!hasFiles) return

    event.preventDefault()
    dragDepthRef.current += 1
    setIsDraggingFile(true)
  }

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!isDraggingFile) return

    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  const handleDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!isDraggingFile) return

    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDraggingFile(false)
    }
  }

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!onFileUpload || disabled || isLoading) return

    event.preventDefault()
    dragDepthRef.current = 0
    setIsDraggingFile(false)
    uploadFiles(Array.from(event.dataTransfer.files))
  }

  // 语音输入处理
  const toggleVoiceInput = () => {
    // 检查浏览器是否支持语音识别
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionAPI) {
      console.error("当前浏览器不支持语音识别")
      return
    }

    if (isListening) {
      // 停止语音识别
      recognitionRef.current?.stop()
      setIsListening(false)
    } else {
      // 开始语音识别
      const recognition = new SpeechRecognitionAPI()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = "zh-CN" // 设置为中文

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = ""
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) {
            transcript += result[0].transcript
          }
        }
        if (transcript) {
          onChange(value + transcript)
        }
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("语音识别错误:", event.error)
        setIsListening(false)
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition
      recognition.start()
      setIsListening(true)
    }
  }

  // 组件卸载时停止语音识别
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [])

  // 是否可以提交
  const canSubmit = !isLoading && !disabled && (value.trim() || uploadedFiles.length > 0)

  return (
    <div
      onPaste={handlePaste}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative rounded-[24px] border bg-white transition-all duration-300 touch-manipulation max-sm:rounded-[28px]",
        isFocused
          ? "border-emerald-500/45 shadow-[0_8px_24px_rgba(15,118,86,0.10)] sm:shadow-[0_8px_24px_rgba(0,0,0,0.10),0_20px_48px_rgba(0,0,0,0.15)]"
          : "border-slate-200/80 shadow-[0_10px_30px_rgba(15,23,42,0.08)] sm:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.10)]",
        className
      )}
      style={{ 
        borderColor: isFocused ? `${brandColors[900]}20` : slateColors[100],
        ['--ring-color' as string]: `${brandColors[900]}10`
      }}
    >
      <AnimatePresence>
        {isDraggingFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] border border-dashed border-emerald-500/60 bg-emerald-50/80 text-sm font-medium text-emerald-800 backdrop-blur-sm"
          >
            松开即可上传文件
          </motion.div>
        )}
      </AnimatePresence>

      {/* 工具栏 */}
      {showModelSelector && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-b px-3 py-2 sm:px-4",
            isMobileInputMode && "max-sm:hidden"
          )}
          style={{ borderColor: slateColors[50] }}
        >
          {/* 模型选择器 - 使用 ModelSelector 组件 */}
          {models.length > 0 && selectedModel && onModelChange ? (
            <ModelSelector
              selectedModel={selectedModel}
              onModelChange={onModelChange}
              models={models}
              disabled={isLoading || disabled}
            />
          ) : (
            /* Fallback: 简单按钮（当 props 不完整时） */
            <button
              type="button"
              onClick={onModelClick}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-slate-50 min-h-[36px]"
              aria-label="选择 AI 模型"
            >
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: modelColor }} />
              <span className="text-xs font-medium" style={{ color: slateColors[600] }}>
                {modelName || "选择模型"}
              </span>
              <ChevronDown className="h-3 w-3 opacity-50" style={{ color: slateColors[400] }} />
            </button>
          )}

          {/* 附件按钮 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full sm:rounded-lg"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || disabled}
            aria-label="上传附件"
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
              className="flex gap-2 overflow-x-auto border-b px-3 py-3 scrollbar-thin sm:px-4"
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
      <div
        className={cn(
          "flex items-end gap-2 p-2 sm:gap-3 sm:p-3",
          isMobileInputMode && "max-sm:p-1.5 max-sm:pb-2"
        )}
      >
        {/* 附件按钮（工具栏隐藏或移动端键盘态时显示） */}
        {!showModelSelector && (
          <div className="flex flex-col items-center gap-0.5 sm:gap-1 shrink-0">
            <span className="text-[10px] font-medium hidden sm:block" style={{ color: slateColors[400] }}>
              文件上传
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-11 w-11 sm:h-10 sm:w-10 rounded-xl sm:rounded-xl touch-manipulation",
                isFocused && "max-sm:h-9 max-sm:w-9 max-sm:rounded-full"
              )}
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || disabled}
              aria-label="上传附件"
            >
              <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: slateColors[400] }} />
            </Button>
          </div>
        )}

        {/* 语音输入按钮 */}
        <div className={cn("flex flex-col items-center gap-0.5 sm:gap-1 shrink-0", isMobileInputMode && "max-sm:hidden")}>
          <span className="text-[10px] font-medium hidden sm:block" style={{ color: slateColors[400] }}>
            {isListening ? "录音中" : "语音输入"}
          </span>
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleVoiceInput}
            disabled={isLoading || disabled}
            className={cn(
              "h-10 w-10 sm:h-10 sm:w-10 rounded-full sm:rounded-xl flex items-center justify-center transition-all duration-200 touch-manipulation",
              isListening
                ? "bg-red-500 text-white shadow-lg animate-pulse"
                : "bg-slate-100 hover:bg-slate-200 text-slate-600"
            )}
            aria-label={isListening ? "停止录音" : "开始语音输入"}
          >
            {isListening ? (
              <MicOff className="h-4 w-4 sm:h-5 sm:w-5" />
            ) : (
              <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
            )}
          </motion.button>
        </div>

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
            "flex-1 resize-none border-0 bg-transparent shadow-none",
            "min-h-[44px] max-h-[132px] rounded-[18px] px-3 py-2 text-[16px] leading-6 sm:min-h-[48px] sm:max-h-[160px] sm:p-2 sm:text-[15px]",
            "focus-visible:border-transparent focus-visible:ring-0",
            isMobileInputMode && "max-sm:min-h-[42px] max-sm:max-h-[112px] max-sm:bg-slate-50/80 max-sm:px-3 max-sm:py-2"
          )}
          style={{ color: slateColors[700] }}
          rows={1}
        />

        {/* 发送按钮 */}
        <div className="flex flex-col items-center gap-0.5 sm:gap-1 shrink-0">
          <span className="text-[10px] font-medium hidden sm:block" style={{ color: slateColors[400] }}>
            发送
          </span>
          <motion.button
            type="button"
            whileHover={canSubmit ? { scale: 1.02, y: -1 } : {}}
            whileTap={canSubmit ? { scale: 0.98 } : {}}
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full sm:h-10 sm:w-10 sm:rounded-xl touch-manipulation",
              "text-white transition-all duration-200",
              isMobileInputMode && "max-sm:h-10 max-sm:w-10",
              !canSubmit && "opacity-40 cursor-not-allowed"
            )}
            style={{
              backgroundColor: brandColors[900],
              boxShadow: canSubmit
                ? `0 4px 12px ${brandColors[900]}40`
                : "none"
            }}
            aria-label="发送消息"
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
        aria-label="文件上传"
      />
    </div>
  )
}

export default ChatInput
