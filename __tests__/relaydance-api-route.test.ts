import { NextRequest } from "next/server"

jest.mock("@/lib/auth/verified-user", () => ({
  requireUser: jest.fn(async () => ({ user: { id: "user-1" }, response: null })),
}))

const createTaskRun = jest.fn(async () => ({
  id: "video_req_1",
  requestId: "video_req_1",
  traceId: "trace_1",
  persisted: true,
}))
const updateTaskRun = jest.fn(async () => undefined)

jest.mock("@/lib/ai-task-trace", () => {
  const actual = jest.requireActual("@/lib/ai-task-trace")
  return {
    ...actual,
    createRequestId: jest.fn(() => "video_req_1"),
    createTaskRun,
    updateTaskRun,
  }
})

const createRelayDanceVideo = jest.fn()

jest.mock("@/lib/relaydance-gateway-client", () => ({
  RELAYDANCE_DEFAULT_MODEL: "doubao-seedance-2-0-720p",
  createRelayDanceVideo,
}))

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/media/video/relaydance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/media/video/relaydance", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createRelayDanceVideo.mockResolvedValue({
      ok: true,
      status: 200,
      payload: {
        success: true,
        task_id: "provider_task_1",
        status: "submitted",
        provider_response: { task_id: "provider_task_1" },
      },
      error: null,
    })
  })

  it("creates a unified ai_task_runs record and returns the media polling URL", async () => {
    const { POST } = await import("@/app/api/media/video/relaydance/route")
    const response = await POST(makeRequest({
      prompt: "cinematic classroom video",
      first_frame_url: "https://cdn.example.com/first.jpg",
      last_frame_url: "https://cdn.example.com/last.jpg",
    }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(createTaskRun).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      requestId: "video_req_1",
      kind: "video_generation",
      model: "doubao-seedance-2-0-720p",
      metadata: expect.objectContaining({
        provider: "relaydance",
        has_first_frame: true,
        has_last_frame: true,
      }),
    }))
    expect(createRelayDanceVideo).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "cinematic classroom video",
      model: "doubao-seedance-2-0-720p",
      first_frame_url: "https://cdn.example.com/first.jpg",
      last_frame_url: "https://cdn.example.com/last.jpg",
    }))
    expect(updateTaskRun).toHaveBeenCalledWith("video_req_1", expect.objectContaining({
      status: "running",
      upstreamTaskId: "provider_task_1",
    }))
    expect(json).toEqual(expect.objectContaining({
      success: true,
      task_id: "video_req_1",
      poll_url: "/api/media/tasks/video_req_1",
    }))
    expect(JSON.stringify(json)).not.toContain("gateway-secret")
    expect(JSON.stringify(json)).not.toMatch(/provider_task_id|trace_id|next_adapter|upstream_task_id|metadata|provider_status/)
  })
})
