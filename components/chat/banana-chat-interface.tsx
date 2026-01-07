"use client"

/**
 * Banana 2 Pro 4K 专用聊天界面
 * 特点：
 * 1. 流式输出文字描述
 * 2. 自动渲染生成的图片（支持 Markdown 格式）
 * 3. 独立的 UI 和交互逻辑
 */

import type React from "react"
import { useState, useRef, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { 
  Send, Paperclip, X, FileText, Copy, Loader2, Palette, User, 
  ChevronLeft, ArrowDown, Download, Share2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@supabase/supabase-js"
import { collapseSidebar, refreshCredits } from "@/components/app-sidebar"
import { calculatePreviewCost } from "@/lib/pricing"
import { UltimateRenderer } from "@/components/chat/UltimateRenderer"

const BRAND_GREEN = "#14532d"
const BANANA_COLOR = "#14532d" // 使用网站主题深绿色

// Supabase 初始化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Message = { 
  id: string
  role: "user" | "assistant"
  content: string
}

type UploadedFile = { 
  name: string
  type: string
  size: number
  data: string
  preview?: string
  difyFileId?: string
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

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentBotIdRef = useRef<string | null>(null)
  
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [hasNewMessage, setHasNewMessage] = useState(false)

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
      const res = await fetch(`/api/user/credits?user_id=${encodeURIComponent(uid)}`)
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
        
        const res = await fetch("/api/dify-upload", {
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

    // 🔥 先保存用户输入的文本
    const userInputText = txt
    
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: userInputText }
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
        await supabase.from('chat_sessions').insert({ id: sid, user_id: userId, title: "图片生成", preview })
    } else {
        await supabase.from('chat_sessions').update({ preview }).eq('id', sid)
    }
    await supabase.from('chat_messages').insert({ session_id: sid, role: "user", content: userInputText })

    const botId = (Date.now()+1).toString()
    currentBotIdRef.current = botId
    setMessages(p => [...p, { id: botId, role: "assistant", content: "" }])
    
    let fullText = ""
    try {
        console.log(`🎨 [Banana前端] 准备发送请求，用户输入: "${userInputText}"`)
        
        const res = await fetch("/api/dify-chat", {
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
              mode: "image"
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
        toast.error(e.message || "图片生成失败，请重试", { duration: 5000 })
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
              <span className="text-sm font-medium text-slate-700">Banana 2 Pro 4K</span>
            </div>
          </div>
          <div className="md:hidden">
            {userId ? (
              <MobileUserInfo 
                userName={userDisplayName}
                credits={userCredits}
                onMenuClick={() => router.push("/settings")}
              />
            ) : (
              <button
                onClick={() => router.push("/login")}
                className="px-3 py-1.5 text-xs font-medium text-white rounded-lg"
                style={{ backgroundColor: BANANA_COLOR }}
              >
                登录
              </button>
            )}
          </div>
          <div className="hidden md:block w-16" />
        </div>

        {/* 滚动区域 */}
        <div className="flex-1 h-0 relative overflow-hidden">
          <div 
            ref={scrollAreaRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto custom-scrollbar"
          >
            <div className="mx-auto max-w-4xl px-4 md:px-6 py-6 md:py-8">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-50">
                    <span className="text-4xl">🍌</span>
                  </div>
                  <h1 className="text-xl font-semibold text-slate-800 mb-2">AI 图片生成</h1>
                  <p className="text-sm text-slate-500 max-w-md">
                    描述你想要的图片，Banana 2 Pro 4K 将为你创作高质量的 AI 图像
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {messages.map((message) => (
                    <div key={message.id} className={cn("flex gap-3", message.role === "user" ? "justify-end" : "justify-start")}>
                      {message.role === "assistant" && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white mt-1" style={{ backgroundColor: BANANA_COLOR }}>
                          <span className="text-lg">🍌</span>
                        </div>
                      )}
                      <div className={cn(
                        "relative rounded-2xl px-4 py-3",
                        message.role === "user"
                          ? "text-white max-w-[75%]"
                          : "bg-slate-50 w-full max-w-full"
                      )} style={message.role === "user" ? { backgroundColor: BANANA_COLOR } : {}}>
                        {message.role === "user" ? (
                          <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</div>
                        ) : (
                          <>
                            {isLoading && message.id === currentBotIdRef.current && !message.content ? (
                              <div className="flex items-center gap-2 text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm">思考中...</span>
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
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200 mt-1 overflow-hidden">
                          {userAvatar ? (
                            <img src={userAvatar} alt="Me" className="h-full w-full object-cover" />
                          ) : (
                            <User className="h-4 w-4 text-slate-500" />
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
            {/* 上传进度条 */}
            {isUploading && (
              <div className="mb-3 rounded-lg bg-slate-50 p-3 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-600">上传中...</span>
                  <span className="text-xs font-medium" style={{ color: BANANA_COLOR }}>{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
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

            {/* 文件预览区域 */}
            {uploadedFiles.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="relative group">
                    {f.preview ? (
                      <div className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-slate-200">
                        <img src={f.preview} alt={f.name} className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeFile(i)}
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm border border-slate-200">
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

            <form onSubmit={onSubmit} className="relative rounded-[24px] bg-white shadow-lg border border-slate-200">
              <div className="flex items-end gap-2 p-3">
                {/* 文件上传按钮 */}
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <span className="text-[10px] font-medium text-slate-400">文件</span>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 rounded-xl text-slate-400 hover:bg-slate-50" 
                    onClick={() => {
                      if (!userId) {
                        toast.error("请先登录后再上传文件")
                        return
                      }
                      fileInputRef.current?.click()
                    }}
                    disabled={isLoading}
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                </div>
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  className="hidden" 
                  accept="image/*" 
                  multiple 
                  onChange={handleFileUpload} 
                />

                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={userId ? "描述你想要的图片..." : "请先登录..."}
                  className="min-h-[48px] max-h-[160px] flex-1 resize-none border-0 bg-transparent p-2 text-[15px] text-slate-700 placeholder:text-slate-400 focus-visible:ring-0"
                  disabled={isLoading}
                  rows={1}
                />
                
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <span className="text-[10px] font-medium text-slate-400">发送</span>
                  <Button 
                    type="submit" 
                    size="icon" 
                    className="h-10 w-10 rounded-xl text-white shadow-lg hover:opacity-90 transition-all disabled:opacity-40"
                    style={{ backgroundColor: BANANA_COLOR }}
                    disabled={isLoading || !input.trim()}
                  >
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </Button>
                </div>
              </div>
            </form>

            {!userId && (
              <p className="mt-3 text-center text-xs text-slate-400">未登录</p>
            )}
          </div>
        </div>
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
