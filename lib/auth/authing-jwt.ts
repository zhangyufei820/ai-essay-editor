import { createPublicKey, createVerify, type JsonWebKey } from "crypto"

type Env = Record<string, string | undefined>

export type AuthingJwtPayload = {
  sub: string
  email?: string | null
  phone_number?: string | null
  phone?: string | null
  iss?: string
  aud?: string | string[]
  exp?: number
  nbf?: number
  iat?: number
}

type JwtHeader = {
  alg?: string
  kid?: string
  typ?: string
}

type Jwks = {
  keys?: Array<JsonWebKey & { kid?: string; alg?: string; use?: string }>
}

type FetchLike = (url: string) => Promise<Pick<Response, "ok" | "json">>

const JWKS_CACHE = new Map<string, { expiresAt: number; jwks: Jwks }>()
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  return Buffer.from(padded, "base64")
}

function decodeJsonPart<T>(value: string): T | null {
  try {
    return JSON.parse(decodeBase64Url(value).toString("utf8")) as T
  } catch {
    return null
  }
}

function readConfig(env: Env) {
  const issuer = env.AUTHING_ISSUER?.trim()
  const audience = env.AUTHING_AUDIENCE?.trim() || env.NEXT_PUBLIC_AUTHING_APP_ID?.trim()
  const jwksUrl = env.AUTHING_JWKS_URL?.trim()

  if (!issuer || !audience || !jwksUrl) return null
  return { issuer, audience, jwksUrl }
}

function hasAudience(payloadAudience: string | string[] | undefined, expected: string) {
  if (Array.isArray(payloadAudience)) return payloadAudience.includes(expected)
  return payloadAudience === expected
}

async function fetchJwks(jwksUrl: string, fetchImpl: FetchLike, nowMs: number) {
  const cached = JWKS_CACHE.get(jwksUrl)
  if (cached && cached.expiresAt > nowMs) return cached.jwks

  const response = await fetchImpl(jwksUrl)
  if (!response.ok) return null

  const jwks = (await response.json()) as Jwks
  JWKS_CACHE.set(jwksUrl, { jwks, expiresAt: nowMs + JWKS_CACHE_TTL_MS })
  return jwks
}

export async function verifyAuthingJwt(
  token: string,
  env: Env = process.env,
  fetchImpl: FetchLike = fetch,
  nowMs = Date.now(),
): Promise<AuthingJwtPayload | null> {
  const config = readConfig(env)
  if (!config) {
    if (env.NODE_ENV === "production") {
      console.warn("[Authing] JWT verification is not configured; refusing Authing bearer token")
    }
    return null
  }

  const parts = token.split(".")
  if (parts.length !== 3) return null

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const header = decodeJsonPart<JwtHeader>(encodedHeader)
  const payload = decodeJsonPart<AuthingJwtPayload>(encodedPayload)
  if (!header || !payload?.sub) return null
  if (header.alg !== "RS256" || !header.kid) return null
  if (payload.iss !== config.issuer) return null
  if (!hasAudience(payload.aud, config.audience)) return null

  const nowSeconds = Math.floor(nowMs / 1000)
  if (!payload.exp || payload.exp <= nowSeconds) return null
  if (payload.nbf && payload.nbf > nowSeconds) return null

  const jwks = await fetchJwks(config.jwksUrl, fetchImpl, nowMs)
  const jwk = jwks?.keys?.find((key) => key.kid === header.kid)
  if (!jwk) return null

  const verifier = createVerify("RSA-SHA256")
  verifier.update(`${encodedHeader}.${encodedPayload}`)
  verifier.end()

  const publicKey = createPublicKey({ key: jwk, format: "jwk" })
  const valid = verifier.verify(publicKey, decodeBase64Url(encodedSignature))
  return valid ? payload : null
}

export function clearAuthingJwksCacheForTests() {
  JWKS_CACHE.clear()
}
