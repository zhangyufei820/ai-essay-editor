import { updateSession } from "@/lib/supabase/middleware"
import type { NextRequest } from "next/server"

const ALLOWED_CORS_ORIGINS = new Set([
  "https://shenxiang.school",
  "https://www.shenxiang.school",
  "https://api.shenxiang.school",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
])

function applyCorsHeaders(response: Response, request: NextRequest) {
  const origin = request.headers.get("origin")

  if (origin && ALLOWED_CORS_ORIGINS.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Credentials", "true")
    response.headers.set("Vary", appendVary(response.headers.get("Vary"), "Origin"))
  }

  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
  response.headers.set(
    "Access-Control-Allow-Headers",
    request.headers.get("access-control-request-headers") ||
      "Content-Type, Authorization, X-User-Id, X-Model",
  )
  response.headers.set("Access-Control-Max-Age", "86400")

  return response
}

function appendVary(current: string | null, value: string) {
  if (!current) return value
  const parts = current.split(",").map((part) => part.trim().toLowerCase())
  return parts.includes(value.toLowerCase()) ? current : `${current}, ${value}`
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isApiRoute = pathname.startsWith("/api/")

  if (isApiRoute && request.method === "OPTIONS") {
    return applyCorsHeaders(new Response(null, { status: 204 }), request)
  }

  const isServerActionProbe =
    pathname.startsWith("/_next/server-actions") ||
    pathname.startsWith("/_next/server-components") ||
    pathname.startsWith("/_next/redirect") ||
    pathname.startsWith("/_next/turbopack/flight")

  if (request.headers.has("next-action") || isServerActionProbe) {
    return new Response("Server Actions are not enabled for this app.", { status: 410 })
  }

  const response = await updateSession(request)

  if (isApiRoute) {
    return applyCorsHeaders(response, request)
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
