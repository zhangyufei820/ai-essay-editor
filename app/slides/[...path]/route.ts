import { promises as fs } from "fs"
import path from "path"
import { NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const WORKSPACE_ROOT = process.env.OPENCLAW_WORKSPACE_ROOT || "/openclaw-workspace"

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
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
      const stat = await fs.stat(candidatePath)
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
  _request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path: assetPath = [] } = await params
  const filePath = await findWorkspaceAssetPath(assetPath)

  if (!filePath) {
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
}
