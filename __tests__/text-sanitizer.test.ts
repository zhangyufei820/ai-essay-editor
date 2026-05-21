import { cleanLLMText } from "@/lib/text-sanitizer"

describe("cleanLLMText", () => {
  it("preserves LaTeX commands that start with n or t", () => {
    const input = String.raw`$\text{Im}\, z > 0,\quad ad-bc\neq 0,\quad \nabla f$`

    expect(cleanLLMText(input)).toBe(input)
  })

  it("normalizes escaped math delimiters", () => {
    const input = String.raw`\$\$w=\frac{az+b}{cz+d}\$\$ and \(z \in \mathbb{R}\)`

    expect(cleanLLMText(input)).toBe(String.raw`$$w=\frac{az+b}{cz+d}$$ and $z \in \mathbb{R}$`)
  })

  it("still converts literal newline and tab escapes outside LaTeX commands", () => {
    expect(cleanLLMText(String.raw`第一行\n第二行\t缩进`)).toBe("第一行\n第二行\t缩进")
  })

  it("adds markdown spacing before compact heading markers from model output", () => {
    const input = "一、可用工具推荐### 文献检索–中国知网适合查论文### 写作与排版适合整理成稿"

    expect(cleanLLMText(input)).toBe([
      "一、可用工具推荐",
      "",
      "### 文献检索–中国知网适合查论文",
      "",
      "### 写作与排版适合整理成稿",
    ].join("\n"))
  })

  it("normalizes heading markers without a following space", () => {
    expect(cleanLLMText("总结###下一步建议")).toBe("总结\n\n### 下一步建议")
  })

  it("does not rewrite markdown markers inside fenced code blocks", () => {
    const input = [
      "说明### 正文标题",
      "```md",
      "代码### 不应变成标题",
      "```",
    ].join("\n")

    expect(cleanLLMText(input)).toBe([
      "说明",
      "",
      "### 正文标题",
      "```md",
      "代码### 不应变成标题",
      "```",
    ].join("\n"))
  })
})
