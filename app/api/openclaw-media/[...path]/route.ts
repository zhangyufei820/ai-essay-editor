import { promises as fs } from "fs"
import path from "path"
import { NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MEDIA_ROOT = process.env.OPENCLAW_MEDIA_ROOT || "/openclaw-media"

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path: mediaPath = [] } = await params
  const filePath = resolveMediaPath(mediaPath)

  if (!filePath) {
    return new Response("Bad Request", { status: 400 })
  }

  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) {
      return new Response("Not Found", { status: 404 })
    }

    const bytes = await fs.readFile(filePath)
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream"

    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new Response("Not Found", { status: 404 })
  }
}
