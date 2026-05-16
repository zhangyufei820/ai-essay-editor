import type { NextRequest } from "next/server"

const ALLOWED_CORS_ORIGINS = new Set([
  "https://shenxiang.school",
  "https://www.shenxiang.school",
  "https://api.shenxiang.school",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
])

export function isAllowedCorsOrigin(origin: string) {
  if (ALLOWED_CORS_ORIGINS.has(origin)) return true

  if (process.env.NODE_ENV !== "production") {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  }

  return false
}

function appendVary(current: string | null, value: string) {
  if (!current) return value
  const parts = current.split(",").map((part) => part.trim().toLowerCase())
  return parts.includes(value.toLowerCase()) ? current : `${current}, ${value}`
}

export function applyCorsHeaders(response: Response, request: NextRequest) {
  const origin = request.headers.get("origin")

  if (origin && !isAllowedCorsOrigin(origin)) {
    response.headers.set("Vary", appendVary(response.headers.get("Vary"), "Origin"))
    return response
  }

  if (origin && isAllowedCorsOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Credentials", "true")
    response.headers.set("Vary", appendVary(response.headers.get("Vary"), "Origin"))
  }

  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
  response.headers.set(
    "Access-Control-Allow-Headers",
    request.headers.get("access-control-request-headers") ||
      "Content-Type, Authorization, X-Model",
  )
  response.headers.set("Access-Control-Max-Age", "86400")

  return response
}
