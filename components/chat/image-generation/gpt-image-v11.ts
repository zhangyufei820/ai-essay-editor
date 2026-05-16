export type ImageTaskMode = "image_generate" | "image_edit"
export type GeminiImageModel = "gemini-3.1-flash-image-preview" | "gemini-3-pro-image-preview"
export type GptImageModel = "gpt-image-2" | "gpt-image-1.5" | "gpt-image-1" | "gpt-image-1-mini" | GeminiImageModel
export type ImageAspectRatio =
  | "auto"
  | "1:1"
  | "16:9"
  | "9:16"
  | "4:3"
  | "3:4"
  | "3:2"
  | "2:3"
  | "21:9"
  | "9:21"
  | "2:1"
  | "1:2"
  | "3:1"
  | "1:3"
  | "4:5"
  | "5:4"
  | "4:1"
  | "1:4"
  | "8:1"
  | "1:8"
export type ImageSize =
  | "auto"
  | "512"
  | "1K"
  | "2K"
  | "4K"
  | "original_1k"
  | "original_2k"
  | "original_4k"
  | "1024x1024"
  | "1536x1024"
  | "1024x1536"
  | "2048x2048"
  | "2048x1152"
  | "1152x2048"
  | "3840x2160"
  | "2160x3840"
export type ImageQuality = "auto" | "low" | "medium" | "high"
export type ImageOutputFormat = "png" | "jpeg" | "webp"
export type ImageBackground = "auto" | "opaque" | "transparent"
export type ImageModeration = "auto" | "low"

export interface GptImageInputs {
  provider?: "openai" | "google"
  aspect_ratio: ImageAspectRatio
  size: ImageSize
  image_size?: "auto" | "512" | "1K" | "2K" | "4K"
  model: GptImageModel
  quality: ImageQuality
  output_format: ImageOutputFormat
  output_compression: number
  background: ImageBackground
  moderation: ImageModeration
  n: number
  mode: ImageTaskMode
  response_modalities?: string[]
  reference_image_url: string
  reference_image_urls: string[]
  mask_image_url: string
}

export interface Option<T extends string> {
  value: T
  label: string
  description?: string
  editOnly?: boolean
}

export const MODE_OPTIONS: Option<ImageTaskMode>[] = [
  { label: "文生图", value: "image_generate" },
  { label: "图片编辑", value: "image_edit" },
]

export const MODEL_OPTIONS: Option<GptImageModel>[] = [
  { label: "GPT Image 2｜最高质量，支持 2K / 4K", value: "gpt-image-2" },
  { label: "GPT Image 1.5｜质量与速度折中", value: "gpt-image-1.5" },
  { label: "GPT Image 1｜默认推荐，稳定经济", value: "gpt-image-1" },
  { label: "GPT Image 1 Mini｜快速测试，低成本", value: "gpt-image-1-mini" },
]

export const GEMINI_MODEL_OPTIONS: Option<GeminiImageModel>[] = [
  { label: "Gemini 3.1 Flash Image｜速度快，支持超宽比例", value: "gemini-3.1-flash-image-preview" },
  { label: "Gemini 3 Pro Image｜更强理解与画面质量", value: "gemini-3-pro-image-preview" },
]

export const ASPECT_RATIO_OPTIONS: Option<ImageAspectRatio>[] = [
  { label: "自动", value: "auto" },
  { label: "正方形 1:1", value: "1:1" },
  { label: "横图 16:9", value: "16:9" },
  { label: "竖图 9:16", value: "9:16" },
  { label: "横图 4:3", value: "4:3" },
  { label: "竖图 3:4", value: "3:4" },
  { label: "横图 3:2", value: "3:2" },
  { label: "竖图 2:3", value: "2:3" },
  { label: "超宽横图 21:9", value: "21:9" },
  { label: "超高竖图 9:21", value: "9:21" },
  { label: "横图 2:1", value: "2:1" },
  { label: "竖图 1:2", value: "1:2" },
  { label: "超宽横图 3:1", value: "3:1" },
  { label: "超高竖图 1:3", value: "1:3" },
]

export const GEMINI_ASPECT_RATIO_OPTIONS: Option<ImageAspectRatio>[] = [
  { label: "正方形 1:1", value: "1:1" },
  { label: "横图 16:9", value: "16:9" },
  { label: "竖图 9:16", value: "9:16" },
  { label: "横图 4:3", value: "4:3" },
  { label: "竖图 3:4", value: "3:4" },
  { label: "横图 3:2", value: "3:2" },
  { label: "竖图 2:3", value: "2:3" },
  { label: "竖图 4:5", value: "4:5" },
  { label: "横图 5:4", value: "5:4" },
  { label: "超宽横图 4:1", value: "4:1" },
  { label: "超高竖图 1:4", value: "1:4" },
  { label: "极宽横图 8:1", value: "8:1" },
  { label: "极高竖图 1:8", value: "1:8" },
]

export const SIZE_OPTIONS: Option<ImageSize>[] = [
  { label: "自动选择", value: "auto" },
  { label: "保持原图比例，标准清晰度｜图片编辑专用", value: "original_1k", editOnly: true },
  { label: "保持原图比例，2K｜图片编辑专用", value: "original_2k", editOnly: true },
  { label: "保持原图比例，4K｜仅推荐 GPT Image 2，图片编辑专用", value: "original_4k", editOnly: true },
  { label: "标准正方形 1024×1024", value: "1024x1024" },
  { label: "标准横图 1536×1024", value: "1536x1024" },
  { label: "标准竖图 1024×1536", value: "1024x1536" },
  { label: "2K 正方形 2048×2048", value: "2048x2048" },
  { label: "2K 横图 2048×1152", value: "2048x1152" },
  { label: "2K 竖图 1152×2048", value: "1152x2048" },
  { label: "4K 横图 3840×2160", value: "3840x2160" },
  { label: "4K 竖图 2160×3840", value: "2160x3840" },
]

export const GEMINI_IMAGE_SIZE_OPTIONS: Option<ImageSize>[] = [
  { label: "自动选择", value: "auto" },
  { label: "512｜快速预览", value: "512" },
  { label: "1K｜默认推荐", value: "1K" },
  { label: "2K｜高清", value: "2K" },
  { label: "4K｜高质量", value: "4K" },
]

export const QUALITY_OPTIONS: Option<ImageQuality>[] = [
  { label: "自动", value: "auto" },
  { label: "快速草稿", value: "low" },
  { label: "标准质量", value: "medium" },
  { label: "高质量", value: "high" },
]

export const OUTPUT_FORMAT_OPTIONS: Option<ImageOutputFormat>[] = [
  { label: "PNG｜高质量，默认推荐", value: "png" },
  { label: "JPEG｜体积小", value: "jpeg" },
  { label: "WebP｜适合网页", value: "webp" },
]

export const BACKGROUND_OPTIONS: Option<ImageBackground>[] = [
  { label: "自动", value: "auto" },
  { label: "不透明背景", value: "opaque" },
  { label: "透明背景", value: "transparent" },
]

export const MODERATION_OPTIONS: Option<ImageModeration>[] = [
  { label: "标准审核", value: "auto" },
  { label: "较低限制", value: "low" },
]

export const DEFAULT_IMAGE_INPUTS: GptImageInputs = {
  provider: "openai",
  mode: "image_generate",
  model: "gpt-image-1",
  aspect_ratio: "1:1",
  size: "1024x1024",
  quality: "medium",
  output_format: "png",
  output_compression: 100,
  background: "auto",
  moderation: "auto",
  n: 1,
  reference_image_url: "",
  reference_image_urls: [],
  mask_image_url: "",
}

export const EDIT_MODE_DEFAULTS: GptImageInputs = {
  provider: "openai",
  mode: "image_edit",
  model: "gpt-image-2",
  aspect_ratio: "auto",
  size: "original_4k",
  quality: "medium",
  output_format: "png",
  output_compression: 100,
  background: "auto",
  moderation: "auto",
  n: 1,
  reference_image_url: "",
  reference_image_urls: [],
  mask_image_url: "",
}

export const GEMINI_IMAGE_DEFAULT_INPUTS: GptImageInputs = {
  provider: "google",
  mode: "image_generate",
  model: "gemini-3.1-flash-image-preview",
  aspect_ratio: "1:1",
  size: "1K",
  image_size: "1K",
  quality: "medium",
  output_format: "png",
  output_compression: 100,
  background: "auto",
  moderation: "auto",
  n: 1,
  response_modalities: ["TEXT", "IMAGE"],
  reference_image_url: "",
  reference_image_urls: [],
  mask_image_url: "",
}

export const GEMINI_IMAGE_EDIT_DEFAULTS: GptImageInputs = {
  ...GEMINI_IMAGE_DEFAULT_INPUTS,
  mode: "image_edit",
}

const SIZE_TO_RATIO: Partial<Record<ImageSize, ImageAspectRatio>> = {
  "1024x1024": "1:1",
  "2048x2048": "1:1",
  "1536x1024": "16:9",
  "2048x1152": "16:9",
  "3840x2160": "16:9",
  "1024x1536": "9:16",
  "1152x2048": "9:16",
  "2160x3840": "9:16",
}

export function isOriginalSize(size: ImageSize): boolean {
  return size === "original_1k" || size === "original_2k" || size === "original_4k"
}

export function isLargeSize(size: ImageSize): boolean {
  return size === "2K" || size === "4K" || size === "2048x2048" || size === "2048x1152" || size === "1152x2048" || size === "3840x2160" || size === "2160x3840" || size === "original_4k"
}

export function getAspectRatioForSize(size: ImageSize): ImageAspectRatio | null {
  return SIZE_TO_RATIO[size] ?? null
}

export function resolveSizeForAspectRatio(
  aspectRatio: ImageAspectRatio,
  size: ImageSize
): { size: ImageSize; message?: string } {
  if (isOriginalSize(size)) return { size }

  if (aspectRatio === "9:16" && size === "3840x2160") {
    return {
      size: "2160x3840",
      message: "你选择的是竖图比例，已自动切换为 4K 竖图 2160×3840。",
    }
  }

  if (aspectRatio === "16:9" && size === "2160x3840") {
    return {
      size: "3840x2160",
      message: "你选择的是横图比例，已自动切换为 4K 横图 3840×2160。",
    }
  }

  if (aspectRatio === "1:1" && (size === "3840x2160" || size === "2160x3840")) {
    return {
      size: "2048x2048",
      message: "你选择的是正方形比例，已自动切换为 2048×2048。",
    }
  }

  return { size }
}

export function clampImageCount(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(4, Math.max(1, Math.round(value)))
}

export function clampCompression(value: number): number {
  if (!Number.isFinite(value)) return 100
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function buildDifyInputs(
  values: Omit<GptImageInputs, "reference_image_url" | "reference_image_urls" | "mask_image_url">,
  referenceImageUrl: string | string[] = "",
  maskImageUrl = ""
): GptImageInputs {
  const referenceImageUrls = Array.isArray(referenceImageUrl)
    ? referenceImageUrl.filter(Boolean)
    : referenceImageUrl
      ? [referenceImageUrl]
      : []

  if (String(values.model).startsWith("gemini-")) {
    const geminiSize = (values.image_size || values.size || "1K") as "auto" | "512" | "1K" | "2K" | "4K"
    return {
      provider: "google",
      aspect_ratio: values.aspect_ratio,
      size: geminiSize,
      image_size: geminiSize,
      model: values.model,
      quality: values.quality,
      output_format: values.output_format,
      output_compression: clampCompression(values.output_compression),
      background: values.background,
      moderation: values.moderation,
      n: clampImageCount(values.n),
      mode: values.mode,
      response_modalities: ["TEXT", "IMAGE"],
      reference_image_url: referenceImageUrls[0] || "",
      reference_image_urls: referenceImageUrls,
      mask_image_url: "",
    }
  }

  return {
    provider: values.provider || "openai",
    aspect_ratio: values.aspect_ratio,
    size: values.size,
    model: values.model,
    quality: values.quality,
    output_format: values.output_format,
    output_compression: clampCompression(values.output_compression),
    background: values.background,
    moderation: values.moderation,
    n: clampImageCount(values.n),
    mode: values.mode,
    reference_image_url: referenceImageUrls[0] || "",
    reference_image_urls: referenceImageUrls,
    mask_image_url: maskImageUrl,
  }
}

export function extractImageUrlsFromDifyResult(payload: unknown): string[] {
  const urls = new Set<string>()
  const markdownImageRegex = /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/g
  const plainImageUrlRegex = /(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>]*)?)/gi

  const visit = (value: unknown) => {
    if (!value) return

    if (typeof value === "string") {
      let markdownMatch: RegExpExecArray | null
      while ((markdownMatch = markdownImageRegex.exec(value)) !== null) {
        urls.add(markdownMatch[1])
      }

      let urlMatch: RegExpExecArray | null
      while ((urlMatch = plainImageUrlRegex.exec(value)) !== null) {
        urls.add(urlMatch[1])
      }

      if (value.startsWith("http://") || value.startsWith("https://")) {
        urls.add(value)
      }

      try {
        const parsed = JSON.parse(value)
        visit(parsed)
      } catch {
        // Keep string parsing permissive; most answers are plain text.
      }
      return
    }

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    if (typeof value !== "object") return

    const record = value as Record<string, unknown>
    visit(record.answer)
    visit(record.image_url)
    visit(record.image_urls)
    visit(record.url)
    visit(record.urls)
    visit(record.first_url)
    visit(record.image)
    visit(record.images)
    visit(record.file)
    visit(record.files)
    visit(record.data)
    visit(record.outputs)
    visit(record.result)
    visit(record.text)
    visit(record.raw_body)
  }

  visit(payload)
  return Array.from(urls)
}

type ImageProxyOptions = {
  raw?: boolean
  width?: number
  format?: ImageOutputFormat
  download?: boolean
}

function getImageProxyExtension(url: string, raw?: boolean, format?: ImageOutputFormat) {
  if (format === "jpeg") return "jpg"
  if (format) return format
  if (!raw) return "webp"

  try {
    const pathname = new URL(url).pathname.toLowerCase()
    if (pathname.endsWith(".jpg")) return "jpg"
    if (pathname.endsWith(".jpeg")) return "jpg"
    if (pathname.endsWith(".webp")) return "webp"
    if (pathname.endsWith(".avif")) return "avif"
    if (pathname.endsWith(".png")) return "png"
  } catch {
    // Fall through to the generated image default.
  }

  return "png"
}

function buildCacheableImageProxyUrl(url: string, options: ImageProxyOptions = {}): string {
  const params = new URLSearchParams({ url })
  if (options.raw) params.set("raw", "1")
  if (options.download) params.set("download", "1")
  if (options.width) params.set("w", String(options.width))
  if (options.format) params.set("format", options.format)
  else if (!options.raw) params.set("format", "webp")

  const mode = options.raw ? "raw" : "preview"
  const extension = getImageProxyExtension(url, options.raw, options.format)
  return `/api/image-proxy/${mode}/image.${extension}?${params.toString()}`
}

export function buildImageProxyUrl(url: string, options: ImageProxyOptions = {}): string {
  try {
    const absoluteProxyMatch = url.match(/^https?:\/\/[^/]+(\/api\/image-proxy\/?.*)$/i)
    if (absoluteProxyMatch) {
      return buildImageProxyUrl(absoluteProxyMatch[1], options)
    }

    if (url.startsWith("/api/image-proxy/")) {
      const params = new URLSearchParams(url.split("?")[1] || "")
      const targetUrl = params.get("url")
      if (targetUrl) return buildCacheableImageProxyUrl(targetUrl, options)
      return url
    }

    if (url.startsWith("/api/image-proxy?")) {
      const params = new URLSearchParams(url.split("?")[1] || "")
      const targetUrl = params.get("url")
      if (targetUrl) return buildCacheableImageProxyUrl(targetUrl, options)
      if (options.raw) params.set("raw", "1")
      else params.delete("raw")
      if (options.width) params.set("w", String(options.width))
      return `/api/image-proxy?${params.toString()}`
    }

    const parsed = new URL(url)
    if (parsed.protocol === "http:" && parsed.hostname === "43.154.111.156" && (parsed.port === "8001" || parsed.port === "8002") && parsed.pathname.startsWith("/images/")) {
      return buildCacheableImageProxyUrl(url, options)
    }
  } catch {
    return url
  }

  return url
}

export function proxifyGeneratedImageUrl(url: string): string {
  return buildImageProxyUrl(url)
}

export function proxifyGeneratedImagePreviewUrl(url: string, width = 1600): string {
  return buildImageProxyUrl(url, { width })
}

export function proxifyGeneratedImageDownloadUrl(url: string, format?: ImageOutputFormat): string {
  return buildImageProxyUrl(url, { raw: true, format, download: true })
}

export function getPublicGeneratedImageDownloadUrl(url: string, format?: ImageOutputFormat): string {
  return absolutizeGeneratedImageUrl(proxifyGeneratedImageDownloadUrl(url, format))
}

export function absolutizeGeneratedImageUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url

  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "")
  const runtimeOrigin = typeof window !== "undefined" ? window.location.origin : configuredOrigin

  if (runtimeOrigin && url.startsWith("/")) {
    return `${runtimeOrigin}${url}`
  }

  return url
}

export function getPublicGeneratedImageUrl(url: string, width = 1600): string {
  return absolutizeGeneratedImageUrl(proxifyGeneratedImagePreviewUrl(url, width))
}
