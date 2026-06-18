import path from "path"
import { NextRequest } from "next/server"

import { requireUser } from "@/lib/auth/verified-user"
import { internalDifyFetch } from "@/lib/internal-dify-fetch"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEFAULT_CODEX_SKILL_GATEWAY_URL = "http://codex-gateway:8000"

const MIME_TYPES: Record<string, string> = {
  ".csv": "text/csv; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain; charset=utf-8",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
}

const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_TYPES))

function codexGatewayBaseUrl() {
  return (process.env.CODEX_SKILL_GATEWAY_URL || DEFAULT_CODEX_SKILL_GATEWAY_URL).replace(/\/+$/, "")
}

function gatewayApiKey() {
  return process.env.CODEX_SKILL_GATEWAY_API_KEY || process.env.CODEX_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY || ""
}

function contentDisposition(filePath: string, disposition: "inline" | "attachment") {
  const filename = path.basename(filePath).replace(/[\u0000-\u001f"\\]/g, "_")
  return `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function safeFilePath(segments: string[]) {
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))
  ) {
    return null
  }

  const filePath = segments.join("/")
  const extension = path.extname(filePath).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(extension)) return null
  return filePath
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId?: string; path?: string[] }> },
) {
  const auth = await requireUser(request)
  if (auth.response) return auth.response

  const { taskId = "", path: fileSegments = [] } = await params
  if (!/^task_[A-Za-z0-9_-]+$/.test(taskId)) {
    return new Response("Bad Request", { status: 400 })
  }

  const filePath = safeFilePath(fileSegments)
  if (!filePath) {
    return new Response("Bad Request", { status: 400 })
  }

  const apiKey = gatewayApiKey()
  if (!apiKey) {
    return new Response("File preview service is not configured", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    })
  }

  const upstreamUrl = `${codexGatewayBaseUrl()}/tasks/${encodeURIComponent(taskId)}/files/${fileSegments.map(encodeURIComponent).join("/")}`
  const upstream = await internalDifyFetch(upstreamUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!upstream.ok) {
    return new Response(upstream.status === 404 ? "Not Found" : "File preview unavailable", {
      status: upstream.status === 404 ? 404 : 502,
      headers: { "Cache-Control": "private, no-store" },
    })
  }

  const bytes = await upstream.arrayBuffer()
  const extension = path.extname(filePath).toLowerCase()
  const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"
  const headers: Record<string, string> = {
    "Content-Type": MIME_TYPES[extension] || upstream.headers.get("content-type") || "application/octet-stream",
    "Content-Disposition": contentDisposition(filePath, disposition),
    "Content-Length": String(bytes.byteLength),
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
  }
  if (extension === ".html" || extension === ".htm") {
    headers["Content-Security-Policy"] = [
      "sandbox",
      "default-src 'none'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "font-src 'self' data: https://cdn.jsdelivr.net",
    ].join("; ")
  }

  return new Response(bytes, { headers })
}
