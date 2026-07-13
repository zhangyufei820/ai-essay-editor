import { promises as fs } from "fs"
import path from "path"
import { NextRequest } from "next/server"

import { requireUser } from "@/lib/auth/verified-user"
import { buildLocalFileResponse } from "@/lib/local-file-response"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const WORKSPACE_ROOT = process.env.OPENCLAW_WORKSPACE_ROOT || "/openclaw-workspace"
const MAX_OPENCLAW_SLIDE_BYTES = 100 * 1024 * 1024

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
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
  ".ico": "image/x-icon",
}

const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_TYPES))

function contentDisposition(filePath: string, disposition: "inline" | "attachment") {
  const filename = path.basename(filePath).replace(/[\u0000-\u001f"\\]/g, "_")
  return `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function resolveWorkspaceAssetPath(segments: string[]) {
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    return null
  }

  const root = path.resolve(/* turbopackIgnore: true */ WORKSPACE_ROOT)
  const filePath = path.resolve(/* turbopackIgnore: true */ root, ...segments)
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    return null
  }

  if (!ALLOWED_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return null
  }

  return filePath
}

async function findWorkspaceAssetPath(segments: string[]) {
  const candidates = [segments]

  // OpenClaw 生成的公开页面通常位于 workspace/slides 下，且 HTML 会引用同目录资源。
  if (segments.length > 0) {
    candidates.push(["slides", ...segments])
  }

  for (const candidateSegments of candidates) {
    const candidatePath = resolveWorkspaceAssetPath(candidateSegments)
    if (!candidatePath) {
      continue
    }

    try {
      const stat = await fs.stat(/* turbopackIgnore: true */ candidatePath)
      if (stat.isFile()) {
        return candidatePath
      }
    } catch {
      // Try the next fallback candidate.
    }
  }

  return null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const auth = await requireUser(request)
  if (auth.response) return auth.response

  const { path: assetPath = [] } = await params
  const filePath = await findWorkspaceAssetPath(assetPath)

  if (!filePath) {
    return new Response("Not Found", { status: 404 })
  }

  const extension = path.extname(filePath).toLowerCase()
  const disposition = extension === ".svg" || request.nextUrl.searchParams.get("download") === "1"
    ? "attachment"
    : "inline"
  const headers: Record<string, string> = {
    "Content-Disposition": contentDisposition(filePath, disposition),
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
  } else if (extension === ".svg") {
    headers["Content-Security-Policy"] = "sandbox; default-src 'none'"
  }

  return buildLocalFileResponse({
    filePath,
    contentType: MIME_TYPES[extension] || "application/octet-stream",
    maxBytes: MAX_OPENCLAW_SLIDE_BYTES,
    rangeHeader: request.headers.get("range"),
    headers,
  })
}
