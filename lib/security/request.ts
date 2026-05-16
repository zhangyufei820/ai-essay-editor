import { NextResponse, type NextRequest } from "next/server"
export { safeInternalRedirectPath } from "@/lib/security/redirect"

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

function getAllowedHosts() {
  const hosts = new Set<string>()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    try {
      hosts.add(new URL(appUrl).host)
    } catch {}
  }
  hosts.add("www.shenxiang.school")
  hosts.add("shenxiang.school")
  return hosts
}

export function isTrustedRequestOrigin(request: NextRequest) {
  const allowedHosts = getAllowedHosts()
  const candidates = [request.headers.get("origin"), request.headers.get("referer")]

  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const url = new URL(candidate)
      if (allowedHosts.has(url.host) || LOCAL_HOSTS.has(url.hostname)) {
        return true
      }
    } catch {}
  }

  return candidates.every((candidate) => !candidate)
}

export function rejectUntrustedOrigin(request: NextRequest) {
  if (isTrustedRequestOrigin(request)) return null
  return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
}
