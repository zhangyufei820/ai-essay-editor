import { isLikelyRenderableImageUrl } from "@/lib/openclaw-media"

export type OpenClawPrimaryImage = {
  src: string
  alt?: string
}

const META_IMAGE_PATTERN =
  /<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["'][^>]*content=["']([^"']+)["'][^>]*>|<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["'][^>]*>/gi

const IMG_PATTERN = /<img\b[^>]*>/gi
const ATTR_PATTERN = /\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

function getAttributes(tag: string) {
  const attributes = new Map<string, string>()

  for (const match of tag.matchAll(ATTR_PATTERN)) {
    const name = match[1]?.toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ""
    if (name) attributes.set(name, decodeHtmlEntities(value.trim()))
  }

  return attributes
}

function resolveImageUrl(value: string, baseUrl: string) {
  const candidate = value.trim()
  if (!candidate || candidate.startsWith("#")) return null

  try {
    return new URL(candidate, baseUrl).toString()
  } catch {
    return isLikelyRenderableImageUrl(candidate) ? candidate : null
  }
}

function firstSrcFromSrcset(value?: string | null) {
  if (!value) return null
  const first = value.split(",")[0]?.trim()
  return first?.split(/\s+/)[0] || null
}

export function extractPrimaryImageFromOpenClawHtml(html: string, baseUrl: string): OpenClawPrimaryImage | null {
  for (const match of html.matchAll(META_IMAGE_PATTERN)) {
    const src = resolveImageUrl(match[1] || match[2] || "", baseUrl)
    if (src && isLikelyRenderableImageUrl(src)) return { src }
  }

  const imageCandidates: OpenClawPrimaryImage[] = []
  for (const match of html.matchAll(IMG_PATTERN)) {
    const attributes = getAttributes(match[0])
    const rawSrc =
      attributes.get("src") ||
      attributes.get("data-src") ||
      firstSrcFromSrcset(attributes.get("srcset")) ||
      firstSrcFromSrcset(attributes.get("data-srcset"))
    const src = rawSrc ? resolveImageUrl(rawSrc, baseUrl) : null

    if (src && isLikelyRenderableImageUrl(src)) {
      const alt = attributes.get("alt") || undefined
      imageCandidates.push({ src, alt })
    }
  }

  if (imageCandidates.length === 1) return imageCandidates[0]

  return null
}
