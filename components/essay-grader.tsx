"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Upload, FileText, X } from "lucide-react"
import { UltimateRenderer } from "@/components/chat/UltimateRenderer"
import { motion } from "framer-motion"
import { toast } from "sonner"

type UploadedFile = { 
  name: string
  type: string
  size: number
  data: string
  preview?: string
  difyFileId?: string
}

export function EssayGrader() {
  const [essayText, setEssayText] = useState("")
  const [gradeLevel, setGradeLevel] = useState("")
  const [topic, setTopic] = useState("")
  const [wordLimit, setWordLimit] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState("")
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 🔥 文件上传处理 - 参考 banana-chat-interface.tsx
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || !files.length) return
    
    setIsUploading(true)
    setUploadProgress(0)
    
    try {
      const totalFiles = files.length
      const uploadPromises = Array.from(files).map(async (file, index) => {
        const formData = new FormData()
        formData.append("file", file)
        formData.append("user", "essay-correction-user")
        
        const res = await fetch("/api/dify-upload", {
          method: "POST",
          headers: {
            "X-User-Id": "essay-correction-user",
            "X-Model": "essay-correction"
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

  const handleSubmit = async () => {
    if (!essayText.trim() && uploadedFiles.length === 0) {
      toast.error("请输入作文内容或上传作文图片")
      return
    }

    if (!gradeLevel || !topic || !wordLimit) {
      toast.error("请填写年级、题目和字数要求")
      return
    }

    setIsLoading(true)
    setResult("")

    try {
      // 🔥 提取文件ID - 参考 banana-chat-interface.tsx
      const fileIds = uploadedFiles.map(f => f.difyFileId).filter(Boolean) as string[]

      const response = await fetch("/api/essay-grade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          essayText,
          gradeLevel,
          topic,
          wordLimit,
          fileIds, // 🔥 发送文件ID而不是base64数据
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("[作文批改] 响应错误:", response.status, errorText)
        throw new Error(`批改失败: ${response.status}`)
      }

      // 🔥 处理流式响应 - 添加安全检查
      const reader = response.body?.getReader()
      
      if (!reader) {
        console.error("[作文批改] 无法获取 reader，响应体为空")
        throw new Error("响应无效，无法读取流数据")
      }

      const decoder = new TextDecoder()
      let buffer = ""
      let fullText = ""

      try {
        while (true) {
          const { done, value } = await reader.read()
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
              
              // 🔥 处理思考过程（agent_thought）
              if (json.event === "agent_thought") {
                console.log("[作文批改] 思考:", json.thought)
              }
              
              // 🔥 处理文本输出（answer字段）
              if (json.answer) {
                fullText += json.answer
                setResult(fullText)
              }
              
              // 🔥 处理 message 事件
              if (json.event === "message" && json.answer) {
                fullText += json.answer
                setResult(fullText)
              }
            } catch (e) {
              console.error("解析失败:", e, data)
            }
          }
        }
      } catch (streamError) {
        console.error("[作文批改] 流读取错误:", streamError)
        // 如果流读取出错，但已有部分内容，仍然显示
        if (fullText) {
          console.log("[作文批改] 部分内容已生成，显示中...")
        } else {
          throw new Error("流读取失败")
        }
      }
      
      // 清空已上传文件
      setUploadedFiles([])
      toast.success("批改完成")
    } catch (error) {
      console.error("Error:", error)
      const errorMessage = error instanceof Error ? error.message : "未知错误"
      toast.error(`批改失败: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-balance">创意作文批改师</h1>
        <p className="text-lg text-muted-foreground text-balance">融合文学大师风格，为您的作文提供专业的批改与润色</p>
      </div>

      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle>提交作文</CardTitle>
          <CardDescription>请填写作文内容和相关信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Essay Text Input */}
          <div className="space-y-2">
            <Label htmlFor="essay-text">作文内容</Label>
            <Textarea
              id="essay-text"
              placeholder="请在此处粘贴您的作文内容，或上传文件..."
              value={essayText}
              onChange={(e) => setEssayText(e.target.value)}
              className="min-h-[300px] resize-y"
            />
            
            {/* 🔥 上传进度条 */}
            {isUploading && (
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-600">上传中...</span>
                  <span className="text-xs font-medium text-green-700">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-green-700"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {/* 🔥 文件预览区域 */}
            {uploadedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
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
            
            <div className="flex gap-2">
              <div className="relative">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <Label htmlFor="file-upload">
                  <Button variant="outline" size="sm" asChild type="button">
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      上传作文图片
                    </span>
                  </Button>
                </Label>
              </div>
              <Button variant="outline" size="sm" disabled>
                <FileText className="w-4 h-4 mr-2" />
                上传文档 (即将推出)
              </Button>
            </div>
          </div>

          {/* Metadata Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="grade-level">学生年级 *</Label>
              <Select value={gradeLevel} onValueChange={setGradeLevel}>
                <SelectTrigger id="grade-level">
                  <SelectValue placeholder="选择年级" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="小学">小学</SelectItem>
                  <SelectItem value="初中">初中</SelectItem>
                  <SelectItem value="高中">高中</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="topic">作文题目 *</Label>
              <Input id="topic" placeholder="例如：我的梦想" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="word-limit">字数要求 *</Label>
              <Input
                id="word-limit"
                placeholder="例如：650字以内"
                value={wordLimit}
                onChange={(e) => setWordLimit(e.target.value)}
              />
            </div>
          </div>

          {/* Submit Button */}
          <Button onClick={handleSubmit} disabled={isLoading} className="w-full" size="lg">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                正在智能批改中...
              </>
            ) : (
              "开始智能批改"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Result Section */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle>批改结果</CardTitle>
            <CardDescription>AI为您生成的专业批改报告</CardDescription>
          </CardHeader>
          <CardContent>
            {/* 🔥 使用 UltimateRenderer 替代 ReactMarkdown，确保完整渲染 */}
            <div className="w-full">
              <UltimateRenderer content={result} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
