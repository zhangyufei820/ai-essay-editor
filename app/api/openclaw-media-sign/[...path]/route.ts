import { NextRequest, NextResponse } from "next/server"

import { requireUser } from "@/lib/auth/verified-user"
import { createSignedOpenClawMediaUrl } from "@/lib/openclaw-media-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function validateSegments(segments: string[]) {
  return !segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const auth = await requireUser(request)
  if (auth.response) return auth.response

  const { path: mediaPath = [] } = await params

  if (!validateSegments(mediaPath)) {
    return new Response("Bad Request", { status: 400 })
  }

  const signedUrl = createSignedOpenClawMediaUrl(mediaPath.join("/"), undefined, auth.user!.id)
  const redirectUrl = new URL(signedUrl, request.url)
  if (request.nextUrl.searchParams.get("download") === "1") {
    redirectUrl.searchParams.set("download", "1")
  }

  return NextResponse.redirect(redirectUrl, {
    status: 307,
    headers: {
      "Cache-Control": "private, no-store",
    },
  })
}
