"use client"
/* eslint-disable @next/next/no-img-element -- Tool previews use user-uploaded blob URLs and generated external image URLs. */

import {
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle,
  InputV2 as Input,
  LabelV2 as Label,
  TextareaV2 as Textarea
} from "@/components/ui/v2"
import { GridWaveLoader } from "@/components/chat/GridWaveLoader"
import { extractImageUrlsFromDifyResult, proxifyGeneratedImageUrl } from "@/components/chat/image-generation/gpt-image-v11"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"
import { useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from "react"
import { Camera, FileImage, Image as ImageIcon, Loader2, Megaphone, Presentation, Search, Sparkles, Upload, Wand2 } from "lucide-react"
import { IconAllInOne, IconEssay } from "@/components/icons/v2"

type ToolResult = {
  title: string
  content: unknown
}

type ReverseTargetModel = "gpt-image-2" | "nano_banana"

type ReverseImageResult = {
  prompt: string
  targetModel: ReverseTargetModel
  generatedImages: string[]
  sourceText?: string
  requestId?: string
  traceId?: string
}

const reverseModelOptions: Array<{ value: ReverseTargetModel; label: string }> = [
  { value: "gpt-image-2", label: "gpt-image-2" },
  { value: "nano_banana", label: "nano_banana" },
]

type VoiceOption = {
  voice_id: string
  name: string
  language?: string
  description?: string
}

type VoiceJob = {
  job_id: string
  status: "queued" | "running" | "succeeded" | "failed"
  progress?: number
  audio_url?: string | null
  error?: string | null
  voice_id?: string | null
}

const TTS_POLL_MAX_ATTEMPTS = 150
const TTS_POLL_SLOW_HINT_AFTER_ATTEMPTS = 12

function JsonBlock({ value }: { value: unknown }) {
  if (typeof value === "string") {
    return <div className="whitespace-pre-wrap rounded-[var(--radius-soft)] bg-[var(--paper-100)]/50 p-3 text-sm leading-6">{value}</div>
  }

  return (
    <pre className="max-h-96 overflow-auto rounded-[var(--radius-soft)] bg-[var(--paper-100)]/50 p-3 text-xs leading-5">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function isHtmlErrorContent(value: unknown) {
  if (typeof value !== "string") return false
  const text = value.trim().toLowerCase()
  return (
    text.startsWith("<!doctype html") ||
    text.startsWith("<html") ||
    text.includes("<title>shenxiang.school | 502: bad gateway</title>") ||
    (text.includes("cloudflare") && text.includes("bad gateway"))
  )
}

function getSafeServiceError(error: unknown, fallback = "服务暂时不可用，请稍后重试。") {
  const raw = error instanceof Error ? error.message : String(error || "")
  if (!raw || isHtmlErrorContent(raw)) return fallback
  return raw
}

function createClientRequestId(prefix = "tools-img") {
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

function extractMarkdownImageUrls(content: string) {
  return Array.from(content.matchAll(/!\[[^\]]*]\(([^)]+)\)/g), (match) => match[1])
    .filter((url): url is string => Boolean(url))
    .map(proxifyGeneratedImageUrl)
}

function mapToolImageError(error: unknown) {
  const raw = getSafeServiceError(error, "图片服务暂时不可用，请稍后重试。")
  const lower = raw.toLowerCase()
  if (raw.includes("请先登录") || raw.includes("未授权") || lower.includes("unauthorized") || lower.includes("401")) {
    return "请先登录后再使用图像提示词反推。"
  }
  if (lower.includes("timeout") || raw.includes("超时") || lower.includes("504")) {
    return "图片生成等待超时，请稍后重试，或先降低生成质量。"
  }
  if (lower.includes("403") || lower.includes("forbidden")) {
    return "当前账号暂时不能使用该图像生成模型，请切换模型或升级后再试。"
  }
  if (lower.includes("bad gateway") || lower.includes("502")) {
    return "图片服务暂时不可用，请稍后重试。"
  }
  if (lower.includes("upstream_error") || lower.includes("dify error") || lower.includes("500")) {
    return "图片服务请求失败，可能是余额不足、模型不可用、尺寸不支持或参数不兼容。"
  }
  return raw.replace(/Dify/gi, "服务").replace(/网关/g, "服务") || "处理失败，请稍后重试。"
}

function buildImageGenerationInputs(targetModel: ReverseTargetModel) {
  if (targetModel === "nano_banana") {
    return {
      provider: "google",
      aspect_ratio: "1:1",
      size: "1K",
      image_size: "1K",
      model: "gemini-3.1-flash-image-preview",
      quality: "low",
      output_format: "png",
      output_compression: 100,
      background: "auto",
      moderation: "auto",
      n: 1,
      mode: "image_generate",
      response_modalities: ["TEXT", "IMAGE"],
      reference_image_url: "",
      reference_image_urls: [],
      mask_image_url: "",
    }
  }

  return {
    provider: "openai",
    aspect_ratio: "1:1",
    size: "1024x1024",
    model: "gpt-image-2",
    quality: "low",
    output_format: "png",
    output_compression: 100,
    background: "auto",
    moderation: "auto",
    n: 1,
    mode: "image_generate",
    reference_image_url: "",
    reference_image_urls: [],
    mask_image_url: "",
  }
}

function ToolCard({
  index,
  title,
  description,
  icon: Icon,
  children,
  featured = false,
}: {
  index: string
  title: string
  description: string
  icon: ComponentType<any>
  children: ReactNode
  featured?: boolean
}) {
  return (
    <Card
      className={[
        "group w-full min-w-0 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-sharp)] border-[var(--paper-200)] bg-[var(--paper-50)] sm:max-w-none",
        "shadow-[0_1px_0_rgba(16,55,35,0.04),0_18px_48px_rgba(16,55,35,0.06)] transition duration-300",
        "hover:-translate-y-0.5 hover:border-[var(--ink-200)] hover:shadow-[0_18px_70px_rgba(16,55,35,0.11)]",
        featured ? "lg:col-span-2" : "",
      ].join(" ")}
    >
      <CardHeader className="border-b border-[var(--paper-200)] bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(247,244,235,0.36))]">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-soft)] border border-[var(--ink-100)] bg-[var(--ink-50)] text-[var(--ink-700)]">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold text-[var(--seal-600)]">{index}</span>
              <CardTitle className="text-[17px] leading-6 text-[var(--ink-900)]">{title}</CardTitle>
            </div>
            <p className="text-[13px] leading-5 text-[var(--ink-500)]">{description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  )
}

export default function ToolsPage() {
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<ToolResult | null>(null)
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [ocrFile, setOcrFile] = useState<File | null>(null)
  const [ocrImages, setOcrImages] = useState("")
  const [presentationContent, setPresentationContent] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [sparkQuery, setSparkQuery] = useState("")
  const [ttsText, setTtsText] = useState("")
  const [ttsVoices, setTtsVoices] = useState<VoiceOption[]>([])
  const [ttsVoiceId, setTtsVoiceId] = useState("")
  const [ttsJob, setTtsJob] = useState<VoiceJob | null>(null)
  const [reverseImageFile, setReverseImageFile] = useState<File | null>(null)
  const [reverseImagePreview, setReverseImagePreview] = useState("")
  const [reverseTargetModel, setReverseTargetModel] = useState<ReverseTargetModel>("gpt-image-2")
  const [reversePrompt, setReversePrompt] = useState("")
  const [reverseResult, setReverseResult] = useState<ReverseImageResult | null>(null)
  const [reverseStage, setReverseStage] = useState("")
  const documentFileRef = useRef<HTMLInputElement | null>(null)
  const ocrCameraRef = useRef<HTMLInputElement | null>(null)
  const ocrUploadRef = useRef<HTMLInputElement | null>(null)
  const reverseImageRef = useRef<HTMLInputElement | null>(null)

  const selectedReverseModel = useMemo(
    () => reverseModelOptions.find((option) => option.value === reverseTargetModel) || reverseModelOptions[0],
    [reverseTargetModel],
  )

  useEffect(() => {
    let mounted = true
    fetch("/api/omnivoice/voices")
      .then((response) => response.json())
      .then((payload) => {
        if (!mounted || !Array.isArray(payload.voices)) return
        setTtsVoices(payload.voices)
        setTtsVoiceId((current) => current || payload.voices[0]?.voice_id || "")
      })
      .catch(() => {
        if (mounted) setTtsVoices([])
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    return () => {
      if (reverseImagePreview) URL.revokeObjectURL(reverseImagePreview)
    }
  }, [reverseImagePreview])

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(reader.error || new Error("读取图片失败"))
      reader.readAsDataURL(file)
    })
  }

  function handleOcrFile(file?: File | null) {
    if (!file) return
    setOcrFile(file)
    setResult({ title: "图片 OCR", content: `已选择图片：${file.name}` })
  }

  function handleReverseImageFile(file?: File | null) {
    if (!file) return
    if (reverseImagePreview) URL.revokeObjectURL(reverseImagePreview)
    setReverseImageFile(file)
    setReverseImagePreview(URL.createObjectURL(file))
    setReversePrompt("")
    setReverseResult(null)
    setReverseStage("")
    setResult({ title: "图像提示词反推", content: `已选择图片：${file.name}，请点击“开始反推提示词”。` })
  }

  async function pollImageTask(taskId: string, requestId: string) {
    const startedAt = Date.now()
    const maxWaitMs = 10 * 60 * 1000

    while (Date.now() - startedAt < maxWaitMs) {
      await new Promise((resolve) => window.setTimeout(resolve, 5000))
      setReverseStage("图片仍在生成，正在检查结果")

      const response = await fetch(`/api/dify-chat?imageTaskId=${encodeURIComponent(taskId)}&requestId=${encodeURIComponent(requestId)}`, {
        headers: {
          ...(await getVerifiedAuthHeaders()),
          "X-Request-Id": requestId,
        },
      })
      const payload = await readResponseJson(response)

      if (response.ok && payload?.status === "succeeded") return payload.result
      if (payload?.status === "running") continue

      throw new Error(typeof payload?.error === "string" ? payload.error : `upstream_error:${response.status}`)
    }

    throw new Error("timeout")
  }

  async function runReversePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reverseImageFile) {
      setResult({ title: "图像提示词反推", content: "请先上传一张图片" })
      return
    }

    try {
      setBusy("reverse")
      setReverseStage("正在上传图片并反推提示词")
      const formData = new FormData()
      formData.append("image", reverseImageFile)
      formData.append("target_model", reverseTargetModel)

      const response = await fetch("/api/image-prompt/reverse", {
        method: "POST",
        headers: await getVerifiedAuthHeaders(),
        body: formData,
      })
      const payload = await readResponseJson(response)
      const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : ""

      if (!response.ok || !prompt || isHtmlErrorContent(prompt)) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "反推提示词失败")
      }

      setReversePrompt(prompt)
      setReverseResult({
        prompt,
        targetModel: reverseTargetModel,
        generatedImages: [],
      })
      setResult({ title: "图像提示词反推", content: prompt })
      setReverseStage("提示词已生成，可以继续生成图像")
    } catch (error) {
      const message = mapToolImageError(error)
      setResult({ title: "图像提示词反推", content: message })
      setReverseStage("")
    } finally {
      setBusy(null)
    }
  }

  async function generateFromReversePrompt() {
    const cleanPrompt = reversePrompt.trim()
    if (!cleanPrompt) {
      setResult({ title: "图像生成", content: "请先反推或填写提示词" })
      return
    }

    try {
      setBusy("reverse-generate")
      setReverseStage("正在生成图片")
      const requestId = createClientRequestId(reverseTargetModel === "gpt-image-2" ? "tools-img" : "tools-banana")
      const generationModel = reverseTargetModel === "nano_banana" ? "banana-2-pro" : "gpt-image-2"
      const response = await fetch("/api/dify-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getVerifiedAuthHeaders()),
          "X-Request-Id": requestId,
        },
        body: JSON.stringify({
          query: cleanPrompt,
          inputs: buildImageGenerationInputs(reverseTargetModel),
          model: generationModel,
          mode: "image",
          imageSize: reverseTargetModel === "nano_banana"
            ? { width: 1024, height: 1024, ratio: "1:1" }
            : undefined,
          async_image_task: reverseTargetModel === "gpt-image-2",
          requestId,
        }),
      })

      let payload = await readResponseJson(response)
      const traceId = response.headers.get("X-Trace-Id") || undefined
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `upstream_error:${response.status}`)
      }

      if (payload?.status === "running" && typeof payload?.imageTaskId === "string") {
        setReverseStage("图片任务已提交，等待生成结果")
        payload = await pollImageTask(payload.imageTaskId, payload.requestId || requestId)
      }

      const sourceText =
        typeof payload?.answer === "string"
          ? payload.answer
          : typeof payload?.data?.outputs?.text === "string"
            ? payload.data.outputs.text
            : ""
      const generatedImages = [
        ...extractImageUrlsFromDifyResult(payload).map(proxifyGeneratedImageUrl),
        ...extractMarkdownImageUrls(sourceText),
      ].filter((url, index, items) => items.indexOf(url) === index)

      if (!generatedImages.length && !sourceText) {
        throw new Error("upstream_error: empty image result")
      }

      const nextResult = {
        prompt: cleanPrompt,
        targetModel: reverseTargetModel,
        generatedImages,
        sourceText,
        requestId,
        traceId,
      }
      setReverseResult(nextResult)
      setResult({ title: "图像生成结果", content: generatedImages.length ? generatedImages : sourceText || "图片已生成" })
      setReverseStage("图片生成完成")
    } catch (error) {
      const message = mapToolImageError(error)
      setResult({ title: "图像生成", content: message })
      setReverseStage("")
    } finally {
      setBusy(null)
    }
  }

  async function runDocumentProcess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!documentFile) {
      setResult({ title: "文档处理", content: "请先选择文件" })
      return
    }

    try {
      setBusy("document")
      const formData = new FormData()
      formData.append("file", documentFile)
      const response = await fetch("/api/document-process", { method: "POST", body: formData })
      const payload = await response.json().catch(() => ({}))
      setResult({ title: "文档处理结果", content: response.ok ? payload : payload.error || "文档处理失败" })
    } finally {
      setBusy(null)
    }
  }

  async function runOcr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const images = ocrImages.split(/\n+/).map((value) => value.trim()).filter(Boolean)
    if (!images.length && !ocrFile) {
      setResult({ title: "图片 OCR", content: "请上传或拍摄一张图片，也可以粘贴测试文本" })
      return
    }

    try {
      setBusy("ocr")
      const uploadedImage = ocrFile ? await readFileAsDataUrl(ocrFile) : null
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: [
            ...images,
            ...(uploadedImage ? [{ file_name: ocrFile?.name, image_base64: uploadedImage.split(",")[1] }] : []),
          ],
        }),
      })
      const payload = await response.json().catch(() => ({}))
      setResult({ title: "OCR 识别结果", content: response.ok ? payload.text || payload : payload.error || "OCR 失败" })
    } finally {
      setBusy(null)
    }
  }

  async function runPresentation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!presentationContent.trim()) {
      setResult({ title: "演示文稿", content: "请填写演示内容" })
      return
    }

    try {
      setBusy("presentation")
      const response = await fetch("/api/presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: presentationContent, template: "classroom" }),
      })
      const payload = await response.json().catch(() => ({}))
      setResult({ title: "演示文稿结果", content: response.ok ? payload.presentation || payload : payload.error || "生成失败" })
    } finally {
      setBusy(null)
    }
  }

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!searchQuery.trim()) {
      setResult({ title: "网页搜索", content: "请填写搜索问题" })
      return
    }

    try {
      setBusy("search")
      const response = await fetch("/api/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, maxResults: 5 }),
      })
      const payload = await response.json().catch(() => ({}))
      setResult({ title: "网页搜索结果", content: response.ok ? payload.results || payload : payload.error || "搜索失败" })
    } finally {
      setBusy(null)
    }
  }

  async function runSparkpage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sparkQuery.trim()) {
      setResult({ title: "综合报告", content: "请填写报告主题" })
      return
    }

    try {
      setBusy("spark")
      const response = await fetch("/api/sparkpage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: sparkQuery }),
      })
      const payload = await response.json().catch(() => ({}))
      setResult({ title: "综合报告结果", content: response.ok ? payload.sparkpage || payload : payload.error || "生成失败" })
    } finally {
      setBusy(null)
    }
  }

  async function runTts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ttsText.trim()) {
      setResult({ title: "文字转语音", content: "请输入要朗读的文字" })
      return
    }

    try {
      setBusy("tts")
      setTtsJob(null)
      const response = await fetch("/api/omnivoice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: ttsText,
          voice_id: ttsVoiceId || undefined,
          language: "zh-CN",
          emotion: "friendly",
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.job?.job_id) {
        setResult({ title: "文字转语音", content: payload.error || "语音任务创建失败" })
        return
      }

      setTtsJob(payload.job)
      setResult({ title: "文字转语音", content: "语音任务已创建，正在生成音频..." })

      for (let attempt = 0; attempt < TTS_POLL_MAX_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt < 3 ? 1500 : 5000))
        const jobResponse = await fetch(`/api/omnivoice/jobs/${encodeURIComponent(payload.job.job_id)}`)
        const jobPayload = await jobResponse.json().catch(() => ({}))
        if (!jobResponse.ok || !jobPayload.job) continue

        setTtsJob(jobPayload.job)
        if (jobPayload.job.status === "running" && attempt === TTS_POLL_SLOW_HINT_AFTER_ATTEMPTS) {
          setResult({ title: "文字转语音", content: "语音模型首次加载可能需要几分钟，系统仍在生成，请不要关闭页面。" })
        }
        if (jobPayload.job.status === "succeeded" && jobPayload.job.audio_url) {
          setResult({ title: "文字转语音", content: "语音已生成，可在左侧播放器试听。" })
          return
        }
        if (jobPayload.job.status === "failed") {
          setResult({ title: "文字转语音", content: jobPayload.job.error || "语音生成失败" })
          return
        }
      }

      setResult({ title: "文字转语音", content: "语音仍在生成中。任务已提交到服务器，请稍后点击生成语音重试或联系管理员查询任务 ID。" })
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[linear-gradient(180deg,var(--paper-50)_0%,var(--paper-100)_100%)] px-4 py-5 dark:bg-[var(--paper-50)] sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <header className="w-full min-w-0 max-w-[calc(100vw-2rem)] rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[rgba(255,255,255,0.58)] px-5 py-4 shadow-[0_18px_60px_rgba(16,55,35,0.08)] backdrop-blur sm:max-w-none">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--seal-600)]">Tools Desk</p>
              <h1 className="mt-2 font-[var(--font-display)] text-2xl font-black leading-tight text-[var(--ink-900)] sm:text-3xl">
                工具工作台
              </h1>
            </div>
            <div className="hidden w-full min-w-0 grid-cols-3 gap-2 text-center sm:grid md:w-auto">
              {[
                ["7", "可用工具"],
                ["API", "实时处理"],
                ["1", "结果面板"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="min-w-0 rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] px-2 py-2 shadow-sm sm:px-3"
                >
                  <div className="font-[var(--font-display)] text-lg font-black text-[var(--ink-800)]">{value}</div>
                  <div className="mt-0.5 text-[11px] font-medium leading-4 text-[var(--ink-500)]">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <ToolCard index="01" title="图像提示词反推" description="上传参考图，反推出可直接用于 Image 2 或 Banana/Gemini 的生成提示词。" icon={FileImage} featured>
              <form className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" onSubmit={runReversePrompt}>
                <div className="space-y-3">
                  <Label htmlFor="reverse-image-file">上传图片</Label>
                  <input
                    ref={reverseImageRef}
                    id="reverse-image-file"
                    className="sr-only"
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleReverseImageFile(event.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() => reverseImageRef.current?.click()}
                    className="flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-soft)] border border-dashed border-[var(--ink-300)] bg-[var(--ink-50)] px-4 text-center text-sm font-semibold text-[var(--ink-700)] transition hover:border-[var(--ink-600)] hover:bg-[var(--paper-100)]"
                  >
                    {reverseImagePreview ? (
                      <img src={reverseImagePreview} alt="已上传图片预览" className="max-h-40 rounded-[var(--radius-soft)] object-contain" />
                    ) : (
                      <>
                        <span className="flex size-12 items-center justify-center rounded-[var(--radius-soft)] border border-[var(--ink-200)] bg-[var(--paper-50)]">
                          <Upload className="size-5" />
                        </span>
                        <span>请先上传图片</span>
                        <span className="text-xs font-normal text-[var(--ink-500)]">支持 JPG / PNG / WebP，上传后再反推提示词</span>
                      </>
                    )}
                  </button>
                  {reverseImageFile ? (
                    <p className="truncate text-xs text-[var(--ink-500)]">已选：{reverseImageFile.name}</p>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>参数映射</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {reverseModelOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setReverseTargetModel(option.value)}
                          className={[
                            "rounded-[var(--radius-soft)] border px-3 py-3 text-left transition",
                            reverseTargetModel === option.value
                              ? "border-[var(--seal-500)] bg-[var(--seal-50)] text-[var(--ink-900)] shadow-sm"
                              : "border-[var(--paper-200)] bg-[var(--paper-50)] text-[var(--ink-700)] hover:border-[var(--ink-300)]",
                          ].join(" ")}
                        >
                          <span className="block font-mono text-xs font-bold">{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reverse-prompt">反推提示词</Label>
                    <Textarea
                      id="reverse-prompt"
                      rows={7}
                      value={reversePrompt}
                      onChange={(event) => setReversePrompt(event.target.value)}
                      placeholder={`上传图片后，系统会按 ${selectedReverseModel.label} 参数反推提示词...`}
                    />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="submit" variant="outline" disabled={busy === "reverse" || !reverseImageFile}>
                      {busy === "reverse" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                      开始反推提示词
                    </Button>
                    <Button type="button" variant="seal" disabled={busy === "reverse-generate" || !reversePrompt.trim()} onClick={generateFromReversePrompt}>
                      {busy === "reverse-generate" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ImageIcon className="mr-2 size-4" />}
                      生成图像
                    </Button>
                  </div>
                  {reverseStage ? <p className="text-xs font-semibold text-[var(--ink-500)]">{reverseStage}</p> : null}
                </div>
              </form>
            </ToolCard>

            <ToolCard index="02" title="文档处理" description="上传学习资料，提取可继续加工的文本。" icon={IconEssay}>
              <form className="space-y-3" onSubmit={runDocumentProcess}>
                <Label htmlFor="document-file">上传 PDF / Word / 图片 / 文本</Label>
                <Input
                  ref={documentFileRef}
                  id="document-file"
                  type="file"
                  className="sr-only"
                  onChange={(event) => setDocumentFile(event.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={() => documentFileRef.current?.click()}
                  className="flex h-12 w-full items-center justify-center rounded-[var(--radius-soft)] border border-[var(--paper-300)] bg-[var(--paper-100)] px-4 text-sm font-semibold text-[var(--ink-700)] transition hover:border-[var(--ink-400)] hover:bg-[var(--ink-50)]"
                >
                  {documentFile ? documentFile.name : "➕点击上传文档"}
                </button>
                <Button type="submit" disabled={busy === "document"} className="w-full">
                  {busy === "document" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  提取文本
                </Button>
              </form>
            </ToolCard>

            <ToolCard index="03" title="图片 OCR" description="上传或拍照识别图片文字，适合资料整理。" icon={Wand2}>
              <form className="space-y-3" onSubmit={runOcr}>
                <Label htmlFor="ocr-images">图片上传 / 拍照 / 测试文本</Label>
                <input
                  ref={ocrUploadRef}
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleOcrFile(event.target.files?.[0])}
                />
                <input
                  ref={ocrCameraRef}
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => handleOcrFile(event.target.files?.[0])}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={() => ocrUploadRef.current?.click()}>
                    <Upload className="mr-2 size-4" />
                    上传图片
                  </Button>
                  <Button type="button" variant="outline" onClick={() => ocrCameraRef.current?.click()}>
                    <Camera className="mr-2 size-4" />
                    拍照识别
                  </Button>
                </div>
                {ocrFile ? (
                  <p className="truncate text-xs text-[var(--ink-500)]">已选：{ocrFile.name}</p>
                ) : null}
                <Textarea id="ocr-images" rows={3} value={ocrImages} onChange={(event) => setOcrImages(event.target.value)} placeholder="也可粘贴文字做网关连通性测试，每行一条" />
                <Button type="submit" disabled={busy === "ocr"} className="w-full">
                  {busy === "ocr" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  识别文字
                </Button>
              </form>
            </ToolCard>

            <ToolCard index="04" title="演示文稿" description="把课件、汇报素材快速整理成演示结构。" icon={Presentation}>
              <form className="space-y-3" onSubmit={runPresentation}>
                <Label htmlFor="presentation-content">课件或汇报内容</Label>
                <Textarea id="presentation-content" rows={5} value={presentationContent} onChange={(event) => setPresentationContent(event.target.value)} placeholder="粘贴要生成演示文稿的内容..." />
                <Button type="submit" disabled={busy === "presentation"} className="w-full">
                  {busy === "presentation" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  生成演示文稿
                </Button>
              </form>
            </ToolCard>

            <ToolCard index="05" title="网页搜索" description="围绕一个问题抓取网页结果，辅助备课和调研。" icon={Search}>
              <form className="space-y-3" onSubmit={runSearch}>
                <Label htmlFor="search-query">搜索问题</Label>
                <Input id="search-query" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="例如：牛顿第二定律生活例子" />
                <Button type="submit" disabled={busy === "search"} className="w-full">
                  {busy === "search" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  搜索
                </Button>
              </form>
            </ToolCard>

            <ToolCard index="06" title="Sparkpage 综合报告" description="输入主题，生成更完整的资料整理和综合分析结果。" icon={IconAllInOne} featured>
              <form className="grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={runSparkpage}>
                <Input value={sparkQuery} onChange={(event) => setSparkQuery(event.target.value)} placeholder="输入要综合分析的主题" />
                <Button type="submit" disabled={busy === "spark"}>
                  {busy === "spark" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  生成报告
                </Button>
              </form>
            </ToolCard>

            <ToolCard index="07" title="文字转语音" description="把文本转换成可播放音频，调用服务器 OmniVoice 网关。" icon={Megaphone} featured>
              <form className="space-y-3" onSubmit={runTts}>
                <Label htmlFor="tts-text">朗读文本</Label>
                <Textarea
                  id="tts-text"
                  rows={4}
                  value={ttsText}
                  maxLength={1200}
                  onChange={(event) => setTtsText(event.target.value)}
                  placeholder="输入要转换成语音的文字..."
                />
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="tts-voice">音色</Label>
                    <select
                      id="tts-voice"
                      value={ttsVoiceId}
                      onChange={(event) => setTtsVoiceId(event.target.value)}
                      className="h-10 w-full rounded-[var(--radius-soft)] border border-[var(--paper-300)] bg-[var(--paper-50)] px-3 text-sm text-[var(--ink-800)] outline-none focus:border-[var(--ink-500)]"
                    >
                      {ttsVoices.length ? ttsVoices.map((voice) => (
                        <option key={voice.voice_id} value={voice.voice_id}>
                          {voice.name}{voice.description ? ` - ${voice.description}` : ""}
                        </option>
                      )) : (
                        <option value="">正在加载音色...</option>
                      )}
                    </select>
                  </div>
                  <Button type="submit" disabled={busy === "tts" || !ttsText.trim()}>
                    {busy === "tts" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    生成语音
                  </Button>
                </div>
                {ttsJob ? (
                  <div className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)]/60 p-3">
                    <p className="text-xs font-semibold text-[var(--ink-600)]">
                      状态：{ttsJob.status === "succeeded" ? "已完成" : ttsJob.status === "failed" ? "失败" : "生成中"} · 进度 {Math.round((ttsJob.progress || 0) * 100)}%
                    </p>
                    {busy === "tts" && !ttsJob.audio_url && ttsJob.status !== "failed" ? (
                      <p className="mt-2 text-xs leading-5 text-[var(--ink-500)]">
                        正在轮询服务器任务。首次加载 OmniVoice 模型时可能会停在 20% 数分钟，生成完成后播放器会自动出现。
                      </p>
                    ) : null}
                    {ttsJob.audio_url ? (
                      <audio className="mt-3 w-full" controls src={ttsJob.audio_url}>
                        <a href={ttsJob.audio_url}>播放音频</a>
                      </audio>
                    ) : null}
                    {ttsJob.error ? <p className="mt-2 text-xs text-[var(--seal-600)]">{ttsJob.error}</p> : null}
                  </div>
                ) : null}
              </form>
            </ToolCard>
          </div>

          <Card className="w-full min-w-0 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-sharp)] border-[var(--paper-200)] bg-[var(--paper-50)] shadow-[0_24px_80px_rgba(16,55,35,0.1)] sm:max-w-none xl:sticky xl:top-5 xl:self-start">
            <CardHeader className="border-b border-[var(--paper-200)] bg-[var(--ink-50)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--seal-600)]">Output</p>
                  <CardTitle className="mt-1 text-lg text-[var(--ink-900)]">{result?.title || "结果预览"}</CardTitle>
                </div>
                <span className="flex size-9 items-center justify-center rounded-[var(--radius-soft)] border border-[var(--ink-100)] bg-[var(--paper-50)] text-[var(--ink-700)]">
                  <IconAllInOne className="size-4" aria-hidden="true" />
                </span>
              </div>
            </CardHeader>
            <CardContent className="min-h-[420px] p-5">
              {busy === "reverse-generate" ? (
                <div className="flex min-h-[340px] flex-col items-center justify-center gap-4 rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--ink-900)] p-5 text-center">
                  <GridWaveLoader maxWidth={260} gridSize={12} dotSize={5} gap={5} label={reverseStage || "正在生成图片，请稍候。"} />
                  <div>
                    <p className="font-[var(--font-display)] text-lg font-bold text-[var(--paper-50)]">正在生成图像</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--paper-200)]">{reverseStage || "Image 2 风格加载中，请稍候。"}</p>
                  </div>
                </div>
              ) : reverseResult?.generatedImages.length ? (
                <div className="space-y-4">
                  <div className="grid gap-3">
                    {reverseResult.generatedImages.map((url, index) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)]">
                        <img src={url} alt={`生成图像 ${index + 1}`} className="h-auto w-full object-contain" />
                      </a>
                    ))}
                  </div>
                  <div className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)]/60 p-3">
                    <p className="text-xs font-bold text-[var(--seal-600)]">反推提示词</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ink-700)]">{reverseResult.prompt}</p>
                  </div>
                </div>
              ) : reversePrompt ? (
                <div className="space-y-4">
                  <div className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)]/60 p-3">
                    <p className="text-xs font-bold text-[var(--seal-600)]">已反推提示词</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ink-700)]">{reversePrompt}</p>
                  </div>
                  <Button type="button" variant="seal" className="w-full" disabled={busy === "reverse-generate"} onClick={generateFromReversePrompt}>
                    <ImageIcon className="mr-2 size-4" />
                    生成图像并显示在这里
                  </Button>
                </div>
              ) : result ? <JsonBlock value={result.content} /> : (
                <div className="flex min-h-[340px] flex-col items-center justify-center rounded-[var(--radius-soft)] border border-dashed border-[var(--paper-300)] bg-[linear-gradient(180deg,rgba(255,255,255,0.56),rgba(247,244,235,0.42))] px-6 text-center">
                  <span className="mb-4 flex size-12 items-center justify-center rounded-[var(--radius-soft)] border border-[var(--ink-100)] bg-[var(--ink-50)] text-[var(--ink-700)]">
                    <IconAllInOne className="size-5" aria-hidden="true" />
                  </span>
                  <p className="font-[var(--font-display)] text-lg font-bold text-[var(--ink-800)]">等待生成结果</p>
                  <p className="mt-2 max-w-56 text-sm leading-6 text-[var(--ink-500)]">
                    选择左侧任意工具运行后，文本、报告或搜索结果会在这里集中呈现。
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
