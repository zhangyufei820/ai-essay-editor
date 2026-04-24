"use client"

/**
 * GPT Image 2 专用聊天界面
 * 特点：
 * 1. 文生图 / 图像编辑 模式切换
 * 2. 尺寸选择：1024x1024 (1:1)、1024x1536 (9:16)、1536x1024 (4:3)
 * 3. 流式输出文字描述 + 图片渲染
 */

import type React from "react"
import { useState, useRef, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Paperclip, X, FileText, Copy, Loader2, Palette, User,
  ChevronLeft, ArrowDown, Download, Share2, Sparkles, Wand2, Image as ImageIcon,
  History
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@supabase/supabase-js"
import { collapseSidebar, refreshCredits } from "@/components/app-sidebar"
import { calculatePreviewCost, type ModelType } from "@/lib/pricing"
import { UltimateRenderer } from "@/components/chat/UltimateRenderer"
import { UserMessageBubble } from "@/components/chat/UserMessageBubble"
import { ModelLogo } from "@/components/ModelLogo"
import { GridWaveLoader } from "@/components/chat/GridWaveLoader"
import { getApiUrl } from "@/lib/api-config"

const BRAND_GREEN = "#14532d"

// 🎨 模式选项
const MODE_OPTIONS = [
  { key: "text-to-image", label: "文生图", icon: Wand2 },
  { key: "image-edit", label: "图像编辑", icon: ImageIcon },
] as const

type ModeOption = typeof MODE_OPTIONS[number]

function toDifyImageMode(modeKey: ModeOption["key"]): "generate" | "edit" {
  return modeKey === "image-edit" ? "edit" : "generate"
}

// 🎨 尺寸选项配置
const RATIO_OPTIONS = ["1:1", "4:3", "3:2", "16:9", "9:16", "2:3", "3:4"] as const

const SIZE_TIER_OPTIONS = [
  { value: "standard", label: "标准" },
  { value: "hd", label: "高清" },
  { value: "2k", label: "2K" },
  { value: "4k-experimental", label: "4K 实验" },
] as const

const SIZE_OPTIONS = [
  { value: "1-1-standard", ratio: "1:1", tier: "standard", tierLabel: "标准", apiValue: "1024x1024" },
  { value: "1-1-hd", ratio: "1:1", tier: "hd", tierLabel: "高清", apiValue: "1536x1536" },
  { value: "1-1-2k", ratio: "1:1", tier: "2k", tierLabel: "2K", apiValue: "2048x2048" },
  { value: "1-1-4k", ratio: "1:1", tier: "4k-experimental", tierLabel: "4K 实验", apiValue: "3072x3072" },
  { value: "4-3-standard", ratio: "4:3", tier: "standard", tierLabel: "标准", apiValue: "1024x768" },
  { value: "4-3-hd", ratio: "4:3", tier: "hd", tierLabel: "高清", apiValue: "1440x1080" },
  { value: "4-3-2k", ratio: "4:3", tier: "2k", tierLabel: "2K", apiValue: "2048x1536" },
  { value: "4-3-4k", ratio: "4:3", tier: "4k-experimental", tierLabel: "4K 实验", apiValue: "2880x2160" },
  { value: "3-2-standard", ratio: "3:2", tier: "standard", tierLabel: "标准", apiValue: "1152x768" },
  { value: "3-2-hd", ratio: "3:2", tier: "hd", tierLabel: "高清", apiValue: "1620x1080" },
  { value: "3-2-2k", ratio: "3:2", tier: "2k", tierLabel: "2K", apiValue: "2304x1536" },
  { value: "3-2-4k", ratio: "3:2", tier: "4k-experimental", tierLabel: "4K 实验", apiValue: "3240x2160" },
  { value: "16-9-standard", ratio: "16:9", tier: "standard", tierLabel: "标准", apiValue: "1024x576" },
  { value: "16-9-hd", ratio: "16:9", tier: "hd", tierLabel: "高清", apiValue: "1920x1080" },
  { value: "16-9-2k", ratio: "16:9", tier: "2k", tierLabel: "2K", apiValue: "2560x1440" },
  { value: "16-9-4k", ratio: "16:9", tier: "4k-experimental", tierLabel: "4K 实验", apiValue: "3840x2160" },
  { value: "9-16-standard", ratio: "9:16", tier: "standard", tierLabel: "标准", apiValue: "576x1024" },
  { value: "9-16-hd", ratio: "9:16", tier: "hd", tierLabel: "高清", apiValue: "1080x1920" },
  { value: "9-16-2k", ratio: "9:16", tier: "2k", tierLabel: "2K", apiValue: "1440x2560" },
  { value: "9-16-4k", ratio: "9:16", tier: "4k-experimental", tierLabel: "4K 实验", apiValue: "2160x3840" },
  { value: "2-3-standard", ratio: "2:3", tier: "standard", tierLabel: "标准", apiValue: "768x1152" },
  { value: "2-3-hd", ratio: "2:3", tier: "hd", tierLabel: "高清", apiValue: "1080x1620" },
  { value: "2-3-2k", ratio: "2:3", tier: "2k", tierLabel: "2K", apiValue: "1536x2304" },
  { value: "2-3-4k", ratio: "2:3", tier: "4k-experimental", tierLabel: "4K 实验", apiValue: "2160x3240" },
  { value: "3-4-standard", ratio: "3:4", tier: "standard", tierLabel: "标准", apiValue: "768x1024" },
  { value: "3-4-hd", ratio: "3:4", tier: "hd", tierLabel: "高清", apiValue: "1080x1440" },
  { value: "3-4-2k", ratio: "3:4", tier: "2k", tierLabel: "2K", apiValue: "1536x2048" },
  { value: "3-4-4k", ratio: "3:4", tier: "4k-experimental", tierLabel: "4K 实验", apiValue: "2160x2880" },
] as const

type SizeOption = typeof SIZE_OPTIONS[number]
type SizeRatio = typeof RATIO_OPTIONS[number]
type SizeTier = typeof SIZE_TIER_OPTIONS[number]["value"]

const TEXT_TO_IMAGE_PRESETS = [
  "高端植物洗护广告图，墨绿色瓶身，暖白背景，国际品牌海报风",
  "极简珠宝静物，柔和棚拍光，浅灰石材台面，奢侈品画册质感",
  "未来感智能家居场景，浅雾白空间，电影级逆光，北欧极简构图",
]

const IMAGE_EDIT_PRESETS = [
  "保留主体和构图，移除背景杂物，整体提升高级商业质感",
  "保留人物面部特征，替换成干净品牌背景，增强光影层次",
  "保持产品主体不变，改成国际品牌海报风，材质更通透精致",
]

function formatSizeLabel(apiValue: string) {
  return apiValue.replace("x", "×")
}

function parseImageSize(apiValue: string) {
  const [widthText, heightText] = apiValue.split("x")
  const width = Number(widthText)
  const height = Number(heightText)

  return {
    width,
    height,
  }
}

function extractImageUrls(payload: unknown): string[] {
  const urls = new Set<string>()

  const visit = (value: unknown) => {
    if (!value) return

    if (typeof value === "string") {
      if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:image/")) {
        urls.add(value)
      }
      return
    }

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    if (typeof value !== "object") return

    const record = value as Record<string, unknown>

    visit(record.url)
    visit(record.first_url)
    visit(record.image_data_uri)
    visit(record.image)
    visit(record.images)
    visit(record.file)
    visit(record.files)
    visit(record.outputs)
    visit(record.data)

    if (typeof record.raw_body === "string") {
      try {
        visit(JSON.parse(record.raw_body))
      } catch {
        // Ignore malformed raw_body payloads and keep other fallbacks.
      }
    }
  }

  visit(payload)
  return Array.from(urls)
}

function extractWorkflowTextSegments(payload: unknown): string[] {
  const segments: string[] = []
  const seen = new Set<string>()

  const push = (value: unknown, prefix?: string) => {
    if (typeof value !== "string") return
    const trimmed = value.trim()
    if (!trimmed) return
    const nextValue = prefix ? `${prefix}${trimmed}` : trimmed
    if (!seen.has(nextValue)) {
      seen.add(nextValue)
      segments.push(nextValue)
    }
  }

  const visit = (value: unknown) => {
    if (!value) return

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    if (typeof value !== "object") return

    const record = value as Record<string, unknown>
    push(record.text)
    push(record.result)
    push(record.error, "Error: ")
    push(record.revised_prompt, "Revised prompt: ")
    visit(record.outputs)
    visit(record.data)
    visit(record.files)

    if (typeof record.raw_body === "string") {
      try {
        visit(JSON.parse(record.raw_body))
      } catch {
        // Ignore malformed raw_body payloads and keep other fallbacks.
      }
    }
  }

  visit(payload)
  return segments
}

function buildAssistantContentFromWorkflowResult(result: any) {
  const payloads = [
    result?.data?.outputs,
    result?.data,
    result?.outputs,
    result,
  ]

  const imageUrls = payloads.flatMap((payload) => extractImageUrls(payload))
  const uniqueImageUrls = Array.from(new Set(imageUrls))
  const textSegments = payloads.flatMap((payload) => extractWorkflowTextSegments(payload))
  const uniqueTextSegments = Array.from(new Set(textSegments))
  const status = result?.data?.status || result?.status

  if (uniqueImageUrls.length > 0) {
    return [
      ...uniqueTextSegments,
      ...uniqueImageUrls.map((url) => `![Generated Image](${url})`)
    ].join("\n\n")
  }

  if (uniqueTextSegments.length > 0) {
    return uniqueTextSegments.join("\n\n")
  }

  if (typeof status === "string" && status !== "succeeded") {
    return `图像工作流已结束，当前状态：${status}。`
  }

  if (result?.task_id || result?.workflow_run_id) {
    return "图像任务已提交，但工作流暂未返回可展示的图片结果。"
  }

  return ""
}

// Supabase 初始化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  files?: UploadedFile[]
}

type UploadedFile = {
  name: string
  type: string
  size: number
  data: string
  preview?: string
  difyFileId?: string
}

type ChatSession = {
  id: string
  title: string
  date: number
  preview: string
  ai_model: string
}

// 🎯 流式光标组件
const StreamingCursor = () => (
  <span className="inline-block ml-1 text-green-700 animate-pulse">▍</span>
)

// 🖼️ 图片渲染组件
function GptImage2Renderer({ content, isStreaming = false }: { content: string; isStreaming?: boolean }) {
  if (!content) return <StreamingCursor />;

  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  const images: Array<{alt: string, url: string}> = []
  let match

  while ((match = imageRegex.exec(content)) !== null) {
    images.push({
      alt: match[1] || 'Generated Image',
      url: match[2]
    })
  }

  const textContent = content.replace(imageRegex, '').trim()

  return (
    <div className="space-y-4">
      {textContent && (
        <div className="text-slate-700 leading-relaxed">
          <UltimateRenderer content={textContent} />
          {isStreaming && !images.length && <StreamingCursor />}
        </div>
      )}

      {images.map((img, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="relative rounded-2xl overflow-hidden shadow-xl border border-green-100"
        >
          <img
            src={img.url}
            alt={img.alt}
            className="w-full h-auto"
            loading="lazy"
          />
          <a
            href={img.url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-3 right-3 p-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg hover:bg-white transition-all"
          >
            <Download className="w-4 h-4 text-slate-600" />
          </a>
        </motion.div>
      ))}
    </div>
  )
}

function GptImage2ChatInterfaceInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const urlSessionId = searchParams.get("id")

  const [userId, setUserId] = useState<string>("")
  const [userAvatar, setUserAvatar] = useState<string>("")
  const [userCredits, setUserCredits] = useState<number>(0)
  const [userDisplayName, setUserDisplayName] = useState<string>("")
  const sessionIdRef = useRef<string | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string>("")

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)
  const [editNotes, setEditNotes] = useState("")

  // 🎨 新增：模式选择和尺寸选择
  const [selectedMode, setSelectedMode] = useState<ModeOption>(MODE_OPTIONS[0])
  const [selectedSize, setSelectedSize] = useState<SizeOption>(SIZE_OPTIONS[0])
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)

  // 🔥 历史会话侧边栏状态
  const [showHistorySidebar, setShowHistorySidebar] = useState(false)
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentBotIdRef = useRef<string | null>(null)

  const [isNearBottom, setIsNearBottom] = useState(true)
  const [hasNewMessage, setHasNewMessage] = useState(false)
  const [showHeroIntro, setShowHeroIntro] = useState(true)
  const tierOptionsForRatio = SIZE_OPTIONS.filter((option) => option.ratio === selectedSize.ratio)
  const actionLabel = selectedMode.key === "image-edit" ? "开始编辑" : "开始生成"
  const promptPlaceholder = selectedMode.key === "image-edit"
    ? "描述你想编辑的画面调整方向、风格、材质、灯光与构图，例如：保留人物主体，改成高级杂志封面风，柔和棚拍光。"
    : "描述你想生成的画面、风格、材质、灯光与构图，例如：高端植物洗护广告图，墨绿色瓶身，暖白背景，国际品牌海报风。"
  const selectedSummary = `${selectedSize.ratio} · ${selectedSize.tierLabel} · ${formatSizeLabel(selectedSize.apiValue)} · ${selectedMode.label}`
  const selectionHint = selectedMode.key === "image-edit"
    ? "上传参考图后，系统会将模式、尺寸与比例一并传给后端。"
    : "系统会将当前模式、尺寸与比例一并传给后端生成链路。"
  const modeGuideTitle = selectedMode.key === "image-edit" ? "上传参考图并写下编辑指令" : "输入提示词，开始你的图像创作"
  const modeGuideDescription = selectedMode.key === "image-edit"
    ? "图像编辑模式会以参考图为基础，再结合你的编辑指令与输出参数生成结果。"
    : "文生图模式以提示词为核心，你也可以补充参考图来统一风格和氛围。"
  const heroPrompts = selectedMode.key === "image-edit" ? IMAGE_EDIT_PRESETS : TEXT_TO_IMAGE_PRESETS
  const hasPrompt = Boolean(input.trim() || (selectedMode.key === "image-edit" && editNotes.trim()))
  const canSubmit = selectedMode.key === "image-edit"
    ? hasPrompt && uploadedFiles.length > 0
    : hasPrompt
  const isLandingState = messages.length === 0 && showHeroIntro
  const isWorkspaceFocused = messages.length === 0 && !showHeroIntro
  const hasMessages = messages.length > 0
  const isChatMode = hasMessages
  const advancedSettingsVisible = showAdvancedSettings || isLandingState

  const selectRatio = (ratio: SizeRatio) => {
    const matchedSize =
      SIZE_OPTIONS.find((option) => option.ratio === ratio && option.tier === selectedSize.tier) ||
      SIZE_OPTIONS.find((option) => option.ratio === ratio)

    if (matchedSize) {
      setSelectedSize(matchedSize)
    }
  }

  const selectTier = (tier: SizeTier) => {
    const matchedSize =
      SIZE_OPTIONS.find((option) => option.ratio === selectedSize.ratio && option.tier === tier) ||
      SIZE_OPTIONS.find((option) => option.tier === tier)

    if (matchedSize) {
      setSelectedSize(matchedSize)
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('currentUser')
      if (userStr) {
        try {
          const user = JSON.parse(userStr)
          const uid = user.id || user.sub || user.userId || ""
          setUserId(uid)
          if (user.user_metadata?.avatar_url) setUserAvatar(user.user_metadata.avatar_url)

          const displayName = user.phone || user.phone_number || user.email || user.nickname || user.username || user.user_metadata?.name || "用户"
          setUserDisplayName(displayName)

          if (uid) fetchCredits(uid)
        } catch (e) {
          console.error("❌ [用户初始化] 解析失败:", e)
        }
      }
    }
  }, [])

  const fetchCredits = async (uid: string) => {
    try {
      const res = await fetch(getApiUrl(`/api/user/credits?user_id=${encodeURIComponent(uid)}`))
      if (res.ok) {
        const data = await res.json()
        setUserCredits(data.credits || 0)
      }
    } catch (err) {
      console.error("❌ [积分查询] 异常:", err)
    }
  }

  useEffect(() => {
    if (urlSessionId && urlSessionId !== currentSessionId) {
       loadHistorySession(urlSessionId)
    }
  }, [urlSessionId])

  const loadHistorySession = async (sid: string) => {
    setIsLoading(true)
    setMessages([])
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sid)
        .order('created_at', { ascending: true })

      if (error) throw error

      if (data && data.length > 0) {
        const historyMessages = data.map((m: any) => ({
           id: m.id,
           role: m.role,
           content: m.content
        }))
        setMessages(historyMessages)
        setCurrentSessionId(sid)
        sessionIdRef.current = sid
      }
    } catch (e) {
      console.error("加载历史会话失败:", e)
      toast.error("加载历史会话失败")
    } finally {
      setIsLoading(false)
    }
  }

  // 🔥 获取历史会话列表
  const fetchChatSessions = async (uid: string) => {
    try {
      const res = await fetch(`/api/chat-session`, {
        headers: { 'X-User-Id': uid }
      })
      if (!res.ok) return
      const { sessions } = await res.json()
      const safeSessionData = Array.isArray(sessions) ? sessions : []
      if (safeSessionData.length > 0) {
        const mapped = safeSessionData.map((s: any) => ({
          id: s.id,
          title: s.title || "新对话",
          date: new Date(s.created_at).getTime(),
          preview: s.preview || "",
          ai_model: s.ai_model || "gpt-image-2"
        }))
        setChatSessions(mapped)
      } else {
        setChatSessions([])
      }
    } catch (err) {
      console.error("❌ [历史会话] 查询异常:", err)
      setChatSessions([])
    }
  }

  // 🔥 当打开历史会话侧边栏时，重新获取会话列表
  useEffect(() => {
    if (showHistorySidebar && userId) {
      fetchChatSessions(userId)
    }
  }, [showHistorySidebar, userId])

  const handleScroll = () => {
    if (scrollAreaRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current
      const isNear = scrollHeight - scrollTop - clientHeight < 100
      setIsNearBottom(isNear)
      if (isNear) setHasNewMessage(false)
      if (scrollTop > 24 && showHeroIntro && messages.length > 0) setShowHeroIntro(false)
    }
  }

  const applyHeroPrompt = (prompt: string) => {
    setInput(prompt)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    setHasNewMessage(false)
  }

  useEffect(() => {
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    } else if (messages.length > 0) {
      setHasNewMessage(true)
    }
  }, [messages, isNearBottom])

  const calculateCost = () => {
    if (!userId) return 0
    const isLuxury = userCredits > 1000
    return calculatePreviewCost("gpt-image-2" as ModelType, {
      isLuxury,
      estimatedInputTokens: input.length > 0 ? Math.ceil(input.length / 4) * 2 : undefined
    })
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || !files.length) return

    if (!userId) {
      toast.error("请先登录后再上传文件")
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const totalFiles = files.length
      const uploadPromises = Array.from(files).map(async (file, index) => {
        const formData = new FormData()
        formData.append("file", file)
        formData.append("user", userId)

        const res = await fetch(getApiUrl("/api/dify-upload"), {
          method: "POST",
          headers: {
            "X-User-Id": userId,
            "X-Model": "gpt-image-2"
          },
          body: formData
        })

        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`上传失败: ${res.status} ${errText}`)
        }

        const data = await res.json()

        setUploadProgress(Math.round(((index + 1) / totalFiles) * 100))

        return new Promise<UploadedFile>((resolve) => {
          if (file.type.startsWith("image/")) {
            resolve({
              name: file.name,
              type: file.type,
              size: file.size,
              data: "",
              difyFileId: data.id,
              preview: URL.createObjectURL(file)
            })
          } else {
            const reader = new FileReader()
            reader.onload = e => resolve({
              name: file.name,
              type: file.type,
              size: file.size,
              data: e.target?.result as string,
              difyFileId: data.id,
              preview: undefined
            })
            reader.readAsDataURL(file)
          }
        })
      })

      const results = await Promise.all(uploadPromises)
      setUploadedFiles(p => [...p, ...results])
      toast.success("文件上传成功")
    } catch (e: any) {
      console.error("上传错误:", e)
      toast.error("上传失败")
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }

    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const removeFile = (i: number) => setUploadedFiles(p => p.filter((_, idx) => idx !== i))

  const onSubmit = async (
    e: React.FormEvent,
    overrides?: { content?: string; files?: UploadedFile[] }
  ) => {
    e.preventDefault()
    if (!userId) {
      toast.error("请登录")
      return
    }

    const activeFiles = overrides?.files ?? uploadedFiles
    const overrideContent = (overrides?.content || "").trim()
    const primaryInput = ((overrides?.content ?? input) || "").trim()
    const secondaryInput = (editNotes || "").trim()
    const txt = overrideContent ? overrideContent : selectedMode.key === "image-edit"
      ? [primaryInput, secondaryInput ? `补充要求：${secondaryInput}` : ""].filter(Boolean).join("\n\n")
      : primaryInput
    if (!txt) return

    if (selectedMode.key === "image-edit" && activeFiles.length === 0) {
      toast.error("Please upload a reference image before editing.")
      return
    }

    const cost = calculateCost()
    if (userCredits < cost) {
      toast.error("积分不足", {
        description: `需要 ${cost} 积分，当前 ${userCredits}`,
        duration: 2000
      })
      setTimeout(() => router.push("/pricing"), 1500)
      return
    }

    setIsLoading(true)
    setShowAdvancedSettings(false)
    collapseSidebar()

    let sid = currentSessionId
    if (!sid && !urlSessionId) {
        sid = Date.now().toString()
        setCurrentSessionId(sid)
        sessionIdRef.current = sid
    } else if (urlSessionId) {
        sid = urlSessionId
        sessionIdRef.current = urlSessionId
    }

    const userInputText = txt
    const userFiles = [...activeFiles]

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userInputText,
      files: userFiles
    }
    setMessages(p => [...p, userMsg])
    setInput("")
    setEditNotes("")

    const fileIds = activeFiles.map(f => f.difyFileId).filter(Boolean) as string[]

    setUploadedFiles([])

    const preview = userInputText.slice(0, 30)
    const { data: existing } = await supabase.from('chat_sessions').select('id').eq('id', sid).single()
    if (!existing) {
        await supabase.from('chat_sessions').insert({ id: sid, user_id: userId, title: "GPT Image 2", preview, ai_model: "gpt-image-2" })
    } else {
        await supabase.from('chat_sessions').update({ preview, ai_model: "gpt-image-2" }).eq('id', sid)
    }
    await supabase.from('chat_messages').insert({ session_id: sid, role: "user", content: userInputText })

    const botId = (Date.now()+1).toString()
    currentBotIdRef.current = botId
    setMessages(p => [...p, { id: botId, role: "assistant", content: "" }])

    let fullText = ""
    try {
        console.log(`🎨 [GPT Image 2前端] 准备发送请求，用户输入: "${userInputText}"`)

        const { width, height } = parseImageSize(selectedSize.apiValue)

        const difyMode = toDifyImageMode(selectedMode.key)

        const res = await fetch(getApiUrl("/api/dify-chat"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-User-Id": userId
            },
            body: JSON.stringify({
              query: userInputText,
              fileIds: fileIds,
              userId,
              conversation_id: sessionIdRef.current,
              model: "gpt-image-2",
              mode: difyMode,
              inputs: {
                mode: difyMode,
                size: selectedSize.apiValue,
                ratio: selectedSize.ratio,
                tier: selectedSize.tier
              },
              imageSize: {
                ratio: selectedSize.ratio,
                width,
                height
              }
            })
        })

        if (res.status === 401) {
          toast.error("请先登录")
          throw new Error("未授权")
        }
        if (res.status === 402) throw new Error("积分不足")
        if (!res.ok) {
          const errorText = await res.text()
          throw new Error(`请求失败 (${res.status}): ${errorText.slice(0, 100)}`)
        }

        // 🎨 GPT Image 2 使用 blocking 模式，直接解析 JSON
        try {
          const result = await res.json()
          console.log(`🎨 [GPT Image 2] Blocking 响应:`, result)

          if (result.error) {
            throw new Error(`Dify Error: ${result.error}`)
          }
          fullText = buildAssistantContentFromWorkflowResult(result)

          setMessages(p => p.map(m => m.id === botId ? { ...m, content: fullText } : m))
        } catch (e) {
          console.error(`🎨 [GPT Image 2前端] 解析失败:`, e)
          throw e
        }

        if (fullText) {
          await supabase.from('chat_messages').insert({
            session_id: sid,
            role: "assistant",
            content: fullText
          })
        }

        setUserCredits(prev => prev - cost)

    } catch (e: any) {
        console.error("❌ [GPT Image 2 对话异常]:", e)

        const errorMsg = e.message || "图片生成失败，请重试"
        toast.error(errorMsg, {
          duration: 5000,
          description: `请查看控制台了解详情`
        })

        setMessages(p => p.filter(m => m.id !== botId))
    } finally {
      setIsLoading(false)
      if (userId) fetchCredits(userId)
      refreshCredits()
      router.refresh()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSubmit(e as unknown as React.FormEvent)
    }
  }

  const handleBack = () => {
    router.push("/")
  }

  return (
    <div className="relative flex h-[100dvh] min-h-0 w-full overflow-hidden bg-white">
      <div className="flex flex-1 flex-col h-full relative min-w-0">

        {/* 顶部导航栏 */}
        <div className="flex items-center h-12 px-3 md:px-4 border-b border-slate-200/70 bg-white/90 backdrop-blur shrink-0">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 rounded-xl px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
              <span className="text-sm font-medium hidden sm:inline">返回首页</span>
          </button>
          <div className="flex-1 text-center md:text-left md:ml-3">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <ModelLogo modelKey="gpt-image-2" size="lg" />
              <span className="text-sm font-medium text-slate-700">GPT Image 2 图像创作</span>
            </div>
          </div>
          <div>
            {userId ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-700 font-medium">{userCredits.toLocaleString()}</span>
                <button
                  onClick={() => setShowHistorySidebar(true)}
                  className="p-1.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                  <History className="h-4 w-4 text-slate-600" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push("/login")}
                  className="px-3 py-1.5 text-xs font-medium text-white rounded-xl"
                  style={{ backgroundColor: BRAND_GREEN }}
                >
                  登录
                </button>
                <button
                  onClick={() => setShowHistorySidebar(true)}
                  className="p-1.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                  <History className="h-4 w-4 text-slate-600" />
                </button>
              </div>
            )}
          </div>
          <div className="hidden md:block w-6" />
        </div>

        {/* 滚动区域 */}
        <div
          className={cn(
            "relative overflow-hidden transition-[height,flex] duration-300",
            messages.length === 0 && !showHeroIntro ? "h-0 flex-none" : "flex-1 h-0"
          )}
        >
          {/* 🔥 移动端浮动历史按钮 */}
          <button
            onClick={() => setShowHistorySidebar(!showHistorySidebar)}
            className="absolute top-3 right-3 z-40 flex items-center gap-1.5 px-3 py-2 bg-white/95 backdrop-blur-lg rounded-full shadow-lg border border-slate-100 md:hidden"
          >
            <History className="h-4 w-4 text-slate-600" />
            <span className="text-xs font-medium text-slate-600">历史</span>
          </button>
          <div
            ref={scrollAreaRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto custom-scrollbar"
          >
            <div className="mx-auto max-w-5xl px-4 md:px-6 py-6 md:py-8">
              {messages.length === 0 ? (
                <AnimatePresence initial={false}>
                  {showHeroIntro && (
                    <motion.div
                      initial={{ opacity: 1, height: "auto", y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -16, marginBottom: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                <div className="mx-auto max-w-3xl py-3 text-center">
                  <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-3 py-2 shadow-sm">
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                      <ModelLogo modelKey="gpt-image-2" size="lg" />
                      GPT Image 2
                    </span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">{selectedSummary}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-500">
                    {selectedMode.key === "image-edit"
                      ? "上传参考图并输入编辑指令，生成新的图像结果。"
                      : "描述你想生成的画面、风格、材质、灯光与构图，直接开始创作。"}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {heroPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => applyHeroPrompt(prompt)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-all duration-200 hover:border-emerald-200 hover:text-slate-800"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              ) : (
                <div className="space-y-5">
                  {messages.map((message) => (
                    <div key={message.id} className={cn("flex gap-3 group", message.role === "user" ? "justify-end" : "justify-start")}>
                      {message.role === "assistant" && (
                        <div className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full mt-0.5 overflow-hidden">
                          <ModelLogo modelKey="gpt-image-2" size="sm" />
                        </div>
                      )}
                      <div className={cn(
                        "flex flex-col max-w-[80%]",
                        message.role === "user" ? "items-end" : "items-start"
                      )}>
                        {message.role === "user" ? (
                          <UserMessageBubble
                            content={message.content}
                            files={message.files}
                            onEdit={(content, files) => {
                              setInput(content)
                              setUploadedFiles((files as UploadedFile[]) ?? [])
                            }}
                            onSend={(content, files) => {
                              setInput(content)
                              setUploadedFiles((files as UploadedFile[]) ?? [])
                              const fakeEvent = { preventDefault: () => {} } as unknown as React.FormEvent
                              onSubmit(fakeEvent, { content, files: (files as UploadedFile[]) ?? [] })
                            }}
                          />
                        ) : (
                          <>
                            {isLoading && message.id === currentBotIdRef.current && !message.content ? (
                              <div className="flex items-center justify-center py-4">
                                <GridWaveLoader
                                  size={320}
                                  dotSize={4}
                                  gap={9}
                                  label="正在生成更细致的图像，请稍候。"
                                />
                              </div>
                            ) : (
                              <GptImage2Renderer
                                content={message.content}
                                isStreaming={message.id === currentBotIdRef.current && isLoading}
                              />
                            )}
                          </>
                        )}
                      </div>
                      {message.role === "user" && (
                        <div className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full bg-slate-200 mt-0.5 overflow-hidden">
                          {userAvatar ? (
                            <img src={userAvatar} alt="Me" className="h-full w-full object-cover" />
                          ) : (
                            <User className="h-3.5 w-3.5 text-slate-500" />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* 新消息提示 */}
          <AnimatePresence>
            {hasNewMessage && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                onClick={scrollToBottom}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 text-white text-sm rounded-full shadow-lg flex items-center gap-2"
                style={{ backgroundColor: BRAND_GREEN }}
              >
                <ArrowDown className="w-4 h-4" />
                新消息
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* 输入框 */}
        <div
          className={cn(
            "custom-scrollbar border-t border-slate-100 bg-white p-3 md:p-5",
            isWorkspaceFocused
              ? "flex-1 min-h-0 overflow-y-auto"
              : "shrink-0"
          )}
        >
          <div className={cn("mx-auto max-w-5xl", isWorkspaceFocused && "min-h-full flex items-center")}>
            <form
              onSubmit={onSubmit}
              className={cn(
                "relative w-full overflow-hidden rounded-[32px] border border-white/80 bg-white/92 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all duration-300 focus-within:border-emerald-200/80 focus-within:shadow-[0_24px_72px_rgba(20,83,45,0.12)]",
                hasMessages ? "max-w-none" : "max-w-4xl"
              )}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_46%),radial-gradient(circle_at_top_right,rgba(226,232,240,0.8),transparent_38%)]" />
              <div className="relative space-y-4 p-4 sm:p-5">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                />

                <div className="flex flex-col gap-3 border-b border-slate-200/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{isChatMode ? "对话工作台" : "全屏图像工作台"}</p>
                      <p className={cn("mt-1 text-[13px] leading-6 text-slate-500", isChatMode && "hidden sm:block")}>
                        {isChatMode ? "已切换为对话创作模式，底部输入框继续保留上传、尺寸和分辨率设置。" : modeGuideDescription}
                      </p>
                    </div>
                    <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                      {MODE_OPTIONS.map((mode) => {
                        const ModeIcon = mode.icon

                        return (
                          <button
                            key={mode.key}
                            type="button"
                            onClick={() => setSelectedMode(mode)}
                            className={cn(
                              "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200",
                              selectedMode.key === mode.key
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-800 shadow-[0_8px_20px_rgba(16,185,129,0.12)]"
                                : "border border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                            )}
                          >
                            <ModeIcon className="h-4 w-4" />
                            {mode.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <span className="rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 shadow-sm shadow-emerald-100/70">
                      {selectedSummary}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 rounded-2xl border border-slate-200/80 bg-white px-4 text-sm font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      onClick={() => {
                        if (!userId) {
                          toast.error("请先登录后再上传文件")
                          return
                        }
                        fileInputRef.current?.click()
                      }}
                      disabled={isLoading}
                    >
                      <Paperclip className="mr-2 h-4 w-4" />
                      {selectedMode.key === "image-edit" ? "上传编辑参考图" : "添加参考图"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedSettings((value) => !value)}
                      className="inline-flex h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition-all duration-200 hover:border-slate-300 hover:text-slate-800"
                    >
                      {showAdvancedSettings ? "收起设置" : "尺寸与分辨率"}
                    </button>
                  </div>
                </div>

                {advancedSettingsVisible && (
                  <div className="grid gap-3 rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,249,251,0.95))] p-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_240px]">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-700">比例</p>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">{selectedSize.ratio}</span>
                      </div>
                      <Select value={selectedSize.ratio} onValueChange={(value) => selectRatio(value as SizeRatio)}>
                        <SelectTrigger className="mt-3 h-11 w-full rounded-2xl border-slate-200 bg-white px-4 text-left text-sm text-slate-700 shadow-sm">
                          <SelectValue placeholder="选择比例" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-slate-200 bg-white">
                          {RATIO_OPTIONS.map((ratio) => (
                            <SelectItem key={ratio} value={ratio} className="rounded-xl py-2.5 text-sm">
                              {ratio}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-700">尺寸档位</p>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                          {selectedSize.tierLabel} · {formatSizeLabel(selectedSize.apiValue)}
                        </span>
                      </div>
                      <Select value={selectedSize.tier} onValueChange={(value) => selectTier(value as SizeTier)}>
                        <SelectTrigger className="mt-3 h-11 w-full rounded-2xl border-slate-200 bg-white px-4 text-left text-sm text-slate-700 shadow-sm">
                          <SelectValue placeholder="选择尺寸档位" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-slate-200 bg-white">
                          {SIZE_TIER_OPTIONS.map((tier) => {
                            const option = tierOptionsForRatio.find((item) => item.tier === tier.value)
                            if (!option) return null

                            return (
                              <SelectItem key={tier.value} value={tier.value} className="rounded-xl py-2.5">
                                <div className="flex w-full items-center justify-between gap-3">
                                  <span className="font-medium text-slate-700">{tier.label}</span>
                                  <span className="text-xs text-slate-400">{formatSizeLabel(option.apiValue)}</span>
                                </div>
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded-[24px] border border-slate-200/80 bg-white/85 p-4">
                      <p className="text-sm font-medium text-slate-800">当前输出</p>
                      <p className="mt-2 text-sm font-semibold text-slate-700">{formatSizeLabel(selectedSize.apiValue)}</p>
                      <p className="mt-1 text-xs leading-6 text-slate-500">{selectedMode.label} · {selectedSize.ratio} · {selectedSize.tierLabel}</p>
                      <p className="mt-3 text-xs leading-6 text-slate-500">{selectionHint}</p>
                    </div>
                  </div>
                )}

                {selectedMode.key === "image-edit" && uploadedFiles.length === 0 && (
                  <div className="rounded-[24px] border border-dashed border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm leading-6 text-slate-600">
                    图像编辑模式需要至少 1 张参考图。点击右上角“上传编辑参考图”后再发送。
                  </div>
                )}

                {isUploading && (
                  <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-600">上传中...</span>
                      <span className="text-xs font-medium" style={{ color: BRAND_GREEN }}>{uploadProgress}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: BRAND_GREEN }}
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                )}

                {uploadedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {uploadedFiles.map((f, i) => (
                      <div key={i} className="group relative">
                        {f.preview ? (
                          <div className="relative h-20 w-20 overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-sm">
                            <img src={f.preview} alt={f.name} className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removeFile(i)}
                              className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-sm shadow-sm">
                            <FileText className="h-4 w-4 text-green-600" />
                            <span className="max-w-[120px] truncate text-slate-600">{f.name}</span>
                            <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className={cn(
                  "rounded-[28px] border border-slate-200/80 bg-white/94 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] transition-all duration-200 focus-within:border-emerald-200 focus-within:shadow-[0_16px_36px_rgba(16,185,129,0.08)]",
                  isChatMode ? "sm:p-4" : "sm:p-5"
                )}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{isChatMode ? "继续创作" : modeGuideTitle}</p>
                      <p className={cn("mt-1 text-xs leading-6 text-slate-500", isChatMode && "hidden sm:block")}>
                        {selectedMode.key === "image-edit" ? "参考图、主指令和补充要求会一起提交。" : "提示词、参考图和输出参数会一起提交到后端工作流。"}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500">
                      {formatSizeLabel(selectedSize.apiValue)}
                    </span>
                  </div>

                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={promptPlaceholder}
                    className={cn(
                      "mt-4 resize-none rounded-[24px] border border-emerald-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-4 py-4 text-[15px] leading-7 text-slate-700 placeholder:text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_18px_40px_rgba(15,23,42,0.04)] focus-visible:ring-0",
                      isChatMode ? "min-h-[92px] max-h-[180px]" : "min-h-[180px] max-h-[320px]"
                    )}
                    disabled={isLoading}
                    rows={isChatMode ? 3 : 6}
                  />

                  {selectedMode.key === "image-edit" && (
                    <Textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="补充描述，例如：保留人物表情与服饰，只调整背景、光影和整体商业感。"
                      className="mt-3 min-h-[88px] resize-none rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-700 placeholder:text-slate-400 focus-visible:ring-0"
                      disabled={isLoading}
                      rows={3}
                    />
                  )}

                  {!isChatMode && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {heroPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => applyHeroPrompt(prompt)}
                        className="rounded-full border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs font-medium text-slate-500 transition-all duration-200 hover:border-emerald-200 hover:bg-white hover:text-slate-700"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  )}

                  <div className={cn(
                    "mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between",
                    isChatMode && "gap-2 sm:gap-3"
                  )}>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-600">{selectedSummary}</p>
                      <p className={cn("text-xs leading-6 text-slate-500", isChatMode && "hidden sm:block")}>{selectionHint}</p>
                    </div>

                    <Button
                      type="submit"
                      className="h-12 w-full justify-center whitespace-nowrap rounded-2xl px-5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(20,83,45,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(20,83,45,0.28)] disabled:translate-y-0 disabled:opacity-40 sm:w-auto sm:min-w-[160px]"
                      style={{ backgroundColor: BRAND_GREEN }}
                      disabled={isLoading || !canSubmit}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          创作中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          {actionLabel}
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {!userId && (
                  <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-xs leading-6 text-slate-500">
                    未登录状态下将无法开始创作，但你仍然可以先准备提示词、参考图和输出参数。
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* 🔥 历史会话侧边栏 - 左侧滑出 */}
        <AnimatePresence>
          {showHistorySidebar && (
            <>
              {/* 遮罩层 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
                onClick={() => setShowHistorySidebar(false)}
              />
              {/* 侧边栏 */}
              <motion.div
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                className="fixed left-0 top-0 h-screen w-72 z-50 flex flex-col"
                style={{ background: "#FDFBF7", boxShadow: "4px 0 24px rgba(0,0,0,0.12)" }}
              >
                {/* 头部 */}
                <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
                  <span className="text-sm font-semibold text-slate-700">历史会话</span>
                  <button
                    onClick={() => setShowHistorySidebar(false)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <X className="h-4 w-4 text-slate-500" />
                  </button>
                </div>
                {/* 会话列表 */}
                <div className="flex-1 min-h-0 px-1 py-2 overflow-y-auto">
                  {chatSessions.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">暂无历史会话</div>
                  ) : (
                    chatSessions.map(session => (
                      <button
                        key={session.id}
                        onClick={() => {
                          // 🔥 如果是其他模型的会话，跳转到对应页面
                          if (session.ai_model && session.ai_model !== "gpt-image-2") {
                            // 🔥 映射正确的路由
                            const modelRoute = session.ai_model === "banana-2-pro"
                              ? "/chat/banana-2-pro"
                              : session.ai_model === "gpt-image-2"
                                ? "/chat/creative-image-gpt2"
                                : `/chat/${session.ai_model}`
                            router.push(`${modelRoute}?id=${session.id}`)
                            return
                          }
                          // 同模型会话，正常加载
                          loadHistorySession(session.id)
                          setShowHistorySidebar(false)
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-lg transition-all",
                          currentSessionId === session.id
                            ? "bg-[#14532d]/10 text-[#14532d]"
                            : "hover:bg-slate-100 text-slate-600"
                        )}
                      >
                        <div className="text-sm font-medium truncate">{session.title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(session.date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function GptImage2ChatInterface() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND_GREEN }} />
      </div>
    }>
      <GptImage2ChatInterfaceInner />
    </Suspense>
  )
}
