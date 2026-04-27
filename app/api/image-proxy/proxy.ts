import { NextRequest } from "next/server"
import { Readable } from "node:stream"
import sharp from "sharp"

const DEFAULT_GATEWAY_ORIGIN = "http://43.154.111.156:8001"
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const DEFAULT_PREVIEW_WIDTH = 1600
const MAX_PREVIEW_WIDTH = 3840
const UPSTREAM_TIMEOUT_MS = 15_000
const IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable"

type OutputFormat = "webp" | "avif" | "jpeg" | "png"

function getAllowedOrigins(): Set<string> {
  const origins = new Set([DEFAULT_GATEWAY_ORIGIN])
  const configuredGateways = [
    process.env.DIFY_IMAGE_GATEWAY_URL,
    process.env.DIFY_IMAGE_GATEWAY_PUBLIC_URL,
    process.env.NEXT_PUBLIC_DIFY_IMAGE_GATEWAY_URL,
  ]

  for (const configuredGateway of configuredGateways) {
    if (!configuredGateway) continue
    try {
      origins.add(new URL(configuredGateway).origin)
    } catch {
      // Ignore malformed env values and keep the safe default allowlist.
    }
  }

  return origins
}

function getUpstreamImageUrl(target: URL): string {
  const internalGateway = process.env.DIFY_IMAGE_GATEWAY_URL
  if (!internalGateway) return target.toString()

  try {
    const internalOrigin = new URL(internalGateway).origin
    const publicOrigins = new Set([
      DEFAULT_GATEWAY_ORIGIN,
      process.env.DIFY_IMAGE_GATEWAY_PUBLIC_URL,
      process.env.NEXT_PUBLIC_DIFY_IMAGE_GATEWAY_URL,
    ].filter(Boolean) as string[])

    if (publicOrigins.has(target.origin)) {
      return `${internalOrigin}${target.pathname}${target.search}`
    }
  } catch {
    // Fall back to the requested URL if the internal gateway env is malformed.
  }

  return target.toString()
}

function parsePreviewWidth(value: string | null) {
  if (!value) return DEFAULT_PREVIEW_WIDTH
  const width = Number(value)
  if (!Number.isFinite(width)) return DEFAULT_PREVIEW_WIDTH
  return Math.min(MAX_PREVIEW_WIDTH, Math.max(320, Math.round(width)))
}

function pickOutputFormat(request: NextRequest): OutputFormat {
  const requestedFormat = request.nextUrl.searchParams.get("format")
  if (requestedFormat === "avif" || requestedFormat === "webp" || requestedFormat === "jpeg" || requestedFormat === "png") {
    return requestedFormat
  }

  const accept = request.headers.get("accept") || ""
  if (accept.includes("image/webp")) return "webp"
  if (accept.includes("image/avif")) return "avif"
  return "jpeg"
}

function createAbortSignal() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) }
}

function setCdnCacheHeaders(headers: Headers) {
  headers.set("Cache-Control", IMAGE_CACHE_CONTROL)
  headers.set("CDN-Cache-Control", IMAGE_CACHE_CONTROL)
  headers.set("Cloudflare-CDN-Cache-Control", IMAGE_CACHE_CONTROL)
  headers.set("X-Content-Type-Options", "nosniff")
}

export async function proxyImage(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")

  if (!rawUrl) {
    return new Response("Missing url", { status: 400 })
  }

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return new Response("Invalid url", { status: 400 })
  }

  if (!getAllowedOrigins().has(target.origin) || !target.pathname.startsWith("/images/")) {
    return new Response("Forbidden", { status: 403 })
  }

  const abort = createAbortSignal()
  let upstream: Response
  try {
    upstream = await fetch(getUpstreamImageUrl(target), {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*",
      },
      redirect: "manual",
      signal: abort.signal,
    })
  } catch {
    abort.cancel()
    return new Response("Image fetch timeout", { status: 504 })
  } finally {
    abort.cancel()
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("Image fetch failed", { status: upstream.status || 502 })
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream"
  if (!contentType.startsWith("image/")) {
    return new Response("Unsupported content type", { status: 415 })
  }

  const rawMode = request.nextUrl.searchParams.get("raw") === "1"
  const headers = new Headers({
    "Content-Type": contentType,
  })
  setCdnCacheHeaders(headers)

  const contentLength = upstream.headers.get("content-length")
  if (contentLength) headers.set("Content-Length", contentLength)

  if (rawMode) {
    return new Response(upstream.body, {
      status: 200,
      headers,
    })
  }

  if (contentLength && Number(contentLength) > MAX_IMAGE_BYTES) {
    return new Response("Image too large", { status: 413 })
  }

  const width = parsePreviewWidth(request.nextUrl.searchParams.get("w"))
  const format = pickOutputFormat(request)
  let pipeline = sharp({ animated: false })
    .rotate()
    .resize({ width, height: width, fit: "inside", withoutEnlargement: true })

  if (format === "avif") pipeline = pipeline.avif({ quality: 58, effort: 4 })
  if (format === "webp") pipeline = pipeline.webp({ quality: 78, effort: 4 })
  if (format === "jpeg") pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true })
  if (format === "png") pipeline = pipeline.png({ compressionLevel: 9, palette: true })

  headers.set("Content-Type", `image/${format}`)
  headers.delete("Content-Length")
  headers.set("Vary", "Accept")
  headers.set("X-Image-Proxy-Mode", "optimized")

  const optimizedStream = Readable.fromWeb(upstream.body as ReadableStream<Uint8Array>).pipe(pipeline)

  return new Response(Readable.toWeb(optimizedStream) as ReadableStream<Uint8Array>, {
    status: 200,
    headers,
  })
}
