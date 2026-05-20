import { extractDifySseText, extractDifyTextOutput } from "@/lib/dify-output-text"

describe("Dify output text extraction", () => {
  it("extracts direct answer node outputs from node_finished events", () => {
    expect(extractDifySseText({
      event: "node_finished",
      data: {
        title: "直接回复",
        outputs: {
          answer: "你好，我已经收到你的问题。",
        },
      },
    })).toBe("你好，我已经收到你的问题。")
  })

  it("leaves workflow_finished text to explicit final-output handlers", () => {
    expect(extractDifySseText({
      event: "workflow_finished",
      data: {
        outputs: {
          text: "最终报告",
        },
      },
    })).toBe("")
  })

  it("extracts workflow outputs across common text keys", () => {
    expect(extractDifyTextOutput({
      data: {
        outputs: {
          markdown_report: "## 实验报告\n结论清晰。",
        },
      },
    })).toBe("## 实验报告\n结论清晰。")
  })

  it("keeps streamed message chunks unchanged", () => {
    expect(extractDifySseText({ event: "message", answer: "第一段" })).toBe("第一段")
    expect(extractDifySseText({ event: "text_chunk", data: { text: "第二段" } })).toBe("第二段")
  })
})
