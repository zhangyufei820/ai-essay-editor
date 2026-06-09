import { NextRequest } from "next/server"

jest.mock("@/lib/auth/verified-user", () => ({
  requireUser: jest.fn(async () => ({ user: { id: "user-1" }, response: null })),
}))

const createTaskRun = jest.fn(async () => ({
  id: "music_req_1",
  requestId: "music_req_1",
  traceId: "trace_1",
  persisted: true,
}))
const updateTaskRun = jest.fn(async () => undefined)

jest.mock("@/lib/ai-task-trace", () => {
  const actual = jest.requireActual("@/lib/ai-task-trace")
  return {
    ...actual,
    createRequestId: jest.fn(() => "music_req_1"),
    createTaskRun,
    updateTaskRun,
  }
})

const runWorkflow = jest.fn()

jest.mock("@/lib/suno-dify-client", () => ({
  createSunoDifyClient: () => ({ runWorkflow }),
}))

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/media/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/media/tasks", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    runWorkflow.mockResolvedValue({
      success: true,
      http_status: 200,
      response_json: {
        data: {
          outputs: {
            success: true,
            task_id: "suno-task-1",
            status: "submitted",
          },
        },
      },
    })
  })

  it("creates a unified music task and returns a polling URL without leaking secrets", async () => {
    process.env.SUNO_GATEWAY_API_KEY = "gateway-secret"
    const { POST } = await import("@/app/api/media/tasks/route")

    const response = await POST(makeRequest({
      type: "music",
      request: {
        operation: "music_custom",
        prompt: "写一首校园歌曲",
        title: "校园",
        tags: "pop",
      },
    }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(createTaskRun).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      requestId: "music_req_1",
      kind: "music_generation",
    }))
    expect(updateTaskRun).toHaveBeenLastCalledWith("music_req_1", expect.objectContaining({
      status: "running",
      upstreamTaskId: "suno-task-1",
    }))
    expect(json).toEqual(expect.objectContaining({
      success: true,
      task_id: "music_req_1",
      poll_url: "/api/media/tasks/music_req_1",
    }))
    expect(JSON.stringify(json)).not.toContain("gateway-secret")
    expect(JSON.stringify(json)).not.toMatch(/provider_task_id|trace_id|next_adapter|upstream_task_id|metadata|provider_status/)
  })
})
