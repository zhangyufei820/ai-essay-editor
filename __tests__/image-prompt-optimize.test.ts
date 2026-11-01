import { NextRequest } from "next/server"

const internalDifyFetch = jest.fn()

jest.mock("@/lib/internal-dify-fetch", () => ({ internalDifyFetch }))
jest.mock("@/lib/auth/verified-user", () => ({
  requireUser: jest.fn(async () => ({ user: { id: "test-user" }, response: null })),
}))
jest.mock("@/lib/rate-limit", () => ({ applyRateLimit: jest.fn(() => null) }))

describe("POST /api/image-prompt/optimize", () => {
  const originalGateway = process.env.LLM_GATEWAY_BASE_URL
  const originalMasterKey = process.env.LITELLM_MASTER_KEY
  const originalOptimizerKey = process.env.DIFY_IMAGE_PROMPT_OPTIMIZER_API_KEY

  afterEach(() => {
    if (originalGateway === undefined) delete process.env.LLM_GATEWAY_BASE_URL
    else process.env.LLM_GATEWAY_BASE_URL = originalGateway
    if (originalMasterKey === undefined) delete process.env.LITELLM_MASTER_KEY
    else process.env.LITELLM_MASTER_KEY = originalMasterKey
    if (originalOptimizerKey === undefined) delete process.env.DIFY_IMAGE_PROMPT_OPTIMIZER_API_KEY
    else process.env.DIFY_IMAGE_PROMPT_OPTIMIZER_API_KEY = originalOptimizerKey
    jest.clearAllMocks()
  })

  it("optimizes through the existing gateway when the dedicated Dify key is absent", async () => {
    delete process.env.DIFY_IMAGE_PROMPT_OPTIMIZER_API_KEY
    process.env.LLM_GATEWAY_BASE_URL = "http://gateway:4000/v1"
    process.env.LITELLM_MASTER_KEY = "test-gateway-key"
    internalDifyFetch.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "一只白猫，侧光，浅景深，横幅构图" } }],
    }), { status: 200 }))

    const { POST } = await import("@/app/api/image-prompt/optimize/route")
    const response = await POST(new NextRequest("http://localhost/api/image-prompt/optimize", {
      method: "POST",
      body: JSON.stringify({ prompt: "白猫", model: "gpt-image-2" }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true, optimized_prompt: "一只白猫，侧光，浅景深，横幅构图",
    })
    const [url, options] = internalDifyFetch.mock.calls[0]
    expect(url).toBe("http://gateway:4000/v1/chat/completions")
    expect(JSON.parse(options.body)).toMatchObject({ model: "sx-chinese-text" })
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it("returns a controlled error when the gateway returns no usable text", async () => {
    delete process.env.DIFY_IMAGE_PROMPT_OPTIMIZER_API_KEY
    process.env.LLM_GATEWAY_BASE_URL = "http://gateway:4000/v1"
    process.env.LITELLM_MASTER_KEY = "test-gateway-key"
    internalDifyFetch.mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 }))

    const { POST } = await import("@/app/api/image-prompt/optimize/route")
    const response = await POST(new NextRequest("http://localhost/api/image-prompt/optimize", {
      method: "POST", body: JSON.stringify({ prompt: "白猫" }),
    }))
    expect(response.status).toBe(502)
    expect((await response.json()).code).toBe("EMPTY_OPTIMIZED_PROMPT")
  })
})
