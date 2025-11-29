"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, Paperclip, X, FileText, Copy, Check, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Progress } from "@/components/ui/progress"
import { AnalysisStages } from "./analysis-stages"

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options)
      if (response.status === 429) {
        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 3000 + Math.random() * 1000
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }
      }
      return response
    } catch (error) {
      if (i === maxRetries - 1) throw error
      const delay = Math.pow(2, i) * 2000
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw new Error("Max retries reached")
}

type UploadedFile = {
  name: string
  type: string
  size: number
  data: string
  preview?: string
  difyFileId?: string
}

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
}

const INTERNAL_MODELS = {
  gpt: "gpt-5.1",
  claude: "claude-opus-4-1-20250805-thinking",
  gemini: "gemini-3-pro-preview-11-2025-thinking",
}

type FileProcessingState = {
  status: "idle" | "uploading" | "processing" | "recognizing" | "complete" | "error"
  progress: number
  message: string
}

export function EnhancedChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [enableWebSearch, setEnableWebSearch] = useState(false)
  const [analysisStage, setAnalysisStage] = useState(0)
  const [fileProcessing, setFileProcessing] = useState<FileProcessingState>({
    status: "idle",
    progress: 0,
    message: "",
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (isLoading && analysisStage < 4) {
      const timer = setTimeout(
        () => {
          setAnalysisStage((prev) => Math.min(prev + 1, 4))
        },
        2000 + Math.random() * 1000,
      )
      return () => clearTimeout(timer)
    }
  }, [isLoading, analysisStage])

  const createNewSession = async () => {
    const sessionId = `session_${Date.now()}`
    setCurrentSessionId(sessionId)
    return sessionId
  }

  const saveMessage = async (role: string, content: string, files?: UploadedFile[]) => {
    // 简化的消息保存
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setFileProcessing({ status: "uploading", progress: 0, message: "正在上传文件..." })

    const newFiles: UploadedFile[] = []
    const totalFiles = files.length

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const progress = Math.round(((i + 0.5) / totalFiles) * 100)
      setFileProcessing({ status: "uploading", progress, message: `正在上传 ${file.name} 到 Dify...` })

      try {
        const formData = new FormData()
        formData.append("file", file)

        const uploadResponse = await fetch("/api/dify-upload", {
          method: "POST",
          body: formData,
        })

        if (!uploadResponse.ok) {
          throw new Error(`上传失败: ${file.name}`)
        }

        const uploadData = await uploadResponse.json()

        const reader = new FileReader()
        const fileData = await new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string)
          reader.readAsDataURL(file)
        })

        const uploadedFile: UploadedFile = {
          name: file.name,
          type: file.type,
          size: file.size,
          data: fileData,
          difyFileId: uploadData.id,
        }

        if (file.type.startsWith("image/")) {
          uploadedFile.preview = fileData
        }

        newFiles.push(uploadedFile)
      } catch (error) {
        console.error("Upload error:", error)
        toast.error(`${file.name} 上传失败`)
      }
    }

    if (newFiles.length > 0) {
      setFileProcessing({
        status: "complete",
        progress: 100,
        message: `已上传 ${newFiles.length} 个文件到 Dify`,
      })
      setUploadedFiles((prev) => [...prev, ...newFiles])
    } else {
      setFileProcessing({ status: "error", progress: 0, message: "文件上传失败" })
    }

    setTimeout(() => {
      setFileProcessing({ status: "idle", progress: 0, message: "" })
    }, 2000)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedInput = (input || "").trim()
    if (!trimmedInput && uploadedFiles.length === 0) {
      return
    }

    setIsLoading(true)
    setAnalysisStage(0)

    const messageContent = trimmedInput || "请帮我批改这篇作文"

    const fileIds = uploadedFiles.filter((f) => f.difyFileId).map((f) => f.difyFileId)

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageContent,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setUploadedFiles([])

    const assistantMessageId = (Date.now() + 1).toString()
    setMessages((prev) => [...prev, { id: assistantMessageId, role: "assistant", content: "" }])

    let accumulatedContent = ""
    let hasReceivedContent = false

    try {
      const requestBody = {
        query: messageContent,
        fileIds: fileIds,
        ...(currentSessionId && { conversationId: currentSessionId }),
      }

      const response = await fetch("/api/dify-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API返回错误: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error("无法读取响应流")
      }

      const decoder = new TextDecoder()
      let buffer = ""

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          buffer += chunk

          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (!line.trim() || !line.startsWith("data: ")) continue

            const data = line.slice(6).trim()
            if (data === "[DONE]") continue

            try {
              const parsed = JSON.parse(data)

              if (parsed.event === "message" || parsed.event === "agent_message") {
                if (parsed.answer) {
                  if (!hasReceivedContent) {
                    setAnalysisStage(4)
                  }
                  accumulatedContent += parsed.answer
                  hasReceivedContent = true
                  setMessages((prev) =>
                    prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, content: accumulatedContent } : msg)),
                  )
                }
              } else if (parsed.event === "message_end") {
                if (parsed.conversation_id) {
                  setCurrentSessionId(parsed.conversation_id)
                }
              } else if (parsed.event === "error") {
                throw new Error(parsed.message || "Dify处理错误")
              }
            } catch (parseError) {
              console.error("解析数据块失败:", parseError)
            }
          }
        }

        if (hasReceivedContent) {
          await saveMessage("assistant", accumulatedContent)
          toast.success("批改完成")
        }
      } catch (streamError) {
        if (hasReceivedContent && accumulatedContent) {
          await saveMessage("assistant", accumulatedContent)
          toast.warning("批改部分完成（连接中断，但已保存接收到的内容）")
        } else {
          throw streamError
        }
      }
    } catch (error) {
      console.error("批改错误:", error)

      const errorMessage = error instanceof Error ? error.message : "未知错误"

      if (hasReceivedContent && accumulatedContent) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: accumulatedContent + "\n\n---\n⚠️ 注意：批改过程中连接中断，以上为部分批改结果",
                }
              : msg,
          ),
        )
        toast.warning("连接中断，已显示部分批改结果")
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: `抱歉，批改失败：${errorMessage}\n\n💡 提示：Dify工作流可能仍在运行，请稍后查看结果或重试`,
                }
              : msg,
          ),
        )
        toast.error(`批改失败: ${errorMessage}`)
      }
    } finally {
      setIsLoading(false)
      setAnalysisStage(0)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-gradient-to-b from-amber-50/50 to-white">
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-8">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 shadow-lg">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <h1 className="mb-4 text-2xl font-bold text-foreground">你好！欢迎使用沈翔智学！</h1>
              <p className="mb-2 max-w-md text-muted-foreground">
                专业的作文批改专家，为学生习作提供深度点评、创意建议和个性化指导，让每篇作文都焕发光彩！
              </p>
              <p className="text-sm text-muted-foreground/80">上传您的作文图片或直接输入文字，开始智能批改吧！</p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn("flex gap-4", message.role === "user" ? "justify-end" : "justify-start")}
                >
                  {message.role === "assistant" && (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 shadow-sm">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3 shadow-sm",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-white border border-border/50",
                    )}
                  >
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {message.content || <AnalysisStages />}
                      </div>
                    </div>
                    {message.role === "assistant" && message.content && (
                      <div className="mt-3 flex items-center gap-2 border-t border-border/30 pt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => copyToClipboard(message.content, message.id)}
                        >
                          {copiedMessageId === message.id ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          复制
                        </Button>
                      </div>
                    )}
                  </div>
                  {message.role === "user" && (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary shadow-sm">
                      <span className="text-sm font-medium text-primary-foreground">我</span>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border/50 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-4 py-4">
          {fileProcessing.status !== "idle" && (
            <div className="mb-4 rounded-xl border border-border/50 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                {fileProcessing.status === "error" ? (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                ) : fileProcessing.status === "complete" ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{fileProcessing.message}</p>
                  {fileProcessing.status !== "complete" && fileProcessing.status !== "error" && (
                    <Progress value={fileProcessing.progress} className="mt-2 h-1.5" />
                  )}
                </div>
              </div>
            </div>
          )}

          {uploadedFiles.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {uploadedFiles.map((file, index) => (
                <div
                  key={index}
                  className="group relative flex items-center gap-2 rounded-xl border border-border/50 bg-white px-3 py-2 shadow-sm transition-all hover:shadow-md"
                >
                  {file.preview ? (
                    <img
                      src={file.preview || "/placeholder.svg"}
                      alt={file.name}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="max-w-[120px] truncate text-sm text-foreground">{file.name}</span>
                  <button
                    onClick={() => removeFile(index)}
                    className="ml-1 rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={onSubmit} className="relative">
            <div className="flex items-end gap-3 rounded-2xl border border-border/50 bg-white p-3 shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl text-muted-foreground hover:bg-primary/10 hover:text-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,.txt,.doc,.docx,.pdf"
                multiple
                onChange={handleFileUpload}
              />
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入作文内容或上传图片..."
                className="min-h-[44px] max-h-[200px] flex-1 resize-none border-0 bg-transparent p-0 text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-0"
                disabled={isLoading}
                rows={1}
              />
              <Button
                type="submit"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
          </form>

          <p className="mt-3 text-center text-xs text-muted-foreground/60">沈翔智学 - 专业的AI作文批改平台</p>
        </div>
      </div>
    </div>
  )
}

const copyToClipboard = async (text: string, messageId: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success("已复制到剪贴板")
  } catch (error) {
    toast.error("复制失败")
  }
}
