import { createClient } from "@supabase/supabase-js"
import { settleStaleImageTasks } from "@/lib/image-task-refunds"

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}))

describe("image task stale settlement", () => {
  const mockedCreateClient = createClient as jest.Mock
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role"
    process.env.DIFY_IMAGE_GATEWAY_URL = "http://image-gateway.test"
    process.env.DIFY_IMAGE_GATEWAY_TOKEN = "gateway-token"
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("recovers a stale running Image 2 task when the gateway task already succeeded", async () => {
    const updatePayloads: Array<Record<string, unknown>> = []
    const staleTask = {
      id: "img_request_1",
      user_id: "user_1",
      status: "running",
      stage: "图片正在生成",
      metadata: { previous: "value" },
      upstream_task_id: "gateway_task_1",
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    }

    const staleQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [staleTask], error: null }),
    }
    const updateQuery: {
      update: jest.Mock
      eq: jest.Mock
      in: jest.Mock
    } = {
      update: jest.fn(),
      eq: jest.fn(),
      in: jest.fn(),
    }
    updateQuery.update.mockImplementation((payload: Record<string, unknown>) => {
        updatePayloads.push(payload)
        return updateQuery
      })
    updateQuery.eq.mockReturnValue(updateQuery)
    updateQuery.in.mockResolvedValue({ error: null })
    const supabase = {
      from: jest.fn()
        .mockReturnValueOnce(staleQuery)
        .mockReturnValueOnce(updateQuery),
    }
    mockedCreateClient.mockReturnValue(supabase)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "succeeded",
        elapsed_ms: 27_833,
        result: {
          data: {
            image_url: "https://oss.example.com/generated.png",
          },
        },
      }),
    } as Response)

    const result = await settleStaleImageTasks({ olderThanMs: 15 * 60 * 1000, limit: 1 })

    expect(result).toMatchObject({
      scanned: 1,
      settled: 1,
      recovered: 1,
      refunded: 0,
      errors: [],
    })
    expect(global.fetch).toHaveBeenCalledWith(
      "http://image-gateway.test/api/image/tasks/gateway_task_1",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-gateway-token": "gateway-token",
          Authorization: "Bearer gateway-token",
        }),
      }),
    )
    expect(updatePayloads[0]).toMatchObject({
      status: "succeeded",
      stage: "图片生成完成",
      progress: 100,
      error_message: null,
      error_code: null,
      metadata: expect.objectContaining({
        previous: "value",
        elapsed_ms: 27_833,
        gateway_status: "succeeded",
        recovered_from_stale: true,
      }),
      artifacts: expect.arrayContaining([
        expect.objectContaining({
          type: "image",
          url: "https://oss.example.com/generated.png",
        }),
      ]),
    })
    expect(updateQuery.in).toHaveBeenCalledWith("status", ["queued", "running"])
  })
})
