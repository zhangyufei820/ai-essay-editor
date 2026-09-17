import {
  canRecoverPartialEssayCorrection,
  isValidEssayCorrectionResult,
} from "@/lib/essay-correction-result"

const validReport = [
  "# 作文批改报告",
  "综合总分：86/100",
  "## 总评",
  "文章主题明确，内容完整，结构由开头、主体和结尾组成，叙事顺序清楚。",
  "## 优点",
  "语言自然，段落衔接顺畅，细节描写能够支撑中心。",
  "## 修改建议",
  "建议补充人物动作和环境描写，并对结尾进行润色，使主题更集中。",
].join("\n")

describe("essay correction result validation", () => {
  it("rejects the production placeholder returned after image extraction fails", () => {
    const placeholder = [
      "未收到作文内容，暂时无法进行完整批改。",
      "请上传清晰的作文图片或提供作文文本后重试。",
      "以下是一般建议：注意文章结构、语言表达和主题内容。",
      "request_id: abc node_id: vision-extract",
    ].join("\n")

    expect(isValidEssayCorrectionResult(placeholder)).toBe(false)
  })

  it("accepts a substantive grading report with a non-zero score", () => {
    expect(isValidEssayCorrectionResult(validReport)).toBe(true)
  })

  it.each([
    "**综合评分：86/100**",
    "- **综合评分**：86/100",
  ])("accepts a valid score wrapped in common Markdown emphasis: %s", (scoreLine) => {
    expect(isValidEssayCorrectionResult(validReport.replace("综合总分：86/100", scoreLine))).toBe(true)
  })

  it("rejects an all-zero report even when it contains grading headings", () => {
    const report = [
      "# 作文批改报告",
      "综合总分 100% 0 分。",
      "总分：0 分，等级判定：无法判定。",
      "总评、结构、语言、内容和修改建议均无法统计。",
      "当前材料不足，暂时无法评价这篇作文。",
    ].join("\n")

    expect(isValidEssayCorrectionResult(report)).toBe(false)
  })

  it("does not mistake the denominator in a zero out of 100 score for earned points", () => {
    const report = [
      "# 作文批改报告",
      "综合总分：0/100分",
      "## 总评",
      "文章主题、内容和结构均有记录，语言表达与段落安排也包含在这份模板中。",
      "## 优点",
      "模板列出了开头、结尾和细节描写等常规点评栏目。",
      "## 修改建议",
      "建议补充人物动作和环境描写，并对结尾进行润色，使主题更集中。",
    ].join("\n")

    expect(report.length).toBeGreaterThan(100)
    expect(isValidEssayCorrectionResult(report)).toBe(false)
  })

  it("allows a valid fallback only for an explicitly partial workflow", () => {
    expect(canRecoverPartialEssayCorrection({
      event: "workflow_finished",
      data: { status: "partial-succeeded" },
    }, [validReport])).toBe(true)

    expect(canRecoverPartialEssayCorrection({
      event: "workflow_finished",
      data: { status: "partial_succeeded" },
    }, [validReport])).toBe(true)
  })

  it("does not let buffered text hide a fatal terminal failure", () => {
    expect(canRecoverPartialEssayCorrection({
      event: "error",
      message: "provider error: status code 503",
    }, [validReport])).toBe(false)

    expect(canRecoverPartialEssayCorrection({
      event: "workflow_finished",
      data: { status: "failed" },
    }, [validReport])).toBe(false)
  })
})
