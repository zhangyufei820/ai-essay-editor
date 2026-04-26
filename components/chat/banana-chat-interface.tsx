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
import {
  X, FileText, Copy, Loader2, Palette, User,
  ChevronLeft, ArrowDown, Download, Share2, Sparkles, History
} from "lucide-react"
import { cn } from "@/lib/utils"
import { buildChatSessionRouteFromSession, normalizeChatSessionModel } from "@/lib/chat-session-routes"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@supabase/supabase-js"
import { collapseSidebar, refreshCredits, refreshSessionList } from "@/components/app-sidebar"
import { calculatePreviewCost } from "@/lib/pricing"
import { UltimateRenderer } from "@/components/chat/UltimateRenderer"
import { GridWaveLoader } from "@/components/chat/GridWaveLoader"
import { ImageChatComposer } from "@/components/chat/image-generation/image-chat-composer"
import { getImageModelConfig } from "@/components/chat/image-generation/config"
import { proxifyGeneratedImageDownloadUrl, proxifyGeneratedImagePreviewUrl } from "@/components/chat/image-generation/gpt-image-v11"

const BRAND_GREEN = "#14532d"
const BANANA_COLOR = "#14532d" // 使用网站主题深绿色

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || ''

// 🎨 尺寸选项配置
const SIZE_OPTIONS = getImageModelConfig("banana-2-pro").sizeOptions

type SizeOption = typeof SIZE_OPTIONS[number]

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
  ai_provider?: string
  processing_mode?: string
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
            src={proxifyGeneratedImagePreviewUrl(img.url, 900)} 
            alt={img.alt}
            className="w-full h-auto"
            loading="lazy"
          />
          {/* 下载按钮 */}
          <a
            href={proxifyGeneratedImageDownloadUrl(img.url)}
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
  const urlSessionId = searchParams.get("sessionId") || searchParams.get("id")
  const initialPrompt = searchParams.get("prompt") ?? ""
  const initialSizeValue = searchParams.get("size") ?? "9-16-hd"

  const [userId, setUserId] = useState<string>("")
  const [userAvatar, setUserAvatar] = useState<string>("")
  const [userCredits, setUserCredits] = useState<number>(0)
  const [userDisplayName, setUserDisplayName] = useState<string>("")
  const sessionIdRef = useRef<string | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string>("")

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState(initialPrompt)
  const [isLoading, setIsLoading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedSize, setSelectedSize] = useState<SizeOption>(
    SIZE_OPTIONS.find((s) => s.value === initialSizeValue) ??
    SIZE_OPTIONS.find((s) => s.ratio === initialSizeValue) ??
    SIZE_OPTIONS[1]
  )

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentBotIdRef = useRef<string | null>(null)
  
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [hasNewMessage, setHasNewMessage] = useState(false)
  const [showHistorySidebar, setShowHistorySidebar] = useState(false)
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])

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
          ai_model: s.ai_model || "banana-2-pro",
          ai_provider: s.ai_provider || "",
          processing_mode: s.processing_mode || "",
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

  // 自动提交：从入口页传递的 prompt
  const hasAutoSubmittedRef = useRef(false)
  useEffect(() => {
    if (!userId || !input.trim() || hasAutoSubmittedRef.current) return
    hasAutoSubmittedRef.current = true
    void onSubmit({ preventDefault() {} } as React.FormEvent)
  }, [userId, input])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) { 
      toast.error("请登录")
      return 
    }
    
    const txt = (input || "").trim()
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
    const userFiles = [...uploadedFiles]  // 🔥 保存文件副本用于显示
    
    const userMsg: Message = { 
      id: Date.now().toString(), 
      role: "user", 
      content: userInputText,
      files: userFiles  // 🔥 保存文件信息到消息中
    }
    setMessages(p => [...p, userMsg])
    setInput("")
    
    // 提取文件ID
    const fileIds = uploadedFiles.map(f => f.difyFileId).filter(Boolean) as string[]
    
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
    refreshSessionList()

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
        <div className="flex items-center h-14 px-4 border-b border-slate-100 bg-white shrink-0">
          <button 
            onClick={handleBack}
            className="flex items-center gap-1 text-slate-600 hover:text-slate-800 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm font-medium hidden sm:inline">返回</span>
          </button>
          <div className="flex-1 text-center md:text-left md:ml-4">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <span className="text-lg">🍌</span>
              <span className="text-sm font-medium text-slate-700">Banana2 Pro 4K</span>
            </div>
          </div>
          <div>
            {userId ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-700 font-medium">{userCredits.toLocaleString()}</span>
                <button
                  onClick={() => setShowHistorySidebar(true)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <History className="h-4 w-4 text-slate-600" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push("/login")}
                  className="px-3 py-1.5 text-xs font-medium text-white rounded-lg"
                  style={{ backgroundColor: BANANA_COLOR }}
                >
                  登录
                </button>
                <button
                  onClick={() => setShowHistorySidebar(true)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <History className="h-4 w-4 text-slate-600" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 滚动区域 */}
        <div className="flex-1 h-0 relative overflow-hidden">
          <div 
            ref={scrollAreaRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto custom-scrollbar pb-28 md:pb-0"
          >
            <div className="mx-auto max-w-4xl px-3 md:px-6 py-3 md:py-8">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 md:py-16 text-center">
                  <div className="mb-4 md:mb-6 flex h-14 w-14 md:h-16 md:w-16 items-center justify-center rounded-2xl bg-yellow-50">
                    <span className="text-4xl">🍌</span>
                  </div>
                  <h1 className="text-lg md:text-xl font-semibold text-slate-800 mb-2">AI 图片生成</h1>
                  <p className="text-sm text-slate-500 max-w-md px-4">
                    描述你想要的图片，Banana2 Pro 4K 将为你创作高质量的 AI 图像
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5 md:space-y-5">
                  {messages.map((message) => (
                    <div key={message.id} className={cn("flex gap-1.5 md:gap-3 group", message.role === "user" ? "justify-end" : "justify-start")}>
                      {message.role === "assistant" && (
                        <div className="flex w-6 h-6 md:w-7 md:h-7 shrink-0 items-center justify-center rounded-full mt-0.5" style={{ backgroundColor: BANANA_COLOR }}>
                          <span className="text-xs md:text-sm">🍌</span>
                        </div>
                      )}
                      {/* Flat content container */}
                      <div className={cn(
                        "flex flex-col max-w-[94%] md:max-w-[80%]",
                        message.role === "user" ? "items-end" : "items-start"
                      )}>
                        {/* User message */}
                        {message.role === "user" ? (
                          <div
                            className="rounded-2xl px-3 py-2.5 md:px-4 md:py-3 text-slate-700 border border-slate-200"
                            style={{ backgroundColor: "#f8fafc", borderRadius: "18px 4px 18px 18px" }}
                          >
                            <div className="space-y-2">
                              {message.files && message.files.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {message.files.map((file, idx) => (
                                    <motion.div
                                      key={idx}
                                      initial={{ opacity: 0, scale: 0.8 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      transition={{ duration: 0.3, delay: idx * 0.1 }}
                                    >
                                      {file.preview ? (
                                        <div className="relative w-14 h-14 rounded-lg overflow-hidden border-2 border-white/30">
                                          <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1.5 rounded-lg bg-white/20 px-2 py-1 text-xs">
                                          <FileText className="h-3 w-3" />
                                          <span className="max-w-[60px] truncate">{file.name}</span>
                                        </div>
                                      )}
                                    </motion.div>
                                  ))}
                                </div>
                              )}
                              <div className="whitespace-pre-wrap text-[13px] md:text-sm" style={{ lineHeight: 1.6 }}>{message.content}</div>
                            </div>
                          </div>
                        ) : (
                          /* AI message - Flat, minimal */
                          <>
                            {isLoading && message.id === currentBotIdRef.current && !message.content ? (
                              <div className="flex items-center justify-center py-4">
                                <GridWaveLoader maxWidth={220} dotSize={5} backgroundColor="#2F3136" />
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
        <div className="fixed bottom-0 left-2 right-2 z-50 md:relative md:left-auto md:right-auto border-t border-slate-100 bg-white/95 backdrop-blur-md p-0 pb-safe md:p-6 shrink-0">
          <div className="mx-auto max-w-4xl">
            <ImageChatComposer
              modeOptions={[{ key: "image", label: "图像生成" }]}
              selectedModeKey="image"
              onModeChange={() => undefined}
              sizeOptions={SIZE_OPTIONS.map((size) => ({ ...size }))}
              selectedSizeValue={selectedSize.value}
              onSizeChange={(sizeValue) =>
                setSelectedSize(SIZE_OPTIONS.find((s) => s.value === sizeValue) ?? SIZE_OPTIONS[1])
              }
              input={input}
              onInputChange={setInput}
              onKeyDown={handleKeyDown}
              onSubmit={onSubmit}
              onUploadClick={() => {
                if (!userId) {
                  toast.error("请先登录后再上传文件")
                  return
                }
                fileInputRef.current?.click()
              }}
              uploadedFiles={uploadedFiles}
              onRemoveFile={removeFile}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              isLoading={isLoading}
              submitLabelColor={BANANA_COLOR}
              placeholder={userId ? "描述你想要的图片..." : "请先登录..."}
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
            />
            {!userId && (
              <p className="mt-3 text-center text-xs text-slate-400">未登录</p>
            )}
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
                          if (normalizeChatSessionModel(session.ai_model) !== "banana-2-pro") {
                            router.push(buildChatSessionRouteFromSession(session))
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
