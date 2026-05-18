const OPENCLAW_MEDIA_ROUTE = "/api/openclaw-media"
const OPENCLAW_MEDIA_SIGN_ROUTE = "/api/openclaw-media-sign"
const OPENCLAW_SLIDES_ROUTE = "/slides"

const OPENCLAW_MEDIA_URL_PATTERN =
  /https?:\/\/(?:43\.154\.111\.156|shenxiang\.school|www\.shenxiang\.school|api\.shenxiang\.school|cloudflare\.shenxiang\.school|localhost|127\.0\.0\.1)(?::18789)?\/__openclaw__\/media\/([^\s)"'<>`]+)/g

const OPENCLAW_MEDIA_PATH_PATTERN =
  /\/home\/node\/\.openclaw\/media\/([^\s)"'<>`]+)/g

const OPENCLAW_WORKSPACE_PATH_PATTERN =
  /\/home\/node\/\.openclaw\/workspace\/([^\s)"'<>`]+)/g

const OPENCLAW_WORKSPACE_URL_PATTERN =
  /https?:\/\/(?:43\.154\.111\.156|shenxiang\.school|www\.shenxiang\.school|api\.shenxiang\.school|cloudflare\.shenxiang\.school|localhost|127\.0\.0\.1)(?::18789)?\/__openclaw__\/workspace\/([^\s)"'<>`]+)/g

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico"])
const PRESENTATION_EXTENSIONS = new Set([".ppt", ".pptx"])
const DOCUMENT_EXTENSIONS = new Set([".html", ".htm", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".md", ".json"])
const HTML_EXTENSIONS = new Set([".html", ".htm"])

function publicBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://www.shenxiang.school").replace(/\/+$/, "")
}

function cleanReferencePath(value: string) {
  return value.replace(/[),.;:!?]+$/g, "")
}

function encodePathSegments(value: string) {
  return value
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

export function toPublicOpenClawMediaUrl(mediaPath: string) {
  const encodedPath = encodePathSegments(cleanReferencePath(mediaPath))
  return `${publicBaseUrl()}${OPENCLAW_MEDIA_ROUTE}/${encodedPath}`
}

export function toPublicOpenClawMediaSignUrl(mediaPath: string) {
  const encodedPath = encodePathSegments(cleanReferencePath(mediaPath))
  return `${publicBaseUrl()}${OPENCLAW_MEDIA_SIGN_ROUTE}/${encodedPath}`
}

export function toPublicOpenClawWorkspaceUrl(workspacePath: string) {
  const cleanedPath = cleanReferencePath(workspacePath).replace(/^slides\//, "")
  const encodedPath = encodePathSegments(cleanedPath)
  return `${publicBaseUrl()}${OPENCLAW_SLIDES_ROUTE}/${encodedPath}`
}

function getUrlPathname(value: string) {
  if (!value) return ""

  if (value.startsWith("data:") || value.startsWith("blob:")) {
    return value
  }

  try {
    return new URL(value, publicBaseUrl()).pathname
  } catch {
    return value.split(/[?#]/, 1)[0] || value
  }
}

function getExtension(value: string) {
  let pathname = getUrlPathname(value)
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    // Use the raw path if it contains malformed percent escapes.
  }
  pathname = pathname.toLowerCase()
  const dotIndex = pathname.lastIndexOf(".")
  if (dotIndex < 0) return ""
  return pathname.slice(dotIndex)
}

export function isLikelyRenderableImageUrl(value: string) {
  if (!value) return false
  if (/^data:image\//i.test(value) || /^blob:/i.test(value)) return true
  return IMAGE_EXTENSIONS.has(getExtension(value))
}

export function isLikelyHtmlDocumentUrl(value: string) {
  return HTML_EXTENSIONS.has(getExtension(value))
}

export function getOpenClawAttachmentKind(value: string): "image" | "ppt" | "file" {
  if (isLikelyRenderableImageUrl(value)) return "image"

  const extension = getExtension(value)
  if (PRESENTATION_EXTENSIONS.has(extension)) return "ppt"
  if (DOCUMENT_EXTENSIONS.has(extension)) return "file"

  return "file"
}

export function rewriteOpenClawMediaReferences(text: string) {
  return text
    .replace(OPENCLAW_MEDIA_URL_PATTERN, (_match, mediaPath: string) => toPublicOpenClawMediaSignUrl(mediaPath))
    .replace(OPENCLAW_MEDIA_PATH_PATTERN, (_match, mediaPath: string) => toPublicOpenClawMediaSignUrl(mediaPath))
    .replace(OPENCLAW_WORKSPACE_URL_PATTERN, (_match, workspacePath: string) => toPublicOpenClawWorkspaceUrl(workspacePath))
    .replace(OPENCLAW_WORKSPACE_PATH_PATTERN, (_match, workspacePath: string) => toPublicOpenClawWorkspaceUrl(workspacePath))
}
