import { NextRequest } from "next/server"
import { readFileSync } from "fs"
import path from "path"
import sharp from "sharp"

const internalDifyFetch = jest.fn()
const extractEssayTextFromImage = jest.fn()
const signEssayOcrTextToken = jest.fn()

jest.mock("@/lib/internal-dify-fetch", () => ({
  internalDifyFetch,
}))

jest.mock("@/lib/essay-image-fallback", () => ({
  extractEssayTextFromImage,
  signEssayOcrTextToken,
}))

jest.mock("@/lib/auth/verified-user", () => ({
  requireUser: jest.fn(async () => ({ user: { id: "user-1" }, response: null })),
}))

jest.mock("@/lib/dify-credentials", () => ({
  getDifyCredentialForModel: jest.fn(() => ({ credential: "dify-key" })),
}))

jest.mock("@/lib/rate-limit", () => ({
  checkIpRateLimit: jest.fn(() => ({ allowed: true })),
  createRateLimitResponse: jest.fn(() => new Response(null, { status: 429 })),
  getClientIP: jest.fn(() => "127.0.0.1"),
}))

jest.mock("@/lib/ai-task-trace", () => ({
  createRequestId: jest.fn(() => "upload-request-1"),
  sanitizeForTrace: jest.fn((value: unknown) => String(value)),
}))

function createUploadRequest(file: File, model: string) {
  const formData = new FormData()
  formData.set("file", file)

  return new NextRequest("http://localhost/api/dify-upload", {
    method: "POST",
    headers: { "X-Model": model },
    body: formData,
  })
}

function successfulDifyUpload() {
  return new Response(JSON.stringify({ id: "dify-file-1" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

describe("POST /api/dify-upload essay OCR", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    internalDifyFetch.mockResolvedValue(successfulDifyUpload())
    signEssayOcrTextToken.mockReturnValue("signed-ocr-proof")
  })

  it("runs standard-image OCR alongside Dify upload and signs the resized OCR text", async () => {
    let markUploadStarted!: () => void
    let markOcrStarted!: () => void
    const uploadStarted = new Promise<void>((resolve) => { markUploadStarted = resolve })
    const ocrStarted = new Promise<void>((resolve) => { markOcrStarted = resolve })

    internalDifyFetch.mockImplementation(async () => {
      markUploadStarted()
      await ocrStarted
      return successfulDifyUpload()
    })
    extractEssayTextFromImage.mockImplementation(async (params) => {
      markOcrStarted()
      await uploadStarted
      const metadata = await sharp(Buffer.from(params.imageBase64, "base64")).metadata()
      expect(metadata.format).toBe("jpeg")
      expect(metadata.width).toBe(2048)
      expect(metadata.height).toBeLessThanOrEqual(2048)
      expect(params).toEqual(expect.objectContaining({
        mimeType: "image/jpeg",
        fileName: expect.stringMatching(/\.jpg$/),
      }))
      return { text: "这是一篇待批改的作文。", provider: "essay-ai-suite" }
    })

    const source = await sharp({
      create: {
        width: 3000,
        height: 1000,
        channels: 3,
        background: "white",
      },
    }).png().toBuffer()
    const { POST } = await import("@/app/api/dify-upload/route")
    const response = await POST(createUploadRequest(
      new File([source], "essay.png", { type: "image/png" }),
      "standard",
    ))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(signEssayOcrTextToken).toHaveBeenCalledWith({
      userId: "user-1",
      fileId: "dify-file-1",
      text: "这是一篇待批改的作文。",
    })
    expect(json.data).toEqual(expect.objectContaining({
      extracted_text: "这是一篇待批改的作文。",
      extracted_text_token: "signed-ocr-proof",
      extracted_char_count: 11,
    }))
  })

  it("keeps a successful Dify upload when OCR fails", async () => {
    extractEssayTextFromImage.mockRejectedValue(new Error("OCR unavailable"))
    const source = await sharp({
      create: {
        width: 1200,
        height: 1600,
        channels: 3,
        background: "white",
      },
    }).jpeg().toBuffer()
    const { POST } = await import("@/app/api/dify-upload/route")
    const response = await POST(createUploadRequest(
      new File([source], "essay.jpg", { type: "image/jpeg" }),
      "standard",
    ))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.id).toBe("dify-file-1")
    expect(json.data.extracted_text).toBeNull()
    expect(json.data.extracted_text_token).toBeNull()
    expect(signEssayOcrTextToken).not.toHaveBeenCalled()
  })

  it("still fails the request when the required Dify upload fails", async () => {
    let markOcrStarted!: () => void
    const ocrStarted = new Promise<void>((resolve) => { markOcrStarted = resolve })
    internalDifyFetch.mockImplementation(async () => {
      await ocrStarted
      return new Response("upstream unavailable", { status: 503 })
    })
    extractEssayTextFromImage.mockImplementation(async () => {
      markOcrStarted()
      return {
        text: "这是一篇待批改的作文。",
        provider: "essay-ai-suite",
      }
    })
    const source = await sharp({
      create: {
        width: 800,
        height: 1200,
        channels: 3,
        background: "white",
      },
    }).jpeg().toBuffer()
    const { POST } = await import("@/app/api/dify-upload/route")
    const response = await POST(createUploadRequest(
      new File([source], "essay.jpg", { type: "image/jpeg" }),
      "standard",
    ))

    expect(response.status).toBe(502)
    expect(extractEssayTextFromImage).toHaveBeenCalledTimes(1)
    expect(signEssayOcrTextToken).not.toHaveBeenCalled()
  })

  it("does not invoke essay OCR for another model", async () => {
    const source = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: "white",
      },
    }).png().toBuffer()
    const { POST } = await import("@/app/api/dify-upload/route")
    const response = await POST(createUploadRequest(
      new File([source], "reference.png", { type: "image/png" }),
      "general-chat",
    ))

    expect(response.status).toBe(200)
    expect(extractEssayTextFromImage).not.toHaveBeenCalled()
    expect(signEssayOcrTextToken).not.toHaveBeenCalled()
  })

  it("skips OCR byte and pixel limit violations without failing Dify upload", async () => {
    internalDifyFetch.mockImplementation(async () => successfulDifyUpload())
    const overByteLimit = new File(
      [new Uint8Array((16 * 1024 * 1024) + 1)],
      "large-essay.jpg",
      { type: "image/jpeg" },
    )
    const overPixelLimitBuffer = await sharp(
      Buffer.alloc(6_400 * 6_300, 255),
      { raw: { width: 6_400, height: 6_300, channels: 1 } },
    ).png({ compressionLevel: 9 }).toBuffer()
    const overPixelLimit = new File(
      [overPixelLimitBuffer],
      "huge-canvas.png",
      { type: "image/png" },
    )
    const { POST } = await import("@/app/api/dify-upload/route")

    const byteResponse = await POST(createUploadRequest(overByteLimit, "standard"))
    const pixelResponse = await POST(createUploadRequest(overPixelLimit, "standard"))
    const [byteJson, pixelJson] = await Promise.all([
      byteResponse.json(),
      pixelResponse.json(),
    ])

    expect(byteResponse.status).toBe(200)
    expect(pixelResponse.status).toBe(200)
    expect(byteJson.data.extracted_text).toBeNull()
    expect(pixelJson.data.extracted_text).toBeNull()
    expect(extractEssayTextFromImage).not.toHaveBeenCalled()
    expect(signEssayOcrTextToken).not.toHaveBeenCalled()
  })

  it("limits each user to two OCR operations and releases slots in finally", async () => {
    internalDifyFetch.mockImplementation(async () => successfulDifyUpload())
    const ocrResolvers: Array<(value: { text: string; provider: string }) => void> = []
    extractEssayTextFromImage.mockImplementation(() => new Promise((resolve) => {
      ocrResolvers.push(resolve)
    }))
    const source = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: "white",
      },
    }).jpeg().toBuffer()
    const { POST } = await import("@/app/api/dify-upload/route")
    const makeRequest = () => createUploadRequest(
      new File([source], "essay.jpg", { type: "image/jpeg" }),
      "standard",
    )

    const requests = [POST(makeRequest()), POST(makeRequest()), POST(makeRequest())]
    for (let attempts = 0; attempts < 20 && ocrResolvers.length < 2; attempts += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(extractEssayTextFromImage).toHaveBeenCalledTimes(2)

    for (const resolve of ocrResolvers) {
      resolve({ text: "这是一篇包含完整正文内容的作文批改测试。", provider: "essay-ai-suite" })
    }
    const responses = await Promise.all(requests)
    const payloads = await Promise.all(responses.map((response) => response.json()))
    expect(responses.every((response) => response.status === 200)).toBe(true)
    expect(payloads.filter((payload) => payload.data.extracted_text).length).toBe(2)
    expect(payloads.filter((payload) => !payload.data.extracted_text).length).toBe(1)

    extractEssayTextFromImage.mockResolvedValue({
      text: "释放槽位后，下一张作文图片可以继续完成文字识别。",
      provider: "essay-ai-suite",
    })
    const afterRelease = await POST(makeRequest())
    expect(afterRelease.status).toBe(200)
    expect(extractEssayTextFromImage).toHaveBeenCalledTimes(3)
  })

  it("keeps OCR text and its proof out of saved history while forwarding both to chat", () => {
    const source = readFileSync(
      path.join(process.cwd(), "components/chat/enhanced-chat-interface.tsx"),
      "utf8",
    )
    const persistenceStart = source.indexOf("files: activeFiles.map(({")
    const persistenceBlock = source.slice(persistenceStart, persistenceStart + 320)

    expect(source).toContain("extractedTextToken?: string")
    expect(source).toContain("data.data?.extracted_text_token")
    expect(source).toContain("extractedTextToken: file.extractedTextToken")
    expect(persistenceStart).toBeGreaterThan(-1)
    expect(persistenceBlock).toContain("extractedText: _extractedText")
    expect(persistenceBlock).toContain("extractedTextToken: _extractedTextToken")
    expect(persistenceBlock).toContain("...file")
    expect(source).toContain("const MAX_CHAT_UPLOAD_FILES = 4")
    expect(source).toContain("selectedFiles.length > availableFileSlots")
    expect(source).toContain("for (const [index, fileToUpload] of selectedFiles.entries())")
    expect(source).not.toContain("Promise.all(uploadPromises)")
  })
})
