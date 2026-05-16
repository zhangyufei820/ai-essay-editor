import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { verifyAuthingJwt } from "@/lib/auth/authing-jwt"

export type VerifiedUser = {
  id: string
  email?: string | null
  phone?: string | null
  provider?: "supabase" | "authing"
  metadata?: Record<string, unknown>
}

function createRequestSupabaseClient(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) return null

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll() {
        // Route handlers in this project only need to verify the existing session.
      },
    },
  })
}

function readBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || ""
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export async function getVerifiedUser(request: NextRequest): Promise<VerifiedUser | null> {
  const supabase = createRequestSupabaseClient(request)
  const bearerToken = readBearerToken(request)

  if (supabase) {
    const result = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser()

    const user = result.data.user
    if (user?.id && !result.error) {
      return {
        id: user.id,
        email: user.email,
        phone: user.phone,
        provider: "supabase",
        metadata: user.user_metadata || {},
      }
    }
  }

  if (!bearerToken) return null

  const authingPayload = await verifyAuthingJwt(bearerToken)
  if (!authingPayload?.sub) return null

  return {
    id: authingPayload.sub,
    email: authingPayload.email,
    phone: authingPayload.phone_number || authingPayload.phone,
    provider: "authing",
  }
}

export async function requireUser(request: NextRequest) {
  const user = await getVerifiedUser(request)
  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "未授权访问，请先登录", code: "UNAUTHORIZED" },
        { status: 401 },
      ),
    }
  }

  return { user, response: null }
}

export function assertSameUser(resourceUserId: string | null | undefined, user: VerifiedUser) {
  return Boolean(resourceUserId && resourceUserId === user.id)
}
