import { ButtonV2 as Button, TextareaV2 as Textarea } from "@/components/ui/v2"
/* eslint-disable @next/next/no-img-element -- Dynamic/user-generated/external image surfaces: keep native img to preserve sizing, blob/data/proxy URLs, payment QR codes, and chat preview behavior. */
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
import { X, Loader2, ChevronDown, FileText, Image as ImageIcon, MicOff, Camera } from "lucide-react"
import { IconMic, IconSend, IconUpload } from "@/components/icons/v2"
import { cn } from "@/lib/utils"
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
      className="relative flex min-w-[180px] max-w-[240px] shrink-0 items-center gap-2 rounded-[var(--radius-soft)] px-3 py-2"
      style={{ backgroundColor: "var(--paper-50)" }}
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
          style={{ backgroundColor: "color-mix(in srgb, var(--ink-600) 15%, transparent)" }}
        >
          <FileText className="h-4 w-4" style={{ color: "var(--ink-600)" }} />
        </div>
      )}
      
      <div className="min-w-0 flex-1">
        <span
          className="block truncate text-sm font-medium leading-5"
          style={{ color: "var(--ink-700)" }}
        >
          {file.name}
        </span>
        <span className="block truncate text-[11px] leading-4 text-[var(--ink-400)]">
          已上传 · {sizeLabel}
        </span>
      </div>
      
      {/* 删除按钮 */}
      <button
        onClick={() => onRemove(index)}
        className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--seal-50)]"
        aria-label={`移除文件 ${file.name}`}
      >
        <X className="h-3.5 w-3.5 text-[var(--ink-400)] hover:text-[var(--seal-500)]" />
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
  modelColor = "var(--ink-900)",
  models = [],
  onModelChange,
  className
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
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

  // v2 message toolbar: "继续追问" focuses the composer.
  useEffect(() => {
    const handleFocusChatInput = () => {
      if (disabled || !textareaRef.current) return

      textareaRef.current.focus()
      textareaRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" })
      setIsFocused(true)
    }

    window.addEventListener("focus-chat-input", handleFocusChatInput)
    return () => window.removeEventListener("focus-chat-input", handleFocusChatInput)
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

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsCameraOpen(false)
  }

  const uploadFiles = (files: File[]) => {
    if (!onFileUpload || disabled || isLoading || files.length === 0) return false

    const fileList = createFileList(files)
    if (!fileList) return false

    onFileUpload(fileList)
    return true
  }

  const handleOpenCamera = async () => {
    if (disabled || isLoading) return

    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click()
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      })
      cameraStreamRef.current = stream
      setIsCameraOpen(true)
      requestAnimationFrame(() => {
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      })
    } catch {
      cameraInputRef.current?.click()
    }
  }

  const handleCapturePhoto = () => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext("2d")
    if (!context) return

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      uploadFiles([
        new File([blob], `camera-${Date.now()}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        }),
      ])
      stopCamera()
    }, "image/jpeg", 0.92)
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
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
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
        className,
        "relative mx-auto w-full max-w-3xl rounded-[var(--radius-card)] border border-[var(--ink-600)] bg-white shadow-[var(--shadow-paper)] touch-manipulation",
        "transition-[border-color,box-shadow] duration-200",
        "focus-within:border-[var(--ink-700)] focus-within:[box-shadow:var(--shadow-focus-ink)]",
        isFocused && "border-[var(--ink-700)]"
      )}
      style={{ 
        ['--ring-color' as string]: "var(--ink-500)"
      }}
    >
      <AnimatePresence>
        {isDraggingFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] border border-dashed border-[var(--ink-500)]/60 bg-[var(--ink-50)]/80 text-sm font-medium text-[var(--ink-800)] backdrop-blur-sm"
          >
            松开即可上传文件
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCameraOpen ? (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--ink-900)]/70 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-lg overflow-hidden rounded-[var(--radius-card)] border border-[var(--ink-600)] bg-[var(--paper-50)] shadow-[var(--shadow-elevated)]"
              initial={{ y: 18, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 18, scale: 0.98 }}
            >
              <div className="flex items-center justify-between border-b border-[var(--paper-200)] px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-800)]">
                  <Camera className="h-4 w-4" />
                  拍照上传
                </div>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-100)] hover:text-[var(--ink-800)]"
                  aria-label="关闭相机"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="bg-black">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
              <div className="flex items-center justify-end gap-2 px-4 py-3">
                <Button type="button" variant="ghost" size="sm" onClick={stopCamera}>
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCapturePhoto}
                  className="gap-2 bg-[var(--ink-700)] text-white hover:bg-[var(--ink-800)]"
                >
                  <Camera className="h-4 w-4" />
                  使用照片
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* 工具栏 */}
      {showModelSelector && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-b px-3 py-2 sm:px-4",
            isMobileInputMode && "max-sm:hidden"
          )}
          style={{ borderColor: "var(--paper-50)" }}
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
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--radius-pill)] border border-[var(--paper-300)] bg-[var(--paper-50)] text-[13px] font-medium text-[var(--ink-700)] font-[var(--font-sans-v2)] hover:bg-[var(--ink-50)] hover:border-[var(--ink-300)] transition-colors duration-200"
              aria-label="选择 AI 模型"
            >
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: modelColor }} />
              <span>
                {modelName || "选择模型"}
              </span>
              <ChevronDown className="h-3 w-3 text-[var(--ink-400)]" />
            </button>
          )}

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-[var(--ink-600)] hover:bg-[var(--ink-50)] sm:rounded-[var(--radius-soft)]"
              onClick={handleOpenCamera}
              disabled={isLoading || disabled}
              aria-label="打开相机拍照"
            >
              <Camera className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-[var(--ink-600)] hover:bg-[var(--ink-50)] sm:rounded-[var(--radius-soft)]"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || disabled}
              aria-label="上传附件"
            >
              <IconUpload className="h-4 w-4" />
            </Button>
          </div>
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
              style={{ borderColor: "var(--paper-50)" }}
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
          <div className="flex shrink-0 items-end gap-1">
            <div className="flex flex-col items-center gap-0.5 sm:gap-1">
              <span className="hidden text-[11px] text-[var(--ink-400)] font-[var(--font-mono-v2)] sm:block">
                拍照
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-11 w-11 sm:h-10 sm:w-10 rounded-[var(--radius-sharp)] touch-manipulation text-[var(--ink-600)] hover:bg-[var(--ink-50)]",
                  isFocused && "max-sm:h-9 max-sm:w-9 max-sm:rounded-full"
                )}
                onClick={handleOpenCamera}
                disabled={isLoading || disabled}
                aria-label="打开相机拍照"
              >
                <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
            <div className="flex flex-col items-center gap-0.5 sm:gap-1">
              <span className="hidden text-[11px] text-[var(--ink-400)] font-[var(--font-mono-v2)] sm:block">
                文件上传
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-11 w-11 sm:h-10 sm:w-10 rounded-[var(--radius-sharp)] touch-manipulation text-[var(--ink-600)] hover:bg-[var(--ink-50)]",
                  isFocused && "max-sm:h-9 max-sm:w-9 max-sm:rounded-full"
                )}
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || disabled}
                aria-label="上传附件"
              >
                <IconUpload className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>
        )}

        {/* 语音输入按钮 */}
        <div className={cn("flex flex-col items-center gap-0.5 sm:gap-1 shrink-0", isMobileInputMode && "max-sm:hidden")}>
          <span className="hidden text-[11px] text-[var(--ink-400)] font-[var(--font-mono-v2)] sm:block">
            {isListening ? "录音中" : "语音输入"}
          </span>
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleVoiceInput}
            disabled={isLoading || disabled}
            className={cn(
              "h-10 w-10 sm:h-10 sm:w-10 rounded-full sm:rounded-[var(--radius-sharp)] flex items-center justify-center transition-all duration-200 touch-manipulation",
              isListening
                ? "bg-[var(--seal-500)] text-white shadow-lg animate-pulse"
                : "text-[var(--ink-600)] hover:bg-[var(--ink-50)]"
            )}
            aria-label={isListening ? "停止录音" : "开始语音输入"}
          >
            {isListening ? (
              <MicOff className="h-4 w-4 sm:h-5 sm:w-5" />
            ) : (
              <IconMic className="h-4 w-4 sm:h-5 sm:w-5" />
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
            isMobileInputMode && "max-sm:min-h-[42px] max-sm:max-h-[112px] max-sm:bg-[var(--paper-50)]/80 max-sm:px-3 max-sm:py-2"
          )}
          style={{ color: "var(--ink-700)" }}
          rows={1}
        />

        {/* 发送按钮 */}
        <div className="flex flex-col items-center gap-0.5 sm:gap-1 shrink-0">
          <span className="hidden text-[11px] text-[var(--ink-400)] font-[var(--font-mono-v2)] sm:block">
            发送
          </span>
          <motion.button
            type="button"
            whileHover={canSubmit ? { scale: 1.02, y: -1 } : {}}
            whileTap={canSubmit ? { scale: 0.98 } : {}}
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full sm:h-10 sm:w-10 sm:rounded-[var(--radius-sharp)] touch-manipulation",
              "bg-[var(--seal-500)] text-white transition-all duration-200 hover:bg-[var(--seal-600)]",
              "active:translate-y-[1px] active:shadow-[inset_0_1px_2px_rgba(142,45,34,0.45)]",
              "disabled:opacity-50 disabled:bg-[var(--paper-300)]",
              isMobileInputMode && "max-sm:h-10 max-sm:w-10",
              !canSubmit && "cursor-not-allowed"
            )}
            aria-label="发送消息"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <IconSend className="h-5 w-5" />
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
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        aria-label="拍照上传"
      />
    </div>
  )
}

export default ChatInput
