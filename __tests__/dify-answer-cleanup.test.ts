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

  it("removes compact teacher-kit control JSON appended after beike-pro content", () => {
    const raw = [
      "下面给你《背影》10分钟课堂导入的三种设计：",
      "{\"skill\":\"teacher-kit-v4\",\"message\":\"用teacher-kit-v4技能备课，请为《背影》设计一个10分钟课堂导入，输出三条。\"}",
    ].join("")

    expect(cleanBeikeProAnswer(raw)).toBe("下面给你《背影》10分钟课堂导入的三种设计：")
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

  it("removes transient unavailable and skill debug lines from successful OpenClaw skill answers", () => {
    const raw = [
      "服务暂时不可用，请稍后重试。 skill_trigger_reason: 服务暂时不可用，请稍后重试。",
      "skill_trigger_reason: 前端已明确选择“PPT 全流程助手”，并提供了完整几何题解析内容用于生成课件",
      "",
      "已生成这道几何题的解析 PPT，可直接查看：",
      "",
      "[点击查看演示文稿](https://www.shenxiang.school/slides/geometry-proof.html)",
      "",
      "这版是 12 页课堂讲解版。",
    ].join("\n")

    const cleaned = sanitizeDifyAnswerForModel(raw, "open-claw")

    expect(cleaned).toContain("已生成这道几何题的解析 PPT")
    expect(cleaned).toContain("[点击查看演示文稿](https://www.shenxiang.school/slides/geometry-proof.html)")
    expect(cleaned).not.toContain("服务暂时不可用")
    expect(cleaned).not.toContain("skill_trigger_reason")
  })

  it("removes a split OpenClaw unavailable prefix once skill debug text arrives", () => {
    const raw = [
      "服务暂时不可用，请稍后重试。",
      "skill_trigger_reason: 前端已明确选择“PPT 全流程助手”",
    ].join(" ")

    expect(sanitizeDifyAnswerForModel(raw, "open-claw")).toBe("")
  })

  it("keeps a real OpenClaw unavailable message when there is no useful result", () => {
    expect(sanitizeDifyAnswerForModel("服务暂时不可用，请稍后重试。", "open-claw")).toBe("服务暂时不可用，请稍后重试。")
  })
})
