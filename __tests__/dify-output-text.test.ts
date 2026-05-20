import { extractDifyTextOutput } from "@/lib/dify-output-text"

describe("Dify final output text extraction", () => {
  it("extracts markdown_report from workflow outputs", () => {
    expect(
      extractDifyTextOutput({
        data: {
          outputs: {
            markdown_report: "## 实验报告\n结论清晰。",
          },
        },
      }),
    ).toBe("## 实验报告\n结论清晰。")
  })

  it("extracts common final output keys", () => {
    expect(extractDifyTextOutput({ result: "最终结果" })).toBe("最终结果")
    expect(extractDifyTextOutput({ text: "最终文本" })).toBe("最终文本")
    expect(extractDifyTextOutput({ answer: "最终回答" })).toBe("最终回答")
  })

  it("extracts from JSON string outputs", () => {
    expect(extractDifyTextOutput('{"outputs":{"markdown_report":"# 报告"}}')).toBe("# 报告")
  })

  it("extracts the first non-empty text from arrays", () => {
    expect(extractDifyTextOutput([{ text: "" }, { markdown: "正文" }])).toBe("正文")
  })

  it("does not extract arbitrary message fields from unrelated objects", () => {
    expect(extractDifyTextOutput({ message: "debug only" })).toBe("")
  })
})
