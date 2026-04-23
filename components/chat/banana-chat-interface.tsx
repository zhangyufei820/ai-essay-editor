"use client"

/**
 * Banana2 Pro 4K 专用聊天界面
 * 特点：
 * 1. 流式输出文字描述
 * 2. 自动渲染生成的图片（支持 Markdown 格式）
 * 3. 独立的 UI 和交互逻辑
 */

import type React from "react"
import { useState, useRef, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Paperclip, X, FileText, Copy, Loader2, Palette, User,
  ChevronLeft, ArrowDown, Download, Share2, Sparkles, History
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@supabase/supabase-js"
import { collapseSidebar, refreshCredits } from "@/components/app-sidebar"
import { calculatePreviewCost } from "@/lib/pricing"
import { UltimateRenderer } from "@/components/chat/UltimateRenderer"
import { UserMessageBubble } from "@/components/chat/UserMessageBubble"
import { GridWaveLoader } from "@/components/chat/GridWaveLoader"

const BRAND_GREEN = "#14532d"
const BANANA_COLOR = "#14532d" // 使用网站主题深绿色

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || ''

// 🎨 尺寸选项配置
const RATIO_OPTIONS = ["1:1", "4:3", "3:2", "16:9", "9:16", "2:3", "3:4"] as const

const SIZE_TIER_OPTIONS = [
  { value: "standard", label: "标准" },
  { value: "hd", label: "高清" },
  { value: "2k", label: "2K" },
  { value: "4k-experimental", label: "4K 实验" },
] as const

const SIZE_OPTIONS = [
  { value: "1-1-standard", ratio: "1:1", tier: "standard", tierLabel: "标准", width: 1024, height: 1024, apiValue: "1024x1024" },
  { value: "1-1-hd", ratio: "1:1", tier: "hd", tierLabel: "高清", width: 1536, height: 1536, apiValue: "1536x1536" },
  { value: "1-1-2k", ratio: "1:1", tier: "2k", tierLabel: "2K", width: 2048, height: 2048, apiValue: "2048x2048" },
  { value: "1-1-4k", ratio: "1:1", tier: "4k-experimental", tierLabel: "4K 实验", width: 3072, height: 3072, apiValue: "3072x3072" },
  { value: "4-3-standard", ratio: "4:3", tier: "standard", tierLabel: "标准", width: 1024, height: 768, apiValue: "1024x768" },
  { value: "4-3-hd", ratio: "4:3", tier: "hd", tierLabel: "高清", width: 1440, height: 1080, apiValue: "1440x1080" },
  { value: "4-3-2k", ratio: "4:3", tier: "2k", tierLabel: "2K", width: 2048, height: 1536, apiValue: "2048x1536" },
  { value: "4-3-4k", ratio: "4:3", tier: "4k-experimental", tierLabel: "4K 实验", width: 2880, height: 2160, apiValue: "2880x2160" },
  { value: "3-2-standard", ratio: "3:2", tier: "standard", tierLabel: "标准", width: 1152, height: 768, apiValue: "1152x768" },
  { value: "3-2-hd", ratio: "3:2", tier: "hd", tierLabel: "高清", width: 1620, height: 1080, apiValue: "1620x1080" },
  { value: "3-2-2k", ratio: "3:2", tier: "2k", tierLabel: "2K", width: 2304, height: 1536, apiValue: "2304x1536" },
  { value: "3-2-4k", ratio: "3:2", tier: "4k-experimental", tierLabel: "4K 实验", width: 3240, height: 2160, apiValue: "3240x2160" },
  { value: "16-9-standard", ratio: "16:9", tier: "standard", tierLabel: "标准", width: 1024, height: 576, apiValue: "1024x576" },
  { value: "16-9-hd", ratio: "16:9", tier: "hd", tierLabel: "高清", width: 1920, height: 1080, apiValue: "1920x1080" },
  { value: "16-9-2k", ratio: "16:9", tier: "2k", tierLabel: "2K", width: 2560, height: 1440, apiValue: "2560x1440" },
  { value: "16-9-4k", ratio: "16:9", tier: "4k-experimental", tierLabel: "4K 实验", width: 3840, height: 2160, apiValue: "3840x2160" },
  { value: "9-16-standard", ratio: "9:16", tier: "standard", tierLabel: "标准", width: 576, height: 1024, apiValue: "576x1024" },
  { value: "9-16-hd", ratio: "9:16", tier: "hd", tierLabel: "高清", width: 1080, height: 1920, apiValue: "1080x1920" },
  { value: "9-16-2k", ratio: "9:16", tier: "2k", tierLabel: "2K", width: 1440, height: 2560, apiValue: "1440x2560" },
  { value: "9-16-4k", ratio: "9:16", tier: "4k-experimental", tierLabel: "4K 实验", width: 2160, height: 3840, apiValue: "2160x3840" },
  { value: "2-3-standard", ratio: "2:3", tier: "standard", tierLabel: "标准", width: 768, height: 1152, apiValue: "768x1152" },
  { value: "2-3-hd", ratio: "2:3", tier: "hd", tierLabel: "高清", width: 1080, height: 1620, apiValue: "1080x1620" },
  { value: "2-3-2k", ratio: "2:3", tier: "2k", tierLabel: "2K", width: 1536, height: 2304, apiValue: "1536x2304" },
  { value: "2-3-4k", ratio: "2:3", tier: "4k-experimental", tierLabel: "4K 实验", width: 2160, height: 3240, apiValue: "2160x3240" },
  { value: "3-4-standard", ratio: "3:4", tier: "standard", tierLabel: "标准", width: 768, height: 1024, apiValue: "768x1024" },
  { value: "3-4-hd", ratio: "3:4", tier: "hd", tierLabel: "高清", width: 1080, height: 1440, apiValue: "1080x1440" },
  { value: "3-4-2k", ratio: "3:4", tier: "2k", tierLabel: "2K", width: 1536, height: 2048, apiValue: "1536x2048" },
  { value: "3-4-4k", ratio: "3:4", tier: "4k-experimental", tierLabel: "4K 实验", width: 2160, height: 2880, apiValue: "2160x2880" },
] as const

type SizeOption = typeof SIZE_OPTIONS[number]
type SizeRatio = typeof RATIO_OPTIONS[number]
type SizeTier = typeof SIZE_TIER_OPTIONS[number]["value"]

const BANANA_PROMPT_PRESETS = [
  "高端香氛广告图，琥珀色玻璃瓶，暖灰背景，电影级光影，国际品牌视觉",
  "未来感厨房家电海报，银白金属材质，柔和反射，高级家居杂志风",
  "极简护肤产品静物，玉石绿色瓶身，奶白背景，奢侈品广告质感",
]

function formatSizeLabel(apiValue: string) {
  return apiValue.replace("x", "×")
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
  files?: UploadedFile[]  // 🔥 新增：用户消息可以包含上传的文件
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

// 🖼️ 图片渲染组件 - 支持 Markdown 格式 ![](url) + Markdown 文本渲染
function BananaRenderer({ content, isStreaming = false }: { content: string; isStreaming?: boolean }) {
  if (!content) return <StreamingCursor />;
  
  // 检测图片 Markdown：![alt](url) 或 ![](url)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  const images: Array<{alt: string, url: string}> = []
  let match
  
  while ((match = imageRegex.exec(content)) !== null) {
    images.push({
      alt: match[1] || 'Generated Image',
      url: match[2]
    })
  }
  
  // 移除图片 Markdown，保留纯文本
  const textContent = content.replace(imageRegex, '').trim()
  
  return (
    <div className="space-y-4">
      {/* 文字描述 - 使用 UltimateRenderer 渲染 Markdown */}
      {textContent && (
        <div className="text-slate-700 leading-relaxed">
          <UltimateRenderer content={textContent} />
          {isStreaming && !images.length && <StreamingCursor />}
        </div>
      )}
      
      {/* 图片展示 */}
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
          {/* 下载按钮 */}
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

// 移动端用户信息组件
const MobileUserInfo = ({ 
  userName, 
  credits, 
  onMenuClick 
}: { 
  userName: string
  credits: number
  onMenuClick: () => void 
}) => (
  <button 
    onClick={onMenuClick}
    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
  >
    <div 
      className="flex h-7 w-7 items-center justify-center rounded-lg text-white text-xs font-bold"
      style={{ backgroundColor: BANANA_COLOR }}
    >
      {userName?.[0]?.toUpperCase() || "U"}
    </div>
    <div className="flex flex-col items-start">
      <span className="text-xs font-medium text-slate-700 max-w-[80px] truncate">
        {userName || "用户"}
      </span>
      <span className="text-[10px] text-green-700 font-medium">
        {credits.toLocaleString()} 积分
      </span>
    </div>
  </button>
)

function BananaChatInterfaceInner() {
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
  const [selectedSize, setSelectedSize] = useState<SizeOption>(
    SIZE_OPTIONS.find((option) => option.ratio === "9:16" && option.tier === "hd") ?? SIZE_OPTIONS[0]
  )
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentBotIdRef = useRef<string | null>(null)
  
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [hasNewMessage, setHasNewMessage] = useState(false)
  const [showHistorySidebar, setShowHistorySidebar] = useState(false)
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const tierOptionsForRatio = SIZE_OPTIONS.filter((option) => option.ratio === selectedSize.ratio)
  const selectedSummary = `${selectedSize.ratio} · ${selectedSize.tierLabel} · ${formatSizeLabel(selectedSize.apiValue)}`
  const promptPlaceholder = "描述你想生成的画面、品牌感、材质、灯光、构图与情绪，例如：极简护肤广告，柔和玉石绿瓶身，奶白背景，国际品牌 KV 风。"
  const canSubmit = Boolean(input.trim())

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

  // 用户初始化
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
      const res = await fetch(`${API_BASE}/api/user/credits?user_id=${encodeURIComponent(uid)}`)
      if (res.ok) {
        const data = await res.json()
        setUserCredits(data.credits || 0)
      }
    } catch (err) {
      console.error("❌ [积分查询] 异常:", err)
    }
  }

  // 加载历史会话
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
          ai_model: s.ai_model || "banana-2-pro"
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

  // 智能滚动
  const handleScroll = () => {
    if (scrollAreaRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current
      const isNear = scrollHeight - scrollTop - clientHeight < 100
      setIsNearBottom(isNear)
      if (isNear) setHasNewMessage(false)
    }
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
    return calculatePreviewCost("banana-2-pro", {
      isLuxury,
      estimatedInputTokens: input.length > 0 ? Math.ceil(input.length / 4) * 2 : undefined
    })
  }

  // 文件上传处理
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
        
        const res = await fetch(`${API_BASE}/api/dify-upload`, {
          method: "POST",
          headers: {
            "X-User-Id": userId,
            "X-Model": "banana-2-pro"
          },
          body: formData
        })
        
        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`上传失败: ${res.status} ${errText}`)
        }
        
        const data = await res.json()
        
        // 更新进度
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
    const txt = ((overrides?.content ?? input) || "").trim()
    if (!txt) return
    
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

    // 🔥 先保存用户输入的文本和文件
    const userInputText = txt
    const userFiles = [...activeFiles]  // 🔥 保存文件副本用于显示
    
    const userMsg: Message = { 
      id: Date.now().toString(), 
      role: "user", 
      content: userInputText,
      files: userFiles  // 🔥 保存文件信息到消息中
    }
    setMessages(p => [...p, userMsg])
    setInput("")
    
    // 提取文件ID
    const fileIds = activeFiles.map(f => f.difyFileId).filter(Boolean) as string[]
    
    // 清空已上传文件
    setUploadedFiles([])

    // 创建会话
    const preview = userInputText.slice(0, 30)
    const { data: existing } = await supabase.from('chat_sessions').select('id').eq('id', sid).single()
    if (!existing) {
        await supabase.from('chat_sessions').insert({ id: sid, user_id: userId, title: "图片生成", preview, ai_model: "banana-2-pro" })
    } else {
        await supabase.from('chat_sessions').update({ preview, ai_model: "banana-2-pro" }).eq('id', sid)
    }
    await supabase.from('chat_messages').insert({ session_id: sid, role: "user", content: userInputText })

    const botId = (Date.now()+1).toString()
    currentBotIdRef.current = botId
    setMessages(p => [...p, { id: botId, role: "assistant", content: "" }])
    
    let fullText = ""
    try {
        console.log(`🎨 [Banana前端] 准备发送请求，用户输入: "${userInputText}"`)
        
        const res = await fetch(`${API_BASE}/api/dify-chat`, {
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
              model: "banana-2-pro",
              mode: "image",
              inputs: {
                mode: "image",
                size: selectedSize.apiValue,
                ratio: selectedSize.ratio,
                tier: selectedSize.tier
              },
              // 🎨 传递尺寸参数
              imageSize: {
                ratio: selectedSize.ratio,
                width: selectedSize.width,
                height: selectedSize.height
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
        
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
            const { done, value } = await reader!.read()
            if (done) break
            
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() || ""

            for (const line of lines) {
                if (!line.startsWith("data: ")) continue
                const data = line.slice(6).trim()
                if (data === "[DONE]") continue
                
                try {
                    const json = JSON.parse(data)
                    
                    // 🎨 Workflow API 事件处理
                    console.log(`🎨 [Banana前端] 收到事件:`, json.event, json)
                    
                    // 处理 conversation_id（Chat API）
                    if (json.conversation_id && sessionIdRef.current !== json.conversation_id) {
                        sessionIdRef.current = json.conversation_id
                    }
                    
                    // 处理 Chat API 的 answer 字段
                    if (json.answer) {
                        fullText += json.answer
                        setMessages(p => p.map(m => m.id === botId ? { ...m, content: fullText } : m))
                    }
                    
                    // 🎨 处理 Workflow API 的 text 事件
                    if (json.event === 'text_chunk' || json.event === 'agent_message') {
                        const text = json.data?.text || json.text || ''
                        if (text) {
                            fullText += text
                            setMessages(p => p.map(m => m.id === botId ? { ...m, content: fullText } : m))
                        }
                    }
                    
                    // 🎨 处理 Workflow 完成事件（可能包含最终输出）
                    if (json.event === 'workflow_finished') {
                        console.log(`🎨 [Banana前端] Workflow完成:`, json.data)
                        
                        // 检查输出中是否有文本
                        if (json.data?.outputs) {
                            const outputs = json.data.outputs
                            
                            // 尝试提取文本输出
                            if (outputs.text) {
                                fullText = outputs.text
                                setMessages(p => p.map(m => m.id === botId ? { ...m, content: fullText } : m))
                            } else if (outputs.result) {
                                fullText = outputs.result
                                setMessages(p => p.map(m => m.id === botId ? { ...m, content: fullText } : m))
                            }
                            
                            // 检查是否有图片文件
                            if (outputs.files && Array.isArray(outputs.files)) {
                                for (const file of outputs.files) {
                                    if (file.type === 'image' && file.url) {
                                        fullText += `\n\n![Generated Image](${file.url})`
                                    }
                                }
                                setMessages(p => p.map(m => m.id === botId ? { ...m, content: fullText } : m))
                            }
                        }
                    }
                    
                    // 🎨 处理 message_file 事件（图片）
                    if (json.event === 'message_file') {
                        console.log(`🎨 [Banana前端] 收到图片:`, json)
                        if (json.type === 'image' && json.url) {
                            fullText += `\n\n![Generated Image](${json.url})`
                            setMessages(p => p.map(m => m.id === botId ? { ...m, content: fullText } : m))
                        }
                    }
                    
                } catch (e) {
                    console.error(`🎨 [Banana前端] 解析失败:`, e, data)
                }
            }
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
        console.error("❌ [Banana 对话异常]:", e)
        console.error("❌ [错误堆栈]:", e.stack)
        console.error("❌ [错误详情]:", {
          message: e.message,
          name: e.name,
          userInputText,
          fileIds,
          userId
        })
        
        // 🔥 显示详细错误信息
        const errorMsg = e.message || "图片生成失败，请重试"
        toast.error(errorMsg, { 
          duration: 5000,
          description: `请查看控制台了解详情`
        })
        
        // 🔥 只删除 bot 消息，保留用户消息
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
    <div className="flex h-screen w-full bg-white overflow-hidden relative">
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
              <span className="text-lg">🍌</span>
              <span className="text-sm font-medium text-slate-700">Banana 2 Pro 图像创作</span>
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
                  style={{ backgroundColor: BANANA_COLOR }}
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
        </div>

        {/* 滚动区域 */}
        <div className="flex-1 h-0 relative overflow-hidden">
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
                <div className="mx-auto max-w-3xl py-3 text-center">
                  <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-3 py-2 shadow-sm">
                    <span className="inline-flex items-center gap-2 rounded-full bg-yellow-50 px-3 py-1 text-sm font-medium text-slate-700">
                      <span className="text-base">🍌</span>
                      Banana 2 Pro
                    </span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">{selectedSummary}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-500">
                    输入主体、材质、灯光、镜头和品牌气质，快速生成商业感更强的图像结果。
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {BANANA_PROMPT_PRESETS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setInput(prompt)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-all duration-200 hover:border-emerald-200 hover:text-slate-800"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {messages.map((message) => (
                    <div key={message.id} className={cn("flex gap-3 group", message.role === "user" ? "justify-end" : "justify-start")}>
                      {message.role === "assistant" && (
                        <div className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full mt-0.5" style={{ backgroundColor: BANANA_COLOR }}>
                          <span className="text-sm">🍌</span>
                        </div>
                      )}
                      {/* Flat content container */}
                      <div className={cn(
                        "flex flex-col max-w-[80%]",
                        message.role === "user" ? "items-end" : "items-start"
                      )}>
                        {/* User message */}
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
                          /* AI message - Flat, minimal */
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
                              <BananaRenderer
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
                style={{ backgroundColor: BANANA_COLOR }}
              >
                <ArrowDown className="w-4 h-4" />
                新消息
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* 输入框 */}
        <div className="border-t border-slate-100 bg-white p-3 md:p-6 shrink-0">
          <div className="mx-auto max-w-4xl">
            <form
              onSubmit={onSubmit}
              className="relative overflow-hidden rounded-[36px] border border-white/80 bg-white/90 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all duration-300 focus-within:-translate-y-0.5 focus-within:border-emerald-200/80 focus-within:shadow-[0_30px_90px_rgba(20,83,45,0.14)]"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_46%),radial-gradient(circle_at_top_right,rgba(250,204,21,0.12),transparent_38%)]" />
              <div className="relative p-4 sm:p-6">
                <div className="flex flex-col gap-3 border-b border-slate-200/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">图像创作工作台</p>
                      <p className="mt-1 text-sm text-slate-500">把输入提示作为主视觉中心，输出设置收束成一条轻量工具栏。</p>
                    </div>
                    <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-slate-200/80 bg-white/85 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 shadow-[0_8px_20px_rgba(16,185,129,0.12)]">
                        <Sparkles className="h-4 w-4" />
                        Banana 2 Pro
                      </span>
                      <span className="rounded-full px-4 py-2 text-sm font-medium text-slate-500">
                        高质量图像生成
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <span className="rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm shadow-emerald-100/70">
                      {selectedSummary}
                    </span>
                    <span className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-500">
                      Banana 图像工作流
                    </span>
                  </div>
                </div>

                <input 
                  ref={fileInputRef} 
                  type="file" 
                  className="hidden" 
                  accept="image/*" 
                  multiple 
                  onChange={handleFileUpload} 
                />

                <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.48fr)_280px]">
                  <div className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(247,249,251,0.95))] p-5 shadow-[0_20px_44px_rgba(15,23,42,0.06)] sm:p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">从一句高质量提示词开始你的图像创作</h2>
                        <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">主体、品牌感、材质、灯光与构图越清晰，最终结果越接近成熟商业视觉。</p>
                      </div>
                      <div className="flex items-center gap-2 self-start">
                        <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm">
                          Banana 2 Pro
                        </span>
                        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-700">
                          已选 {selectedSize.ratio} · {selectedSize.tierLabel}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-slate-50/75 p-4">
                      <div className="flex flex-wrap items-start gap-4">
                        <div className="min-w-[200px] flex-1">
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

                        <div className="min-w-[240px] flex-[1.2]">
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

                        <div className="flex flex-1 min-w-[150px] justify-end">
                          <button
                            type="button"
                            onClick={() => setShowAdvancedSettings((value) => !value)}
                            className="inline-flex h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition-all duration-200 hover:border-slate-300 hover:text-slate-800"
                          >
                            {showAdvancedSettings ? "收起高级设置" : "高级设置"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {isUploading && (
                      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/80 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-600">上传中...</span>
                          <span className="text-xs font-medium" style={{ color: BANANA_COLOR }}>{uploadProgress}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: BANANA_COLOR }}
                            initial={{ width: 0 }}
                            animate={{ width: `${uploadProgress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                      </div>
                    )}

                    {uploadedFiles.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {uploadedFiles.map((f, i) => (
                          <div key={i} className="group relative">
                            {f.preview ? (
                              <div className="relative h-24 w-24 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
                                <img src={f.preview} alt={f.name} className="h-full w-full object-cover" />
                                <button
                                  onClick={() => removeFile(i)}
                                  className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-sm shadow-sm">
                                <FileText className="h-4 w-4 text-green-600" />
                                <span className="max-w-[100px] truncate text-slate-600">{f.name}</span>
                                <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-5 rounded-[28px] border border-slate-200/80 bg-white/92 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-all duration-200 focus-within:border-emerald-200 focus-within:shadow-[0_16px_36px_rgba(16,185,129,0.08)] sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">创作提示词</p>
                          <p className="mt-1 text-xs text-slate-500">描述你想生成的画面、风格、材质、灯光与构图。</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500">
                          主输入区
                        </span>
                      </div>

                      <div className="mt-4 rounded-[24px] border border-emerald-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_18px_40px_rgba(15,23,42,0.04)]">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                            <p className="text-sm font-medium text-slate-700">在这里输入生成提示词</p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-400 shadow-sm">
                            支持长文本
                          </span>
                        </div>

                        <Textarea
                          ref={textareaRef}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={promptPlaceholder}
                          className="mt-4 min-h-[220px] max-h-[360px] resize-none border-0 bg-transparent px-0 py-0 text-[16px] leading-8 text-slate-700 placeholder:text-slate-400 focus-visible:ring-0"
                          disabled={isLoading}
                          rows={8}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {BANANA_PROMPT_PRESETS.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => setInput(prompt)}
                            className="rounded-full border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs font-medium text-slate-500 transition-all duration-200 hover:border-emerald-200 hover:bg-white hover:text-slate-700"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>

                      <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
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
                            添加参考图
                          </Button>
                          <span className="text-xs text-slate-500">
                            {userId ? "参考图、画幅比例与输出尺寸会一起传入后端图像工作流。" : "登录后可上传参考图、保存记录并同步积分。"}
                          </span>
                        </div>

                        <Button
                          type="submit"
                          className="h-12 rounded-2xl px-5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(20,83,45,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(20,83,45,0.28)] disabled:translate-y-0 disabled:opacity-40"
                          style={{ backgroundColor: BANANA_COLOR }}
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
                              开始创作
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-[26px] border border-slate-200/80 bg-white/82 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
                      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
                        <p className="text-sm font-medium text-slate-800">当前输出</p>
                        <p className="mt-2 text-sm font-semibold text-slate-700">{formatSizeLabel(selectedSize.apiValue)}</p>
                        <p className="mt-1 text-xs leading-6 text-slate-500">Banana 2 Pro · {selectedSize.ratio} · {selectedSize.tierLabel}</p>
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-slate-200/80 bg-white/82 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
                      <button
                        type="button"
                        onClick={() => setShowAdvancedSettings((value) => !value)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <div>
                          <p className="mt-2 text-base font-semibold text-slate-800">高级设置</p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500">
                          {showAdvancedSettings ? "收起" : "展开"}
                        </span>
                      </button>

                      {showAdvancedSettings && (
                        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
                            <p className="mt-2 text-sm font-medium text-slate-700">Banana 2 Pro</p>
                            <p className="mt-1 text-xs leading-6 text-slate-500">面向高质感商业视觉的图像生成工作流。</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
                            <p className="mt-2 text-sm font-medium text-slate-700">{selectedSize.tierLabel} · {formatSizeLabel(selectedSize.apiValue)}</p>
                            <p className="mt-1 text-xs leading-6 text-slate-500">当前比例、尺寸档位与真实输出尺寸会同步写入 `inputs` 和 `imageSize`。</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
                            <p className="mt-2 text-sm font-medium text-slate-700">
                              {uploadedFiles.length > 0 ? `已添加 ${uploadedFiles.length} 张参考图` : "暂未添加参考图"}
                            </p>
                            <p className="mt-1 text-xs leading-6 text-slate-500">可选上传参考图，让风格、材质或构图更接近你的目标。</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {!userId && (
                      <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-xs leading-6 text-slate-500">
                        未登录状态下将无法开始创作，但你仍然可以先准备提示词、参考图和输出参数。
                      </div>
                    )}
                  </div>
                </div>
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
                style={{ background: "#FDFBF7", boxShadow: "4px 0 24px rgba(0,0,0,0,12)" }}
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
                          if (session.ai_model && session.ai_model !== "banana-2-pro") {
                            const modelRoute = session.ai_model === "gpt-image-2"
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

export function BananaChatInterface() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: BANANA_COLOR }} />
      </div>
    }>
      <BananaChatInterfaceInner />
    </Suspense>
  )
}
