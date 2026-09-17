jest.mock("server-only", () => ({}))
jest.mock("@/lib/essay-ai-suite-client", () => ({
  callEssayAiSuite: jest.fn(),
}))
jest.mock("@/lib/internal-dify-fetch", () => ({
  internalDifyFetch: jest.fn(),
}))

import { callEssayAiSuite } from "@/lib/essay-ai-suite-client"
import {
  ESSAY_OCR_TEXT_TOKEN_TTL_MS,
  EssayImageFallbackError,
  MAX_ESSAY_OCR_TEXT_LENGTH,
  extractEssayTextFromImage,
  getVerifiedEssayOcrTextFromAttachments,
  gradeEssayWithFallback,
  isUsableEssayOcrText,
  signEssayOcrTextToken,
  verifyEssayOcrTextToken,
} from "@/lib/essay-image-fallback"
import { internalDifyFetch } from "@/lib/internal-dify-fetch"

const callEssayAiSuiteMock = callEssayAiSuite as jest.Mock
const internalDifyFetchMock = internalDifyFetch as jest.Mock

const validReport = [
  "# 作文批改报告",
  "综合总分：86/100分",
  "## 总评",
  "文章主题明确，内容完整，结构由开头、主体和结尾组成，叙事顺序清楚。",
  "## 优点",
  "语言自然，段落衔接顺畅，细节描写能够支撑中心。",
  "## 修改建议",
  "建议补充人物动作和环境描写，并对结尾进行润色，使主题更集中。",
].join("\n")

describe("essay image fallback", () => {
  const originalEnv = {
    ESSAY_OCR_SIGNING_SECRET: process.env.ESSAY_OCR_SIGNING_SECRET,
    LITELLM_MASTER_KEY: process.env.LITELLM_MASTER_KEY,
    ESSAY_AI_SUITE_API_TOKEN: process.env.ESSAY_AI_SUITE_API_TOKEN,
    LLM_GATEWAY_BASE_URL: process.env.LLM_GATEWAY_BASE_URL,
    SHENXIANG_NEW_API_BASE_URL: process.env.SHENXIANG_NEW_API_BASE_URL,
    SHENXIANG_NEW_API_TEXT_API_KEY: process.env.SHENXIANG_NEW_API_TEXT_API_KEY,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.ESSAY_OCR_SIGNING_SECRET = "test-essay-ocr-signing-secret"
    process.env.LITELLM_MASTER_KEY = "test-gateway-key"
    process.env.LLM_GATEWAY_BASE_URL = "http://llm-gateway:4000/v1/"
    delete process.env.SHENXIANG_NEW_API_BASE_URL
    delete process.env.SHENXIANG_NEW_API_TEXT_API_KEY
  })

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("returns normalized text only from the configured vision OCR provider", async () => {
    callEssayAiSuiteMock.mockResolvedValue({
      ok: true,
      result: {
        image_id: "file-1",
        text: `  第一段记录了春天的校园。\r\n\r\n\r\n\r\n${"第二段继续描写花草和同学们的活动。".repeat(8)}  `,
        confidence: null,
        provider: "openai-compatible-vision",
        status: "success",
        error: null,
      },
    })

    const result = await extractEssayTextFromImage({
      fileId: "file-1",
      fileName: "essay.jpg",
      imageBase64: "data:image/jpeg;base64,aGVsbG8=",
    })

    expect(result.provider).toBe("essay-ai-suite")
    expect(result.text.startsWith("第一段记录了春天的校园。\n\n\n第二段")).toBe(true)
    expect(callEssayAiSuiteMock).toHaveBeenCalledWith(
      "/api/ocr/image",
      {
        image_id: "file-1",
        file_name: "essay.jpg",
        image_base64: "aGVsbG8=",
      },
      20_000,
    )
    expect(internalDifyFetchMock).not.toHaveBeenCalled()
  })

  it("rejects refusal, short, and truncated OCR output", () => {
    expect(isUsableEssayOcrText("春天来了，我和同学们在校园里观察花草并认真记录。"))
      .toBe(true)
    expect(isUsableEssayOcrText("抱歉，我无法识别图片中的作文内容，请重新上传。"))
      .toBe(false)
    expect(isUsableEssayOcrText("春天来了"))
      .toBe(false)
    expect(isUsableEssayOcrText("文".repeat(MAX_ESSAY_OCR_TEXT_LENGTH)))
      .toBe(false)
    expect(isUsableEssayOcrText(
      "这是一段足够长但由上游明确标记为截断的作文正文内容。",
      { truncated: true },
    )).toBe(false)
  })

  it("ignores non-vision suite OCR output and uses the gateway", async () => {
    callEssayAiSuiteMock.mockResolvedValue({
      ok: true,
      result: {
        image_id: "file-passthrough",
        text: "这段文字来自调用方直传，不能作为真实图片识别结果。",
        confidence: null,
        provider: "passthrough",
        status: "success",
        error: null,
      },
    })
    internalDifyFetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: { content: "春天来了，我和同学们在校园里观察花草并认真记录。" },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }))

    await expect(extractEssayTextFromImage({
      fileId: "file-passthrough",
      imageBase64: "aGVsbG8=",
    })).resolves.toEqual({
      text: "春天来了，我和同学们在校园里观察花草并认真记录。",
      provider: "llm-gateway",
    })
  })

  it("uses sx-chinese-text vision when essay-ai-suite OCR fails", async () => {
    callEssayAiSuiteMock.mockResolvedValue({ ok: false, error: "unavailable" })
    internalDifyFetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "  春天来了。\r\n我和同学们在花园里观察花草并认真记录。  " } }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }))

    const result = await extractEssayTextFromImage({
      fileId: "file-2",
      imageBase64: "aGVsbG8=",
      mimeType: "image/png",
    })

    expect(result).toEqual({
      text: "春天来了。\n我和同学们在花园里观察花草并认真记录。",
      provider: "llm-gateway",
    })
    expect(internalDifyFetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = internalDifyFetchMock.mock.calls[0]
    expect(url).toBe("http://llm-gateway:4000/v1/chat/completions")
    expect(init.headers.Authorization).toBe("Bearer test-gateway-key")
    expect(init.signal).toBeInstanceOf(AbortSignal)
    const body = JSON.parse(init.body)
    expect(body.model).toBe("sx-chinese-text")
    expect(body.messages[1].content[1].image_url.url).toBe("data:image/png;base64,aGVsbG8=")
  })

  it("rejects gateway output when the model reports token truncation", async () => {
    callEssayAiSuiteMock.mockResolvedValue({ ok: false, error: "unavailable" })
    internalDifyFetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        finish_reason: "length",
        message: { content: "这篇作文描写了春天校园里的花草和同学们的活动。" },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }))

    await expect(extractEssayTextFromImage({
      fileId: "file-truncated",
      imageBase64: "aGVsbG8=",
    })).rejects.toEqual(expect.objectContaining<Partial<EssayImageFallbackError>>({
      code: "ESSAY_OCR_UNUSABLE_RESULT",
    }))
  })

  it("binds the OCR token to user, final file id, text, and a short expiry", () => {
    const now = Date.parse("2026-09-16T02:15:00Z")
    const params = {
      userId: "user-1",
      fileId: "dify-upload-file-1",
      text: "第一段记录春天校园里的花草。\r\n第二段描写同学们认真观察的过程。",
      now,
    }
    const token = signEssayOcrTextToken(params)
    const [encoded] = token.split(".")
    const payloadText = Buffer.from(encoded, "base64url").toString("utf8")

    expect(token).toBeTruthy()
    expect(payloadText).not.toContain(params.userId)
    expect(payloadText).not.toContain(params.fileId)
    expect(payloadText).not.toContain("春天校园")
    expect(verifyEssayOcrTextToken(token, { ...params, now: now + 1_000 })).toBe(true)
    expect(verifyEssayOcrTextToken(`${token}x`, { ...params, now: now + 1_000 })).toBe(false)
    expect(verifyEssayOcrTextToken(token, { ...params, userId: "user-2", now: now + 1_000 })).toBe(false)
    expect(verifyEssayOcrTextToken(token, { ...params, fileId: "other-file", now: now + 1_000 })).toBe(false)
    expect(verifyEssayOcrTextToken(token, { ...params, text: "被篡改", now: now + 1_000 })).toBe(false)
    expect(verifyEssayOcrTextToken(token, {
      ...params,
      text: "第一段记录春天校园里的花草。\n第二段描写同学们认真观察的过程。",
      now: now + 1_000,
    })).toBe(false)
    expect(verifyEssayOcrTextToken(token, {
      ...params,
      now: now + ESSAY_OCR_TEXT_TOKEN_TTL_MS,
    })).toBe(false)
  })

  it("aggregates every verified image OCR attachment in requested file order", () => {
    const userId = "user-1"
    const pageOne = "第一页作文正文描写了春天校园里的花草和清风。"
    const pageTwo = "第二页作文正文记录了同学们观察植物的完整过程。"
    const pageOneToken = signEssayOcrTextToken({ userId, fileId: "page-1", text: pageOne })
    const pageTwoToken = signEssayOcrTextToken({ userId, fileId: "page-2", text: pageTwo })

    expect(getVerifiedEssayOcrTextFromAttachments({
      userId,
      fileIds: ["page-2", "page-1"],
      fileAttachments: [
        {
          id: "page-1",
          mimeType: "image/jpeg",
          extractedText: pageOne,
          extractedTextToken: pageOneToken,
          ignored: "must not affect verification",
        },
        {
          id: "not-requested",
          mimeType: "image/jpeg",
          extractedText: "不应读取",
          extractedTextToken: pageOneToken,
        },
        {
          id: "page-2",
          mimeType: "image/png",
          extractedText: pageTwo,
          extractedTextToken: pageTwoToken,
        },
      ],
    })).toEqual({
      text: `${pageTwo}\n\n${pageOne}`,
      fileIds: ["page-2", "page-1"],
    })
  })

  it("rejects the whole fallback when one requested page is missing or untrusted", () => {
    const userId = "user-1"
    const pageOne = "第一页作文正文描写了春天校园里的花草和清风。"
    const pageOneToken = signEssayOcrTextToken({ userId, fileId: "page-1", text: pageOne })
    const baseAttachments = [{
      id: "page-1",
      mimeType: "image/jpeg",
      extractedText: pageOne,
      extractedTextToken: pageOneToken,
    }]

    expect(getVerifiedEssayOcrTextFromAttachments({
      userId,
      fileIds: ["page-1", "page-2"],
      fileAttachments: baseAttachments,
    })).toBeNull()
    expect(getVerifiedEssayOcrTextFromAttachments({
      userId,
      fileIds: ["page-1", " page-1 "],
      fileAttachments: baseAttachments,
    })).toBeNull()
    expect(getVerifiedEssayOcrTextFromAttachments({
      userId,
      fileIds: ["page-1", "page-2"],
      fileAttachments: [
        ...baseAttachments,
        {
          id: "page-2",
          mimeType: "image/png",
          extractedText: "被篡改的第二页",
          extractedTextToken: pageOneToken,
        },
      ],
    })).toBeNull()
    expect(getVerifiedEssayOcrTextFromAttachments({
      userId,
      fileIds: ["page-1", "document"],
      fileAttachments: [
        ...baseAttachments,
        {
          id: "document",
          mimeType: "application/pdf",
          extractedText: pageOne,
          extractedTextToken: pageOneToken,
        },
      ],
    })).toBeNull()
  })

  it("rejects verified multi-page OCR text above the grading input limit", () => {
    const userId = "user-1"
    const pageOne = "甲".repeat(12_000)
    const pageTwo = "乙".repeat(12_000)

    expect(getVerifiedEssayOcrTextFromAttachments({
      userId,
      fileIds: ["page-1", "page-2"],
      fileAttachments: [
        {
          id: "page-1",
          mimeType: "image/jpeg",
          extractedText: pageOne,
          extractedTextToken: signEssayOcrTextToken({ userId, fileId: "page-1", text: pageOne }),
        },
        {
          id: "page-2",
          mimeType: "image/jpeg",
          extractedText: pageTwo,
          extractedTextToken: signEssayOcrTextToken({ userId, fileId: "page-2", text: pageTwo }),
        },
      ],
    })).toBeNull()
  })

  it("returns only a validated LLM grading report", async () => {
    callEssayAiSuiteMock.mockResolvedValue({
      ok: true,
      result: {
        status: "success",
        provider: "llm",
        markdown_report: validReport,
        model: "sx-chinese-text",
        prompt_version: "essay-grading-v1",
      },
    })

    await expect(gradeEssayWithFallback({
      text: "春天来了，我和同学一起去公园观察花草，记录了许多有趣的细节。",
      essayId: "essay-1",
      gradeLevel: "初中",
    })).resolves.toEqual({
      markdownReport: validReport,
      provider: "llm",
      model: "sx-chinese-text",
      promptVersion: "essay-grading-v1",
    })
    expect(callEssayAiSuiteMock).toHaveBeenCalledWith(
      "/api/essay/grade-single",
      expect.objectContaining({
        essay_id: "essay-1",
        grade_level: "初中",
      }),
      35_000,
      undefined,
    )
  })

  it("uses the configured direct text model before the slower suite grader", async () => {
    process.env.SHENXIANG_NEW_API_BASE_URL = "http://new-api:3000/v1/"
    process.env.SHENXIANG_NEW_API_TEXT_API_KEY = "test-new-api-key"
    internalDifyFetchMock.mockResolvedValue(new Response(JSON.stringify({
      model: "gpt-6-astra",
      choices: [{
        finish_reason: "stop",
        message: { content: validReport },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }))

    await expect(gradeEssayWithFallback({
      text: "春天来了，我和同学一起去公园观察花草，记录了许多有趣的细节。",
      gradeLevel: "初中",
    })).resolves.toEqual({
      markdownReport: validReport,
      provider: "llm",
      model: "gpt-6-astra",
      promptVersion: "direct-essay-grading-v1",
    })
    expect(internalDifyFetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = internalDifyFetchMock.mock.calls[0]
    expect(url).toBe("http://new-api:3000/v1/chat/completions")
    expect(init.headers.Authorization).toBe("Bearer test-new-api-key")
    expect(init.signal).toBeInstanceOf(AbortSignal)
    const body = JSON.parse(init.body)
    expect(body.model).toBe("gpt-6-astra")
    expect(body.max_tokens).toBe(1_400)
    expect(body.messages[0].content).toContain("第一行必须严格使用")
    expect(body.messages[1].content).toContain("学段：初中")
    expect(callEssayAiSuiteMock).not.toHaveBeenCalled()
  })

  it("falls back to the suite when the direct text model is unavailable", async () => {
    process.env.SHENXIANG_NEW_API_BASE_URL = "http://new-api:3000/v1"
    process.env.SHENXIANG_NEW_API_TEXT_API_KEY = "test-new-api-key"
    internalDifyFetchMock.mockResolvedValue(new Response(JSON.stringify({
      error: { message: "unavailable" },
    }), { status: 503, headers: { "Content-Type": "application/json" } }))
    callEssayAiSuiteMock.mockResolvedValue({
      ok: true,
      result: {
        status: "success",
        provider: "llm",
        markdown_report: validReport,
        model: "sx-chinese-text",
        prompt_version: "essay-grading-v1",
      },
    })

    await expect(gradeEssayWithFallback({
      text: "春天来了，我和同学一起去公园观察花草，记录了许多有趣的细节。",
    })).resolves.toMatchObject({
      markdownReport: validReport,
      model: "sx-chinese-text",
      promptVersion: "essay-grading-v1",
    })
    expect(internalDifyFetchMock).toHaveBeenCalledTimes(1)
    expect(callEssayAiSuiteMock).toHaveBeenCalledTimes(1)
  })

  it("rejects unusable OCR text before calling the grading service", async () => {
    await expect(gradeEssayWithFallback({
      text: "抱歉，我无法识别图片中的作文内容，请重新上传。",
    })).rejects.toEqual(expect.objectContaining<Partial<EssayImageFallbackError>>({
      code: "ESSAY_FALLBACK_TEXT_INVALID",
    }))
    expect(callEssayAiSuiteMock).not.toHaveBeenCalled()
  })

  it("propagates cancellation to grading and discards a result resolved after abort", async () => {
    const controller = new AbortController()
    let resolveGrade!: (value: unknown) => void
    callEssayAiSuiteMock.mockImplementation(() => new Promise((resolve) => {
      resolveGrade = resolve
    }))

    const grading = gradeEssayWithFallback({
      text: "春天来了，我和同学一起去公园观察花草，记录了许多有趣的细节。",
      signal: controller.signal,
    })
    for (let attempt = 0; attempt < 5 && callEssayAiSuiteMock.mock.calls.length === 0; attempt += 1) {
      await Promise.resolve()
    }
    expect(callEssayAiSuiteMock).toHaveBeenCalledWith(
      "/api/essay/grade-single",
      expect.any(Object),
      35_000,
      controller.signal,
    )

    controller.abort()
    resolveGrade({
      ok: true,
      result: {
        status: "success",
        provider: "llm",
        markdown_report: validReport,
      },
    })

    await expect(grading).rejects.toEqual(expect.objectContaining<Partial<EssayImageFallbackError>>({
      code: "ESSAY_FALLBACK_GRADE_ABORTED",
    }))
  })

  it("rejects local-draft grading even when its report looks valid", async () => {
    callEssayAiSuiteMock.mockResolvedValue({
      ok: true,
      result: {
        status: "success",
        provider: "local-draft",
        markdown_report: validReport,
      },
    })

    await expect(gradeEssayWithFallback({
      text: "这是一篇用于回退批改测试的完整作文正文。",
    })).rejects.toEqual(expect.objectContaining<Partial<EssayImageFallbackError>>({
      code: "ESSAY_FALLBACK_GRADE_INVALID",
    }))
  })
})
