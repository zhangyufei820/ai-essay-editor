"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Send, Paperclip, X, FileText, ImageIcon, File } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type AIProvider = {
  id: string
  name: string
  models: string[]
}

const AI_PROVIDERS: AIProvider[] = [
  { id: "openai", name: "OpenAI", models: ["gpt-5", "gpt-5-mini"] },
  { id: "anthropic", name: "Anthropic", models: ["claude-sonnet-4.5", "claude-opus-4"] },
  { id: "xai", name: "xAI (Grok)", models: ["grok-4", "grok-4-fast"] },
  { id: "google", name: "Google", models: ["gemini-2.5-flash", "gemini-2.5-pro"] },
  { id: "fireworks", name: "Fireworks AI", models: ["llama-v4-70b", "mixtral-8x22b"] },
]

type UploadedFile = {
  name: string
  type: string
  size: number
  data: string
  preview?: string
}

export function ChatInterface() {
  const [input, setInput] = useState("")
  const [selectedProvider, setSelectedProvider] = useState("openai")
  const [selectedModel, setSelectedModel] = useState("gpt-5")
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: {
        "X-AI-Provider": selectedProvider,
        "X-AI-Model": selectedModel,
      },
    }),
  })

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!input.trim() && uploadedFiles.length === 0) {
      return
    }

    const messageContent = {
      text: input,
      files: uploadedFiles.map((f) => ({
        name: f.name,
        type: f.type,
        data: f.data,
      })),
    }

    sendMessage(messageContent)
    setInput("")
    setUploadedFiles([])
  }

  const currentProvider = AI_PROVIDERS.find((p) => p.id === selectedProvider)

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* AI Provider Selector */}
      <div className="border-b border-border bg-background/95 backdrop-blur">
        <div className="container flex items-center gap-4 px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">AI模型:</span>
          <Select
            value={selectedProvider}
            onValueChange={(value) => {
              setSelectedProvider(value)
              const provider = AI_PROVIDERS.find((p) => p.id === value)
              if (provider) {
                setSelectedModel(provider.models[0])
              }
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currentProvider?.models.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="container mx-auto max-w-4xl py-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <span className="text-2xl">文</span>
              </div>
              <h2 className="mb-2 text-2xl font-bold">创意作文批改师</h2>
              <p className="text-muted-foreground">上传您的作文或直接输入文字，我将为您提供专业的批改建议</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex gap-3", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <Card
                className={cn(
                  "max-w-[80%] p-4",
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {message.parts.map((part, index) => {
                  if (part.type === "text") {
                    return (
                      <div key={index} className="whitespace-pre-wrap break-words">
                        {part.text}
                      </div>
                    )
                  }
                  return null
                })}
              </Card>
            </div>
          ))}

          {status === "in_progress" && (
            <div className="flex gap-3">
              <Card className="max-w-[80%] bg-muted p-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-primary" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0.2s]" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0.4s]" />
                </div>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-border bg-background">
        <div className="container mx-auto max-w-4xl px-4 py-4">
          {/* Uploaded Files Preview */}
          {uploadedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
                  {file.preview ? (
                    <img
                      src={file.preview || "/placeholder.svg"}
                      alt={file.name}
                      className="h-8 w-8 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-background">
                      {file.type.includes("pdf") ? (
                        <FileText className="h-4 w-4" />
                      ) : file.type.includes("image") ? (
                        <ImageIcon className="h-4 w-4" />
                      ) : (
                        <File className="h-4 w-4" />
                      )}
                    </div>
                  )}
                  <span className="text-sm">{file.name}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeFile(index)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={status === "in_progress"}
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入您的问题或粘贴作文内容..."
              className="min-h-[60px] flex-1 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              disabled={status === "in_progress"}
            />

            <Button
              type="submit"
              size="icon"
              disabled={status === "in_progress" || (!input.trim() && uploadedFiles.length === 0)}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>

          <p className="mt-2 text-xs text-muted-foreground">
            支持上传图片、PDF、Word文档 (最大10MB) | 按Enter发送，Shift+Enter换行
          </p>
        </div>
      </div>
    </div>
  )
}
