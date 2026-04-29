import { promises as fs } from "fs"
import path from "path"
import { NextRequest } from "next/server"

import { createServerClient } from "@/lib/supabase/server"
import { verifySignedOpenClawMediaPath } from "@/lib/openclaw-media-server"

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

    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new Response("Not Found", { status: 404 })
  }
}
