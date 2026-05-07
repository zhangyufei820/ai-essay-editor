import { promises as fs } from "fs"
import path from "path"
import { NextRequest } from "next/server"

import { createServerClient } from "@/lib/supabase/server"
import { verifySignedOpenClawMediaPath } from "@/lib/openclaw-media-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MEDIA_ROOT = process.env.OPENCLAW_MEDIA_ROOT || "/openclaw-media"

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

const DOWNLOAD_EXTENSIONS = new Set([
  ".csv",
  ".doc",
  ".docx",
  ".md",
  ".ppt",
  ".pptx",
  ".txt",
  ".xls",
  ".xlsx",
  ".zip",
])

function contentDisposition(filePath: string, disposition: "inline" | "attachment") {
  const filename = path.basename(filePath).replace(/[\u0000-\u001f"\\]/g, "_")
  return `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function resolveMediaPath(segments: string[]) {
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    return null
  }

  const root = path.resolve(MEDIA_ROOT)
  const filePath = path.resolve(root, ...segments)
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    return null
  }

  return filePath
}

async function isAuthorized(request: NextRequest, mediaPath: string) {
  const exp = request.nextUrl.searchParams.get("exp")
  const sig = request.nextUrl.searchParams.get("sig")

  if (verifySignedOpenClawMediaPath(mediaPath, exp, sig)) {
    return true
  }

  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    return Boolean(user)
  } catch {
    return false
  }
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

  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) {
      return new Response("Not Found", { status: 404 })
    }

    const bytes = await fs.readFile(filePath)
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()]
    if (!contentType) {
      return new Response("Unsupported Media Type", { status: 415 })
    }
    const extension = path.extname(filePath).toLowerCase()
    const disposition = request.nextUrl.searchParams.get("download") === "1" || DOWNLOAD_EXTENSIONS.has(extension)
      ? "attachment"
      : "inline"

    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition(filePath, disposition),
        "Content-Length": String(stat.size),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new Response("Not Found", { status: 404 })
  }
}
