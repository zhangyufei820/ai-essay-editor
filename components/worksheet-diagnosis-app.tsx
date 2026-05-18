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
/* eslint-disable @next/next/no-img-element -- User uploaded worksheet previews need native object URLs. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createClient } from "@supabase/supabase-js"
import { FileImage, ImageIcon, Loader2, MessageSquareText, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { extractUserId } from "@/lib/auth-user"
import {
  WORKSHEET_REPORT_IMAGE_CREDITS,
  calculateWorksheetDiagnosisCredits,
} from "@/lib/billing-config"
import {
  extractImageUrlsFromDifyResult,
  proxifyGeneratedImageDownloadUrl,
  proxifyGeneratedImageUrl,
} from "@/components/chat/image-generation/gpt-image-v11"
import { IconAllInOne, IconCopy, IconDiagnosis, IconExportPdf } from "@/components/icons/v2"

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

type ReportImageResult = {
  imageUrls: string[]
  downloadUrl: string
  requestId: string
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

function createClientRequestId(prefix = "worksheet") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

async function readResponseJson(response: Response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`
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
  const [analyzeStartedAt, setAnalyzeStartedAt] = useState<number | null>(null)
  const [analyzeElapsedSeconds, setAnalyzeElapsedSeconds] = useState(0)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [isGeneratingPoster, setIsGeneratingPoster] = useState(false)
  const [posterStage, setPosterStage] = useState("")
  const [posterStartedAt, setPosterStartedAt] = useState<number | null>(null)
  const [posterElapsedSeconds, setPosterElapsedSeconds] = useState(0)
  const [posterResult, setPosterResult] = useState<ReportImageResult | null>(null)
  const [posterError, setPosterError] = useState("")

  const canAnalyze = worksheets.length > 0 && !isUploading && !isAnalyzing
  const diagnosisCredits = calculateWorksheetDiagnosisCredits(Math.max(1, worksheets.length))

  const styleLabel = useMemo(() => ({
    parent: "家校沟通版",
    teacher: "教师反馈版",
    student: "学生自查版",
  }[reportStyle]), [reportStyle])

  useEffect(() => {
    if (!isAnalyzing || !analyzeStartedAt) return
    const timer = window.setInterval(() => {
      setAnalyzeElapsedSeconds(Math.max(0, Math.floor((Date.now() - analyzeStartedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [analyzeStartedAt, isAnalyzing])

  useEffect(() => {
    if (!isGeneratingPoster || !posterStartedAt) return
    const timer = window.setInterval(() => {
      setPosterElapsedSeconds(Math.max(0, Math.floor((Date.now() - posterStartedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isGeneratingPoster, posterStartedAt])

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
    setAnalyzeStartedAt(Date.now())
    setAnalyzeElapsedSeconds(0)
    setResult(null)
    setPosterResult(null)
    setPosterError("")
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
      setAnalyzeStartedAt(null)
    }
  }

  const copyParentMessage = async () => {
    if (!result?.diagnosis.parent_message) return
    await navigator.clipboard.writeText(result.diagnosis.parent_message)
    toast.success("家校沟通建议已复制")
  }

  const keepDiagnosisOnly = () => {
    toast.success("已保留诊断结果，可继续查看或重新上传试卷。")
  }

  const pollPosterTask = async (taskId: string, requestId: string) => {
    const startedAt = Date.now()
    const maxWaitMs = 10 * 60 * 1000

    while (Date.now() - startedAt < maxWaitMs) {
      await wait(5_000)
      setPosterStage("海报正在生成，正在检查结果")

      const response = await fetch(`/api/dify-chat?imageTaskId=${encodeURIComponent(taskId)}&requestId=${encodeURIComponent(requestId)}`, {
        headers: {
          ...(await getVerifiedAuthHeaders()),
          "X-Request-Id": requestId,
        },
      })
      const payload = await readResponseJson(response)

      if (response.ok && payload?.status === "succeeded") {
        return payload.result
      }

      if (payload?.status === "running") continue

      const detailMessage =
        typeof payload?.error === "string"
          ? payload.error
          : typeof payload?.data?.message === "string"
            ? payload.data.message
            : typeof payload?.data?.code === "string"
              ? payload.data.code
              : ""
      const refundHint = payload?.refund?.status === "refunded" ? "，本次海报积分已自动退回" : ""
      throw new Error(`${detailMessage || `海报生成失败：${response.status}`}${refundHint}`)
    }

    throw new Error("海报生成等待超时，请稍后在记录中查看或重试。")
  }

  const generatePoster = async () => {
    if (!result?.renderPrompt || isGeneratingPoster) return

    setIsGeneratingPoster(true)
    setPosterStage("正在提交海报生成任务")
    setPosterStartedAt(Date.now())
    setPosterElapsedSeconds(0)
    setPosterError("")
    setPosterResult(null)

    try {
      const requestId = createClientRequestId("poster")
      const response = await fetch("/api/dify-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getVerifiedAuthHeaders()),
          "X-Request-Id": requestId,
        },
        body: JSON.stringify({
          query: result.renderPrompt,
          inputs: {
            aspect_ratio: "3:4",
            size: "1024x1536",
            model: "gpt-image-2",
            quality: "medium",
            output_format: "png",
            output_compression: 100,
            background: "opaque",
            moderation: "auto",
            n: 1,
            mode: "image_generate",
          },
          model: "gpt-image-2",
          mode: "image",
          async_image_task: true,
          requestId,
        }),
      })
      let payload = await readResponseJson(response)

      if (!response.ok) {
        throw new Error(payload.error || payload.message || `海报生成失败：${response.status}`)
      }

      if (payload?.status === "running" && typeof payload?.imageTaskId === "string") {
        setPosterStage("海报任务已提交，等待生成结果")
        payload = await pollPosterTask(payload.imageTaskId, payload.requestId || requestId)
      }

      const rawImageUrls = extractImageUrlsFromDifyResult(payload)
      const imageUrls = rawImageUrls.map(proxifyGeneratedImageUrl)
      if (imageUrls.length === 0) throw new Error("海报生成完成但没有返回图片，请稍后重试。")

      setPosterResult({
        imageUrls,
        downloadUrl: proxifyGeneratedImageDownloadUrl(rawImageUrls[0] || imageUrls[0], "png"),
        requestId,
      })
      toast.success("诊断海报已生成")
    } catch (error) {
      const message = error instanceof Error ? error.message : "海报生成失败"
      setPosterError(message)
      toast.error(message)
    } finally {
      setIsGeneratingPoster(false)
      setPosterStage("")
      setPosterStartedAt(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.58fr)]">
        <div className="rounded-3xl border border-[var(--ink-100)] bg-[var(--paper-50)] p-6 shadow-sm md:p-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--ink-100)] bg-[var(--ink-50)] px-3 py-1 text-sm font-semibold text-[var(--ink-700)]">
            <IconDiagnosis className="size-4" />
            错题诊断海报
          </div>
          <h1 className="max-w-3xl text-3xl font-black leading-tight text-[var(--ink-900)] md:text-5xl">
            拍一张卷子，生成家校沟通诊断报告
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ink-500)] md:text-lg">
            自动识别卷面与错题证据，整理观察结论、解决方案和训练建议，生成适合家长与老师沟通的报告。
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {["识别错题证据", "归因学习问题", "生成训练建议"].map((item, index) => (
              <div key={item} className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-100)] p-4">
                <div className="mb-3 flex size-9 items-center justify-center rounded-[var(--radius-sharp)] bg-[var(--ink-50)] text-[var(--ink-700)]">
                  {index + 1}
                </div>
                <p className="font-semibold text-[var(--ink-900)]">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <Card className="rounded-3xl border-[var(--ink-100)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="size-5 text-[var(--ink-700)]" />
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
              className="flex min-h-[138px] w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-sharp)] border border-dashed border-[var(--ink-300)] bg-[var(--ink-50)] px-4 text-center transition hover:bg-[var(--ink-50)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? <Loader2 className="size-7 animate-spin text-[var(--ink-700)]" /> : <FileImage className="size-7 text-[var(--ink-700)]" />}
              <span className="text-sm font-semibold text-[var(--ink-900)]">
                {isUploading ? "正在上传图片" : "点击上传试卷图片"}
              </span>
            </button>

            {worksheets.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {worksheets.map((file, index) => (
                  <div key={`${file.difyFileId}-${index}`} className="group relative overflow-hidden rounded-[var(--radius-sharp)] border bg-[var(--paper-100)]">
                    <img src={file.previewUrl} alt={file.name} className="aspect-[4/3] w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeWorksheet(index)}
                      className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100"
                      aria-label="移除图片"
                    >
                      <X className="size-4" />
                    </button>
                    <div className="bg-[var(--paper-50)] px-2 py-1">
                      <p className="truncate text-xs font-medium">{file.name}</p>
                      <p className="text-[11px] text-[var(--ink-500)]">{formatBytes(file.size)}</p>
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
                  <SelectItem value="parent">家校沟通版</SelectItem>
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
            <Button onClick={analyze} disabled={!canAnalyze} className="h-12 w-full rounded-[var(--radius-sharp)]">
              {isAnalyzing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <IconAllInOne className="mr-2 size-4" />}
              {isAnalyzing ? "正在诊断" : "开始诊断"}
            </Button>
            {isAnalyzing && analyzeProgress ? (
              <div className="rounded-[var(--radius-sharp)] border border-[var(--ink-100)] bg-[var(--ink-50)] px-4 py-3 text-center text-sm text-[var(--ink-500)]">
                <p className="font-medium text-[var(--ink-700)]">{analyzeProgress}</p>
                <p className="mt-1">已等待 {formatElapsed(analyzeElapsedSeconds)}，通常需要 60-90 秒。</p>
              </div>
            ) : null}
            <div className="rounded-[var(--radius-sharp)] border border-[var(--ink-100)] bg-[var(--ink-50)] px-4 py-3 text-sm leading-6 text-[var(--ink-500)]">
              <p className="font-semibold text-[var(--ink-900)]">本次诊断：{diagnosisCredits} 积分</p>
              <p>生成诊断草稿后，如继续生成海报，预计另需 {WORKSHEET_REPORT_IMAGE_CREDITS} 积分。</p>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-[560px] rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareText className="size-5 text-[var(--ink-700)]" />
              诊断结果
            </CardTitle>
            <CardDescription>{result ? styleLabel : "上传试卷后，会生成结构化诊断和家校沟通建议。"}</CardDescription>
          </CardHeader>
          <CardContent>
            {errorMessage ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[var(--radius-sharp)] border border-red-100 bg-red-50/70 px-6 text-center">
                <X className="mb-4 size-10 text-[var(--seal-500)]" />
                <p className="font-semibold text-red-700">请求没有完成</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--seal-600)]">
                  {errorMessage}
                </p>
              </div>
            ) : isAnalyzing && !result ? (
              <ProgressPanel
                title="正在诊断"
                message={analyzeProgress || "正在识别卷面并生成诊断。"}
                elapsedSeconds={analyzeElapsedSeconds}
                estimate="通常需要 60-90 秒，复杂卷面可能更久。"
                steps={["上传完成", "识别卷面", "生成诊断"]}
              />
            ) : !result ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[var(--radius-sharp)] border border-dashed bg-[var(--paper-100)]/20 text-center">
                <IconDiagnosis className="mb-4 size-10 text-[var(--ink-500)]" />
                <p className="font-semibold text-[var(--ink-900)]">等待诊断</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--ink-500)]">
                  结果会包含观察结论、主要问题、卷面证据、解决方案、训练计划和家校沟通建议。
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-[var(--radius-sharp)] border border-[var(--ink-100)] bg-[var(--ink-50)] p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink-700)]">下一步</p>
                      <p className="mt-1 text-sm leading-6 text-[var(--ink-500)]">
                        诊断已完成，可以先查看文字报告，也可以继续生成适合家校沟通的诊断海报。
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button variant="outline" onClick={keepDiagnosisOnly} className="h-10 rounded-[var(--radius-sharp)]">
                        <IconDiagnosis className="mr-2 size-4" />
                        只看诊断
                      </Button>
                      <Button onClick={generatePoster} disabled={isGeneratingPoster} className="h-10 rounded-[var(--radius-sharp)]">
                        {isGeneratingPoster ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ImageIcon className="mr-2 size-4" />}
                        {isGeneratingPoster ? "生成中" : "生成诊断海报"}
                      </Button>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-[var(--ink-500)]">
                    生成海报预计另需 {WORKSHEET_REPORT_IMAGE_CREDITS} 积分，失败会按图片任务规则自动退回。
                  </p>
                  {posterStage ? (
                    <div className="mt-4 rounded-[var(--radius-sharp)] border border-[var(--ink-100)] bg-[var(--paper-50)]/70 p-4">
                      <div className="flex items-center gap-3">
                        <Loader2 className="size-4 animate-spin text-[var(--ink-700)]" />
                        <div>
                          <p className="text-sm font-medium text-[var(--ink-700)]">{posterStage}</p>
                          <p className="mt-1 text-xs text-[var(--ink-500)]">
                            已等待 {formatElapsed(posterElapsedSeconds)}，通常需要 1-3 分钟。
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--ink-50)]">
                        <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--seal-500)]" />
                      </div>
                    </div>
                  ) : null}
                  {posterError ? <p className="mt-3 text-sm text-[var(--seal-600)]">{posterError}</p> : null}
                </div>

                {posterResult?.imageUrls.length ? (
                  <div className="rounded-[var(--radius-sharp)] border border-[var(--ink-100)] bg-[var(--paper-50)] p-5">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[var(--ink-700)]">诊断海报</p>
                        <p className="mt-1 text-sm text-[var(--ink-500)]">可下载后用于家校沟通或保存到相册。</p>
                      </div>
                      <a
                        href={posterResult.downloadUrl}
                        download="worksheet-diagnosis-poster.png"
                        className="inline-flex h-10 items-center justify-center rounded-[var(--radius-sharp)] border border-[var(--paper-200)] px-4 text-sm font-semibold transition hover:bg-[var(--paper-100)]"
                      >
                        <IconExportPdf className="mr-2 size-4" />
                        下载海报
                      </a>
                    </div>
                    <img
                      src={posterResult.imageUrls[0]}
                      alt="诊断海报"
                      className="mx-auto max-h-[720px] w-full max-w-md rounded-[var(--radius-sharp)] border object-contain"
                    />
                  </div>
                ) : null}

                <div className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-5 shadow-sm">
                  <SectionTitle>整体观察</SectionTitle>
                  <p className="mt-2 leading-7 text-[var(--ink-900)]">{result.diagnosis.overall_summary || "暂未生成整体判断。"}</p>
                  {result.billing?.chargedCredits ? (
                    <p className="mt-3 text-xs font-medium text-[var(--ink-700)]">
                      已消耗 {result.billing.chargedCredits} 积分
                    </p>
                  ) : null}
                </div>

                <ResultList title="主要问题" items={result.diagnosis.main_issues} />
                <ResultList title="解决方案" items={result.diagnosis.solutions} />

                <div>
                  <SectionTitle className="mb-3">卷面证据</SectionTitle>
                  <div className="space-y-3">
                    {result.diagnosis.evidence?.length ? result.diagnosis.evidence.map((item, index) => (
                      <div key={index} className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-4 shadow-sm">
                        <p className="font-semibold">{item.question || `证据 ${index + 1}`}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--ink-500)]">{item.reason}</p>
                        {item.quote ? <p className="mt-2 rounded-[var(--radius-sharp)] bg-[var(--paper-100)] px-3 py-2 text-xs text-[var(--ink-500)]">{item.quote}</p> : null}
                      </div>
                    )) : <p className="text-sm text-[var(--ink-500)]">暂无证据。</p>}
                  </div>
                </div>

                <div>
                  <SectionTitle className="mb-3">训练计划</SectionTitle>
                  <div className="grid gap-3 md:grid-cols-2">
                    {result.diagnosis.training_plan?.length ? result.diagnosis.training_plan.map((item, index) => (
                      <div key={index} className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-4 shadow-sm">
                        <p className="font-semibold">{item.title || `训练 ${index + 1}`}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--ink-500)]">{item.action}</p>
                        {item.frequency ? <p className="mt-2 text-xs font-medium text-[var(--ink-700)]">{item.frequency}</p> : null}
                      </div>
                    )) : <p className="text-sm text-[var(--ink-500)]">暂无训练计划。</p>}
                  </div>
                </div>

                <div className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-5 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <SectionTitle>家校沟通建议</SectionTitle>
                      <p className="mt-2 leading-7 text-[var(--ink-900)]">{result.diagnosis.parent_message || "暂无家校沟通建议。"}</p>
                    </div>
                    <Button variant="outline" onClick={copyParentMessage} className="h-10 shrink-0 rounded-[var(--radius-sharp)]">
                      <IconCopy className="mr-2 size-4" />
                      复制
                    </Button>
                  </div>
                </div>
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
      <SectionTitle className="mb-3">{title}</SectionTitle>
      {items?.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item, index) => (
            <div key={`${title}-${index}`} className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-4 text-sm leading-6 text-[var(--ink-900)] shadow-sm">
              {item}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--ink-500)]">暂无内容。</p>
      )}
    </div>
  )
}

function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={`flex items-center gap-2 text-sm font-bold text-[var(--ink-700)] ${className}`}>
      <span className="h-4 w-1 rounded-full bg-[var(--seal-500)]" />
      {children}
    </h3>
  )
}

function ProgressPanel({
  title,
  message,
  elapsedSeconds,
  estimate,
  steps,
}: {
  title: string
  message: string
  elapsedSeconds: number
  estimate: string
  steps: string[]
}) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[var(--radius-sharp)] border border-dashed bg-[var(--ink-50)] px-6 text-center">
      <div className="mb-5 flex size-12 items-center justify-center rounded-[var(--radius-sharp)] bg-[var(--ink-50)] text-[var(--ink-700)]">
        <Loader2 className="size-6 animate-spin" />
      </div>
      <p className="font-semibold text-[var(--ink-900)]">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-[var(--ink-500)]">{message}</p>
      <p className="mt-2 text-xs text-[var(--ink-500)]">已等待 {formatElapsed(elapsedSeconds)}，{estimate}</p>

      <div className="mt-6 grid w-full max-w-xl gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step} className="rounded-[var(--radius-sharp)] border border-[var(--ink-100)] bg-[var(--paper-50)] px-4 py-3 text-left">
            <div className="mb-2 flex size-7 items-center justify-center rounded-full bg-[var(--ink-50)] text-xs font-bold text-[var(--ink-700)]">
              {index + 1}
            </div>
            <p className="text-sm font-semibold text-[var(--ink-900)]">{step}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 h-2 w-full max-w-md overflow-hidden rounded-full bg-[var(--ink-50)]">
        <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--seal-500)]" />
      </div>
    </div>
  )
}
