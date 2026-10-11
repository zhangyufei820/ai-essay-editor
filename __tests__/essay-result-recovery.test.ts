import { selectRecoveredEssayResult } from "@/lib/essay-result-recovery"

const task = {
  conversation_id: "conversation-1",
  created_at: "2026-10-10T16:09:26.276Z",
  upstream_task_id: null,
}
const validReport = "作文批改报告\n总分：85分\n优点：主题清楚，开头具体。\n建议：结尾呼应主题，调整段落结构。".repeat(3)
const message = {
  id: "message-1",
  conversation_id: task.conversation_id,
  created_at: Date.parse(task.created_at) / 1000 + 1,
  status: "normal",
  answer: validReport,
}

describe("selectRecoveredEssayResult", () => {
  it("recovers a completed report from the exact conversation and request time", () => {
    expect(selectRecoveredEssayResult([message], task)).toBe(validReport)
  })

  it("does not return another attempt's report when matches are ambiguous", () => {
    expect(selectRecoveredEssayResult([message, { ...message, id: "message-2" }], task)).toBeNull()
    expect(selectRecoveredEssayResult([{ ...message, created_at: message.created_at + 30 }], task)).toBeNull()
    expect(selectRecoveredEssayResult([{ ...message, conversation_id: "another" }], task)).toBeNull()
  })

  it("rejects incomplete or failed Dify messages", () => {
    expect(selectRecoveredEssayResult([{ ...message, status: "generating" }], task)).toBeNull()
    expect(selectRecoveredEssayResult([{ ...message, answer: "批改中" }], task)).toBeNull()
  })

  it("requires the known upstream message id when it is available", () => {
    expect(selectRecoveredEssayResult([message], { ...task, upstream_task_id: "another" })).toBeNull()
    expect(selectRecoveredEssayResult([message], { ...task, upstream_task_id: "message-1" })).toBe(validReport)
  })
})
