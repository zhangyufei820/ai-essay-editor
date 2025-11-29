"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Upload, FileText } from "lucide-react"
import ReactMarkdown from "react-markdown"

export function EssayGrader() {
  const [essayText, setEssayText] = useState("")
  const [gradeLevel, setGradeLevel] = useState("")
  const [topic, setTopic] = useState("")
  const [wordLimit, setWordLimit] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState("")
  const [files, setFiles] = useState<File[]>([])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
    }
  }

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleSubmit = async () => {
    if (!essayText.trim() && files.length === 0) {
      alert("请输入作文内容或上传作文图片")
      return
    }

    if (!gradeLevel || !topic || !wordLimit) {
      alert("请填写年级、题目和字数要求")
      return
    }

    setIsLoading(true)
    setResult("")

    try {
      const images = await Promise.all(
        files
          .filter((f) => f.type.startsWith("image/"))
          .map(async (file) => ({
            name: file.name,
            type: file.type,
            data: await readFileAsBase64(file),
          })),
      )

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
          images, // 发送图片数据
        }),
      })

      if (!response.ok) {
        throw new Error("批改失败")
      }

      const data = await response.json()
      setResult(data.result)
    } catch (error) {
      console.error("Error:", error)
      alert("批改过程中出现错误，请重试")
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
            <div className="flex gap-2">
              <div className="relative">
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                />
                <Label htmlFor="file-upload">
                  <Button variant="outline" size="sm" asChild>
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
            {files.length > 0 && (
              <p className="text-sm text-muted-foreground">
                已选择 {files.length} 个文件: {files.map((f) => f.name).join(", ")}
              </p>
            )}
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
            <div className="prose prose-slate max-w-none dark:prose-invert">
              <ReactMarkdown>{result}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
