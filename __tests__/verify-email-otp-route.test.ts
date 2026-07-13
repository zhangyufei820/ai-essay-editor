import { NextRequest } from "next/server"

const verifyChallengeMock = jest.fn()
const findUserMock = jest.fn()
const createUserMock = jest.fn()
const generateLinkMock = jest.fn()
const verifySessionMock = jest.fn()
const createClientMock = jest.fn()

jest.mock("@/lib/email-otp-store", () => ({
  emailOTPStore: { verify: verifyChallengeMock },
}))

jest.mock("@/lib/auth/find-user-by-email", () => ({
  findAuthUserIdByEmail: findUserMock,
}))

jest.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}))

jest.mock("@/lib/supabase/server", () => ({
  createServerClient: jest.fn(async () => ({
    auth: { verifyOtp: verifySessionMock },
  })),
}))

jest.mock("@/lib/rate-limit", () => ({
  checkIpRateLimit: jest.fn(() => ({ allowed: true })),
  createRateLimitResponse: jest.fn(() => new Response(null, { status: 429 })),
  getClientIP: jest.fn(() => "127.0.0.1"),
}))

jest.mock("@/lib/credits", () => ({
  handleReferralSignup: jest.fn(),
  getUserCredits: jest.fn(),
  createUserReferralCode: jest.fn(),
}))

function post(code = "123456") {
  return new NextRequest("http://localhost/api/auth/verify-email-otp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "Student@Example.com", code }),
  })
}

describe("POST /api/auth/verify-email-otp", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role"
  })

  beforeEach(() => {
    jest.clearAllMocks()
    verifyChallengeMock.mockResolvedValue("valid")
    findUserMock.mockResolvedValue("00000000-0000-4000-8000-000000000001")
    createUserMock.mockResolvedValue({ data: { user: null }, error: null })
    generateLinkMock.mockResolvedValue({
      data: { properties: { hashed_token: "test-token-hash" } },
      error: null,
    })
    verifySessionMock.mockResolvedValue({ error: null })
    createClientMock.mockReturnValue({
      auth: { admin: { createUser: createUserMock, generateLink: generateLinkMock } },
      rpc: jest.fn(),
    })
  })

  it("logs in an existing user without enumerating the auth directory", async () => {
    const { POST } = await import("@/app/api/auth/verify-email-otp/route")

    const response = await POST(post())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      message: "验证成功",
      needsEmailConfirmation: false,
    })
    expect(findUserMock).toHaveBeenCalledWith(expect.anything(), "student@example.com")
    expect(createUserMock).not.toHaveBeenCalled()
    expect(verifySessionMock).toHaveBeenCalledWith({ type: "magiclink", token_hash: "test-token-hash" })
  })

  it("fails closed when the auth lookup RPC is unavailable", async () => {
    findUserMock.mockRejectedValue(new Error("AUTH_USER_LOOKUP_UNAVAILABLE"))
    const { POST } = await import("@/app/api/auth/verify-email-otp/route")

    const response = await POST(post())

    expect(response.status).toBe(503)
    expect(createUserMock).not.toHaveBeenCalled()
  })

  it("rejects invalid challenges before creating an admin client", async () => {
    verifyChallengeMock.mockResolvedValue("invalid")
    const { POST } = await import("@/app/api/auth/verify-email-otp/route")

    const response = await POST(post("000000"))

    expect(response.status).toBe(400)
    expect(createClientMock).not.toHaveBeenCalled()
  })
})
