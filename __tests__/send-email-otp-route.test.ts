import { NextRequest } from "next/server"

const otpSet = jest.fn(() => true)
const otpDelete = jest.fn()
const otpCanSend = jest.fn(() => true)

jest.mock("@/lib/email-otp-store", () => ({
  emailOTPStore: {
    set: otpSet,
    delete: otpDelete,
    canSend: otpCanSend,
  },
}))

jest.mock("@/lib/rate-limit", () => ({
  checkIpRateLimit: jest.fn(() => ({ allowed: true })),
  createRateLimitResponse: jest.fn(() => new Response(null, { status: 429 })),
  getClientIP: jest.fn(() => "127.0.0.1"),
}))

function post(email: unknown = "student@example.com") {
  return new NextRequest("http://localhost/api/auth/send-email-otp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  })
}

describe("POST /api/auth/send-email-otp", () => {
  const originalApiKey = process.env.RESEND_API_KEY

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.RESEND_API_KEY = "test-resend-key"
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY
    } else {
      process.env.RESEND_API_KEY = originalApiKey
    }
  })

  it("removes the stored OTP and does not log the provider body when delivery fails", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response("provider-secret-details", { status: 502 }),
    )
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined)
    const { POST } = await import("@/app/api/auth/send-email-otp/route")

    const response = await POST(post())
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({ error: "邮件发送失败" })
    expect(otpSet).toHaveBeenCalledWith("student@example.com", expect.stringMatching(/^\d{6}$/), 5 * 60 * 1000)
    expect(otpDelete).toHaveBeenCalledWith("student@example.com")
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"message":"[email-otp] provider request failed"'))
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"status":502'))
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("provider-secret-details")
  })

  it("returns no OTP and sends the provider request with a timeout signal", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 200 }))
    const { POST } = await import("@/app/api/auth/send-email-otp/route")

    const response = await POST(post("Student@Example.com"))
    const json = await response.json()
    const requestInit = fetchSpy.mock.calls[0]?.[1]

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true, message: "验证码已发送到您的邮箱" })
    expect(JSON.stringify(json)).not.toMatch(/devCode|\b\d{6}\b/)
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal)
    expect(otpDelete).not.toHaveBeenCalled()
  })

  it("rejects non-string and oversized email input before storing or sending", async () => {
    const fetchSpy = jest.spyOn(global, "fetch")
    const { POST } = await import("@/app/api/auth/send-email-otp/route")

    for (const email of [123, `${"a".repeat(250)}@example.com`]) {
      const response = await POST(post(email))

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: "邮箱格式不正确" })
    }

    expect(otpSet).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
