"use client"

import {
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Description as CardDescription,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle,
  InputV2 as Input,
  LabelV2 as Label,
  SelectV2 as Select,
  SelectV2Content as SelectContent,
  SelectV2Item as SelectItem,
  SelectV2Trigger as SelectTrigger,
  SelectV2Value as SelectValue,
  TextareaV2 as Textarea
} from "@/components/ui/v2"
/* eslint-disable @next/next/no-img-element -- Dynamic/user-generated/external image surfaces: keep native img to preserve sizing, blob/data/proxy URLs, payment QR codes, and chat preview behavior. */

import type React from "react"

import { useCallback, useState, useRef } from "react"
import { Loader2, Upload, X } from "lucide-react"
import { UltimateRenderer } from "@/components/chat/UltimateRenderer"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { getRequiredAuthHeaders, getVerifiedAuthHeaders } from "@/lib/client-auth"
import { IconEssay } from "@/components/icons/v2"
import { DailySurveyGate, type TrialSurveyStatus } from "@/components/trial/DailySurveyGate"
import { trackCampaignEvent } from "@/lib/campaign-events-client"
import { openTrialSurveyGate } from "@/lib/trial-survey-client"

type UploadedFile = { 
  name: string
  type: string
  size: number
  data: string
  preview?: string
  difyFileId?: string
}

function readUploadError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback
  const record = payload as Record<string, unknown>
  const details = typeof record.details === "string" ? record.details : ""
  const error = typeof record.error === "string" ? record.error : ""
  const message = typeof record.message === "string" ? record.message : ""
  return details || error || message || fallback
}

function isEssayImageFile(file: File) {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
  return file.type.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"].includes(extension)
}

const ESSAY_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.heic,.heif,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"

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
  const [trialStatus, setTrialStatus] = useState<TrialSurveyStatus | null>(null)
  const [surveyGateOpen, setSurveyGateOpen] = useState(false)
  const [isPaidUser, setIsPaidUser] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const shouldRequireEssaySurvey = useCallback((status: TrialSurveyStatus | null) => {
    return Boolean(
      status?.active_grant_id &&
      status.requires_daily_survey !== false &&
      !status.today_survey_completed &&
      !isPaidUser
    )
  }, [isPaidUser])

  const refreshTrialSurveyState = useCallback(async () => {
    try {
      const headers = await getVerifiedAuthHeaders()

      const [surveyResponse, creditsResponse] = await Promise.all([
        fetch("/api/surveys/today", { cache: "no-store", headers }),
        fetch("/api/user/credits", { cache: "no-store", headers }),
      ])

      const creditsData = await creditsResponse.json().catch(() => null)
      const nextIsPaidUser = Boolean(creditsData?.is_pro)
      setIsPaidUser(nextIsPaidUser)

      const surveyData = await surveyResponse.json().catch(() => null)
      if (!surveyResponse.ok || !surveyData?.ok) {
        console.warn("[EssayGrader] trial survey precheck failed", surveyResponse.status, surveyData?.error)
        return false
      }

      const status = (surveyData.trialStatus || null) as TrialSurveyStatus | null
      setTrialStatus(status)
      return Boolean(
        status?.active_grant_id &&
        status.requires_daily_survey !== false &&
        !status.today_survey_completed &&
        !nextIsPaidUser
      )
    } catch (error) {
      console.warn("[EssayGrader] trial survey precheck error", error)
      return false
    }
  }, [])

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
        
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/api/dify-upload`, {
          method: "POST",
          headers: {
            ...(await getRequiredAuthHeaders()),
            "X-Model": "essay-correction"
          },
          body: formData
        })
        
        const data = await res.json().catch(() => ({}))
        
        if (!res.ok || data?.success === false || !data?.id) {
          throw new Error(readUploadError(data, `上传失败: ${res.status}`))
        }
        
        // 更新进度
        setUploadProgress(Math.round(((index + 1) / totalFiles) * 100))
        
        return new Promise<UploadedFile>((resolve) => {
          if (isEssayImageFile(file)) {
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
      toast.error(e.message || "上传失败")
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

    const gateRequired = await refreshTrialSurveyState()
    if (gateRequired || shouldRequireEssaySurvey(trialStatus)) {
      setSurveyGateOpen(true)
      openTrialSurveyGate({
        featureName: "作文批改",
        message: "请先完成今日问卷，解锁体验额度后继续批改作文。",
      })
      return
    }

    setIsLoading(true)
    setResult("")

    try {
      // 🔥 提取文件ID - 参考 banana-chat-interface.tsx
      const fileIds = uploadedFiles.map(f => f.difyFileId).filter(Boolean) as string[]

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/api/essay-grade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getVerifiedAuthHeaders()),
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
        try {
          const parsedError = JSON.parse(errorText)
          if (parsedError?.surveyRequired) {
            void trackCampaignEvent("survey_required_block", {
              featureName: "essay_grader",
              status: response.status,
            })
            openTrialSurveyGate({
              featureName: "作文批改",
              message: "请先完成今日问卷，解锁体验额度后继续批改作文。",
            })
            setTrialStatus((previous) => ({
              ...(previous || {}),
              ...(parsedError.trialStatus || {}),
              requires_daily_survey: true,
              today_survey_completed: false,
            }))
            throw new Error("请先完成今日共创反馈问卷，解锁免费体验额度")
          }
        } catch (parseError) {
          if (parseError instanceof Error && parseError.message.includes("共创反馈问卷")) {
            throw parseError
          }
        }
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
      const applyAnswer = (text: string) => {
        if (!text) return
        fullText += text
        setResult(fullText)
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (line.startsWith(":")) {
              if (!fullText) {
                setResult("作文图片正在识别和批改，请保持页面打开...")
              }
              continue
            }
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6).trim()
            if (!data || data === "[DONE]") continue
            
            try {
              const json = JSON.parse(data)
              if (json.event === "billing") continue

              if (json.event === "status") {
                if (!fullText) setResult(String(json.stage || json.message || "作文图片正在识别和批改，请保持页面打开..."))
                continue
              }
              
              // 🔥 处理思考过程（agent_thought）
              if (json.event === "agent_thought") {
                console.log("[作文批改] 思考:", json.thought)
              }

              if (json.event === "error") {
                throw new Error(json.message || json.error || "作文批改服务返回错误")
              }
              
              // 🔥 处理文本输出（answer字段）
              if (json.answer) {
                applyAnswer(json.answer)
              }
              
              // 🔥 处理 message 事件
              if (json.event === "message" && json.answer) {
                applyAnswer(json.answer)
              }
            } catch (e) {
              if (e instanceof Error && !(e instanceof SyntaxError)) throw e
              console.error("解析失败:", e, data)
            }
          }
        }
        if (!fullText) {
          throw new Error("批改服务没有返回可展示结果，请重新提交一次。")
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
      <DailySurveyGate
        featureName="作文批改"
        enabled
        open={surveyGateOpen}
        onOpenChange={setSurveyGateOpen}
        onCompleted={(nextTrialStatus) => {
          setTrialStatus((nextTrialStatus || null) as TrialSurveyStatus | null)
          toast.success("今日体验额度已解锁")
        }}
      />
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-balance">创意作文批改师</h1>
        <p className="text-lg text-[var(--ink-500)] text-balance">融合文学大师风格，为您的作文提供专业的批改与润色</p>
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
              <div className="rounded-[var(--radius-soft)] bg-[var(--paper-50)] p-3 border border-[var(--paper-200)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[var(--ink-600)]">上传中...</span>
                  <span className="text-xs font-medium text-[var(--ink-700)]">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-[var(--paper-200)] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[var(--ink-700)]"
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
                      <div className="relative w-20 h-20 rounded-[var(--radius-soft)] overflow-hidden border-2 border-[var(--paper-200)]">
                        <img src={f.preview} alt={f.name} className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeFile(i)}
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-[var(--radius-soft)] bg-[var(--paper-50)] px-3 py-2 text-sm border border-[var(--paper-200)]">
                        <IconEssay className="h-4 w-4 text-[var(--ink-600)]" />
                        <span className="max-w-[100px] truncate text-[var(--ink-600)]">{f.name}</span>
                        <button onClick={() => removeFile(i)} className="text-[var(--ink-400)] hover:text-[var(--seal-500)]">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex gap-2">
              <label
                htmlFor="essay-image-upload"
                aria-disabled={isUploading}
                className="inline-flex h-9 shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] border border-[var(--ink-300)]/60 bg-[var(--paper-50)] px-3 text-[13px] font-[var(--font-sans-v2)] font-semibold leading-none tracking-normal text-[var(--ink-700)] transition-[background-color,border-color,color,box-shadow,transform] duration-200 hover:border-[var(--ink-500)] hover:bg-[var(--paper-100)] active:translate-y-[1px] aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ESSAY_IMAGE_ACCEPT}
                  multiple
                  onChange={handleFileUpload}
                  id="essay-image-upload"
                  aria-label="上传作文图片"
                  disabled={isUploading}
                  className="sr-only sx-file-input"
                />
                <span className="inline-flex items-center justify-center gap-1.5">
                  <Upload className="w-4 h-4 mr-2" />
                  上传作文图片
                </span>
              </label>
              <Button variant="outline" size="sm" disabled>
                <IconEssay className="w-4 h-4 mr-2" />
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
