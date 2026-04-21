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
import { Textarea } from "@/components/ui/textarea"
import {
  Send, Paperclip, X, FileText, Copy, Loader2, Palette, User,
  ChevronLeft, ArrowDown, Download, Share2, Sparkles, Wand2, Image as ImageIcon
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@supabase/supabase-js"
import { collapseSidebar, refreshCredits } from "@/components/app-sidebar"
import { calculatePreviewCost } from "@/lib/pricing"
import { UltimateRenderer } from "@/components/chat/UltimateRenderer"
import { ModelLogo } from "@/components/ModelLogo"

const BRAND_GREEN = "#14532d"
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || ''

// 🎨 模式选项
const MODE_OPTIONS = [
  { key: "text-to-image", label: "文生图", icon: Wand2 },
  { key: "image-edit", label: "图像编辑", icon: ImageIcon },
] as const

type ModeOption = typeof MODE_OPTIONS[number]

// 🎨 尺寸选项配置
const SIZE_OPTIONS = [
  { label: "1:1", value: "1:1", width: 1024, height: 1024 },
  { label: "9:16", value: "9:16", width: 1024, height: 1536 },
  { label: "4:3", value: "4:3", width: 1536, height: 1024 },
] as const

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

  // 🎨 新增：模式选择和尺寸选择
  const [selectedMode, setSelectedMode] = useState<ModeOption>(MODE_OPTIONS[0])
  const [selectedSize, setSelectedSize] = useState<SizeOption>(SIZE_OPTIONS[0])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentBotIdRef = useRef<string | null>(null)

  const [isNearBottom, setIsNearBottom] = useState(true)
  const [hasNewMessage, setHasNewMessage] = useState(false)

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
    return calculatePreviewCost("gpt-image-2", {
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

        const res = await fetch(`${API_BASE}/api/dify-upload`, {
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

    const userInputText = txt
    const userFiles = [...uploadedFiles]

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userInputText,
      files: userFiles
    }
    setMessages(p => [...p, userMsg])
    setInput("")

    const fileIds = uploadedFiles.map(f => f.difyFileId).filter(Boolean) as string[]

    setUploadedFiles([])

    const preview = userInputText.slice(0, 30)
    const { data: existing } = await supabase.from('chat_sessions').select('id').eq('id', sid).single()
    if (!existing) {
        await supabase.from('chat_sessions').insert({ id: sid, user_id: userId, title: "GPT Image 2", preview })
    } else {
        await supabase.from('chat_sessions').update({ preview }).eq('id', sid)
    }
    await supabase.from('chat_messages').insert({ session_id: sid, role: "user", content: userInputText })

    const botId = (Date.now()+1).toString()
    currentBotIdRef.current = botId
    setMessages(p => [...p, { id: botId, role: "assistant", content: "" }])

    let fullText = ""
    try {
        console.log(`🎨 [GPT Image 2前端] 准备发送请求，用户输入: "${userInputText}"`)

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
              model: "gpt-image-2",
              mode: selectedMode.key,
              imageSize: {
                ratio: selectedSize.value,
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

        // 🎨 GPT Image 2 使用 async 模式，轮询任务状态
        try {
          const result = await res.json()
          console.log(`🎨 [GPT Image 2] Async 响应:`, result)

          // Async 模式返回格式: { task_id, workflow_run_id, status }
          const taskId = result.task_id
          if (!taskId) {
            throw new Error(`Dify 任务提交失败: ${JSON.stringify(result)}`)
          }

          // 轮询任务状态
          const maxPolls = 60  // 最多轮询60次
          const pollInterval = 2000  // 每2秒轮询一次
          let pollCount = 0
          let taskResult = null

          setMessages(p => p.map(m => m.id === botId ? { ...m, content: "正在生成图片..." } : m))

          while (pollCount < maxPolls) {
            await new Promise(resolve => setTimeout(resolve, pollInterval))

            const pollRes = await fetch(`${API_BASE}/api/dify-chat/poll-task?task_id=${taskId}`)
            if (!pollRes.ok) {
              throw new Error(`轮询失败: ${pollRes.status}`)
            }

            taskResult = await pollRes.json()
            console.log(`🎨 [GPT Image 2 轮询] ${pollCount + 1}/${maxPolls} 状态: ${taskResult.data?.status}`)

            const status = taskResult.data?.status

            if (status === "succeeded") {
              // 任务完成，解析输出
              const outputs = taskResult.data?.outputs
              if (outputs) {
                let imageUrl = outputs.first_url || outputs.image_data_uri || outputs.url || ""

                if (outputs.status_code === 200 && outputs.raw_body) {
                  try {
                    const rawData = JSON.parse(outputs.raw_body)
                    if (rawData.data && Array.isArray(rawData.data)) {
                      for (const item of rawData.data) {
                        if (item.url) imageUrl = item.url
                        if (item.revised_prompt) fullText += `提示词: ${item.revised_prompt}\n\n`
                      }
                    }
                  } catch (e) {}
                }

                if (imageUrl) {
                  fullText = `![Generated Image](${imageUrl})`
                } else if (outputs.text || outputs.result) {
                  fullText = outputs.text || outputs.result
                }
              }
              break
            } else if (status === "failed") {
              throw new Error(`图片生成失败: ${taskResult.data?.error || "未知错误"}`)
            }
            // running, pending 等状态继续轮询

            pollCount++
          }

          if (!fullText && pollCount >= maxPolls) {
            throw new Error("图片生成超时，请重试")
          }

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
              <ModelLogo modelKey="gpt-image-2" size="lg" />
              <span className="text-sm font-medium text-slate-700">GPT Image 2</span>
            </div>
          </div>
          <div className="md:hidden">
            {userId ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-700 font-medium">{userCredits.toLocaleString()}</span>
              </div>
            ) : (
              <button
                onClick={() => router.push("/login")}
                className="px-3 py-1.5 text-xs font-medium text-white rounded-lg"
                style={{ backgroundColor: BRAND_GREEN }}
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
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5">
                    <ModelLogo modelKey="gpt-image-2" size="xl" />
                  </div>
                  <h1 className="text-xl font-semibold text-slate-800 mb-2">GPT Image 2</h1>
                  <p className="text-sm text-slate-500 max-w-md">
                    描述你想要的图片，AI 将为你创作高质量的图像
                  </p>
                </div>
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
                          <div
                            className="rounded-2xl px-4 py-3 text-white"
                            style={{ backgroundColor: BRAND_GREEN, borderRadius: "18px 4px 18px 18px" }}
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
                              <div className="whitespace-pre-wrap text-sm" style={{ lineHeight: 1.6 }}>{message.content}</div>
                            </div>
                          </div>
                        ) : (
                          <>
                            {isLoading && message.id === currentBotIdRef.current && !message.content ? (
                              <div className="inline-flex items-center gap-1.5">
                                <Sparkles className="w-3 h-3 text-slate-400 shrink-0" strokeWidth={1.5} />
                                <span className="text-xs text-slate-400 font-normal tracking-wide">Thinking...</span>
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
        <div className="border-t border-slate-100 bg-white p-3 md:p-6 shrink-0">
          <div className="mx-auto max-w-4xl">
            {/* 上传进度条 */}
            {isUploading && (
              <div className="mb-3 rounded-lg bg-slate-50 p-3 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-600">上传中...</span>
                  <span className="text-xs font-medium" style={{ color: BRAND_GREEN }}>{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
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
              {/* 🎨 模式选择器 + 尺寸选择器 */}
              <div className="px-3 pt-3 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* 模式选择 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-400">模式</span>
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-full">
                      {MODE_OPTIONS.map((mode) => {
                        const ModeIcon = mode.icon
                        return (
                          <button
                            key={mode.key}
                            type="button"
                            onClick={() => setSelectedMode(mode)}
                            className={cn(
                              "px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 flex items-center gap-1.5",
                              selectedMode.key === mode.key
                                ? "bg-white text-slate-800 shadow-sm"
                                : "text-slate-500 hover:text-slate-700"
                            )}
                          >
                            <ModeIcon className="w-3.5 h-3.5" />
                            {mode.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* 尺寸选择 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-400">尺寸</span>
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-full">
                      {SIZE_OPTIONS.map((size) => (
                        <button
                          key={size.value}
                          type="button"
                          onClick={() => setSelectedSize(size)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200",
                            selectedSize.value === size.value
                              ? "bg-white text-slate-800 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          )}
                        >
                          {size.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

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
                    style={{ backgroundColor: BRAND_GREEN }}
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