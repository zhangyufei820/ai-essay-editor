import { updateSession } from "@/lib/supabase/middleware"
import { applyCorsHeaders } from "@/lib/cors"
import type { NextRequest } from "next/server"

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
