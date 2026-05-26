import { NextRequest } from "next/server"

jest.mock("@/lib/rate-limit", () => ({
  checkIpRateLimit: jest.fn(() => ({ allowed: true })),
  createRateLimitResponse: jest.fn(() => new Response(null, { status: 429 })),
  getClientIP: jest.fn(() => "127.0.0.1"),
}))

jest.mock("@/lib/security/request", () => ({
  rejectUntrustedOrigin: jest.fn(() => null),
}))

const callEssayAiSuite = jest.fn()

jest.mock("@/lib/essay-ai-suite-client", () => ({
  callEssayAiSuite,
}))

function post(body?: BodyInit, headers?: HeadersInit) {
  return new NextRequest("http://localhost/api/document-process", {
    method: "POST",
    headers,
    body,
  })
}

describe("POST /api/document-process", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns 400 for empty or non-multipart requests instead of surfacing a 500", async () => {
    const { POST } = await import("@/app/api/document-process/route")

    const response = await POST(post())
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({
      error: "请使用 multipart/form-data 上传文件",
      code: "DOCUMENT_FILE_REQUIRED",
    })
    expect(callEssayAiSuite).not.toHaveBeenCalled()
  })

  it("returns 400 when multipart form data does not contain a file field", async () => {
    const { POST } = await import("@/app/api/document-process/route")
    const form = new FormData()
    form.set("note", "missing file")

    const response = await POST(post(form))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({
      error: "未上传文件",
      code: "DOCUMENT_FILE_REQUIRED",
    })
    expect(callEssayAiSuite).not.toHaveBeenCalled()
  })
})
