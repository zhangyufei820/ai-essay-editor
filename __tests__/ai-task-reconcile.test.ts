import { classifyStaleAiTaskRun } from "@/lib/ai-task-reconcile"

describe("ai task reconcile classification", () => {
  it("marks completed stale stages as succeeded", () => {
    expect(classifyStaleAiTaskRun({
      id: "chat_1",
      status: "running",
      stage: "消息生成完成，正在结算",
      progress: 90,
    })).toEqual(expect.objectContaining({
      toStatus: "succeeded",
      reason: "completed_stage_stale",
      progress: 100,
    }))
  })

  it("marks completed workflow stages as succeeded", () => {
    expect(classifyStaleAiTaskRun({
      id: "chat_workflow_done",
      status: "running",
      stage: "工作流已完成",
      progress: 95,
    })).toEqual(expect.objectContaining({
      toStatus: "succeeded",
      reason: "completed_stage_stale",
      progress: 100,
    }))
  })

  it("preserves failure signals instead of converting them to success", () => {
    expect(classifyStaleAiTaskRun({
      id: "chat_2",
      status: "running",
      stage: "流结束但没有返回内容",
      error_code: "EMPTY_STREAM",
      error_message: "流结束但没有返回内容",
    })).toEqual(expect.objectContaining({
      toStatus: "failed",
      reason: "stale_error_signal",
      errorCode: "EMPTY_STREAM",
    }))
  })

  it("marks client disconnects as cancelled", () => {
    expect(classifyStaleAiTaskRun({
      id: "chat_3",
      status: "running",
      stage: "客户端连接中断",
      progress: 32,
    })).toEqual(expect.objectContaining({
      toStatus: "cancelled",
      reason: "client_disconnected",
      progress: 32,
    }))
  })

  it("times out unknown stale queued work", () => {
    expect(classifyStaleAiTaskRun({
      id: "chat_4",
      status: "queued",
      stage: "请求已接收",
    })).toEqual(expect.objectContaining({
      toStatus: "timeout",
      reason: "queued_stale_timeout",
      errorCode: "AI_TASK_STALE_TIMEOUT",
    }))
  })
})
