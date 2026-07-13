import path from "path"
import { NextRequest } from "next/server"

import { requireUser } from "@/lib/auth/verified-user"
import { buildLocalFileResponse } from "@/lib/local-file-response"
import { verifySignedOpenClawMediaPath } from "@/lib/openclaw-media-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MEDIA_ROOT = process.env.OPENCLAW_MEDIA_ROOT || "/openclaw-media"
const MAX_OPENCLAW_MEDIA_BYTES = 100 * 1024 * 1024

const MIME_TYPES: Record<string, string> = {
  ".csv": "text/csv; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
}

function contentDisposition(filePath: string, disposition: "inline" | "attachment") {
  const filename = path.basename(filePath).replace(/[\u0000-\u001f"\\]/g, "_")
  return `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function resolveMediaPath(segments: string[]) {
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    return null
  }

  const root = path.resolve(/* turbopackIgnore: true */ MEDIA_ROOT)
  const filePath = path.resolve(/* turbopackIgnore: true */ root, ...segments)
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    return null
  }

  return filePath
}

async function isAuthorized(request: NextRequest, mediaPath: string) {
  const auth = await requireUser(request)
  if (!auth.user) return false

  const exp = request.nextUrl.searchParams.get("exp")
  const sig = request.nextUrl.searchParams.get("sig")

  if (verifySignedOpenClawMediaPath(mediaPath, exp, sig, auth.user.id)) {
    return true
  }
  return false
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path: mediaPath = [] } = await params
  const filePath = resolveMediaPath(mediaPath)

  if (!filePath) {
    return new Response("Bad Request", { status: 400 })
  }

  if (!(await isAuthorized(request, mediaPath.join("/")))) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "Cache-Control": "private, no-store",
      },
    })
  }

  const extension = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[extension]
  if (!contentType) {
    return new Response("Unsupported Media Type", { status: 415 })
  }
  const disposition = extension === ".svg" || request.nextUrl.searchParams.get("download") === "1"
    ? "attachment"
    : "inline"

  return buildLocalFileResponse({
    filePath,
    contentType,
    maxBytes: MAX_OPENCLAW_MEDIA_BYTES,
    rangeHeader: request.headers.get("range"),
    headers: {
      "Content-Disposition": contentDisposition(filePath, disposition),
      "Cache-Control": "private, max-age=3600",
      ...(extension === ".svg" ? { "Content-Security-Policy": "sandbox; default-src 'none'" } : {}),
    },
  })
}
