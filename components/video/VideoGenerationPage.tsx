"use client"

/* eslint-disable @next/next/no-img-element -- Local upload previews and generated video posters are user-provided media. */

import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Download,
  FileImage,
  Film,
  ImagePlus,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  UploadCloud,
  Wand2,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import {
  AlertV2 as Alert,
  AlertV2Description as AlertDescription,
  BadgeV2 as Badge,
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Description as CardDescription,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle,
  InputV2 as Input,
  LabelV2 as Label,
  ProgressV2 as Progress,
  SelectV2 as Select,
  SelectV2Content as SelectContent,
  SelectV2Item as SelectItem,
  SelectV2Trigger as SelectTrigger,
  SelectV2Value as SelectValue,
  SwitchV2 as Switch,
  TextareaV2 as Textarea,
} from "@/components/ui/v2"
import { getRequiredAuthHeaders, getVerifiedAuthHeaders } from "@/lib/client-auth"
import { cn } from "@/lib/utils"

type VideoForm = {
  mode: "text" | "image"
  prompt: string
  model: string
  seconds: "3" | "5" | "10"
  ratio: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9"
  resolution: "720p" | "1080p"
  generateAudio: boolean
  watermark: boolean
  firstFrameUrl: string
  lastFrameUrl: string
}

type FrameSlot = "first" | "last"

type FrameAsset = {
  file?: File
  previewUrl?: string
  remoteUrl?: string
  uploading?: boolean
  error?: string
}

type MediaTaskStatus = "queued" | "running" | "completed" | "failed" | "expired" | "cancelled"

type MediaTaskOutput = {
  type: string
  url: string
  name?: string
  download_url?: string
  expires_at?: string
}

type MediaTask = {
  id: string
  status: MediaTaskStatus
  provider_status?: string | null
  progress: number
  stage?: string | null
  message: string
  outputs: MediaTaskOutput[]
  error: { message: string; code?: string | null } | null
  metadata?: Record<string, unknown>
  created_at?: string | null
  updated_at?: string | null
  completed_at?: string | null
}

type StudioTask = {
  id: string
  requestId: string
  prompt: string
  createdAt: string
  form: VideoForm
  status: MediaTaskStatus | "submitting"
  progress: number
  message: string
  pollUrl?: string
  videoUrl?: string
  downloadUrl?: string
  error?: string
  warnings?: string[]
}

const DRAFT_KEY = "shenxiang-video-studio-draft-v1"
const RECENT_KEY = "shenxiang-video-studio-recent-v1"
const POLL_TIMEOUT_MS = 10 * 60 * 1000

const DEFAULT_FORM: VideoForm = {
  mode: "text",
  prompt: "",
  model: "doubao-seedance-2-0-720p",
  seconds: "5",
  ratio: "16:9",
  resolution: "720p",
  generateAudio: false,
  watermark: false,
  firstFrameUrl: "",
  lastFrameUrl: "",
}

const MODEL_OPTIONS = [
  {
    value: "doubao-seedance-2-0-fast-260128",
    label: "Seedance 2.0 Fast",
    description: "快速草稿和社交短片",
    resolution: "720p",
  },
  {
    value: "doubao-seedance-2-0-720p",
    label: "Seedance 2.0 Pro 720p",
    description: "质量和速度更均衡",
    resolution: "720p",
  },
  {
    value: "doubao-seedance-2-0-1080p",
    label: "Seedance 2.0 Pro 1080p",
    description: "更高清，生成更慢",
    resolution: "1080p",
  },
] as const

const RATIO_OPTIONS = [
  { value: "16:9", label: "16:9 横屏", shape: "aspect-video" },
  { value: "9:16", label: "9:16 竖屏", shape: "aspect-[9/16]" },
  { value: "1:1", label: "1:1 方形", shape: "aspect-square" },
  { value: "4:3", label: "4:3 课件", shape: "aspect-[4/3]" },
  { value: "3:4", label: "3:4 竖版", shape: "aspect-[3/4]" },
  { value: "21:9", label: "21:9 宽银幕", shape: "aspect-[21/9]" },
] as const

const PROMPT_TEMPLATES = [
  "一间温暖的学习书房，桌面上摊开语文作文稿，镜头缓慢推进，纸页边缘有柔和晨光，真实电影感，细节清晰。",
  "国风水墨风的知识短片，墨绿色山水与课堂黑板自然融合，镜头从远景推到中心主题，节奏沉稳，高级教育品牌质感。",
  "一个学生在城市图书馆窗边整理错题本，镜头轻微手持，阳光穿过书架，画面真实自然，适合短视频开场。",
]

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function getOutputVideo(task?: MediaTask | null) {
  return task?.outputs?.find((item) => item.type === "video" && item.url)
}

function toFriendlyError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "")
  const text = raw.trim()
  const lower = text.toLowerCase()

  if (!text) return "视频生成服务暂时不可用，请稍后重试。"
  if (text.includes("请先登录") || text.includes("未授权") || lower.includes("unauthorized") || lower.includes("401")) {
    return "请先登录后再生成视频。"
  }
  if (text.includes("RELAYDANCE_GATEWAY_CONFIG_MISSING") || text.includes("视频网关未配置")) {
    return "视频生成服务还没有准备好，请稍后再试或联系管理员。"
  }
  if (text.includes("model not found")) {
    return "模型规格不匹配，请选择页面里的 Seedance 模型和清晰度组合。"
  }
  if (text.includes("InputImageSensitiveContentDetected") || text.includes("PrivacyInformation")) {
    return "参考图可能包含不适合生成的内容，请更换图片后再试。"
  }
  if (text.includes("prompt is too long") || text.includes("prompt is too short")) {
    return "提示词长度不合适，建议控制在 30 到 500 字。"
  }
  if (lower.includes("timeout") || text.includes("超时")) {
    return "视频生成等待超时，请稍后在历史任务里重新查看。"
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return "视频服务当前请求过多，请稍后再试。"
  }

  return text.replace(/RelayDance/gi, "视频服务").replace(/Dify/gi, "服务").slice(0, 180)
}

function nextPollDelay(startedAt: number) {
  const elapsed = Date.now() - startedAt
  if (elapsed < 15_000) return 1_000
  if (elapsed < 45_000) return 2_000
  return 3_000
}

function taskTone(status: StudioTask["status"]) {
  if (status === "completed") return "text-[var(--ink-700)]"
  if (status === "failed" || status === "expired" || status === "cancelled") return "text-[var(--seal-600)]"
  return "text-[var(--ink-500)]"
}

function statusLabel(status: StudioTask["status"]) {
  if (status === "submitting") return "提交中"
  if (status === "queued") return "排队中"
  if (status === "running") return "生成中"
  if (status === "completed") return "已完成"
  if (status === "failed") return "失败"
  if (status === "expired") return "已过期"
  return "已取消"
}

const GENERATION_PHASES = [
  { label: "提交中", detail: "正在整理提示词与参考帧。" },
  { label: "排队中", detail: "生成任务已进入队列，请保持页面打开。" },
  { label: "镜头生成中", detail: "正在按分镜生成动态画面。" },
  { label: "合成 MP4", detail: "正在合成视频文件和预览地址。" },
  { label: "可下载", detail: "视频已准备好，可以播放和下载。" },
] as const

function generationPhaseIndex(task: StudioTask) {
  if (task.videoUrl || task.status === "completed") return 4
  if (task.status === "submitting") return 0
  if (task.status === "queued") return 1
  if (task.progress >= 72) return 3
  if (task.progress >= 18) return 2
  return 1
}

function generationPhase(task: StudioTask) {
  return GENERATION_PHASES[generationPhaseIndex(task)]
}

function formatBytes(size?: number) {
  if (!size) return ""
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`
  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

function readPayloadText(payload: unknown) {
  if (!payload || typeof payload !== "object") return ""
  const record = payload as Record<string, unknown>
  return String(record.error || record.message || record.details || "")
}

async function readJson(response: Response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

function FrameDropzone({
  label,
  hint,
  asset,
  onPick,
  onClear,
  disabled,
}: {
  label: string
  hint: string
  asset: FrameAsset
  onPick: (file: File) => void
  onClear: () => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) onPick(file)
  }

  return (
    <div className="min-w-0 rounded-[var(--radius-soft)] border border-dashed border-[var(--paper-300)] bg-[var(--paper-100)]/60 p-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="group flex min-h-[172px] w-full flex-col items-center justify-center overflow-hidden rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] text-center outline-none transition hover:border-[var(--ink-300)] focus-visible:[box-shadow:var(--shadow-focus-ink)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {asset.previewUrl ? (
          <img src={asset.previewUrl} alt={label} className="h-full max-h-[184px] w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center px-4">
            <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-[var(--ink-50)] text-[var(--ink-600)]">
              {asset.uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            </span>
            <span className="text-sm font-semibold text-[var(--ink-800)]">{label}</span>
            <span className="mt-1 max-w-[16rem] text-xs leading-5 text-[var(--ink-500)]">{hint}</span>
          </span>
        )}
      </button>
      <div className="mt-3 flex min-h-8 items-center justify-between gap-3">
        <div className="min-w-0 text-xs leading-5 text-[var(--ink-500)]">
          {asset.file ? (
            <span className="block truncate">
              {asset.file.name} {formatBytes(asset.file.size)}
            </span>
          ) : (
            <span>PNG / JPG / WebP</span>
          )}
          {asset.error ? <span className="block text-[var(--seal-600)]">{asset.error}</span> : null}
          {asset.remoteUrl ? <span className="block text-[var(--ink-600)]">图片已上传，可作为参考帧</span> : null}
        </div>
        {asset.file || asset.remoteUrl || asset.error ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={disabled || asset.uploading}>
            清除
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] px-3 py-2">
      <p className="text-[11px] font-semibold text-[var(--ink-500)]">{label}</p>
      <p className="mt-1 text-sm font-bold text-[var(--ink-800)]">{value}</p>
    </div>
  )
}

function SelectField({
  label,
  value,
  onValueChange,
  children,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  )
}

function FilmGenerationLoader({ task }: { task: StudioTask }) {
  const activeIndex = generationPhaseIndex(task)
  const activePhase = generationPhase(task)
  const frames = ["分镜", "首帧", "镜头", "合成"]

  return (
    <div className="relative flex min-h-[320px] w-full flex-col items-center justify-center overflow-hidden p-5 text-center text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_26%),linear-gradient(135deg,rgba(184,201,187,0.12),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:100%_9px]" />
      <div className="relative w-full max-w-[560px]">
        <div className="mb-4 flex items-center justify-between gap-3 text-xs text-white/65">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 font-semibold">
            <Film className="size-3.5" />
            正在生成视频
          </span>
          <span className="font-mono">{Math.round(task.progress)}%</span>
        </div>

        <div className="relative overflow-hidden rounded-[var(--radius-soft)] border border-white/15 bg-black/35 p-4 shadow-2xl">
          <div className="absolute inset-x-0 top-0 h-3 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.22)_0_10px,transparent_10px_22px)] opacity-50" />
          <div className="absolute inset-x-0 bottom-0 h-3 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.22)_0_10px,transparent_10px_22px)] opacity-50" />
          <div className="pointer-events-none absolute inset-y-0 w-24 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)] animate-[sx-video-film-scan_2.4s_ease-in-out_infinite]" />
          <div className="grid grid-cols-4 gap-2 pt-3 pb-2">
            {frames.map((frame, index) => {
              const lit = index <= Math.min(activeIndex, 3)
              return (
                <div
                  key={frame}
                  className={cn(
                    "relative flex aspect-[4/3] items-end overflow-hidden rounded-[6px] border p-2 text-left transition",
                    lit ? "border-[var(--seal-300)] bg-[linear-gradient(135deg,rgba(255,255,255,0.2),rgba(184,201,187,0.22))] shadow-[0_0_22px_rgba(184,201,187,0.2)]" : "border-white/10 bg-white/[0.04]"
                  )}
                >
                  <div className={cn("absolute inset-0", lit ? "animate-[sx-video-frame-glow_1.8s_ease-in-out_infinite]" : "")} />
                  <span className="relative text-[11px] font-bold text-white/85">{frame}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-base font-bold">{activePhase.label}</p>
          <p className="mt-1 text-sm leading-6 text-white/65">{activePhase.detail}</p>
        </div>

        <div className="mt-5 grid grid-cols-5 gap-2 text-[11px] font-semibold text-white/55">
          {GENERATION_PHASES.map((phase, index) => (
            <div key={phase.label} className="min-w-0">
              <div
                className={cn(
                  "mx-auto mb-2 size-2.5 rounded-full border transition",
                  index < activeIndex ? "border-[var(--seal-300)] bg-[var(--seal-300)]" : index === activeIndex ? "border-white bg-white animate-[sx-video-dot-pulse_1.2s_ease-in-out_infinite]" : "border-white/25 bg-white/5"
                )}
              />
              <span className={cn("block truncate", index <= activeIndex ? "text-white/85" : "text-white/45")}>{phase.label}</span>
            </div>
          ))}
        </div>
      </div>
      <style jsx global>{`
        @keyframes sx-video-film-scan {
          0% { left: -28%; opacity: 0; }
          18% { opacity: 1; }
          82% { opacity: 1; }
          100% { left: 112%; opacity: 0; }
        }

        @keyframes sx-video-frame-glow {
          0%, 100% { opacity: 0.18; transform: translateY(0); }
          50% { opacity: 0.45; transform: translateY(-2px); }
        }

        @keyframes sx-video-dot-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.28); }
          50% { box-shadow: 0 0 0 7px rgba(255, 255, 255, 0); }
        }
      `}</style>
    </div>
  )
}

export function VideoGenerationPage() {
  const [form, setForm] = useState<VideoForm>(DEFAULT_FORM)
  const [firstFrame, setFirstFrame] = useState<FrameAsset>({})
  const [lastFrame, setLastFrame] = useState<FrameAsset>({})
  const [tasks, setTasks] = useState<StudioTask[]>([])
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const pollingRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) || tasks[0], [activeTaskId, tasks])
  const currentModel = MODEL_OPTIONS.find((item) => item.value === form.model) || MODEL_OPTIONS[1]
  const is1080p = form.resolution === "1080p"
  const canSubmit = form.prompt.trim().length > 0 && !submitting && !firstFrame.uploading && !lastFrame.uploading
  const promptCount = form.prompt.trim().length
  const selectedRatio = RATIO_OPTIONS.find((item) => item.value === form.ratio) || RATIO_OPTIONS[0]

  useEffect(() => {
    const stored = safeJsonParse<VideoForm>(window.localStorage.getItem(DRAFT_KEY), DEFAULT_FORM)
    const recent = safeJsonParse<StudioTask[]>(window.localStorage.getItem(RECENT_KEY), [])
    setForm({ ...DEFAULT_FORM, ...stored })
    setTasks(recent.slice(0, 8))
    setActiveTaskId(recent[0]?.id || null)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
  }, [form])

  useEffect(() => {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(tasks.slice(0, 8)))
  }, [tasks])

  useEffect(() => {
    return () => {
      Object.values(pollingRef.current).forEach((timer) => clearTimeout(timer))
      if (firstFrame.previewUrl) URL.revokeObjectURL(firstFrame.previewUrl)
      if (lastFrame.previewUrl) URL.revokeObjectURL(lastFrame.previewUrl)
    }
  }, [firstFrame.previewUrl, lastFrame.previewUrl])

  const updateForm = <K extends keyof VideoForm>(key: K, value: VideoForm[K]) => {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === "model") {
        if (value === "doubao-seedance-2-0-1080p") next.resolution = "1080p"
        if (value === "doubao-seedance-2-0-fast-260128") {
          next.resolution = "720p"
          next.generateAudio = false
        }
      }
      if (key === "resolution") {
        next.model = value === "1080p" ? "doubao-seedance-2-0-1080p" : next.model === "doubao-seedance-2-0-1080p" ? "doubao-seedance-2-0-720p" : next.model
      }
      if (key === "mode" && value === "text") {
        next.firstFrameUrl = ""
        next.lastFrameUrl = ""
      }
      return next
    })
  }

  const uploadFrame = async (slot: FrameSlot, file: File) => {
    setError("")
    const previewUrl = URL.createObjectURL(file)
    const setAsset = slot === "first" ? setFirstFrame : setLastFrame
    const previous = slot === "first" ? firstFrame.previewUrl : lastFrame.previewUrl
    if (previous) URL.revokeObjectURL(previous)
    setAsset({ file, previewUrl, uploading: true })
    updateForm("mode", "image")

    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("只支持 JPG、PNG 或 WebP 图片。")
      }
      if (file.size > 20 * 1024 * 1024) {
        throw new Error("参考图不能超过 20MB。")
      }

      const body = new FormData()
      body.append("file", file)
      body.append("model", "gpt-image-2")
      const response = await fetch("/api/dify-upload", {
        method: "POST",
        headers: {
          "X-Model": "gpt-image-2",
          ...(await getRequiredAuthHeaders()),
        },
        body,
      })
      const payload = await readJson(response)
      if (!response.ok || payload?.success === false) {
        throw new Error(readPayloadText(payload) || `图片上传失败：${response.status}`)
      }
      const remoteUrl = payload?.data?.model_url || payload?.data?.url || payload?.modelUrl || payload?.gatewayUrl
      if (!remoteUrl || typeof remoteUrl !== "string") {
        throw new Error("图片已经上传，但暂时无法用于视频生成，请重新上传。")
      }
      setAsset({ file, previewUrl, remoteUrl })
      if (slot === "first") updateForm("firstFrameUrl", remoteUrl)
      else updateForm("lastFrameUrl", remoteUrl)
    } catch (uploadError) {
      setAsset({ file, previewUrl, error: toFriendlyError(uploadError) })
      if (slot === "first") updateForm("firstFrameUrl", "")
      else updateForm("lastFrameUrl", "")
    }
  }

  const clearFrame = (slot: FrameSlot) => {
    if (slot === "first") {
      if (firstFrame.previewUrl) URL.revokeObjectURL(firstFrame.previewUrl)
      setFirstFrame({})
      updateForm("firstFrameUrl", "")
      return
    }
    if (lastFrame.previewUrl) URL.revokeObjectURL(lastFrame.previewUrl)
    setLastFrame({})
    updateForm("lastFrameUrl", "")
  }

  const applyTemplate = (template: string) => {
    updateForm("prompt", template)
  }

  const updateTask = (taskId: string, patch: Partial<StudioTask>) => {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, ...patch } : task))
  }

  const pollTask = async (taskId: string, pollUrl: string, startedAt: number) => {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      updateTask(taskId, { status: "expired", progress: 100, error: "视频生成等待超时，请稍后重新查看。", message: "任务等待超时" })
      return
    }

    try {
      const response = await fetch(pollUrl, {
        headers: await getVerifiedAuthHeaders(),
      })
      const payload = await readJson(response)
      if (!response.ok || payload?.success === false) {
        throw new Error(readPayloadText(payload) || `任务状态读取失败：${response.status}`)
      }

      const task = payload.task as MediaTask | undefined
      const output = getOutputVideo(task)
      const status = task?.status || "running"
      updateTask(taskId, {
        status,
        progress: typeof task?.progress === "number" ? task.progress : 50,
        message: task?.message || task?.stage || "视频生成中",
        videoUrl: output?.url,
        downloadUrl: output?.download_url || output?.url,
        error: task?.error?.message || undefined,
      })

      if (status === "completed" || status === "failed" || status === "expired" || status === "cancelled") return
      pollingRef.current[taskId] = setTimeout(() => pollTask(taskId, pollUrl, startedAt), nextPollDelay(startedAt))
    } catch (pollError) {
      updateTask(taskId, { status: "failed", progress: 100, error: toFriendlyError(pollError), message: "任务状态读取失败" })
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    if (!form.prompt.trim()) {
      setError("请先写好视频提示词。")
      return
    }
    if (form.mode === "image" && !form.firstFrameUrl && !firstFrame.remoteUrl) {
      setError("图生视频至少需要上传一张首帧图。")
      return
    }

    setSubmitting(true)
    const localTaskId = `local_${Date.now()}`
    const snapshot = { ...form, firstFrameUrl: form.firstFrameUrl || firstFrame.remoteUrl || "", lastFrameUrl: form.lastFrameUrl || lastFrame.remoteUrl || "" }
    const pendingTask: StudioTask = {
      id: localTaskId,
      requestId: localTaskId,
      prompt: snapshot.prompt,
      createdAt: new Date().toISOString(),
      form: snapshot,
      status: "submitting",
      progress: 3,
      message: "正在提交生成请求",
    }
    setTasks((current) => [pendingTask, ...current].slice(0, 8))
    setActiveTaskId(localTaskId)

    try {
      const response = await fetch("/api/media/video/relaydance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getVerifiedAuthHeaders()),
        },
        body: JSON.stringify({
          prompt: snapshot.prompt,
          model: snapshot.model,
          seconds: snapshot.seconds,
          ratio: snapshot.ratio,
          resolution: snapshot.resolution,
          generate_audio: snapshot.generateAudio,
          watermark: snapshot.watermark,
          first_frame_url: snapshot.firstFrameUrl || undefined,
          last_frame_url: snapshot.lastFrameUrl || undefined,
        }),
      })
      const payload = await readJson(response)
      if (!response.ok || payload?.success === false) {
        throw new Error(readPayloadText(payload) || `视频任务提交失败：${response.status}`)
      }

      const requestId = String(payload.request_id || payload.task_id || localTaskId)
      const pollUrl = String(payload.poll_url || `/api/media/tasks/${encodeURIComponent(requestId)}`)
      const warnings = Array.isArray(payload.warnings) ? payload.warnings.map(String) : []
      setTasks((current) => current.map((task) => task.id === localTaskId ? {
        ...task,
        id: requestId,
        requestId,
        status: "running",
        progress: 15,
        pollUrl,
        warnings,
        message: "视频任务已提交，正在生成",
      } : task))
      setActiveTaskId(requestId)
      pollingRef.current[requestId] = setTimeout(() => pollTask(requestId, pollUrl, Date.now()), 1000)
    } catch (submitError) {
      const message = toFriendlyError(submitError)
      setError(message)
      updateTask(localTaskId, { status: "failed", progress: 100, error: message, message: "提交失败" })
    } finally {
      setSubmitting(false)
    }
  }

  const clearRecent = () => {
    Object.values(pollingRef.current).forEach((timer) => clearTimeout(timer))
    pollingRef.current = {}
    setTasks([])
    setActiveTaskId(null)
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,var(--paper-50)_0%,#f7faf5_45%,var(--paper-100)_100%)] px-4 py-5 text-[var(--ink-900)] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[var(--radius-card)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-5 shadow-[var(--shadow-paper)] sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="ink">
                <Film className="size-3" />
                AI 视频创作
              </Badge>
              <Badge variant="paper">自动生成</Badge>
              <Badge variant="seal">完成后可在线播放和下载</Badge>
            </div>
            <div className="mt-5 max-w-3xl">
              <h1 className="font-[var(--font-display)] text-[28px] font-black leading-tight text-[var(--ink-900)] sm:text-[36px]">
                把分镜、首帧和提示词整理成一条可下载的视频
              </h1>
              <p className="mt-3 text-[15px] leading-7 text-[var(--ink-600)]">
                适合课程短片、知识卡片、作品展示和广场分享。提交后可以留在页面等待，完成后会自动出现视频结果。
              </p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Metric label="推荐时长" value={`${form.seconds} 秒`} />
              <Metric label="画幅" value={selectedRatio.label} />
              <Metric label="模型" value={currentModel.label} />
            </div>
          </div>

          <div className="relative min-h-[270px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--ink-200)] bg-[var(--ink-900)] shadow-[var(--shadow-elevated)]">
            <div className="absolute inset-0 opacity-80">
              <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,rgba(184,201,187,0.24),transparent_28%),linear-gradient(135deg,#0e1b11_0%,#203b25_50%,#2e4731_100%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:42px_42px]" />
            </div>
            <div className="relative flex h-full min-h-[270px] flex-col justify-between p-5 text-white">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold">
                  <Sparkles className="size-3.5" />
                  生成预览
                </span>
                <span className="font-mono text-xs text-white/70">24 FPS</span>
              </div>
              <div className={cn("mx-auto flex w-full max-w-[360px] items-center justify-center overflow-hidden rounded-[var(--radius-soft)] border border-white/15 bg-black/20 shadow-2xl", selectedRatio.shape)}>
                {activeTask?.videoUrl ? (
                  <video
                    src={activeTask.videoUrl}
                    controls
                    className="h-full w-full object-contain"
                  />
                ) : firstFrame.previewUrl ? (
                  <img src={firstFrame.previewUrl} alt="首帧预览" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
                    <Play className="mb-3 size-9 text-white/75" />
                    <p className="text-sm font-semibold">等待素材与提示词</p>
                    <p className="mt-1 text-xs leading-5 text-white/60">视频完成后会在这里播放</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs text-white/75">
                <span>写分镜</span>
                <span>生成画面</span>
                <span>完成视频</span>
              </div>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>素材与分镜</CardTitle>
                    <CardDescription>可以直接写文字生成视频；也可以上传开头画面，让视频从指定画面开始。</CardDescription>
                  </div>
                  <div className="inline-flex rounded-full border border-[var(--paper-300)] bg-[var(--paper-100)] p-1">
                    {[
                      { value: "text", label: "文生视频" },
                      { value: "image", label: "图生视频" },
                    ].map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => updateForm("mode", item.value as VideoForm["mode"])}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-sm font-semibold transition",
                          form.mode === item.value ? "bg-[var(--ink-600)] text-white shadow-sm" : "text-[var(--ink-600)] hover:bg-[var(--ink-50)]"
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-2">
                  <FrameDropzone
                    label="上传首帧"
                    hint="让视频从这张画面开始，适合保持人物、场景或构图一致。"
                    asset={firstFrame}
                    onPick={(file) => uploadFrame("first", file)}
                    onClear={() => clearFrame("first")}
                    disabled={submitting}
                  />
                  <FrameDropzone
                    label="上传尾帧"
                    hint="可先放入想要的结尾画面，当前会作为创作参考保留。"
                    asset={lastFrame}
                    onPick={(file) => uploadFrame("last", file)}
                    onClear={() => clearFrame("last")}
                    disabled={submitting}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstFrameUrl">首帧图片链接</Label>
                    <Input
                      id="firstFrameUrl"
                      value={form.firstFrameUrl}
                      onChange={(event) => {
                        updateForm("firstFrameUrl", event.target.value)
                        if (event.target.value.trim()) updateForm("mode", "image")
                      }}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastFrameUrl">尾帧图片链接</Label>
                    <Input
                      id="lastFrameUrl"
                      value={form.lastFrameUrl}
                      onChange={(event) => {
                        updateForm("lastFrameUrl", event.target.value)
                        if (event.target.value.trim()) updateForm("mode", "image")
                      }}
                      placeholder="https://...（可选）"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>视频提示词</CardTitle>
                    <CardDescription>建议写清主体、场景、镜头运动、光线、风格和节奏，适合控制在 30 到 500 字。</CardDescription>
                  </div>
                  <Badge variant={promptCount > 500 ? "seal" : "paper"}>{promptCount}/2000</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={form.prompt}
                  onChange={(event) => updateForm("prompt", event.target.value)}
                  placeholder="例如：Slow cinematic dolly-in, golden hour lighting..."
                  className="min-h-[180px]"
                  maxLength={2000}
                  invalid={promptCount > 0 && promptCount < 8}
                />
                <div className="grid gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-500)]">
                    <Wand2 className="size-3.5" />
                    快速套用
                  </div>
                  <div className="grid gap-2 lg:grid-cols-3">
                    {PROMPT_TEMPLATES.map((template, index) => (
                      <button
                        key={template}
                        type="button"
                        onClick={() => applyTemplate(template)}
                        className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)] p-3 text-left text-xs leading-5 text-[var(--ink-600)] transition hover:border-[var(--ink-300)] hover:bg-[var(--ink-50)] focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)]"
                      >
                        <span className="mb-1 block font-bold text-[var(--ink-800)]">镜头 {index + 1}</span>
                        {template}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-5">
            <Card className="xl:sticky xl:top-5">
              <CardHeader>
                <CardTitle>生成参数</CardTitle>
                <CardDescription>选择视频长度、画面比例和清晰度，提交后页面会自动等待结果。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <SelectField label="模型" value={form.model} onValueChange={(value) => updateForm("model", value)}>
                  {MODEL_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectField>

                <div className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)] p-3 text-xs leading-5 text-[var(--ink-600)]">
                  <span className="font-semibold text-[var(--ink-800)]">{currentModel.description}</span>
                  {form.model === "doubao-seedance-2-0-fast-260128" ? "；适合先看效果，速度更快。" : "；适合正式作品，画面更稳。"}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <SelectField label="时长" value={form.seconds} onValueChange={(value) => updateForm("seconds", value as VideoForm["seconds"])}>
                    <SelectItem value="3">3 秒</SelectItem>
                    <SelectItem value="5">5 秒</SelectItem>
                    <SelectItem value="10">10 秒</SelectItem>
                  </SelectField>
                  <SelectField label="清晰度" value={form.resolution} onValueChange={(value) => updateForm("resolution", value as VideoForm["resolution"])}>
                    <SelectItem value="720p">720p</SelectItem>
                    <SelectItem value="1080p">1080p</SelectItem>
                  </SelectField>
                </div>

                <SelectField label="画幅" value={form.ratio} onValueChange={(value) => updateForm("ratio", value as VideoForm["ratio"])}>
                  {RATIO_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectField>

                <div className="space-y-3 rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)] p-3">
                  <label className="flex items-center justify-between gap-3">
                    <span>
                      <span className="block text-sm font-semibold text-[var(--ink-800)]">生成音轨</span>
                      <span className="block text-xs leading-5 text-[var(--ink-500)]">为视频加入环境声或简单音效。</span>
                    </span>
                    <Switch
                      checked={form.generateAudio}
                      onCheckedChange={(checked) => updateForm("generateAudio", checked)}
                      disabled={form.model === "doubao-seedance-2-0-fast-260128"}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    <span>
                      <span className="block text-sm font-semibold text-[var(--ink-800)]">添加水印</span>
                      <span className="block text-xs leading-5 text-[var(--ink-500)]">默认关闭，正式作品更干净。</span>
                    </span>
                    <Switch checked={form.watermark} onCheckedChange={(checked) => updateForm("watermark", checked)} />
                  </label>
                </div>

                {is1080p ? (
                  <Alert>
                    <AlertCircle className="size-4" />
                    <AlertDescription>1080p 成本和生成时间更高，10 秒任务可能接近 10 分钟硬超时。</AlertDescription>
                  </Alert>
                ) : null}

                {error ? (
                  <Alert variant="error">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  生成视频
                </Button>
              </CardContent>
            </Card>
          </aside>
        </form>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>结果预览</CardTitle>
                  <CardDescription>生成完成后可以直接播放和下载；需要公开分享时，系统会再保存一份稳定版本。</CardDescription>
                </div>
                {activeTask?.downloadUrl ? (
                  <Button variant="seal" asChild>
                    <a href={activeTask.downloadUrl} target="_blank" rel="noreferrer">
                      <Download className="size-4" />
                      下载视频
                    </a>
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--ink-900)]">
                <div className={cn("mx-auto flex max-h-[620px] w-full items-center justify-center", selectedRatio.shape)}>
                  {activeTask?.videoUrl ? (
                    <video src={activeTask.videoUrl} controls className="h-full w-full object-contain" />
                  ) : (
                    activeTask && activeTask.status !== "failed" && activeTask.status !== "expired" && activeTask.status !== "cancelled" ? (
                      <FilmGenerationLoader task={activeTask} />
                    ) : (
                      <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center text-white">
                        <FileImage className="mb-4 size-11 text-white/70" />
                        <p className="font-semibold">还没有视频结果</p>
                        <p className="mt-2 text-sm text-white/60">提交任务后，结果会显示在这里。</p>
                      </div>
                    )
                  )}
                </div>
              </div>
              {activeTask ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className={cn("text-sm font-semibold", taskTone(activeTask.status))}>{statusLabel(activeTask.status)} · {activeTask.message}</p>
                    <span className="font-mono text-xs font-bold text-[var(--ink-500)]">{Math.round(activeTask.progress)}%</span>
                  </div>
                  <Progress value={activeTask.progress} />
                  {activeTask.error ? (
                    <Alert variant="error">
                      <AlertCircle className="size-4" />
                      <AlertDescription>{activeTask.error}</AlertDescription>
                    </Alert>
                  ) : null}
                  {activeTask.warnings?.length ? (
                    <Alert>
                      <AlertCircle className="size-4" />
                      <AlertDescription>{activeTask.warnings.join("；")}</AlertDescription>
                    </Alert>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>任务队列</CardTitle>
                  <CardDescription>最近 8 条本机任务。</CardDescription>
                </div>
                {tasks.length ? (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="清空任务队列" onClick={clearRecent}>
                    <RotateCcw className="size-4" />
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {tasks.length === 0 ? (
                <div className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)] p-4 text-sm leading-6 text-[var(--ink-500)]">
                  还没有生成任务。写好提示词后点击生成，队列会自动记录进度。
                </div>
              ) : tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setActiveTaskId(task.id)}
                  className={cn(
                    "w-full rounded-[var(--radius-soft)] border p-3 text-left transition focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)]",
                    activeTask?.id === task.id ? "border-[var(--ink-300)] bg-[var(--ink-50)]" : "border-[var(--paper-200)] bg-[var(--paper-100)] hover:border-[var(--ink-200)]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--ink-800)]">
                      {task.status === "completed" ? <CheckCircle2 className="size-4 text-[var(--ink-600)]" /> : task.status === "failed" ? <AlertCircle className="size-4 text-[var(--seal-600)]" /> : <Clock3 className="size-4 text-[var(--ink-500)]" />}
                      <span className="truncate">{task.prompt.split("\n")[0] || "视频任务"}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-[var(--ink-500)]">{statusLabel(task.status)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={task.progress} className="h-1.5" />
                    <span className="w-9 text-right font-mono text-[11px] text-[var(--ink-500)]">{Math.round(task.progress)}%</span>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-3 lg:grid-cols-3">
          {[
            ["清晰创作流程", "先准备画面素材，再写分镜提示词，最后选择时长、比例和清晰度。"],
            ["账号安全保护", "生成过程由服务器代为处理，页面不会暴露任何敏感凭据。"],
            ["分享更稳定", "自己预览和下载很快；发布到广场时，系统会保存成更适合长期展示的版本。"],
          ].map(([title, body]) => (
            <div key={title} className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--ink-800)]">
                <BadgeCheck className="size-4 text-[var(--ink-600)]" />
                {title}
              </div>
              <p className="text-sm leading-6 text-[var(--ink-500)]">{body}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
