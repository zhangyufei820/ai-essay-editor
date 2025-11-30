"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { Send, Paperclip, X, FileText, Menu, Plus, Copy, Check, ChevronDown, Edit2, MoreVertical, Share2, Link2, Zap, Brain, Rocket, Sparkles, Diamond, User } from 'lucide-react'
import { cn } from "@/lib/utils"
import { toast } from "sonner"

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options)
      
      // If 429, wait and retry
      if (response.status === 429) {
        if (i < maxRetries - 1) {
          // Exponential backoff: 3s, 6s, 12s
          const delay = Math.pow(2, i) * 3000 + Math.random() * 1000
          console.log(`[v0] Rate limited, retrying in ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
      }
      
      return response
    } catch (error) {
      if (i === maxRetries - 1) throw error
      const delay = Math.pow(2, i) * 2000
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw new Error('Max retries reached')
}

type UploadedFile = {
  name: string
  type: string
  size: number
  data: string
  preview?: string
}

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  mixtureModels?: Array<{ name: string; status: "loading" | "success" | "error"; response?: string }>
}

type AIProvider = {
  id: string
  name: string
  models: Array<{ id: string; name: string }>
}

type Model = {
  id: string
  name: string
  icon: React.ReactNode
  description?: string
  provider: "openai" | "anthropic" | "google"
}

const AVAILABLE_MODELS: Model[] = [
  { 
    id: "mixture-of-agents", 
    name: "Mixture-of-Agents", 
    description: "自动混合最佳AI模型以完成您的任务。",
    icon: <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-purple-500 to-pink-500 text-[10px] font-bold text-white">🤖</div>,
    provider: "openai"
  },
  // OpenAI GPT models
  { 
    id: "gpt-5", 
    name: "GPT-5", 
    icon: <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#74aa9c] text-white"><svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg></div>,
    provider: "openai"
  },
  { 
    id: "gpt-5-mini", 
    name: "GPT-5 Mini", 
    icon: <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#10a37f] text-white"><svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg></div>,
    provider: "openai"
  },
  // Claude models - exact names from vivaapi
  { 
    id: "claude-haiku-4-5-20251001", 
    name: "Claude Haiku 4.5", 
    icon: <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#d97757] text-white"><svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor"/></svg></div>,
    provider: "anthropic"
  },
  { 
    id: "claude-sonnet-4-5-20250929", 
    name: "Claude Sonnet 4.5", 
    icon: <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#d97757] text-white"><svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor"/></svg></div>,
    provider: "anthropic"
  },
  // Gemini models - exact names from vivaapi
  { 
    id: "gemini-2.5-flash-nothinking", 
    name: "Gemini 2.5 Flash", 
    icon: <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-r from-[#4285f4] via-[#ea4335] to-[#fbbc04] text-white"><svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M12 2L2 7v10l10 5 10-5V7z"/></svg></div>,
    provider: "google"
  },
  { 
    id: "gemini-3-pro-preview-11-2025", 
    name: "Gemini 3 Pro", 
    icon: <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-r from-[#4285f4] via-[#ea4335] to-[#fbbc04] text-white"><svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M12 2L2 7v10l10 5 10-5V7z"/></svg></div>,
    provider: "google"
  },
]

function EssayGradingResult({ content }: { content: string }) {
  try {
    // Extract JSON from markdown code block if present
    const jsonMatch = content.match(/\`\`\`json\n([\s\S]*?)\n\`\`\`/)
    const jsonStr = jsonMatch ? jsonMatch[1] : content
    const data = JSON.parse(jsonStr)

    return (
      <div className="space-y-6">
        {/* Final Version */}
        <div>
          <h3 className="mb-2 font-semibold text-lg">最终定稿</h3>
          <Card className="p-4 bg-background">
            <p className="whitespace-pre-wrap">{data.finalVersion}</p>
          </Card>
        </div>

        {/* Diagnosis */}
        {data.diagnosis && (
          <div>
            <h3 className="mb-2 font-semibold text-lg">诊断分析</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Card className="p-4">
                <h4 className="mb-2 font-medium text-sm">规范性评估</h4>
                <p className="text-sm text-muted-foreground">{data.diagnosis.compliance}</p>
              </Card>
              <Card className="p-4">
                <h4 className="mb-2 font-medium text-sm">结构诊断</h4>
                <p className="text-sm text-muted-foreground">{data.diagnosis.structure}</p>
              </Card>
            </div>
          </div>
        )}

        {/* Comparisons */}
        {data.comparisons && data.comparisons.length > 0 && (
          <div>
            <h3 className="mb-2 font-semibold text-lg">对比分析</h3>
            <div className="space-y-3">
              {data.comparisons.map((comp: any, index: number) => (
                <Card key={index} className="p-4">
                  <h4 className="mb-2 font-medium">{comp.aspect}</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">原文</p>
                      <p className="text-sm">{comp.original}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">改进</p>
                      <p className="text-sm">{comp.improved}</p>
                    </div>
                  </div>
                  <div className="mt-2 rounded-lg bg-primary/10 p-2">
                    <p className="text-xs text-primary">{comp.highlight}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Learning Points */}
        {data.learningPoints && (
          <div>
            <h3 className="mb-2 font-semibold text-lg">学习要点</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <Card className="p-4">
                <h4 className="mb-2 font-medium text-sm">结构布局</h4>
                <p className="text-sm text-muted-foreground">{data.learningPoints.structure}</p>
              </Card>
              <Card className="p-4">
                <h4 className="mb-2 font-medium text-sm">语言表达</h4>
                <p className="text-sm text-muted-foreground">{data.learningPoints.language}</p>
              </Card>
              <Card className="p-4">
                <h4 className="mb-2 font-medium text-sm">思想立意</h4>
                <p className="text-sm text-muted-foreground">{data.learningPoints.theme}</p>
              </Card>
            </div>
          </div>
        )}
      </div>
    )
  } catch (error) {
    // Fallback to plain text if JSON parsing fails
    return <div className="whitespace-pre-wrap break-words">{content}</div>
  }
}

export function EnhancedChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isOCRProcessing, setIsOCRProcessing] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [chatSessions, setChatSessions] = useState<Array<{ id: string; title: string; updated_at: string }>>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState("openai")
  // Updated initial selectedModel and added showModelMenu state
  const [selectedModel, setSelectedModel] = useState("mixture-of-agents")
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("chat")
  const [enableWebSearch, setEnableWebSearch] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  // Added sessionTitle and isEditingTitle states
  const [sessionTitle, setSessionTitle] = useState("Friendly AI Assistant Greets User")
  const [isEditingTitle, setIsEditingTitle] = useState(false)

  useEffect(() => {
    loadProviders()
    loadChatSessions()
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const loadProviders = async () => {
    try {
      const response = await fetch("/api/providers")
      if (response.ok) {
        const data = await response.json()
        setProviders(data.providers || [])
      }
    } catch (error) {
      console.error("[v0] Load providers error:", error)
    }
  }

  const loadChatSessions = async () => {
    try {
      const response = await fetch("/api/chat-session")
      if (response.ok) {
        const data = await response.json()
        setChatSessions(data.sessions || [])
      }
    } catch (error) {
      console.error("[v0] Load sessions error:", error)
    }
  }

  const createNewSession = async () => {
    try {
      const response = await fetch("/api/chat-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "新对话",
          processing_mode: processingMode,
          ai_provider: selectedProvider,
          ai_model: selectedModel,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setCurrentSessionId(data.session.id)
        setMessages([])
        await loadChatSessions()
        toast.success("创建新对话")
      } else if (response.status === 503) {
        console.log("[v0] Database not configured, using temporary session")
        setCurrentSessionId("temp-" + Date.now())
        setMessages([])
      }
    } catch (error) {
      console.error("[v0] Create session error:", error)
      setCurrentSessionId("temp-" + Date.now())
    }
  }

  const saveMessage = async (role: "user" | "assistant", content: string, files?: UploadedFile[]) => {
    if (!currentSessionId) return

    try {
      await fetch("/api/save-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: currentSessionId,
          role,
          content,
          files: files?.map((f) => ({ name: f.name, type: f.type, size: f.size, data: f.data })),
        }),
      })
    } catch (error) {
      console.error("[v0] Save message error:", error)
    }
  }

  const processDocument = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("ocrProvider", "google-vision")

    try {
      const response = await fetch("/api/document-process", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("文档处理失败")
      }

      const data = await response.json()
      toast.success(`成功提取 ${data.wordCount} 个字符`)
      return data.extractedText
    } catch (error) {
      console.error("[v0] Document processing error:", error)
      toast.error("文档处理失败")
      return ""
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`文件 ${file.name} 超过10MB限制`)
        continue
      }

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
      ]

      if (!allowedTypes.includes(file.type)) {
        toast.error(`不支持的文件类型: ${file.name}`)
        continue
      }

      if (file.type.includes("pdf") || file.type.includes("word") || file.type.includes("document")) {
        toast.info(`正在处理文档: ${file.name}`)
        const extractedText = await processDocument(file)
        
        if (extractedText) {
          // Auto-fill input with extracted text
          setInput((prev) => prev + (prev ? "\n\n" : "") + `[从${file.name}提取]:\n${extractedText}`)
        }
        continue
      }

      const reader = new FileReader()
      reader.onload = (event) => {
        const data = event.target?.result as string
        const newFile: UploadedFile = {
          name: file.name,
          type: file.type,
          size: file.size,
          data,
          preview: file.type.startsWith("image/") ? data : undefined,
        }
        setUploadedFiles((prev) => [...prev, newFile])
        toast.success(`已添加文件: ${file.name}`)
      }
      reader.readAsDataURL(file)
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const extractTextFromImages = async (files: UploadedFile[]): Promise<string> => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"))
    if (imageFiles.length === 0) return ""

    setIsOCRProcessing(true)
    toast.info(`正在识别 ${imageFiles.length} 张图片中的文字...`)

    try {
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          images: imageFiles.map((img) => img.data),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error("[v0] OCR API error:", errorData)
        throw new Error(errorData.error || "OCR识别失败")
      }

      const data = await response.json()
      const extractedText = data.text

      toast.success(`成功识别 ${extractedText.length} 个字符`)
      return extractedText
    } catch (error) {
      console.error("[v0] OCR error:", error)
      toast.error("图片文字识别失败，将直接发送图片")
      return ""
    } finally {
      setIsOCRProcessing(false)
    }
  }

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedMessageId(messageId)
      toast.success("已复制到剪贴板")
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch (error) {
      toast.error("复制失败")
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedInput = (input || "").trim()
    if (!trimmedInput && uploadedFiles.length === 0) {
      return
    }

    if (!currentSessionId) {
      await createNewSession()
    }

    let extractedText = ""
    const imageFiles = uploadedFiles.filter((f) => f.type.startsWith("image/"))
    if (imageFiles.length > 0) {
      extractedText = await extractTextFromImages(imageFiles)
    }

    let messageContent = trimmedInput

    if (extractedText) {
      messageContent = extractedText + (trimmedInput ? `\n\n用户补充：${trimmedInput}` : "")
    }

    if (uploadedFiles.length > 0) {
      messageContent += "\n\n[附件]:\n"
      uploadedFiles.forEach((file) => {
        messageContent += `- ${file.name} (${(file.size / 1024).toFixed(2)}KB)\n`
      })
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageContent,
    }

    setMessages((prev) => [...prev, userMessage])
    await saveMessage("user", messageContent, uploadedFiles)

    setInput("")
    const currentFiles = [...uploadedFiles]
    setUploadedFiles([])
    setIsLoading(true)
    setIsTyping(false)

    try {
      if (selectedModel === "mixture-of-agents") {
        const mixtureModels = [
          { id: "gpt-5-2025-08-07", name: "GPT-5" },
          { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
          { id: "gemini-2.5-flash-nothinking", name: "Gemini 2.5 Flash" },
        ]

        const assistantMessageId = (Date.now() + 1).toString()
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          mixtureModels: mixtureModels.map(m => ({ name: m.name, status: "loading" as const })),
        }
        setMessages((prev) => [...prev, assistantMessage])

        const modelResponses: Array<{model: string; text: string; success: boolean}> = []
        
        for (const model of mixtureModels) {
          try {
            console.log(`[v0] Calling model: ${model.name} (${model.id})`)
            
            const response = await fetchWithRetry("/api/chat", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-AI-Provider": "vivaapi",
                "X-AI-Model": model.id,
              },
              body: JSON.stringify({
                messages: [...messages, userMessage].map((msg) => ({
                  role: msg.role,
                  content: msg.content,
                })),
              }),
            }, 3)

            if (!response.ok) {
              const errorText = await response.text()
              console.error(`[v0] Model ${model.name} error: ${response.status} - ${errorText}`)
              modelResponses.push({ model: model.name, text: "", success: false })
              
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === assistantMessageId && msg.mixtureModels) {
                    return {
                      ...msg,
                      mixtureModels: msg.mixtureModels.map((m) =>
                        m.name === model.name ? { ...m, status: "error" as const } : m
                      ),
                    }
                  }
                  return msg
                })
              )
              
              await new Promise(resolve => setTimeout(resolve, 5000))
              continue
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()
            let fullText = ""

            if (reader) {
              let buffer = ""
              while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split("\n")
                buffer = lines.pop() || ""

                for (const line of lines) {
                  if (!line.trim() || !line.startsWith("0:")) continue
                  try {
                    const data = JSON.parse(line.slice(2))
                    if (data.type === "text-delta" && data.textDelta) {
                      fullText += data.textDelta
                    }
                  } catch (parseError) {
                    console.error("[v0] Parse error:", parseError)
                  }
                }
              }
            }

            if (fullText) {
              console.log(`[v0] Model ${model.name} succeeded with ${fullText.length} chars`)
              modelResponses.push({ model: model.name, text: fullText, success: true })
              
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === assistantMessageId && msg.mixtureModels) {
                    return {
                      ...msg,
                      mixtureModels: msg.mixtureModels.map((m) =>
                        m.name === model.name
                          ? { ...m, status: "success" as const, response: fullText }
                          : m
                      ),
                    }
                  }
                  return msg
                })
              )
            } else {
              modelResponses.push({ model: model.name, text: "", success: false })
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === assistantMessageId && msg.mixtureModels) {
                    return {
                      ...msg,
                      mixtureModels: msg.mixtureModels.map((m) =>
                        m.name === model.name ? { ...m, status: "error" as const } : m
                      ),
                    }
                  }
                  return msg
                })
              )
            }
            
            await new Promise(resolve => setTimeout(resolve, 5000))
          } catch (error) {
            console.error(`[v0] Model ${model.name} error:`, error)
            modelResponses.push({ model: model.name, text: "", success: false })
            
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id === assistantMessageId && msg.mixtureModels) {
                  return {
                    ...msg,
                    mixtureModels: msg.mixtureModels.map((m) =>
                      m.name === model.name ? { ...m, status: "error" as const } : m
                    ),
                  }
                }
                return msg
              })
            )
            
            await new Promise(resolve => setTimeout(resolve, 5000))
          }
        }

        const successfulResponse = modelResponses.find(r => r.success)
        const finalContent = successfulResponse?.text || "由于API服务负载较高，部分模型暂时不可用。请稍后再试或选择单个模型进行对话。"

        setIsTyping(true)
        for (let i = 0; i <= finalContent.length; i++) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, content: finalContent.slice(0, i) } : msg
            )
          )
          await new Promise(resolve => setTimeout(resolve, 20))
        }
        setIsTyping(false)

        if (successfulResponse) {
          await saveMessage("assistant", finalContent)
        }
        
        setIsLoading(false)
        return
      }

      const assistantMessageId = (Date.now() + 1).toString()
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
      }
      setMessages((prev) => [...prev, assistantMessage])
      setIsTyping(true)

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AI-Provider": "vivaapi",
          "X-AI-Model": selectedModel,
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error("无法读取响应流")
      }

      let buffer = ""
      let fullContent = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("0:")) continue

          try {
            const data = JSON.parse(line.slice(2))
            if (data.type === "text-delta" && data.textDelta) {
              fullContent += data.textDelta
              
              for (const char of data.textDelta) {
                const displayChar = char
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + displayChar }
                      : msg
                  )
                )
                await new Promise(resolve => setTimeout(resolve, 20))
              }
            }
          } catch (parseError) {
            console.error("[v0] Parse error:", parseError)
          }
        }
      }

      await saveMessage("assistant", fullContent)
    } catch (error) {
      console.error("[v0] Send message error:", error)
      toast.error("发送失败，请重试")
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setIsLoading(false)
      setIsTyping(false)
    }
  }

  const currentModel = AVAILABLE_MODELS.find((m) => m.id === selectedModel) || AVAILABLE_MODELS[0]

  return (
    <div className="flex h-screen flex-col bg-[#212121] text-white">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-zinc-800 bg-[#212121] px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {isEditingTitle ? (
            <input
              type="text"
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => e.key === "Enter" && setIsEditingTitle(false)}
              className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm focus:border-zinc-600 focus:outline-none"
              autoFocus
            />
          ) : (
            <>
              <span className="text-sm font-medium">{sessionTitle}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                onClick={() => setIsEditingTitle(true)}
              >
                <Edit2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <Link2 className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <Share2 className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
            onClick={createNewSession}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 bg-[#212121]" ref={scrollRef}>
        <div className="mx-auto w-full max-w-4xl px-4 py-8">
          {messages.length === 0 && (
            <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
              <div className="mb-6">{currentModel.icon}</div>
              <h1 className="mb-2 text-2xl font-medium">你好！很高兴见到你！</h1>
              <p className="max-w-xl text-zinc-400">
                我是一个AI助手，很乐意为你提供各种帮助。无论你需要解答问题、协助学习、讨论话题、处理日常任务，还是只是想随便聊聊天，我都会尽我所能地支持你。
              </p>
              <p className="mt-4 text-zinc-400">请告诉我，今天有什么我可以为你做的吗？或者你想了解什么、讨论什么都可以！</p>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={message.id} className={cn("mb-8", message.role === "user" && "flex justify-end")}>
              {message.role === "user" ? (
                <div className="inline-block max-w-[80%] rounded-2xl bg-white px-5 py-3 text-black">
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {message.mixtureModels && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-zinc-400">Mixture-of-Agents</h3>
                      <div className="space-y-2">
                        {message.mixtureModels.map((model, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 rounded-lg bg-zinc-800/50 px-4 py-3"
                          >
                            {model.status === "success" && (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/20">
                                <Check className="h-3 w-3 text-green-500" />
                              </div>
                            )}
                            {model.status === "loading" && (
                              <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
                            )}
                            {model.status === "error" && (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20">
                                <X className="h-3 w-3 text-red-500" />
                              </div>
                            )}
                            <span className="flex-1 text-sm">{model.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="prose prose-invert max-w-none">
                    <div className="whitespace-pre-wrap break-words leading-7 text-zinc-100">
                      {message.content}
                      {isTyping && index === messages.length - 1 && (
                        <span className="ml-0.5 inline-block h-5 w-[2px] animate-pulse bg-white" />
                      )}
                    </div>
                  </div>

                  {message.content && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-2 border-zinc-700 bg-transparent text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        onClick={() => copyToClipboard(message.content, message.id)}
                      >
                        {copiedMessageId === message.id ? (
                          <>
                            <Check className="h-3 w-3" />
                            已复制
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            复制
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="mb-8">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:0ms]" />
                <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />
                <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t border-zinc-800 bg-[#212121] px-4 pb-6 pt-4">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-3 flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-5 w-5" />
            </Button>

            <div className="relative">
              <button
                className="flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm text-black transition-colors hover:bg-zinc-200"
                onClick={() => setShowModelMenu(!showModelMenu)}
              >
                {currentModel.icon}
                <span className="font-medium">{currentModel.name}</span>
                <ChevronDown className="h-4 w-4" />
              </button>

              {showModelMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowModelMenu(false)} />
                  <div className="absolute bottom-full left-0 z-20 mb-2 w-80 rounded-xl border border-zinc-700 bg-zinc-800 p-2 shadow-2xl">
                    <ScrollArea className="max-h-[60vh]">
                      {AVAILABLE_MODELS.map((model) => (
                        <button
                          key={model.id}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-700",
                            selectedModel === model.id && "bg-zinc-700"
                          )}
                          onClick={() => {
                            setSelectedModel(model.id)
                            setShowModelMenu(false)
                          }}
                        >
                          {model.icon}
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{model.name}</span>
                              {selectedModel === model.id && (
                                <div className="h-2 w-2 rounded-full bg-blue-500" />
                              )}
                            </div>
                            {model.description && (
                              <p className="text-xs text-zinc-400">{model.description}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </ScrollArea>
                  </div>
                </>
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={enableWebSearch}
                onChange={(e) => setEnableWebSearch(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-zinc-900"
              />
              搜索网络
            </label>
          </div>

          {uploadedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {uploadedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2"
                >
                  {file.preview ? (
                    <img
                      src={file.preview || "/placeholder.svg"}
                      alt={file.name}
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <FileText className="h-5 w-5 text-zinc-400" />
                  )}
                  <span className="max-w-[150px] truncate text-sm">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-zinc-400 hover:text-white"
                    onClick={() => removeFile(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={onSubmit} className="relative">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className="relative flex items-center gap-2 rounded-3xl border border-zinc-700 bg-[#2f2f2f] px-4 py-2 shadow-sm focus-within:border-zinc-600">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message"
                className="min-h-[40px] max-h-[200px] flex-1 resize-none border-0 bg-transparent py-2 text-white placeholder:text-zinc-500 focus-visible:ring-0"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    onSubmit(e)
                  }
                }}
                disabled={isLoading}
              />

              <Button
                type="submit"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full bg-zinc-700 text-white hover:bg-zinc-600"
                disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
          <div className="absolute right-0 top-0 h-full w-96 border-l border-zinc-800 bg-[#2f2f2f] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold">设置</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium">AI 提供商</label>
                {/* Placeholder for Select component */}
                <div className="bg-zinc-800 border-zinc-700 text-white">
                  {/* Select implementation goes here */}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">模型</label>
                {/* Placeholder for Select component */}
                <div className="bg-zinc-800 border-zinc-700 text-white">
                  {/* Select implementation goes here */}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">处理模式</label>
                {/* Placeholder for Select component */}
                <div className="bg-zinc-800 border-zinc-700 text-white">
                  {/* Select implementation goes here */}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">启用网络搜索</label>
                <Button
                  variant={enableWebSearch ? "default" : "outline"}
                  size="sm"
                  className="border-zinc-700 hover:bg-zinc-700"
                  onClick={() => setEnableWebSearch(!enableWebSearch)}
                >
                  {enableWebSearch ? "已启用" : "已禁用"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
