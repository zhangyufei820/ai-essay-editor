"use client"
/* eslint-disable @next/next/no-img-element -- Dynamic/user-generated/external image surfaces: keep native img to preserve sizing, blob/data/proxy URLs, payment QR codes, and chat preview behavior. */

import { ExternalLink, Loader2 } from "lucide-react"
import { memo, useEffect, useMemo, useState } from "react"

import { proxifyGeneratedImagePreviewUrl } from "@/components/chat/image-generation/gpt-image-v11"
import { extractPrimaryImageFromOpenClawHtml, type OpenClawPrimaryImage } from "@/lib/openclaw-html"
import { rewriteOpenClawMediaReferences } from "@/lib/openclaw-media"
import { cn } from "@/lib/utils"
import { IconEssay } from "@/components/icons/v2"

const PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000
const PREVIEW_CACHE_MAX_ENTRIES = 24
const PREVIEW_MAX_BYTES = 2 * 1024 * 1024

type PreviewCacheEntry =
  | { expiresAt: number; status: "ready"; preview: HtmlPreviewResult }
  | { expiresAt: number; status: "pending"; promise: Promise<HtmlPreviewResult> }

type HtmlPreviewResult = {
  html: string
  primaryImage: OpenClawPrimaryImage | null
}

const previewCache = new Map<string, PreviewCacheEntry>()

function prunePreviewCache(now = Date.now()) {
  for (const [key, entry] of previewCache) {
    if (entry.expiresAt <= now) {
      previewCache.delete(key)
    }
  }

  while (previewCache.size > PREVIEW_CACHE_MAX_ENTRIES) {
    const oldestKey = previewCache.keys().next().value
    if (!oldestKey) break
    previewCache.delete(oldestKey)
  }
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function sameSiteUrl(value: string) {
  try {
    const parsed = new URL(value, window.location.origin)
    const trustedAppHosts = new Set([
      "shenxiang.school",
      "www.shenxiang.school",
      "api.shenxiang.school",
      "cloudflare.shenxiang.school",
      "localhost",
      "127.0.0.1",
    ])
    if (
      parsed.origin !== window.location.origin &&
      trustedAppHosts.has(parsed.hostname) &&
      (parsed.pathname.startsWith("/api/openclaw-media") ||
        parsed.pathname.startsWith("/api/openclaw-media-sign") ||
        parsed.pathname.startsWith("/slides/"))
    ) {
      return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, window.location.origin)
    }
    if (parsed.origin !== window.location.origin) return null
    return parsed
  } catch {
    return null
  }
}

function withBaseElement(html: string, href: string) {
  const base = `<base href="${escapeHtmlAttribute(href)}">`
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${base}`)
  }
  return `${base}${html}`
}

function fileLabel(src: string, fallback?: string) {
  if (fallback?.trim()) return fallback.trim()
  const rawName = src.split("/").pop()?.split(/[?#]/, 1)[0] || "HTML 页面"

  try {
    return decodeURIComponent(rawName)
  } catch {
    return rawName
  }
}

async function fetchPreviewHtml(target: URL): Promise<HtmlPreviewResult> {
  const cacheKey = target.toString()
  const now = Date.now()
  prunePreviewCache(now)

  const cached = previewCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    if (cached.status === "ready") return cached.preview
    return cached.promise
  }

  const promise = fetch(cacheKey, {
    credentials: "same-origin",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const contentLength = response.headers.get("content-length")
      if (contentLength && Number(contentLength) > PREVIEW_MAX_BYTES) {
        throw new Error("HTML preview is too large")
      }

      const text = await response.text()
      if (new Blob([text]).size > PREVIEW_MAX_BYTES) {
        throw new Error("HTML preview is too large")
      }

      const html = withBaseElement(text, cacheKey)
      const primaryImage = extractPrimaryImageFromOpenClawHtml(text, cacheKey)
      const preview = { html, primaryImage }
      previewCache.set(cacheKey, {
        expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS,
        status: "ready",
        preview,
      })
      return preview
    })
    .catch((error) => {
      previewCache.delete(cacheKey)
      throw error
    })

  previewCache.set(cacheKey, {
    expiresAt: now + PREVIEW_CACHE_TTL_MS,
    status: "pending",
    promise,
  })

  return promise
}

export const OpenClawHtmlPreview = memo(function OpenClawHtmlPreview({
  src,
  title,
  className,
}: {
  src: string
  title?: string
  className?: string
}) {
  const [html, setHtml] = useState<string | null>(null)
  const [primaryImage, setPrimaryImage] = useState<OpenClawPrimaryImage | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")

  const label = useMemo(() => fileLabel(src, title), [src, title])
  const normalizedSrc = useMemo(() => rewriteOpenClawMediaReferences(src), [src])
  const openHref = useMemo(() => sameSiteUrl(normalizedSrc)?.toString() || normalizedSrc, [normalizedSrc])

  useEffect(() => {
    const target = sameSiteUrl(normalizedSrc)
    if (!target) {
      setStatus("error")
      return
    }

    let cancelled = false
    setStatus("loading")
    setHtml(null)
    setPrimaryImage(null)

    fetchPreviewHtml(target)
      .then((preview) => {
        if (cancelled) return
        setHtml(preview.html)
        setPrimaryImage(preview.primaryImage)
        setStatus("ready")
      })
      .catch((error) => {
        if (cancelled || error?.name === "AbortError") return
        setStatus("error")
      })

    return () => {
      cancelled = true
    }
  }, [normalizedSrc])

  return (
    <div className={cn("my-3 overflow-hidden rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] shadow-sm", className)}>
      <div className="flex items-center gap-3 border-b border-[var(--paper-100)] bg-[var(--paper-50)] px-3 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--paper-50)] text-[var(--ink-500)]">
          <IconEssay className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink-700)]">{label}</span>
        <a
          href={openHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--paper-50)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-600)] no-underline shadow-sm transition-colors hover:bg-[var(--paper-100)]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          打开
        </a>
      </div>

      <div className={cn("relative w-full bg-[var(--paper-100)]", primaryImage ? "min-h-[180px]" : "aspect-[4/3] sm:aspect-video")}>
        {status === "loading" && (
          <div className="flex min-h-[220px] items-center justify-center text-[var(--ink-500)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {status === "ready" && primaryImage && (
          <img
            src={proxifyGeneratedImagePreviewUrl(primaryImage.src, 1200)}
            alt={primaryImage.alt || label || "OpenClaw 生成图片"}
            className="max-h-[640px] w-full object-contain bg-[var(--paper-50)]"
            loading="lazy"
          />
        )}

        {status === "ready" && !primaryImage && html && (
          <iframe
            srcDoc={html}
            title={label}
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            className="h-full w-full border-0 bg-[var(--paper-50)]"
            loading="lazy"
          />
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-[var(--ink-500)]">
            无法内嵌预览，请打开查看。
          </div>
        )}
      </div>
    </div>
  )
})
