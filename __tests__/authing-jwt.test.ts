import { createSign, generateKeyPairSync } from "crypto"
import fs from "fs"
import { clearAuthingJwksCacheForTests, verifyAuthingJwt } from "@/lib/auth/authing-jwt"
import { getVerifiedUser, requireUser } from "@/lib/auth/verified-user"

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

function createJwt(payload: Record<string, unknown>, privateKey: string, kid = "test-key") {
  const header = { alg: "RS256", kid, typ: "JWT" }
  const encodedHeader = base64Url(JSON.stringify(header))
  const encodedPayload = base64Url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = createSign("RSA-SHA256").update(signingInput).end().sign(privateKey)
  return `${signingInput}.${base64Url(signature)}`
}

function createMockRequest(headers: Record<string, string> = {}) {
  return {
    headers: {
      get(name: string) {
        const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
        return entry?.[1] || null
      },
    },
    cookies: {
      getAll() {
        return []
      },
    },
  } as any
}

describe("Authing JWT verification", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  const publicJwk = publicKey.export({ format: "jwk" })
  const env = {
    AUTHING_ISSUER: "https://auth.example.com/oidc",
    AUTHING_AUDIENCE: "authing-app-id",
    AUTHING_JWKS_URL: "https://auth.example.com/oidc/.well-known/jwks.json",
  }
  const nowMs = 1_800_000_000_000
  const fetchJwks = jest.fn(async () => ({
    ok: true,
    json: async () => ({ keys: [{ ...publicJwk, kid: "test-key", alg: "RS256", use: "sig" }] }),
  }))

  beforeEach(() => {
    clearAuthingJwksCacheForTests()
    fetchJwks.mockClear()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })

  it("rejects invalid Authing tokens", async () => {
    await expect(verifyAuthingJwt("not-a-jwt", env, fetchJwks, nowMs)).resolves.toBeNull()

    const wrongIssuer = createJwt({
      sub: "authing-user-1",
      iss: "https://evil.example.com",
      aud: "authing-app-id",
      exp: Math.floor(nowMs / 1000) + 60,
    }, privatePem)
    await expect(verifyAuthingJwt(wrongIssuer, env, fetchJwks, nowMs)).resolves.toBeNull()
  })

  it("accepts a valid Authing JWT and maps sub to verified user id", async () => {
    const token = createJwt({
      sub: "507f1f77bcf86cd799439011",
      email: "authing-user@example.com",
      iss: "https://auth.example.com/oidc",
      aud: "authing-app-id",
      exp: Math.floor(nowMs / 1000) + 60,
    }, privatePem)

    const payload = await verifyAuthingJwt(token, env, fetchJwks, nowMs)
    expect(payload).toMatchObject({ sub: "507f1f77bcf86cd799439011", email: "authing-user@example.com" })
  })

  it("lets requireUser identify a valid Authing bearer token", async () => {
    process.env.AUTHING_ISSUER = env.AUTHING_ISSUER
    process.env.AUTHING_AUDIENCE = env.AUTHING_AUDIENCE
    process.env.AUTHING_JWKS_URL = env.AUTHING_JWKS_URL
    const originalFetch = global.fetch
    global.fetch = fetchJwks as any

    const token = createJwt({
      sub: "507f1f77bcf86cd799439011",
      email: "authing-user@example.com",
      iss: "https://auth.example.com/oidc",
      aud: "authing-app-id",
      exp: Math.floor(Date.now() / 1000) + 60,
    }, privatePem)

    try {
      const auth = await requireUser(createMockRequest({ Authorization: `Bearer ${token}` }))
      expect(auth.response).toBeNull()
      expect(auth.user).toMatchObject({
        id: "507f1f77bcf86cd799439011",
        email: "authing-user@example.com",
        provider: "authing",
      })
    } finally {
      global.fetch = originalFetch
      delete process.env.AUTHING_ISSUER
      delete process.env.AUTHING_AUDIENCE
      delete process.env.AUTHING_JWKS_URL
    }
  })

  it("returns 401 when no verified token is present", async () => {
    const auth = await requireUser(createMockRequest())
    expect(auth.user).toBeNull()
    expect(auth.response?.status).toBe(401)
  })

  it("returns 401 for an invalid Authing bearer token", async () => {
    const auth = await requireUser(createMockRequest({ Authorization: "Bearer invalid.authing.token" }))
    expect(auth.user).toBeNull()
    expect(auth.response?.status).toBe(401)
  })

  it("does not use forged X-User-Id as identity", async () => {
    const user = await getVerifiedUser(createMockRequest({ "X-User-Id": "507f1f77bcf86cd799439011" }))
    expect(user).toBeNull()
  })

  it("keeps the Supabase verification path before Authing fallback", () => {
    const source = fs.readFileSync("lib/auth/verified-user.ts", "utf8")
    expect(source).toContain("supabase.auth.getUser(bearerToken)")
    expect(source).toContain("supabase.auth.getUser()")
    expect(source).toContain("verifyAuthingJwt(bearerToken)")
  })
})
