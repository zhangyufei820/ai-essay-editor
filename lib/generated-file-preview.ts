import { getOpenClawAttachmentKind, resolveOpenClawPresentationPreviewUrl, rewriteOpenClawMediaReferences } from "@/lib/openclaw-media"

const CODEX_TASK_FILE_PATTERN =
  /(?:https?:\/\/(?:codex-gateway|codex-skill-gateway|localhost|127\.0\.0\.1)(?::\d+)?)?\/tasks\/(task_[A-Za-z0-9_-]+)\/files\/([^\s)"'<>`]+)/g

const PREVIEWABLE_FILE_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".pdf",
  ".txt",
  ".md",
  ".json",
  ".csv",
])

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

function getUrlPathname(value: string) {
  if (!value) return ""
  if (value.startsWith("data:") || value.startsWith("blob:")) return value

  try {
    return new URL(value, publicBaseUrl()).pathname
  } catch {
    return value.split(/[?#]/, 1)[0] || value
  }
}

export function getGeneratedFileExtension(value: string) {
  let pathname = getUrlPathname(value)
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    // Keep malformed percent escapes as-is.
  }
  const dotIndex = pathname.toLowerCase().lastIndexOf(".")
  return dotIndex >= 0 ? pathname.slice(dotIndex).toLowerCase() : ""
}

export function toPublicCodexSkillFileUrl(taskId: string, filePath: string) {
  return `${publicBaseUrl()}/api/codex-skill-files/${encodeURIComponent(taskId)}/${encodePathSegments(cleanReferencePath(filePath))}`
}

export function rewriteGeneratedFileReferences(text: string) {
  return rewriteOpenClawMediaReferences(text).replace(
    CODEX_TASK_FILE_PATTERN,
    (_match, taskId: string, filePath: string) => toPublicCodexSkillFileUrl(taskId, filePath),
  )
}

export function getGeneratedFilePreviewUrl(value: string) {
  const rewritten = rewriteGeneratedFileReferences(value)
  const kind = getOpenClawAttachmentKind(rewritten)
  if (kind === "ppt") return resolveOpenClawPresentationPreviewUrl(rewritten)
  return rewritten
}

export function getGeneratedFilePreviewKind(value: string): "image" | "presentation" | "inline" | "file" {
  const previewUrl = getGeneratedFilePreviewUrl(value)
  const kind = getOpenClawAttachmentKind(previewUrl)
  if (kind === "image") return "image"
  if (kind === "ppt") return "presentation"

  const extension = getGeneratedFileExtension(previewUrl)
  if (extension === ".html" || extension === ".htm") return "presentation"
  if (PREVIEWABLE_FILE_EXTENSIONS.has(extension)) return "inline"
  return "file"
}

export function shouldPreviewGeneratedFileLink(href: string, label = "") {
  if (!href) return false
  const previewKind = getGeneratedFilePreviewKind(href)
  if (previewKind !== "file") return true

  const lowerLabel = label.toLowerCase()
  return /预览|查看|展示|打开|演示文稿|ppt|powerpoint|slide|slides/.test(lowerLabel)
}
