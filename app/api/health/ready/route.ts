import { NextResponse } from "next/server"

import { getDifyCredentialForModel } from "@/lib/dify-credentials"
import { checkMainSiteReadiness } from "@/lib/health-readiness"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const { credential } = getDifyCredentialForModel("general-chat")
  const result = await checkMainSiteReadiness({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    difyBaseUrl: process.env.DIFY_INTERNAL_URL || process.env.DIFY_BASE_URL || "",
    difyApiKey: credential,
  })

  return NextResponse.json(result, {
    status: result.status === "ready" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function HEAD() {
  const response = await GET()
  return new Response(null, {
    status: response.status,
    headers: { "Cache-Control": "no-store" },
  })
}
