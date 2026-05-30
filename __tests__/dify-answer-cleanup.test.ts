import { cleanBeikeProAnswer, sanitizeDifyAnswerForModel } from "@/lib/dify-answer-cleanup"

describe("Dify answer cleanup", () => {
  it("removes teacher-kit control JSON from beike-pro answers", () => {
    const raw = [
      "我会按 **teacher-kit-v4** 直接生成练习包。",
      "{\"skill\": \"teacher-kit-v4\", \"message\": \"用teacher-kit-v4技能备课\"}",
    ].join("")

    const cleaned = cleanBeikeProAnswer(raw)

    expect(cleaned).toBe("我会按 **teacher-kit-v4** 直接生成练习包。")
    expect(cleaned).not.toContain('"skill"')
    expect(cleaned).not.toContain('"message"')
  })

  it("removes teacher-kit metadata lines from long beike-pro answers", () => {
    const raw = [
      "skill_selected: teacher-kit-v4",
      "skill_trigger_reason: 用户明确要求用 teacher-kit-v4 技能备课",
      "",
      "太好了，这个任务适合做同结构迁移训练。",
    ].join("\n")

    expect(sanitizeDifyAnswerForModel(raw, "beike-pro")).toBe("太好了，这个任务适合做同结构迁移训练。")
  })

  it("does not change other model answers", () => {
    const raw = "{\"skill\":\"teacher-kit-v4\",\"message\":\"debug\"}"
    expect(sanitizeDifyAnswerForModel(raw, "problem")).toBe(raw)
  })
})
