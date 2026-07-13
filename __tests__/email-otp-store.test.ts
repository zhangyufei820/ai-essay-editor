import { createEmailOtpStore } from "@/lib/email-otp-store"

describe("durable email OTP store", () => {
  const rpc = jest.fn()
  const store = createEmailOtpStore({ rpc } as never, "test-signing-secret")

  beforeEach(() => {
    rpc.mockReset()
  })

  it("stores only deterministic email and code digests through the atomic RPC", async () => {
    rpc.mockResolvedValue({ data: true, error: null })

    await expect(store.set("Student@Example.com", "123456", 300_000)).resolves.toBe(true)

    expect(rpc).toHaveBeenCalledWith("upsert_email_otp_challenge", {
      p_email_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_code_digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_expires_at: expect.any(String),
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("student@example.com")
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("123456")
  })

  it("returns false when the database-enforced send cooldown is active", async () => {
    rpc.mockResolvedValue({ data: false, error: null })

    await expect(store.set("student@example.com", "123456", 300_000)).resolves.toBe(false)
  })

  it("maps atomic verification outcomes without exposing the submitted code", async () => {
    rpc.mockResolvedValue({ data: "valid", error: null })

    await expect(store.verify("student@example.com", "654321")).resolves.toBe("valid")

    expect(rpc).toHaveBeenCalledWith("verify_email_otp_challenge", {
      p_email_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_code_digest: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("654321")
  })

  it("fails closed when the persistence RPC fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } })

    await expect(store.verify("student@example.com", "654321")).rejects.toThrow("EMAIL_OTP_STORE_UNAVAILABLE")
  })

  it("fails closed on malformed results and delete errors", async () => {
    rpc.mockResolvedValueOnce({ data: "unexpected", error: null })
    await expect(store.verify("student@example.com", "654321")).rejects.toThrow("EMAIL_OTP_STORE_UNAVAILABLE")

    rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(store.set("student@example.com", "123456")).rejects.toThrow("EMAIL_OTP_STORE_UNAVAILABLE")

    rpc.mockResolvedValueOnce({ data: null, error: { message: "delete failed" } })
    await expect(store.delete("student@example.com")).rejects.toThrow("EMAIL_OTP_STORE_UNAVAILABLE")
  })

  it("rejects an empty signing secret", () => {
    expect(() => createEmailOtpStore({ rpc } as never, "")).toThrow("EMAIL_OTP_STORE_UNAVAILABLE")
  })

  it("initializes and reuses the environment-backed singleton", async () => {
    const originalEnv = { ...process.env }
    const singletonRpc = jest.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: "valid", error: null })
      .mockResolvedValueOnce({ data: null, error: null })
    const createClient = jest.fn(() => ({ rpc: singletonRpc }))

    jest.resetModules()
    jest.doMock("@supabase/supabase-js", () => ({ createClient }))
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key"
    process.env.EMAIL_OTP_HMAC_SECRET = "singleton-secret"

    try {
      const { emailOTPStore } = require("@/lib/email-otp-store")
      await expect(emailOTPStore.set("student@example.com", "123456")).resolves.toBe(true)
      await expect(emailOTPStore.verify("student@example.com", "123456")).resolves.toBe("valid")
      await expect(emailOTPStore.delete("student@example.com")).resolves.toBeUndefined()
      expect(createClient).toHaveBeenCalledTimes(1)
    } finally {
      process.env = originalEnv
      jest.dontMock("@supabase/supabase-js")
      jest.resetModules()
    }
  })
})
