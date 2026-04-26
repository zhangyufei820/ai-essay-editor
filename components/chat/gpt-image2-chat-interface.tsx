"use client"

import type React from "react"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Copy,
  Download,
  FileImage,
  History,
  Image as ImageIcon,
  Loader2,
  RefreshCcw,
  Sparkles,
  Trash2,
  UploadCloud,
  Wand2,
  X,
  Zap,
} from "lucide-react"
import { createClient } from "@supabase/supabase-js"
import { toast } from "sonner"

import { ModelLogo } from "@/components/ModelLogo"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { collapseSidebar, refreshCredits } from "@/components/app-sidebar"
import { extractUserId } from "@/lib/auth-user"
import { cn } from "@/lib/utils"
import {
  ASPECT_RATIO_OPTIONS,
  BACKGROUND_OPTIONS,
  DEFAULT_IMAGE_INPUTS,
  EDIT_MODE_DEFAULTS,
  type GptImageInputs,
  type GptImageModel,
  type ImageAspectRatio,
  type ImageBackground,
  type ImageModeration,
  type ImageOutputFormat,
  type ImageQuality,
  type ImageSize,
  type ImageTaskMode,
  MODERATION_OPTIONS,
  MODE_OPTIONS,
  MODEL_OPTIONS,
  OUTPUT_FORMAT_OPTIONS,
  QUALITY_OPTIONS,
  SIZE_OPTIONS,
  buildDifyInputs,
  clampCompression,
  clampImageCount,
  extractImageUrlsFromDifyResult,
  getAspectRatioForSize,
  isLargeSize,
  isOriginalSize,
  proxifyGeneratedImageUrl,
  resolveSizeForAspectRatio,
} from "@/components/chat/image-generation/gpt-image-v11"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || ""
const BRAND_GREEN = "var(--brand-900)"
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"]

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type UploadKind = "edit" | "mask"

type SelectedImage = {
  file: File
  previewUrl: string
}

type ImageResult = {
  imageUrls: string[]
  sourceText: string
  submittedInputs: GptImageInputs
  prompt: string
}

type ChatSession = {
  id: string
  title: string
  date: number
  preview: string
  ai_model: string
}

function createObjectUrl(file: File) {
  return URL.createObjectURL(file)
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function mapImageError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || "")
  const lower = raw.toLowerCase()

  if (raw === "empty_prompt") return "提示词不能为空。"
  if (raw === "missing_edit_image") return "图片编辑模式需要上传原图。"
  if (lower.includes("rate") || lower.includes("429")) return "上游图片接口限流，请稍后再试，或降低质量 / 切换模型。"
  if (raw.includes("未登录") || raw.includes("请先登录") || raw.includes("未授权") || lower.includes("unauthorized") || lower.includes("401")) {
    return "请先登录后再生成图片。"
  }
  if (lower.includes("download_file_error")) return "网关无法下载上传图片，请重新上传。"
  if (lower.includes("network") || lower.includes("failed to fetch")) return "网络请求失败，请稍后重试。"
  if (lower.includes("upstream_error") || lower.includes("dify error") || lower.includes("500")) {
    return "上游接口请求失败，可能是余额不足、模型不可用、尺寸不支持或参数不兼容。"
  }

  return raw || "图片生成失败，请稍后重试。"
}

function parseDifyResult(payload: unknown) {
  return extractImageUrlsFromDifyResult(payload)
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className="space-y-1 text-sm font-medium text-foreground">
      <span>{children}</span>
      {hint ? <span className="block text-xs font-normal leading-relaxed text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

function NativeSelect<T extends string>({
  value,
  onChange,
  options,
  disabledValues,
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; disabled?: boolean }>
  disabledValues?: T[]
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
    >
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled || disabledValues?.includes(option.value)}
        >
          {option.label}
        </option>
      ))}
    </select>
  )
}

function UploadPanel({
  title,
  description,
  image,
  disabled,
  onPick,
  onRemove,
}: {
  title: string
  description: string
  image: SelectedImage | null
  disabled?: boolean
  onPick: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const pickFile = (file?: File) => {
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("仅支持 png / jpg / jpeg / webp")
      return
    }
    onPick(file)
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-dashed bg-card p-4 transition",
        isDragging ? "border-primary bg-primary/5" : "border-border",
        disabled && "pointer-events-none opacity-50"
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setIsDragging(false)
        pickFile(event.dataTransfer.files?.[0])
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => pickFile(event.target.files?.[0])}
      />

      {image ? (
        <div className="flex gap-3">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
            <img src={image.previewUrl} alt={image.file.name} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{image.file.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatBytes(image.file.size)}</p>
              </div>
              <button type="button" onClick={onRemove} className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                重新上传
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center rounded-lg px-4 py-7 text-center transition hover:bg-muted/60"
        >
          <UploadCloud className="mb-3 h-7 w-7 text-primary" />
          <span className="text-sm font-medium text-foreground">{title}</span>
          <span className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</span>
        </button>
      )}
    </div>
  )
}

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open ? <div className="border-t border-border px-4 py-4">{children}</div> : null}
    </section>
  )
}

function GptImage2ChatInterfaceInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialPrompt = searchParams.get("prompt") ?? ""
  const initialMode = searchParams.get("mode")
  const initialSize = searchParams.get("size")

  const initialInputs = useMemo(() => {
    const base = initialMode === "image_edit" || initialMode === "image-edit"
      ? EDIT_MODE_DEFAULTS
      : DEFAULT_IMAGE_INPUTS
    return {
      ...base,
      size: SIZE_OPTIONS.some((option) => option.value === initialSize) ? (initialSize as ImageSize) : base.size,
    }
  }, [initialMode, initialSize])

  const [userId, setUserId] = useState("")
  const [userCredits, setUserCredits] = useState(0)
  const [mode, setMode] = useState<ImageTaskMode>(initialInputs.mode)
  const [prompt, setPrompt] = useState(initialPrompt)
  const [model, setModel] = useState<GptImageModel>(initialInputs.model)
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>(initialInputs.aspect_ratio)
  const [size, setSize] = useState<ImageSize>(initialInputs.size)
  const [quality, setQuality] = useState<ImageQuality>(initialInputs.quality)
  const [outputFormat, setOutputFormat] = useState<ImageOutputFormat>(initialInputs.output_format)
  const [outputCompression, setOutputCompression] = useState(initialInputs.output_compression)
  const [background, setBackground] = useState<ImageBackground>(initialInputs.background)
  const [moderation, setModeration] = useState<ImageModeration>(initialInputs.moderation)
  const [count, setCount] = useState(initialInputs.n)
  const [editImage, setEditImage] = useState<SelectedImage | null>(null)
  const [maskImage, setMaskImage] = useState<SelectedImage | null>(null)
  const [referenceGatewayUrl, setReferenceGatewayUrl] = useState("")
  const [maskGatewayUrl, setMaskGatewayUrl] = useState("")
  const [result, setResult] = useState<ImageResult | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStage, setSubmitStage] = useState("")
  const [showLongRunningHint, setShowLongRunningHint] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [maskOpen, setMaskOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [showHistorySidebar, setShowHistorySidebar] = useState(false)
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [authChecked, setAuthChecked] = useState(false)

  const currentSessionIdRef = useRef<string>("")
  const hasAutoSubmittedRef = useRef(false)

  const currentInputsWithoutUrls = useMemo(
    () => ({
      aspect_ratio: aspectRatio,
      size,
      model,
      quality,
      output_format: outputFormat,
      output_compression: outputCompression,
      background,
      moderation,
      n: count,
      mode,
    }),
    [aspectRatio, background, count, mode, model, moderation, outputCompression, outputFormat, quality, size]
  )

  const previewInputs = useMemo(
    () => buildDifyInputs(currentInputsWithoutUrls, referenceGatewayUrl, maskGatewayUrl),
    [currentInputsWithoutUrls, maskGatewayUrl, referenceGatewayUrl]
  )

  useEffect(() => {
    const userStr = typeof window !== "undefined" ? localStorage.getItem("currentUser") : null
    if (!userStr) {
      setAuthChecked(true)
      return
    }

    try {
      const user = JSON.parse(userStr)
      const uid = extractUserId(user)
      setUserId(uid)
      if (uid) void fetchCredits(uid)
    } catch {
      toast.error("用户信息解析失败，请重新登录")
    } finally {
      setAuthChecked(true)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (editImage?.previewUrl) URL.revokeObjectURL(editImage.previewUrl)
      if (maskImage?.previewUrl) URL.revokeObjectURL(maskImage.previewUrl)
    }
  }, [editImage?.previewUrl, maskImage?.previewUrl])

  useEffect(() => {
    if (showHistorySidebar && userId) void fetchChatSessions(userId)
  }, [showHistorySidebar, userId])

  const fetchCredits = async (uid: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/user/credits?user_id=${encodeURIComponent(uid)}`)
      if (!res.ok) return
      const data = await res.json()
      setUserCredits(data.credits || 0)
    } catch {
      // Credit display is helpful but should not block the image workspace.
    }
  }

  const fetchChatSessions = async (uid: string) => {
    try {
      const res = await fetch("/api/chat-session", { headers: { "X-User-Id": uid } })
      if (!res.ok) return
      const { sessions } = await res.json()
      const safeSessions = Array.isArray(sessions) ? sessions : []
      setChatSessions(
        safeSessions
          .filter((session: any) => session.ai_model === "gpt-image-2")
          .map((session: any) => ({
            id: session.id,
            title: session.title || "图像生成",
            date: new Date(session.created_at).getTime(),
            preview: session.preview || "",
            ai_model: session.ai_model || "gpt-image-2",
          }))
      )
    } catch {
      setChatSessions([])
    }
  }

  const applyMode = (nextMode: ImageTaskMode) => {
    setMode(nextMode)
    setReferenceGatewayUrl("")
    setMaskGatewayUrl("")

    if (nextMode === "image_edit") {
      setModel("gpt-image-2")
      setAspectRatio("auto")
      setSize("original_4k")
      setQuality("medium")
      setOutputFormat("png")
      setOutputCompression(100)
      setBackground("auto")
      setModeration("auto")
      setCount(1)
      return
    }

    if (isOriginalSize(size)) {
      setSize("1024x1024")
      setAspectRatio("1:1")
      toast.info("保持原图比例尺寸仅适用于图片编辑模式，已切换为 1024×1024。")
    }
  }

  const applySize = (nextSize: ImageSize) => {
    if (mode === "image_generate" && isOriginalSize(nextSize)) {
      setSize("1024x1024")
      setAspectRatio("1:1")
      toast.info("保持原图比例尺寸仅适用于图片编辑模式，已切换为 1024×1024。")
      return
    }

    setSize(nextSize)
    const derivedRatio = getAspectRatioForSize(nextSize)
    if (derivedRatio) setAspectRatio(derivedRatio)

    if ((nextSize === "3840x2160" || nextSize === "2160x3840" || nextSize === "original_4k") && model !== "gpt-image-2") {
      toast.warning("当前模型可能不支持 2K / 4K。建议切换到 GPT Image 2，或改用基础尺寸。", {
        action: {
          label: "使用 GPT Image 2",
          onClick: () => setModel("gpt-image-2"),
        },
      })
    }
  }

  const applyAspectRatio = (nextRatio: ImageAspectRatio) => {
    setAspectRatio(nextRatio)

    const resolved = resolveSizeForAspectRatio(nextRatio, size)
    if (resolved.size !== size) {
      setSize(resolved.size)
      if (resolved.message) toast.info(resolved.message)
    }
  }

  const applyModel = (nextModel: GptImageModel) => {
    setModel(nextModel)
    if (nextModel === "gpt-image-2" && background === "transparent") {
      setBackground("auto")
      toast.info("gpt-image-2 当前不推荐透明背景，请使用 auto 或 opaque。")
    }

    if (nextModel !== "gpt-image-2" && isLargeSize(size)) {
      toast.warning("当前模型可能不支持 2K / 4K。建议切换到 GPT Image 2，或改用基础尺寸。")
    }
  }

  const handleImagePick = (kind: UploadKind, file: File) => {
    const nextImage = { file, previewUrl: createObjectUrl(file) }
    if (kind === "edit") {
      if (editImage?.previewUrl) URL.revokeObjectURL(editImage.previewUrl)
      setEditImage(nextImage)
      setReferenceGatewayUrl("")
      if (mode !== "image_edit") {
        applyMode("image_edit")
        toast.info("已切换到图片编辑模式。")
      }
      return
    }

    if (maskImage?.previewUrl) URL.revokeObjectURL(maskImage.previewUrl)
    setMaskImage(nextImage)
    setMaskGatewayUrl("")
  }

  const removeImage = (kind: UploadKind) => {
    if (kind === "edit") {
      if (editImage?.previewUrl) URL.revokeObjectURL(editImage.previewUrl)
      setEditImage(null)
      setReferenceGatewayUrl("")
      return
    }

    if (maskImage?.previewUrl) URL.revokeObjectURL(maskImage.previewUrl)
    setMaskImage(null)
    setMaskGatewayUrl("")
  }

  async function uploadImageToGateway(file: File) {
    if (!userId) throw new Error("请先登录后再上传图片。")

    const formData = new FormData()
    formData.append("file", file)
    formData.append("user", userId)

    const res = await fetch(`${API_BASE}/api/dify-upload`, {
      method: "POST",
      headers: {
        "X-User-Id": userId,
        "X-Model": "gpt-image-2",
      },
      body: formData,
    })

    const json = await res.json().catch(() => ({}))

    if (!res.ok || !json.success || !json.gatewayUrl) {
      throw new Error(json.message || json.error || "图片上传失败")
    }

    return json.gatewayUrl as string
  }

  const submitImageTask = async (event?: React.FormEvent) => {
    event?.preventDefault()
    if (isSubmitting) return

    if (!userId) {
      const message = "请先登录后再生成图片。"
      setErrorMessage(message)
      toast.error(message)
      return
    }

    const cleanPrompt = prompt.trim()
    if (!cleanPrompt) {
      setErrorMessage(mapImageError("empty_prompt"))
      toast.error("提示词不能为空。")
      return
    }

    if (mode === "image_edit" && !editImage) {
      setErrorMessage(mapImageError("missing_edit_image"))
      toast.error("图片编辑模式需要上传原图。")
      return
    }

    if (size === "original_4k" && model !== "gpt-image-2") {
      toast.warning("非 GPT Image 2 会自动降级到基础尺寸。")
    }

    if ((size === "3840x2160" || size === "2160x3840" || size === "original_4k") && quality === "high") {
      toast.info("4K 高质量生成可能耗时较长，请耐心等待。")
    }

    setIsSubmitting(true)
    setErrorMessage("")
    setResult(null)
    setShowLongRunningHint(false)
    collapseSidebar()

    const longRunningTimer = window.setTimeout(() => {
      setShowLongRunningHint(true)
    }, 60_000)

    try {
      let referenceUrl = ""
      let maskUrl = ""

      if (mode === "image_edit") {
        setSubmitStage("正在上传图片")
        referenceUrl = await uploadImageToGateway(editImage!.file)
        setReferenceGatewayUrl(referenceUrl)

        if (maskImage) {
          maskUrl = await uploadImageToGateway(maskImage.file)
          setMaskGatewayUrl(maskUrl)
        }
      } else {
        setReferenceGatewayUrl("")
        setMaskGatewayUrl("")
      }

      const submittedInputs = buildDifyInputs(currentInputsWithoutUrls, referenceUrl, maskUrl)

      setSubmitStage("正在生成图片")

      const response = await fetch(`${API_BASE}/api/dify-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: JSON.stringify({
          query: cleanPrompt,
          inputs: submittedInputs,
          userId,
          conversation_id: currentSessionIdRef.current || undefined,
          model: "gpt-image-2",
        }),
      })

      const payload = await response.json().catch(async () => ({ answer: await response.text() }))

      if (!response.ok) {
        throw new Error(payload?.error || `upstream_error:${response.status}`)
      }

      const imageUrls = parseDifyResult(payload).map(proxifyGeneratedImageUrl)
      const sourceText =
        typeof payload?.answer === "string"
          ? payload.answer
          : typeof payload?.data?.outputs?.text === "string"
            ? payload.data.outputs.text
            : ""

      if (imageUrls.length === 0 && !sourceText) {
        throw new Error("upstream_error: empty image result")
      }

      const nextResult = {
        imageUrls,
        sourceText,
        submittedInputs,
        prompt: cleanPrompt,
      }
      setResult(nextResult)

      await saveGeneration(cleanPrompt, nextResult)

      setPrompt("")
      toast.success("图片任务已完成")
      if (userId) void fetchCredits(userId)
      refreshCredits()
    } catch (error) {
      const message = mapImageError(error)
      setErrorMessage(message)
      toast.error(message)
    } finally {
      window.clearTimeout(longRunningTimer)
      setIsSubmitting(false)
      setSubmitStage("")
    }
  }

  useEffect(() => {
    if (!authChecked || !userId || hasAutoSubmittedRef.current) return
    if (!initialPrompt.trim() || !prompt.trim()) return
    if (mode === "image_edit" && !editImage) return

    hasAutoSubmittedRef.current = true
    void submitImageTask()
  }, [authChecked, editImage, initialPrompt, mode, prompt, userId])

  const saveGeneration = async (cleanPrompt: string, nextResult: ImageResult) => {
    if (!userId) return

    try {
      const sid = currentSessionIdRef.current || Date.now().toString()
      currentSessionIdRef.current = sid
      const preview = cleanPrompt.slice(0, 40)
      const content = nextResult.imageUrls.length > 0
        ? nextResult.imageUrls.map((url) => `![Generated Image](${url})`).join("\n\n")
        : nextResult.sourceText

      const { data: existing } = await supabase.from("chat_sessions").select("id").eq("id", sid).single()

      if (!existing) {
        await supabase.from("chat_sessions").insert({
          id: sid,
          user_id: userId,
          title: "图像生成",
          preview,
          ai_model: "gpt-image-2",
        })
      } else {
        await supabase.from("chat_sessions").update({ preview, ai_model: "gpt-image-2" }).eq("id", sid)
      }

      await supabase.from("chat_messages").insert([
        { session_id: sid, role: "user", content: cleanPrompt },
        { session_id: sid, role: "assistant", content },
      ])
    } catch {
      // History persistence should not make a successful image task fail.
    }
  }

  const copyText = async (text: string, successText = "已复制") => {
    await navigator.clipboard.writeText(text)
    toast.success(successText)
  }

  const canSubmit = Boolean(userId) && Boolean(prompt.trim()) && !isSubmitting && (mode === "image_generate" || Boolean(editImage))

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="返回"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <ModelLogo modelKey="gpt-image-2" size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">图像生成 / 图像编辑</div>
            <div className="hidden text-xs text-muted-foreground sm:block">V11 Reference URL 工作流</div>
          </div>
          {userId ? (
            <div className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary sm:block">
              {userCredits.toLocaleString()} 积分
            </div>
          ) : (
            <Button size="sm" onClick={() => router.push("/login")} style={{ backgroundColor: BRAND_GREEN }}>
              登录
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setShowHistorySidebar(true)}>
            <History className="mr-2 h-4 w-4" />
            历史
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-5">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex gap-4">
              <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-semibold text-foreground">AI 图像工作台</h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  支持文生图与上传图片编辑。日常推荐 gpt-image-1 + 1024×1024 + medium；需要 4K 或高质量作品时，选择 gpt-image-2，并使用 3840×2160 或 2160×3840。图片编辑时，系统会先上传原图，再自动传入 Dify。
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={submitImageTask} className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg bg-muted p-1">
                  {MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => applyMode(option.value)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition",
                        mode === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {option.value === "image_generate" ? <Wand2 className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <FieldLabel>提示词</FieldLabel>
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="请输入图片生成或图片编辑提示词，例如：不要改变图片元素，放大至4K。"
                  className="min-h-[160px] resize-y rounded-xl border-border bg-background text-base leading-7"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {mode === "image_edit" ? (
              <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">图片编辑素材</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    上传需要编辑的原图。系统会先上传到图片网关，再自动传入 Dify。
                  </p>
                </div>

                <UploadPanel
                  title="编辑图片"
                  description="点击上传或拖拽图片到这里，支持 png / jpg / jpeg / webp。"
                  image={editImage}
                  disabled={isSubmitting}
                  onPick={(file) => handleImagePick("edit", file)}
                  onRemove={() => removeImage("edit")}
                />

                <CollapsibleSection title="蒙版图片，可选" open={maskOpen} onToggle={() => setMaskOpen((value) => !value)}>
                  <UploadPanel
                    title="蒙版图片"
                    description="用于局部编辑。普通换风格、放大、增强清晰度不需要上传蒙版。"
                    image={maskImage}
                    disabled={isSubmitting}
                    onPick={(file) => handleImagePick("mask", file)}
                    onRemove={() => removeImage("mask")}
                  />
                </CollapsibleSection>
              </div>
            ) : null}

            {errorMessage ? (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            {showLongRunningHint ? (
              <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
                <Zap className="mt-0.5 h-4 w-4 shrink-0" />
                <span>图片生成仍在处理中，复杂图像可能需要更久。</span>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {mode === "image_edit" && !editImage ? "图片编辑模式需要上传原图。" : "参数已准备好，提交后由服务端安全调用 Dify。"}
              </div>
              <Button
                type="submit"
                disabled={!canSubmit}
                className="h-11 rounded-lg px-5 text-white"
                style={{ backgroundColor: BRAND_GREEN }}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {isSubmitting ? submitStage || "处理中" : mode === "image_edit" ? "开始编辑" : "开始生成"}
              </Button>
            </div>
          </form>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">结果展示</h2>
                <p className="mt-1 text-xs text-muted-foreground">生成成功后可下载或复制图片地址。</p>
              </div>
              {result ? <CheckCircle2 className="h-5 w-5 text-primary" /> : null}
            </div>

            {isSubmitting ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-border bg-muted/40 text-center">
                <Loader2 className="mb-3 h-7 w-7 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">{submitStage || "正在处理"}</p>
                <p className="mt-1 text-xs text-muted-foreground">请保持页面打开，复杂图片会多花一点时间。</p>
              </div>
            ) : result ? (
              <div className="space-y-4">
                {result.imageUrls.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {result.imageUrls.map((url, index) => (
                      <div key={`${url}-${index}`} className="overflow-hidden rounded-xl border border-border bg-background">
                        <img src={url} alt={`生成结果 ${index + 1}`} className="aspect-square w-full object-contain bg-muted" />
                        <div className="space-y-3 border-t border-border p-3">
                          <p className="break-all text-xs text-muted-foreground">{url}</p>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" asChild>
                              <a href={url} download target="_blank" rel="noopener noreferrer">
                                <Download className="mr-2 h-4 w-4" />
                                下载
                              </a>
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => copyText(url, "图片地址已复制")}>
                              <Copy className="mr-2 h-4 w-4" />
                              复制图片地址
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-7 text-muted-foreground">
                    {result.sourceText || "Dify 已返回结果，但没有检测到图片链接。"}
                  </div>
                )}

                <div className="grid gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground sm:grid-cols-5">
                  <span>模式：{result.submittedInputs.mode === "image_edit" ? "图片编辑" : "文生图"}</span>
                  <span>模型：{result.submittedInputs.model}</span>
                  <span>尺寸：{result.submittedInputs.size}</span>
                  <span>质量：{result.submittedInputs.quality}</span>
                  <span>格式：{result.submittedInputs.output_format}</span>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-center">
                <FileImage className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">还没有生成结果</p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">填写提示词和参数后，结果会出现在这里。</p>
              </div>
            )}
          </section>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-[72px] lg:h-[calc(100vh-88px)] lg:overflow-y-auto">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-4 text-sm font-semibold text-foreground">基础参数</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabel>图像模型</FieldLabel>
                <NativeSelect value={model} onChange={applyModel} options={MODEL_OPTIONS} />
                {model !== "gpt-image-2" && isLargeSize(size) ? (
                  <div className="rounded-lg bg-amber-500/10 p-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                    当前模型可能不支持 2K / 4K。建议切换到 GPT Image 2，或改用基础尺寸。
                    {size === "original_4k" ? " 非 GPT Image 2 会自动降级到基础尺寸。" : null}
                    <button type="button" onClick={() => setModel("gpt-image-2")} className="ml-2 font-semibold underline">
                      使用 GPT Image 2
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <FieldLabel hint="画幅比例是辅助参数，真正输出尺寸由 size 决定。">画幅比例</FieldLabel>
                <NativeSelect value={aspectRatio} onChange={applyAspectRatio} options={ASPECT_RATIO_OPTIONS} />
              </div>

              <div className="space-y-2">
                <FieldLabel>图片尺寸</FieldLabel>
                <NativeSelect
                  value={size}
                  onChange={applySize}
                  options={SIZE_OPTIONS.map((option) => ({
                    ...option,
                    disabled: option.editOnly && mode === "image_generate",
                  }))}
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>生成质量</FieldLabel>
                <NativeSelect value={quality} onChange={setQuality} options={QUALITY_OPTIONS} />
              </div>

              <div className="space-y-2">
                <FieldLabel>图片格式</FieldLabel>
                <NativeSelect value={outputFormat} onChange={setOutputFormat} options={OUTPUT_FORMAT_OPTIONS} />
              </div>

              <div className="space-y-2">
                <FieldLabel>生成张数</FieldLabel>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={count}
                  onChange={(event) => setCount(clampImageCount(Number(event.target.value)))}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </section>

          <CollapsibleSection title="高级参数" open={advancedOpen} onToggle={() => setAdvancedOpen((value) => !value)}>
            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabel>压缩率</FieldLabel>
                {outputFormat === "png" ? (
                  <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">PNG 格式下压缩率已禁用，提交时保留 100。</div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={outputCompression}
                      onChange={(event) => setOutputCompression(clampCompression(Number(event.target.value)))}
                      className="w-full accent-primary"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={outputCompression}
                      onChange={(event) => setOutputCompression(clampCompression(Number(event.target.value)))}
                      className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <FieldLabel>背景模式</FieldLabel>
                <NativeSelect
                  value={background}
                  onChange={setBackground}
                  options={BACKGROUND_OPTIONS.map((option) => ({
                    ...option,
                    disabled: model === "gpt-image-2" && option.value === "transparent",
                  }))}
                />
                {model === "gpt-image-2" ? (
                  <p className="text-xs text-muted-foreground">gpt-image-2 当前不推荐透明背景，请使用 auto 或 opaque。</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <FieldLabel>审核强度</FieldLabel>
                <NativeSelect value={moderation} onChange={setModeration} options={MODERATION_OPTIONS} />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="参数预览" open={previewOpen} onToggle={() => setPreviewOpen((value) => !value)}>
            <div className="space-y-2 text-xs">
              {[
                ["mode", previewInputs.mode],
                ["model", previewInputs.model],
                ["aspect_ratio", previewInputs.aspect_ratio],
                ["size", previewInputs.size],
                ["quality", previewInputs.quality],
                ["output_format", previewInputs.output_format],
                ["output_compression", previewInputs.output_compression],
                ["background", previewInputs.background],
                ["moderation", previewInputs.moderation],
                ["n", previewInputs.n],
                ["reference_image_url 是否已生成", Boolean(previewInputs.reference_image_url)],
                ["mask_image_url 是否已生成", Boolean(previewInputs.mask_image_url)],
              ].map(([key, value]) => (
                <div key={String(key)} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
                  <span className="text-muted-foreground">{key}</span>
                  <span className="font-mono text-foreground">{String(value)}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </aside>
      </main>

      {showHistorySidebar ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="关闭历史"
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowHistorySidebar(false)}
          />
          <div className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">历史图像任务</span>
              <button type="button" className="rounded-lg p-2 hover:bg-muted" onClick={() => setShowHistorySidebar(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {chatSessions.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">暂无历史记录</div>
              ) : (
                chatSessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className="w-full rounded-lg px-3 py-3 text-left transition hover:bg-muted"
                    onClick={() => {
                      currentSessionIdRef.current = session.id
                      setPrompt(session.preview)
                      setShowHistorySidebar(false)
                    }}
                  >
                    <div className="truncate text-sm font-medium text-foreground">{session.title}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{session.preview}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function GptImage2ChatInterface() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <GptImage2ChatInterfaceInner />
    </Suspense>
  )
}
