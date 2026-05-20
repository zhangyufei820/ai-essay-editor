import { NextRequest } from "next/server"

jest.mock("@/lib/auth/verified-user", () => ({
  requireUser: jest.fn(async () => ({ user: { id: "user-1" } })),
}))

const uploadFile = jest.fn()
const runWorkflow = jest.fn()
const ensureSunoCredits = jest.fn(async () => null)
const chargeSunoBaseCredits = jest.fn(async () => true)
const chargeSunoTokenUsageIfPresent = jest.fn(async () => ({ charged: false, credits: 0, reason: "no_explicit_usage" }))
const recordSunoBillingFailure = jest.fn()

jest.mock("@/lib/suno-dify-client", () => ({
  createSunoDifyClient: () => ({
    uploadFile,
    runWorkflow,
  }),
}))

jest.mock("@/lib/suno-billing", () => ({
  ensureSunoCredits,
  chargeSunoBaseCredits,
  chargeSunoTokenUsageIfPresent,
  recordSunoBillingFailure,
  createSunoChargeDescription: (operation: string) => `Suno ${operation}`,
}))

function makeJsonRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/suno/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/suno/run", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.DIFY_API_KEY = "dify-secret"
    process.env.SUNO_DIFY_API_KEY = "suno-workflow-secret"
    process.env.SUNO_GATEWAY_BASE_URL = "http://vivaapi-suno-gateway:8000"
    process.env.SUNO_GATEWAY_API_KEY = "gateway-secret"
    runWorkflow.mockResolvedValue({
      success: true,
      http_status: 200,
      response_json: {
        data: {
          outputs: {
            success: true,
            task_id: "task-1",
          },
        },
      },
    })
  })

  it("injects gateway variables server side and does not return secrets", async () => {
    const { POST } = await import("@/app/api/suno/run/route")
    const response = await POST(makeJsonRequest({
      operation: "music_custom",
      prompt: "歌词",
      title: "标题",
      tags: "pop",
    }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(runWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      inputs: expect.objectContaining({
        gateway_base_url: "__SERVER_INJECT__",
        gateway_api_key: "__SERVER_INJECT__",
        operation: "music_custom",
      }),
    }))
    expect(JSON.stringify(json)).not.toContain("dify-secret")
    expect(JSON.stringify(json)).not.toContain("suno-workflow-secret")
    expect(JSON.stringify(json)).not.toContain("gateway-secret")
    expect(ensureSunoCredits).toHaveBeenCalledWith("user-1")
    expect(chargeSunoBaseCredits).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      operation: "music_custom",
      referenceId: "task-1",
    }))
  })

  it("does not bill query operations", async () => {
    const { POST } = await import("@/app/api/suno/run/route")
    const response = await POST(makeJsonRequest({
      operation: "fetch_task",
      task_id: "task-1",
    }))

    expect(response.status).toBe(200)
    expect(ensureSunoCredits).not.toHaveBeenCalled()
    expect(chargeSunoBaseCredits).not.toHaveBeenCalled()
  })

  it("returns billing error if post-success credit deduction fails", async () => {
    chargeSunoBaseCredits.mockResolvedValueOnce(false)
    const { POST } = await import("@/app/api/suno/run/route")
    const response = await POST(makeJsonRequest({
      operation: "music_custom",
      prompt: "歌词",
      title: "标题",
      tags: "pop",
    }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.code).toBe("CREDITS_DEDUCT_FAILED")
    expect(recordSunoBillingFailure).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      operation: "music_custom",
    }))
  })

  it("accepts multipart file and uploads through the adapter", async () => {
    uploadFile.mockResolvedValue({
      type: "audio",
      transfer_method: "local_file",
      upload_file_id: "file-1",
    })
    const { POST } = await import("@/app/api/suno/run/route")
    const form = new FormData()
    form.set("operation", "upload_full")
    form.set("audio_file", new File(["abc"], "demo.mp3", { type: "audio/mpeg" }))
    const request = new NextRequest("http://localhost/api/suno/run", {
      method: "POST",
      body: form,
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(uploadFile).toHaveBeenCalled()
    expect(runWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      inputs: expect.objectContaining({
        audio_file: [expect.objectContaining({ upload_file_id: "file-1" })],
      }),
    }))
  })
})
