import { parseEssayReview } from "@/lib/parse-essay-review"

describe("essay review parser", () => {
  it("preserves the structured report view for fallback grading Markdown", () => {
    const artifact = parseEssayReview([
      "### 作文批改报告",
      "- **综合评分**：86/100",
      "- **一句话总评**：主题明确，但细节描写还可以更具体。",
      "",
      "#### 关键问题",
      "- 细节不足：缺少动作和环境描写，画面感不够。",
      "- 结尾仓促：没有呼应开头，主题收束不够有力。",
      "",
      "#### 修改建议",
      "- 补充人物动作和环境描写。",
      "- 在结尾回应开头的感受。",
      "",
      "#### 润色示范",
      "傍晚的风吹过操场，我想起那次难忘的比赛。",
      "",
      "## 作文原文",
      "那天我们参加了比赛。",
    ].join("\n"))

    expect(artifact).toMatchObject({
      score: { value: 86, total: 100 },
      summary: "主题明确，但细节描写还可以更具体。",
      diagnosis: [
        { title: "细节不足", detail: "缺少动作和环境描写，画面感不够。" },
        { title: "结尾仓促", detail: "没有呼应开头，主题收束不够有力。" },
      ],
      suggestions: ["补充人物动作和环境描写。", "在结尾回应开头的感受。"],
      originalText: "那天我们参加了比赛。",
      finalDraft: "傍晚的风吹过操场，我想起那次难忘的比赛。",
    })
  })
})
