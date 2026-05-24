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
  useId,
  type KeyboardEvent,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
} from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Camera, Volume2, X, Loader2, ChevronDown, CornerDownLeft, Sparkles, Plus } from "lucide-react"
import { IconEssay, IconMic, IconUpload } from "@/components/icons/v2"
import { cn } from "@/lib/utils"
import { ModelSelector, type Model } from "./ModelSelector"
import { getDifyTTS } from "@/lib/voice-service"
import { toast } from "sonner"

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
  /** 禁用原因，用于区分未登录和生成中 */
  disabledReason?: "auth" | "loading" | "manual"
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
  /** 是否显示 OpenClaw 技能加载按钮 */
  showOpenClawSkillButton?: boolean
  /** 当前选择的 OpenClaw 技能名 */
  selectedOpenClawSkillName?: string
  /** 点击 OpenClaw 技能加载按钮 */
  onOpenClawSkillClick?: () => void
  /** 是否显示 Codex 技能加载按钮 */
  showCodexSkillButton?: boolean
  /** 当前选择的 Codex 技能名 */
  selectedCodexSkillName?: string
  /** 点击 Codex 技能加载按钮 */
  onCodexSkillClick?: () => void
  /** 自定义类名 */
  className?: string
}

const CHAT_FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf,.doc,.docx,.txt,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const CHAT_CAMERA_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"

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
          <IconEssay className="h-4 w-4" style={{ color: "var(--ink-600)" }} />
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
  disabledReason,
  placeholder = "输入内容开始对话...",
  modelName,
  selectedModel,
  onModelClick,
  showModelSelector = false,
  modelColor = "var(--ink-900)",
  models = [],
  onModelChange,
  showOpenClawSkillButton = false,
  selectedOpenClawSkillName,
  onOpenClawSkillClick,
  showCodexSkillButton = false,
  selectedCodexSkillName,
  onCodexSkillClick,
  className
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const cameraVideoRef = useRef<HTMLVideoElement>(null)
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const uploadInputId = useId()
  const cameraInputId = useId()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isPreparingSpeech, setIsPreparingSpeech] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [isCameraReady, setIsCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState("")
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
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
    closeMobileTools()
  }

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    setIsCameraReady(false)
  }

  const closeCamera = () => {
    stopCamera()
    setIsCameraOpen(false)
    setCameraError("")
  }

  const uploadFiles = (files: File[]) => {
    if (!onFileUpload || disabled || isLoading || files.length === 0) return false

    const fileList = createFileList(files)
    if (!fileList) return false

    onFileUpload(fileList)
    return true
  }

  useEffect(() => {
    if (!isCameraOpen) return

    let isActive = true

    const startCamera = async () => {
      try {
        setCameraError("")
        setIsCameraReady(false)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        })

        if (!isActive) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        cameraStreamRef.current = stream
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream
          await cameraVideoRef.current.play()
          setIsCameraReady(true)
        }
      } catch (error) {
        console.error("相机启动失败:", error)
        setCameraError("无法打开摄像头，请检查浏览器权限，或改用系统拍照/相册。")
      }
    }

    startCamera()

    return () => {
      isActive = false
      stopCamera()
    }
  }, [isCameraOpen])

  const captureCameraPhoto = async () => {
    const video = cameraVideoRef.current
    const canvas = cameraCanvasRef.current
    if (!video || !canvas || !onFileUpload) return

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext("2d")
    if (!context) {
      toast.error("相机画面处理失败")
      return
    }

    context.drawImage(video, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92))
    if (!blob) {
      toast.error("拍照失败，请重试")
      return
    }

    const file = new File([blob], `camera-${Date.now()}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    })

    if (uploadFiles([file])) {
      closeCamera()
    }
  }

  const stopAudioPlayback = () => {
    const audio = audioRef.current
    if (!audio) return

    audio.pause()
    if (audio.src.startsWith("blob:")) URL.revokeObjectURL(audio.src)
    audioRef.current = null
    setIsSpeaking(false)
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
      stopAudioPlayback()
      stopCamera()
    }
  }, [])

  const playInputText = async () => {
    const text = value.trim()
    if (!text) {
      toast.info("请输入要朗读的文字")
      return
    }

    if (isSpeaking) {
      stopAudioPlayback()
      return
    }

    try {
      setIsPreparingSpeech(true)
      const audioUrl = await getDifyTTS(text, selectedModel)
      const audio = new Audio(audioUrl)
      audioRef.current = audio
      audio.onended = () => {
        setIsSpeaking(false)
        if (audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl)
      }
      audio.onerror = () => {
        setIsSpeaking(false)
        toast.error("语音播放失败")
      }
      await audio.play()
      setIsSpeaking(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "语音合成失败")
    } finally {
      setIsPreparingSpeech(false)
    }
  }

  // 是否可以提交
  const effectiveDisabledReason = disabledReason || (isLoading ? "loading" : disabled ? "auth" : undefined)
  const inputPlaceholder = effectiveDisabledReason === "auth"
    ? "请先登录..."
    : isLoading
      ? "正在处理，请稍候..."
      : placeholder
  const canSubmit = !isLoading && !disabled && (value.trim() || uploadedFiles.length > 0)

  const closeMobileTools = () => setMobileToolsOpen(false)

  return (
    <div
      onPaste={handlePaste}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        className,
        "relative mx-auto w-full max-w-3xl rounded-[var(--radius-card)] border border-[var(--paper-200)] bg-white shadow-[0_18px_46px_rgba(14,27,17,0.14),0_4px_12px_rgba(14,27,17,0.08)] touch-manipulation",
        "max-sm:rounded-[var(--radius-soft)] max-sm:shadow-[0_-4px_20px_rgba(14,27,17,0.10)]",
        "transition-[border-color,box-shadow] duration-200",
        "focus-within:border-[var(--ink-300)] focus-within:shadow-[0_22px_60px_rgba(14,27,17,0.16),0_6px_16px_rgba(14,27,17,0.10)]",
        isFocused && "border-[var(--ink-300)]"
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

      {/* 工具栏 */}
      {showModelSelector && (
        <div
          className="flex items-center justify-between gap-2 border-b px-2 py-1.5 sm:px-3"
          style={{ borderColor: "var(--paper-50)" }}
        >
          {/* 模型选择器 - 使用 ModelSelector 组件 */}
          {models.length > 0 && selectedModel && onModelChange ? (
            <ModelSelector
              selectedModel={selectedModel}
              onModelChange={onModelChange}
              models={models}
              disabled={isLoading || disabled}
              className="h-8 max-w-[230px] px-2 py-0 text-[12px] sm:max-w-[260px]"
            />
          ) : (
            /* Fallback: 简单按钮（当 props 不完整时） */
            <button
              type="button"
              onClick={onModelClick}
              className="inline-flex h-8 max-w-[230px] items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--paper-300)] bg-[var(--paper-50)] px-2 text-[12px] font-medium text-[var(--ink-700)] font-[var(--font-sans-v2)] hover:bg-[var(--ink-50)] hover:border-[var(--ink-300)] transition-colors duration-200 sm:max-w-[260px]"
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
            {showOpenClawSkillButton && (
              <button
                type="button"
                onClick={onOpenClawSkillClick}
                disabled={isLoading || disabled || !onOpenClawSkillClick}
                className={cn(
                  "inline-flex h-8 max-w-[142px] items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 text-[12px] font-semibold transition-colors",
                  selectedOpenClawSkillName
                    ? "border-[var(--ink-300)] bg-[var(--ink-50)] text-[var(--ink-800)]"
                    : "border-[var(--paper-200)] bg-[var(--paper-50)] text-[var(--ink-600)] hover:border-[var(--ink-300)] hover:bg-[var(--ink-50)]",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
                aria-label="加载 OpenClaw 技能"
                title={selectedOpenClawSkillName ? `已选择：${selectedOpenClawSkillName}` : "加载技能"}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{selectedOpenClawSkillName || "加载技能"}</span>
              </button>
            )}
            {showCodexSkillButton && (
              <button
                type="button"
                onClick={onCodexSkillClick}
                disabled={isLoading || disabled || !onCodexSkillClick}
                className={cn(
                  "inline-flex h-8 max-w-[142px] items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 text-[12px] font-semibold transition-colors",
                  selectedCodexSkillName
                    ? "border-[var(--ink-300)] bg-[var(--ink-50)] text-[var(--ink-800)]"
                    : "border-[var(--paper-200)] bg-[var(--paper-50)] text-[var(--ink-600)] hover:border-[var(--ink-300)] hover:bg-[var(--ink-50)]",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
                aria-label="加载 Codex 技能"
                title={selectedCodexSkillName ? `已选择：${selectedCodexSkillName}` : "加载技能"}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{selectedCodexSkillName || "加载技能"}</span>
              </button>
            )}
            <label
              htmlFor={uploadInputId}
              aria-disabled={isLoading || disabled}
              className={cn(
                "hidden h-8 w-8 cursor-pointer select-none items-center justify-center rounded-full text-[var(--ink-600)] transition-colors hover:bg-[var(--ink-50)] sm:inline-flex sm:rounded-[var(--radius-soft)]",
                (isLoading || disabled) && "pointer-events-none opacity-50"
              )}
              aria-label="上传附件"
            >
              <IconUpload className="h-4 w-4" />
            </label>
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
          "flex items-end gap-1.5 p-2 sm:gap-2 sm:p-2.5",
          "max-sm:gap-1 max-sm:p-1.5 max-sm:pb-2"
        )}
      >
        {showModelSelector ? (
          <div className="relative shrink-0 sm:hidden">
            <button
              type="button"
              onClick={() => setMobileToolsOpen((open) => !open)}
              disabled={isLoading || disabled}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full border border-[var(--paper-200)] bg-[var(--paper-50)] text-[var(--ink-700)] shadow-sm transition-colors",
                "hover:bg-[var(--ink-50)] active:bg-[var(--ink-100)] disabled:cursor-not-allowed disabled:opacity-50",
                mobileToolsOpen && "bg-[var(--ink-50)] text-[var(--ink-900)]"
              )}
              aria-label={mobileToolsOpen ? "收起输入工具" : "展开输入工具"}
              aria-expanded={mobileToolsOpen}
            >
              <Plus className={cn("h-5 w-5 transition-transform", mobileToolsOpen && "rotate-45")} />
            </button>

            <AnimatePresence>
              {mobileToolsOpen ? (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.16 }}
                  className="absolute bottom-12 left-0 z-40 min-w-[164px] overflow-hidden rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-1 shadow-[0_12px_34px_rgba(14,27,17,0.16)]"
                >
                  <label
                    htmlFor={uploadInputId}
                    className={cn(
                      "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-soft)] px-3 text-left text-[14px] font-medium text-[var(--ink-800)] hover:bg-[var(--ink-50)]",
                      (isLoading || disabled) && "pointer-events-none opacity-50"
                    )}
                    aria-disabled={isLoading || disabled}
                  >
                    <IconUpload className="h-4 w-4 text-[var(--ink-700)]" />
                    上传文件
                  </label>
                  <label
                    htmlFor={cameraInputId}
                    className={cn(
                      "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-soft)] px-3 text-left text-[14px] font-medium text-[var(--ink-800)] hover:bg-[var(--ink-50)]",
                      (isLoading || disabled || !onFileUpload) && "pointer-events-none opacity-50"
                    )}
                    aria-disabled={isLoading || disabled || !onFileUpload}
                  >
                    <Camera className="h-4 w-4 text-[var(--ink-700)]" />
                    拍照/相册
                  </label>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-soft)] px-3 text-left text-[14px] font-medium text-[var(--ink-800)] hover:bg-[var(--ink-50)]"
                    onClick={() => {
                      closeMobileTools()
                      toggleVoiceInput()
                    }}
                    disabled={isLoading || disabled}
                  >
                    <IconMic className="h-4 w-4 text-[var(--ink-700)]" />
                    {isListening ? "停止语音" : "语音输入"}
                  </button>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-soft)] px-3 text-left text-[14px] font-medium text-[var(--ink-800)] hover:bg-[var(--ink-50)] disabled:opacity-50"
                    onClick={() => {
                      closeMobileTools()
                      playInputText()
                    }}
                    disabled={isLoading || disabled || isPreparingSpeech || !value.trim()}
                  >
                    <Volume2 className="h-4 w-4 text-[var(--ink-700)]" />
                    {isSpeaking ? "停止朗读" : "朗读文字"}
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}

        {/* 附件按钮（工具栏隐藏或移动端键盘态时显示） */}
        {!showModelSelector && (
          <div className="flex shrink-0 items-end gap-1">
            <div className="flex flex-col items-center gap-0.5 sm:gap-1">
              <span className="hidden text-[11px] text-[var(--ink-400)] font-[var(--font-mono-v2)] sm:block">
                文件上传
              </span>
              <label
                htmlFor={uploadInputId}
                className={cn(
                  "inline-flex h-11 w-11 cursor-pointer select-none items-center justify-center rounded-[var(--radius-sharp)] text-[var(--ink-600)] transition-colors hover:bg-[var(--ink-50)] sm:h-10 sm:w-10",
                  "touch-manipulation",
                  isFocused && "max-sm:h-9 max-sm:w-9 max-sm:rounded-full",
                  (isLoading || disabled) && "pointer-events-none opacity-50"
                )}
                aria-label="上传附件"
              >
                <IconUpload className="h-4 w-4 sm:h-5 sm:w-5" />
              </label>
            </div>
            <div className="flex flex-col items-center gap-0.5 sm:gap-1">
              <span className="hidden text-[11px] text-[var(--ink-400)] font-[var(--font-mono-v2)] sm:block">
                拍照
              </span>
              <label
                htmlFor={cameraInputId}
                className={cn(
                  "inline-flex h-11 w-11 cursor-pointer select-none items-center justify-center rounded-[var(--radius-sharp)] text-[var(--ink-600)] transition-colors hover:bg-[var(--ink-50)] sm:h-10 sm:w-10",
                  "touch-manipulation",
                  isFocused && "max-sm:h-9 max-sm:w-9 max-sm:rounded-full",
                  (isLoading || disabled || !onFileUpload) && "pointer-events-none opacity-50"
                )}
                aria-label="拍照上传"
                title="拍照上传"
              >
                <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
              </label>
            </div>
          </div>
        )}

        <div
          className={cn(
            showModelSelector
              ? "hidden shrink-0 items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--paper-200)] bg-[var(--paper-50)]/75 p-1 sm:flex"
              : "contents"
          )}
        >
          {showModelSelector ? (
            <>
              <span className="sr-only">拍照</span>
              <label
                htmlFor={cameraInputId}
                className={cn(
                  "inline-flex h-8 w-8 cursor-pointer select-none items-center justify-center rounded-full text-[var(--ink-600)] transition-colors hover:bg-white sm:rounded-[var(--radius-sharp)]",
                  (isLoading || disabled || !onFileUpload) && "pointer-events-none opacity-50"
                )}
                aria-label="拍照上传"
                title="拍照上传"
              >
                <Camera className="h-4 w-4" />
              </label>
            </>
          ) : null}

          <div className={cn("flex shrink-0 flex-col items-center gap-0.5 sm:gap-1", showModelSelector && "contents")}>
            <span className={cn("hidden text-[11px] text-[var(--ink-400)] font-[var(--font-mono-v2)] sm:block", showModelSelector && "sr-only")}>
              {isPreparingSpeech ? "合成中" : isSpeaking ? "播放中" : "朗读"}
            </span>
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={playInputText}
              disabled={isLoading || disabled || isPreparingSpeech || !value.trim()}
              className={cn(
                showModelSelector ? "h-8 w-8" : "h-10 w-10",
                "rounded-full sm:rounded-[var(--radius-sharp)] flex items-center justify-center transition-all duration-200 touch-manipulation",
                isSpeaking
                  ? "bg-[var(--ink-700)] text-white shadow-lg"
                  : showModelSelector
                    ? "text-[var(--ink-600)] hover:bg-white"
                    : "text-[var(--ink-600)] hover:bg-[var(--ink-50)]",
                (!value.trim() || isPreparingSpeech) && "opacity-50"
              )}
              aria-label={isSpeaking ? "停止朗读" : "朗读输入文字"}
              title={isSpeaking ? "停止朗读" : "朗读输入文字"}
            >
              {isPreparingSpeech ? (
                <Loader2 className={cn("h-4 w-4 animate-spin", !showModelSelector && "sm:h-5 sm:w-5")} />
              ) : (
                <Volume2 className={cn("h-4 w-4", !showModelSelector && "sm:h-5 sm:w-5")} />
              )}
            </motion.button>
          </div>

          {/* 语音输入按钮 */}
          <div className={cn("flex flex-col items-center gap-0.5 sm:gap-1 shrink-0", showModelSelector && "contents", isMobileInputMode && "max-sm:hidden")}>
            <span className={cn("hidden text-[11px] text-[var(--ink-400)] font-[var(--font-mono-v2)] sm:block", showModelSelector && "sr-only")}>
              {isListening ? "录音中" : "语音输入"}
            </span>
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleVoiceInput}
              disabled={isLoading || disabled}
              className={cn(
                showModelSelector ? "h-8 w-8" : "h-10 w-10 sm:h-10 sm:w-10",
                "rounded-full sm:rounded-[var(--radius-sharp)] flex items-center justify-center transition-all duration-200 touch-manipulation",
                isListening
                  ? "bg-[var(--seal-500)] text-white shadow-lg animate-pulse"
                  : showModelSelector
                    ? "text-[var(--ink-600)] hover:bg-white"
                    : "text-[var(--ink-600)] hover:bg-[var(--ink-50)]"
              )}
              aria-label={isListening ? "停止录音" : "开始语音输入"}
            >
              {isListening ? (
                <IconMic className={cn("h-4 w-4 opacity-50", !showModelSelector && "sm:h-5 sm:w-5")} />
              ) : (
                <IconMic className={cn("h-4 w-4", !showModelSelector && "sm:h-5 sm:w-5")} />
              )}
            </motion.button>
          </div>
        </div>

        {/* 文本输入框 */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={inputPlaceholder}
          disabled={disabled || isLoading}
          className={cn(
            "min-w-0 flex-1 resize-none border bg-white shadow-none",
            "min-h-[58px] max-h-[148px] rounded-[20px] border-[var(--ink-500)]/65 px-4 py-3 text-[16px] leading-6 sm:min-h-[60px] sm:max-h-[170px] sm:px-4 sm:py-3 sm:text-[16px]",
            "placeholder:text-[var(--ink-500)]",
            "focus-visible:border-[var(--ink-700)] focus-visible:ring-0 focus-visible:[box-shadow:0_0_0_2px_rgba(43,74,52,0.12)]",
            "max-sm:min-h-[46px] max-sm:max-h-[120px] max-sm:rounded-[var(--radius-soft)] max-sm:px-3 max-sm:py-2.5"
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
              "max-sm:h-10 max-sm:w-10",
              !canSubmit && "cursor-not-allowed"
            )}
            aria-label="发送消息"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CornerDownLeft className="h-5 w-5" />
            )}
          </motion.button>
        </div>
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        id={uploadInputId}
        type="file"
        className="sx-file-input"
        multiple
        accept={CHAT_FILE_ACCEPT}
        onChange={handleFileChange}
        aria-label="文件上传"
      />
      <input
        ref={cameraInputRef}
        id={cameraInputId}
        type="file"
        className="sx-file-input"
        accept={CHAT_CAMERA_ACCEPT}
        capture="environment"
        onChange={handleFileChange}
        aria-label="拍照上传"
      />
      <AnimatePresence>
        {isCameraOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="拍照上传"
          >
            <motion.div
              className="w-full max-w-lg overflow-hidden rounded-[var(--radius-card)] bg-white shadow-2xl"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
            >
              <div className="flex items-center justify-between border-b border-[var(--paper-100)] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink-800)]">拍照上传</p>
                  <p className="text-xs text-[var(--ink-500)]">支持手机摄像头和电脑摄像头</p>
                </div>
                <button
                  type="button"
                  onClick={closeCamera}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink-500)] hover:bg-[var(--paper-100)]"
                  aria-label="关闭相机"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="bg-black">
                {cameraError ? (
                  <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center text-white">
                    <Camera className="h-8 w-8 opacity-80" />
                    <p className="text-sm leading-6">{cameraError}</p>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <label htmlFor={cameraInputId} className="cursor-pointer">
                        打开系统拍照/相册
                      </label>
                    </Button>
                  </div>
                ) : (
                  <video
                    ref={cameraVideoRef}
                    className="aspect-[4/3] w-full bg-black object-cover"
                    playsInline
                    muted
                  />
                )}
                <canvas ref={cameraCanvasRef} className="hidden" />
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <Button type="button" variant="ghost" asChild>
                  <label htmlFor={cameraInputId} className="cursor-pointer">
                    从相册选择
                  </label>
                </Button>
                <Button type="button" onClick={captureCameraPhoto} disabled={!isCameraReady || Boolean(cameraError)}>
                  <Camera className="mr-2 h-4 w-4" />
                  拍照使用
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export default ChatInput
