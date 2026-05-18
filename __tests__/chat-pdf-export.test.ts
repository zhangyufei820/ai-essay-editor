import fs from "fs"
import path from "path"

import { markdownToSafeHtml, prepareChatMarkdown } from "@/lib/chat-pdf-export"

const root = path.resolve(__dirname, "..")

describe("chat PDF export markdown rendering", () => {
  it("removes thinking tags before exporting formal content", () => {
    expect(prepareChatMarkdown("<think>内部推理</think>\n# 作文批改报告")).toBe("# 作文批改报告")
  })

  it("renders markdown into safe HTML instead of exposing raw markdown markers", () => {
    const html = markdownToSafeHtml(`# 作文批改报告

## 问题诊断
- **问题一**：句子不完整
- 建议：补充原因

最终得分：14 / 25`)

    expect(html).toContain("<h1>作文批改报告</h1>")
    expect(html).toContain("<h2>问题诊断</h2>")
    expect(html).toContain("<strong>问题一</strong>")
    expect(html).toContain("<ul>")
    expect(html).not.toContain("# 作文批改报告")
    expect(html).not.toContain("**问题一**")
    expect(html).not.toContain("- 建议")
  })

  it("essay review template renders the complete raw response through EnhancedMarkdown", () => {
    const src = fs.readFileSync(path.join(root, "components/chat/v2/templates/EssayReviewTemplate.tsx"), "utf8")

    expect(src).toContain("完整批改内容")
    expect(src).toContain("<EnhancedMarkdown")
    expect(src).not.toContain("<pre className")
  })
})
