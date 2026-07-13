import { logger, sanitizeLogValue } from "@/lib/logger"

describe("structured logger redaction", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("redacts identities, credentials, and tokens while preserving correlation IDs", () => {
    const sanitized = sanitizeLogValue({
      userId: "user-sensitive-id",
      email: "student@example.com",
      token: "secret-token",
      requestId: "req-123",
      traceId: "trace-456",
      nested: { password: "password-value" },
    })

    expect(sanitized).toEqual({
      userId: "[REDACTED_ID]",
      email: "[REDACTED]",
      token: "[REDACTED]",
      requestId: "req-123",
      traceId: "trace-456",
      nested: { password: "[REDACTED]" },
    })
  })

  it("sanitizes bearer credentials embedded in error messages", () => {
    expect(sanitizeLogValue(new Error("request failed Authorization: Bearer secret.value"))).toEqual({
      name: "Error",
      message: "request failed Authorization: Bearer [REDACTED]",
    })
  })

  it("handles arrays, circular references, primitives, and error codes", () => {
    const circular: Record<string, unknown> = { value: "safe" }
    circular.self = circular
    const codedError = Object.assign(new Error("token=private"), { code: "UPSTREAM_FAILED" })

    expect(sanitizeLogValue([circular, null, 42, codedError])).toEqual([
      { value: "safe", self: "[CIRCULAR]" },
      null,
      42,
      { name: "Error", message: "token=[REDACTED]", code: "UPSTREAM_FAILED" },
    ])
  })

  it("emits structured production logs and suppresses debug output", () => {
    const info = jest.spyOn(console, "info").mockImplementation()
    const warn = jest.spyOn(console, "warn").mockImplementation()
    const error = jest.spyOn(console, "error").mockImplementation()
    const debug = jest.spyOn(console, "debug").mockImplementation()

    logger.info("request token=private", { requestId: "req-1", email: "student@example.com" })
    logger.warn("warning", { taskId: "task-1" }, { password: "private" })
    logger.error({ secret: "private" })
    logger.debug("hidden")

    expect(info).toHaveBeenCalledWith(expect.stringContaining('"requestId":"req-1"'))
    expect(info).toHaveBeenCalledWith(expect.stringContaining("[REDACTED]"))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"level":"warn"'))
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"message":"application_log"'))
    expect(debug).not.toHaveBeenCalled()
  })
})
