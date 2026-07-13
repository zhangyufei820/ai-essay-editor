const mockInternalDifyFetch = jest.fn()

jest.mock("@/lib/internal-dify-fetch", () => ({
  internalDifyFetch: (...args: unknown[]) => mockInternalDifyFetch(...args),
}))

import { createOmniTtsJob, listOmniVoices } from "@/lib/omnivoice-gateway-client"

describe("public voice gateway responses", () => {
  const originalApiKey = process.env.OMNIVOICE_GATEWAY_API_KEY

  beforeEach(() => {
    process.env.OMNIVOICE_GATEWAY_API_KEY = "test-key"
    mockInternalDifyFetch.mockReset()
  })

  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OMNIVOICE_GATEWAY_API_KEY
    else process.env.OMNIVOICE_GATEWAY_API_KEY = originalApiKey
  })

  it("maps provider-branded voice metadata to product copy", async () => {
    mockInternalDifyFetch.mockResolvedValue(new Response(JSON.stringify({
      voices: [
        { voice_id: "teacher_male_01", name: "沈翔智学男老师", description: "课堂讲解", enabled: true },
        { voice_id: "default", name: "OmniVoice 默认音色", description: "OmniVoice engine preset", enabled: true },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }))

    const result = await listOmniVoices()

    expect(result.ok).toBe(true)
    expect(result.voices).toEqual([
      { voice_id: "teacher_male_01", name: "沈翔智学男老师", description: "课堂讲解", enabled: true },
      { voice_id: "default", name: "沈翔智学标准音色 2", description: undefined, enabled: true },
    ])
    expect(JSON.stringify(result)).not.toMatch(/OmniVoice|engine/i)
  })

  it("returns a stable Chinese fallback for provider failures", async () => {
    mockInternalDifyFetch.mockResolvedValue(new Response(JSON.stringify({
      error: { message: "OmniVoice synthesis failed at tokenflux.dev" },
    }), { status: 502, headers: { "Content-Type": "application/json" } }))

    const result = await createOmniTtsJob({ text: "测试" })

    expect(result).toEqual({ ok: false, job: null, error: "创建语音任务失败，请稍后重试。" })
  })
})
