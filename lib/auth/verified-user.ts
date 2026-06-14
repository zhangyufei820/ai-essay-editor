import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { verifyAuthingJwt, verifyAuthingUserInfoToken } from "@/lib/auth/authing-jwt"

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

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, encodedPayload] = token.split(".")
  if (!encodedPayload) return null

  try {
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>
  } catch {
    return null
  }
}

function shouldVerifyAuthingBeforeSupabase(token: string) {
  const issuer = process.env.AUTHING_ISSUER?.trim()
  if (!issuer) return false

  const parts = token.split(".")
  if (parts.length !== 3) {
    return true
  }

  const payload = decodeJwtPayload(token)
  return payload?.iss === issuer
}

async function getAuthingVerifiedUserFromBearer(bearerToken: string): Promise<VerifiedUser | null> {
  const authingPayload =
    (await verifyAuthingJwt(bearerToken)) ||
    (await verifyAuthingUserInfoToken(bearerToken))
  if (!authingPayload?.sub) return null

  return {
    id: authingPayload.sub,
    email: authingPayload.email,
    phone: authingPayload.phone_number || authingPayload.phone,
    provider: "authing",
  }
}

export async function getVerifiedUser(request: NextRequest): Promise<VerifiedUser | null> {
  const supabase = createRequestSupabaseClient(request)
  const bearerToken = readBearerToken(request)

  const authingFirst = bearerToken ? shouldVerifyAuthingBeforeSupabase(bearerToken) : false
  if (bearerToken && authingFirst) {
    const authingUser = await getAuthingVerifiedUserFromBearer(bearerToken)
    if (authingUser) return authingUser
  }

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

  if (!bearerToken || authingFirst) return null

  return getAuthingVerifiedUserFromBearer(bearerToken)
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
