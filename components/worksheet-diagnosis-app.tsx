"use client"

/* eslint-disable @next/next/no-img-element -- User uploaded worksheet previews need native object URLs. */

import { useMemo, useRef, useState } from "react"
import { createClient } from "@supabase/supabase-js"
import {
  ClipboardCheck,
  Copy,
  FileImage,
  Loader2,
  MessageSquareText,
  Sparkles,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { extractUserId } from "@/lib/auth-user"
import {
  WORKSHEET_REPORT_IMAGE_CREDITS,
  calculateWorksheetDiagnosisCredits,
} from "@/lib/billing-config"

type UploadedWorksheet = {
  name: string
  size: number
  previewUrl: string
  difyFileId: string
}

type Diagnosis = {
  subject: string
  grade_hint: string
  overall_summary: string
  main_issues: string[]
  evidence: Array<{ question: string; reason: string; quote?: string }>
  solutions: string[]
  training_plan: Array<{ title: string; action: string; frequency?: string }>
  parent_message: string
  cautions: string[]
}

type AnalyzeResponse = {
  requestId: string
  workflowRunId?: string
  diagnosis: Diagnosis
  renderPrompt: string
  billing?: {
    chargedCredits: number
    refunded?: boolean
    imageCount?: number
  }
}

type AnalyzeStreamEvent =
  | ({ type: "progress"; message?: string } & Partial<AnalyzeResponse>)
  | ({ type: "result" } & AnalyzeResponse)
  | {
    type: "error"
    error?: string
    code?: string
    status?: number | string
    billing?: {
      chargedCredits: number
      refunded?: boolean
    }
  }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

async function getVerifiedAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window !== "undefined") {
    const authingToken = localStorage.getItem("idToken") || localStorage.getItem("authingToken") || localStorage.getItem("accessToken")
    try {
      const currentUserId = extractUserId(JSON.parse(localStorage.getItem("currentUser") || "null"))
      if (authingToken && /^[a-f0-9]{24}$/i.test(currentUserId)) {
        return { Authorization: `Bearer ${authingToken}` }
      }
    } catch {
      // Fall through to Supabase session.
    }
  }

  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) return { Authorization: `Bearer ${data.session.access_token}` }

  if (typeof window === "undefined") return {}
  const authingToken = localStorage.getItem("idToken") || localStorage.getItem("authingToken") || localStorage.getItem("accessToken")
  return authingToken ? { Authorization: `Bearer ${authingToken}` } : {}
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function createClientRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `worksheet_${crypto.randomUUID()}`
  }
  return `worksheet_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function WorksheetDiagnosisApp() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [subject, setSubject] = useState("数学")
  const [grade, setGrade] = useState("")
  const [reportStyle, setReportStyle] = useState<"parent" | "teacher" | "student">("parent")
  const [extraContext, setExtraContext] = useState("")
  const [worksheets, setWorksheets] = useState<UploadedWorksheet[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeProgress, setAnalyzeProgress] = useState("")
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState("")

  const canAnalyze = worksheets.length > 0 && !isUploading && !isAnalyzing
  const diagnosisCredits = calculateWorksheetDiagnosisCredits(Math.max(1, worksheets.length))

  const styleLabel = useMemo(() => ({
    parent: "家长沟通版",
    teacher: "教师反馈版",
    student: "学生自查版",
  }[reportStyle]), [reportStyle])

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return

    const incoming = Array.from(files).filter((file) => file.type.startsWith("image/"))
    if (incoming.length === 0) {
      toast.error("请上传 jpg、png、webp 等图片文件")
      return
    }

    if (worksheets.length + incoming.length > 6) {
      toast.error("一次最多上传 6 张试卷图片")
      return
    }

    setIsUploading(true)
    setErrorMessage("")
    try {
      const headers = await getVerifiedAuthHeaders()
      const uploaded: UploadedWorksheet[] = []

      for (const file of incoming) {
        const formData = new FormData()
        formData.append("file", file)
        formData.append("model", "worksheet-diagnosis")

        const response = await fetch("/api/dify-upload", {
          method: "POST",
          headers: {
            ...headers,
            "X-Model": "worksheet-diagnosis",
          },
          body: formData,
        })

        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload.id) {
          throw new Error(payload.error || "图片上传失败，请稍后重试。")
        }

        uploaded.push({
          name: file.name,
          size: file.size,
          previewUrl: URL.createObjectURL(file),
          difyFileId: payload.id,
        })
      }

      setWorksheets((items) => [...items, ...uploaded])
      toast.success("试卷图片上传成功")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const removeWorksheet = (index: number) => {
    setWorksheets((items) => {
      const next = [...items]
      const [removed] = next.splice(index, 1)
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return next
    })
  }

  const analyze = async () => {
    if (!canAnalyze) return
    setIsAnalyzing(true)
    setAnalyzeProgress("正在准备诊断")
    setResult(null)
    setErrorMessage("")

    try {
      const response = await fetch("/api/worksheet-diagnosis/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": createClientRequestId(),
          ...(await getVerifiedAuthHeaders()),
        },
        body: JSON.stringify({
          images: worksheets.map((file) => ({
            type: "image",
            transfer_method: "local_file",
            upload_file_id: file.difyFileId,
          })),
          subject: subject.trim() || "数学",
          grade,
          reportStyle,
          extraContext,
        }),
      })

      const contentType = response.headers.get("Content-Type") || ""
      if (contentType.includes("application/x-ndjson") && response.body) {
        if (!response.ok) throw new Error(`诊断失败：${response.status}`)
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let finalPayload: AnalyzeResponse | null = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (!line.trim()) continue
            const event = JSON.parse(line) as AnalyzeStreamEvent
            if (event.type === "progress") {
              setAnalyzeProgress(event.message || "正在诊断")
            } else if (event.type === "result") {
              finalPayload = event
            } else if (event.type === "error") {
              const refundHint = event.billing?.refunded ? "，本次积分已自动退回" : ""
              throw new Error(`${event.error || `诊断失败：${event.status || event.code || "服务异常"}`}${refundHint}`)
            }
          }
        }

        if (!finalPayload) throw new Error("诊断没有返回结果，请稍后重试。")
        setResult(finalPayload)
        toast.success(`错题诊断已完成，已消耗 ${finalPayload.billing?.chargedCredits || diagnosisCredits} 积分`)
        return
      }

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || `诊断失败：${response.status}`)
      }
      setResult(payload)
      toast.success(`错题诊断已完成，已消耗 ${payload.billing?.chargedCredits || diagnosisCredits} 积分`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "诊断失败"
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsAnalyzing(false)
      setAnalyzeProgress("")
    }
  }

  const copyRenderPrompt = async () => {
    if (!result?.renderPrompt) return
    await navigator.clipboard.writeText(result.renderPrompt)
    toast.success("海报内容草稿已复制")
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.58fr)]">
        <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            <ClipboardCheck className="size-4" />
            错题诊断海报
          </div>
          <h1 className="max-w-3xl text-3xl font-black leading-tight text-foreground md:text-5xl">
            拍一张卷子，生成家长看得懂的学习反馈
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
            自动识别卷面与错题证据，整理主要问题、解决方案和训练建议，生成适合家长沟通的反馈草稿。
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {["识别错题证据", "归因学习问题", "生成训练建议"].map((item, index) => (
              <div key={item} className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {index + 1}
                </div>
                <p className="font-semibold text-foreground">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <Card className="rounded-3xl border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="size-5 text-primary" />
              上传试卷
            </CardTitle>
            <CardDescription>支持 1-6 张图片，建议每张图片只拍一页。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => uploadFiles(event.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || worksheets.length >= 6}
              className="flex min-h-[138px] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-4 text-center transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? <Loader2 className="size-7 animate-spin text-primary" /> : <FileImage className="size-7 text-primary" />}
              <span className="text-sm font-semibold text-foreground">
                {isUploading ? "正在上传图片" : "点击上传试卷图片"}
              </span>
            </button>

            {worksheets.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {worksheets.map((file, index) => (
                  <div key={`${file.difyFileId}-${index}`} className="group relative overflow-hidden rounded-xl border bg-muted">
                    <img src={file.previewUrl} alt={file.name} className="aspect-[4/3] w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeWorksheet(index)}
                      className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100"
                      aria-label="移除图片"
                    >
                      <X className="size-4" />
                    </button>
                    <div className="bg-white px-2 py-1">
                      <p className="truncate text-xs font-medium">{file.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatBytes(file.size)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>诊断参数</CardTitle>
            <CardDescription>先生成诊断草稿，再决定是否生成海报。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">学科</Label>
              <Input id="subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grade">年级</Label>
              <Input id="grade" value={grade} onChange={(event) => setGrade(event.target.value)} placeholder="例如：五年级" />
            </div>
            <div className="space-y-2">
              <Label>报告风格</Label>
              <Select value={reportStyle} onValueChange={(value) => setReportStyle(value as typeof reportStyle)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">家长沟通版</SelectItem>
                  <SelectItem value="teacher">教师反馈版</SelectItem>
                  <SelectItem value="student">学生自查版</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="extraContext">补充说明</Label>
              <Textarea
                id="extraContext"
                value={extraContext}
                onChange={(event) => setExtraContext(event.target.value)}
                placeholder="例如：期中卷，最近应用题容易错"
                className="min-h-[104px]"
              />
            </div>
            <Button onClick={analyze} disabled={!canAnalyze} className="h-12 w-full rounded-2xl">
              {isAnalyzing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
              {isAnalyzing ? "正在诊断" : "开始诊断"}
            </Button>
            {isAnalyzing && analyzeProgress ? (
              <p className="text-center text-sm text-muted-foreground">{analyzeProgress}</p>
            ) : null}
            <div className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground">
              <p className="font-semibold text-foreground">本次诊断：{diagnosisCredits} 积分</p>
              <p>生成诊断草稿后，如继续生成海报，预计另需 {WORKSHEET_REPORT_IMAGE_CREDITS} 积分。</p>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-[560px] rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareText className="size-5 text-primary" />
              诊断结果
            </CardTitle>
            <CardDescription>{result ? styleLabel : "上传试卷后，会生成结构化诊断和家长沟通话术。"}</CardDescription>
          </CardHeader>
          <CardContent>
            {errorMessage ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50/70 px-6 text-center">
                <X className="mb-4 size-10 text-red-500" />
                <p className="font-semibold text-red-700">请求没有完成</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-red-600">
                  {errorMessage}
                </p>
              </div>
            ) : !result ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 text-center">
                <ClipboardCheck className="mb-4 size-10 text-muted-foreground" />
                <p className="font-semibold text-foreground">等待诊断</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  结果会包含主要问题、卷面证据、解决方案、训练计划和家长沟通话术。
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl bg-primary/5 p-5">
                  <p className="text-sm font-semibold text-primary">整体判断</p>
                  <p className="mt-2 leading-7 text-foreground">{result.diagnosis.overall_summary || "暂未生成整体判断。"}</p>
                  {result.billing?.chargedCredits ? (
                    <p className="mt-3 text-xs font-medium text-primary">
                      已消耗 {result.billing.chargedCredits} 积分
                    </p>
                  ) : null}
                </div>

                <ResultList title="主要问题" items={result.diagnosis.main_issues} />
                <ResultList title="解决方案" items={result.diagnosis.solutions} />

                <div>
                  <h3 className="mb-3 text-base font-bold">卷面证据</h3>
                  <div className="space-y-3">
                    {result.diagnosis.evidence?.length ? result.diagnosis.evidence.map((item, index) => (
                      <div key={index} className="rounded-2xl border bg-white p-4">
                        <p className="font-semibold">{item.question || `证据 ${index + 1}`}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.reason}</p>
                        {item.quote ? <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{item.quote}</p> : null}
                      </div>
                    )) : <p className="text-sm text-muted-foreground">暂无证据。</p>}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-base font-bold">训练计划</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {result.diagnosis.training_plan?.length ? result.diagnosis.training_plan.map((item, index) => (
                      <div key={index} className="rounded-2xl border bg-white p-4">
                        <p className="font-semibold">{item.title || `训练 ${index + 1}`}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.action}</p>
                        {item.frequency ? <p className="mt-2 text-xs font-medium text-primary">{item.frequency}</p> : null}
                      </div>
                    )) : <p className="text-sm text-muted-foreground">暂无训练计划。</p>}
                  </div>
                </div>

                <div className="rounded-2xl border border-primary/15 bg-white p-5">
                  <p className="text-sm font-semibold text-primary">家长沟通话术</p>
                  <p className="mt-2 leading-7 text-foreground">{result.diagnosis.parent_message || "暂无家长话术。"}</p>
                </div>

                <Button variant="outline" onClick={copyRenderPrompt} className="h-11 rounded-2xl">
                  <Copy className="mr-2 size-4" />
                  复制海报内容草稿
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function ResultList({ title, items }: { title: string; items?: string[] }) {
  return (
    <div>
      <h3 className="mb-3 text-base font-bold">{title}</h3>
      {items?.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item, index) => (
            <div key={`${title}-${index}`} className="rounded-2xl border bg-white p-4 text-sm leading-6 text-foreground">
              {item}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">暂无内容。</p>
      )}
    </div>
  )
}
