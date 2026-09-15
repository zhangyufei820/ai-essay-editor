import { NextRequest } from "next/server"

const exchangeCodeForSessionMock = jest.fn()
const verifyOtpMock = jest.fn()
const getUserMock = jest.fn()

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: {
      exchangeCodeForSession: exchangeCodeForSessionMock,
      verifyOtp: verifyOtpMock,
      getUser: getUserMock,
    },
  })),
}))

jest.mock("@/lib/credits", () => ({
  handleReferralSignup: jest.fn(async () => true),
}))

describe("email confirmation redirects", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = "https://www.shenxiang.school"
    exchangeCodeForSessionMock.mockResolvedValue({ error: null })
    verifyOtpMock.mockResolvedValue({ error: null })
    getUserMock.mockResolvedValue({ data: { user: null } })
  })

  afterAll(() => {
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
  })

  it("never redirects a successful PKCE callback to the internal container origin", async () => {
    const { GET } = await import("@/app/auth/callback/route")
    const request = new Request(
      "https://0.0.0.0:3000/auth/callback?code=test-code&next=%2Fchat%3Fwelcome%3Dtrue",
    )

    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://www.shenxiang.school/chat?welcome=true")
  })

  it("uses the public app origin for token-hash confirmation redirects", async () => {
    const { GET } = await import("@/app/auth/confirm/route")
    const request = new NextRequest(
      "https://0.0.0.0:3000/auth/confirm?token_hash=test-hash&type=signup&next=%2Fchat",
    )

    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://www.shenxiang.school/chat")
  })

  it("uses the public app origin for callback errors", async () => {
    const { GET } = await import("@/app/auth/callback/route")

    const response = await GET(new Request("https://0.0.0.0:3000/auth/callback"))

    expect(response.headers.get("location")).toBe(
      "https://www.shenxiang.school/auth/error?error=missing_code",
    )
  })
})
