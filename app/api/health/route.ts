import { NextResponse } from "next/server"

import { buildHealthPayload } from "@/lib/health-response"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(buildHealthPayload(), {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
