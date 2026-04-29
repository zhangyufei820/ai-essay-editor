import { promises as fs } from "fs"
import path from "path"
import { NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const WORKSPACE_ROOT = process.env.OPENCLAW_WORKSPACE_ROOT || "/openclaw-workspace"

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".pdf": "application/pdf",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_TYPES))

function resolveWorkspaceAssetPath(segments: string[]) {
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    return null
  }

  const root = path.resolve(WORKSPACE_ROOT)
  const filePath = path.resolve(root, ...segments)
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    return null
  }

  if (!ALLOWED_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return null
  }

  return filePath
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path: assetPath = [] } = await params
  const filePath = resolveWorkspaceAssetPath(assetPath)

  if (!filePath) {
    return new Response("Bad Request", { status: 400 })
  }

  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) {
      return new Response("Not Found", { status: 404 })
    }

    const bytes = await fs.readFile(filePath)
    const extension = path.extname(filePath).toLowerCase()

    return new Response(bytes, {
      headers: {
        "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new Response("Not Found", { status: 404 })
  }
}
