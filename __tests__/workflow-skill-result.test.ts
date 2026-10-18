import { isInvalidWorkflowSkillResult } from "@/lib/workflow-skill-result"

const longEssay = "请升格下面的论述文：" + "人与世界如何相处，需要从个人、社会与公共秩序三个层次讨论。".repeat(12)

describe("workflow skill result", () => {
  it("rejects the production greeting for a submitted long essay", () => {
    expect(isInvalidWorkflowSkillResult(
      "shenxiang-gaozhong-lunshuowen",
      longEssay,
      "你好呀，我可以帮你写公众号文章、润色中文、修改作文、处理论文或优化英语作文。你想先处理哪一类内容？",
    )).toBe(true)
  })

  it("accepts an actual writing result and does not alter short conversations", () => {
    expect(isInvalidWorkflowSkillResult(
      "shenxiang-gaozhong-lunshuowen",
      longEssay,
      "这篇文章的中心论点清楚，但第二段的例证与结论衔接较弱。建议先界定‘和’的含义，再分别论证个人与社会层面的关系。",
    )).toBe(false)
    expect(isInvalidWorkflowSkillResult("shenxiang-gaozhong-lunshuowen", "你好", "你好呀，我可以帮你写公众号文章。你想先处理哪一类内容？")).toBe(false)
    expect(isInvalidWorkflowSkillResult(null, longEssay, "你想先处理哪一类内容？")).toBe(false)
  })
})
