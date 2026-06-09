import {
  createRequestId,
  extractArtifactsFromText,
  normalizeMediaTask,
  sanitizeForTrace,
  toPublicTaskRun,
} from "@/lib/ai-task-trace"

jest.mock("@/lib/relaydance-gateway-client", () => ({
  getRelayDanceVideoTask: jest.fn(),
}))

jest.mock("@/lib/ai-task-trace", () => {
  const actual = jest.requireActual("@/lib/ai-task-trace")
  return {
    ...actual,
    updateTaskRun: jest.fn(async () => undefined),
  }
})

describe("ai task trace helpers", () => {
  it("creates prefixed request ids", () => {
    expect(createRequestId("openclaw")).toMatch(/^openclaw_/)
  })

  it("redacts secrets from nested payloads", () => {
    const sanitized = sanitizeForTrace({
      Authorization: "Bearer secret-token-value",
      message: "failed with Bearer secret-token-value",
      nested: { api_key: "secret-value" },
    }) as Record<string, unknown>

    expect(sanitized.Authorization).toBe("[redacted]")
    expect(String(sanitized.message)).toContain("[redacted]")
    expect((sanitized.nested as Record<string, unknown>).api_key).toBe("[redacted]")
  })

  it("extracts generated artifacts from OpenClaw and image output", () => {
    const artifacts = extractArtifactsFromText([
      "完成: https://www.shenxiang.school/slides/script-to-video-flow-v2.html",
      "图片: /api/openclaw-media-sign/tool-image-generation/result.png",
      "视频: https://cdn.example.com/output.mp4",
      "音频: https://cdn.example.com/output.wav",
      "PDF: https://www.shenxiang.school/slides/report.pdf",
    ].join("\n"))

    expect(artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "html" }),
      expect.objectContaining({ type: "image" }),
      expect.objectContaining({ type: "video" }),
      expect.objectContaining({ type: "audio" }),
      expect.objectContaining({ type: "pdf" }),
    ]))
  })

  it("normalizes task records for the unified media task center", () => {
    const task = normalizeMediaTask({
      id: "video_req_1",
      user_id: "user_1",
      kind: "video_generation",
      status: "succeeded",
      progress: 72,
      request_id: "video_req_1",
      trace_id: "trace_1",
      upstream_task_id: "provider_task_1",
      artifacts: [],
      metadata: {
        gateway_status: "completed",
        temporary_video_url: "https://cdn.relaydance.com/result.mp4",
        expires_at: "2026-05-22T08:00:00.000Z",
        token: "secret-value",
      },
      created_at: "2026-05-22T07:00:00.000Z",
      updated_at: "2026-05-22T07:01:00.000Z",
      completed_at: "2026-05-22T07:01:00.000Z",
    })

    expect(task).toEqual(expect.objectContaining({
      id: "video_req_1",
      type: "video_generation",
      status: "completed",
      progress: 100,
      upstream_task_id: "provider_task_1",
    }))
    expect(task.outputs).toEqual([
      expect.objectContaining({
        type: "video",
        url: "https://cdn.relaydance.com/result.mp4",
        download_url: "https://cdn.relaydance.com/result.mp4",
        expires_at: "2026-05-22T08:00:00.000Z",
      }),
    ])
    expect(task.metadata.token).toBe("[redacted]")
  })

  it("keeps internal workflow details out of public task records and media task messages", () => {
    const rawTask = {
      id: "chat_req_1",
      user_id: "user_1",
      kind: "chat",
      status: "running",
      progress: 8,
      request_id: "chat_req_1",
      stage: "Dify 会话已提交",
      current_tool: "总编辑",
      error_message: "PluginInvokeError from LiteLLM provider TokenFlux",
      metadata: { provider: "tokenflux" },
    }
    const publicTask = toPublicTaskRun(rawTask)
    const mediaTask = normalizeMediaTask(rawTask)

    expect(publicTask.stage).toBe("任务已提交")
    expect(publicTask.current_tool).toBe("智能处理")
    expect(publicTask.error_message).not.toMatch(/Dify|Plugin|LiteLLM|TokenFlux|provider|总编辑/)
    expect(mediaTask.stage).toBe("任务已提交")
    expect(mediaTask.message).not.toMatch(/Dify|Plugin|LiteLLM|TokenFlux|provider|总编辑/)
  })

  it("refreshes RelayDance tasks into completed unified media tasks", async () => {
    const { refreshMediaTask, normalizeRefreshedMediaTask } = await import("@/lib/media-task-refresh")
    const { getRelayDanceVideoTask } = await import("@/lib/relaydance-gateway-client")
    const { updateTaskRun } = await import("@/lib/ai-task-trace")

    ;(getRelayDanceVideoTask as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      payload: {
        success: true,
        status: "completed",
        progress: 100,
        video_url: "https://cdn.relaydance.com/final.mp4",
        provider_response: {
          id: "provider_task_1",
          status: "completed",
          metadata: { url: "https://cdn.relaydance.com/final.mp4" },
        },
      },
      error: null,
    })

    const refreshed = await refreshMediaTask({
      id: "video_req_1",
      user_id: "user_1",
      kind: "video_generation",
      status: "running",
      progress: 30,
      request_id: "video_req_1",
      upstream_task_id: "provider_task_1",
      artifacts: [],
      metadata: {
        provider: "relaydance",
        expires_at: "2026-05-22T08:00:00.000Z",
      },
    })
    const normalized = normalizeRefreshedMediaTask(refreshed)

    expect(getRelayDanceVideoTask).toHaveBeenCalledWith("provider_task_1")
    expect(updateTaskRun).toHaveBeenCalledWith("video_req_1", expect.objectContaining({
      status: "succeeded",
      stage: "视频生成完成",
      artifacts: [
        expect.objectContaining({
          type: "video",
          url: "https://cdn.relaydance.com/final.mp4",
        }),
      ],
    }))
    expect(normalized.status).toBe("completed")
    expect(normalized.outputs[0]).toEqual(expect.objectContaining({
      type: "video",
      url: "https://cdn.relaydance.com/final.mp4",
    }))
  })
})
