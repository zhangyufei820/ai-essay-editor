import { NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEFAULT_GATEWAY_ORIGIN = "http://43.154.111.156:8001"

function getAllowedOrigins(): Set<string> {
  const origins = new Set([DEFAULT_GATEWAY_ORIGIN])
  const configuredGateway = process.env.DIFY_IMAGE_GATEWAY_URL

  if (configuredGateway) {
    try {
      origins.add(new URL(configuredGateway).origin)
    } catch {
      // Ignore malformed env values and keep the safe default allowlist.
    }
  }

  return origins
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")

  if (!rawUrl) {
    return new Response("Missing url", { status: 400 })
  }

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return new Response("Invalid url", { status: 400 })
  }

  if (!getAllowedOrigins().has(target.origin) || !target.pathname.startsWith("/images/")) {
    return new Response("Forbidden", { status: 403 })
  }

  const upstream = await fetch(target.toString(), {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*",
    },
  })

  if (!upstream.ok || !upstream.body) {
    return new Response("Image fetch failed", { status: upstream.status || 502 })
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream"
  if (!contentType.startsWith("image/")) {
    return new Response("Unsupported content type", { status: 415 })
  }

  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  })

  const contentLength = upstream.headers.get("content-length")
  if (contentLength) headers.set("Content-Length", contentLength)

  return new Response(upstream.body, {
    status: 200,
    headers,
  })
}
