import { readFileSync } from "fs"
import path from "path"

const root = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

describe("markdown code highlighting", () => {
  it("uses one shared syntax highlighted code block in both chat markdown renderers", () => {
    const enhancedMarkdown = read("components/chat/EnhancedMarkdown.tsx")
    const messageBubble = read("components/chat/MessageBubble.tsx")
    const codeBlock = read("components/chat/MarkdownCodeBlock.tsx")
    const highlightedCode = read("components/chat/HighlightedCode.tsx")

    expect(enhancedMarkdown).toContain("MarkdownCodeBlock")
    expect(messageBubble).toContain("MarkdownCodeBlock")
    expect(codeBlock).toContain("dynamic(")
    expect(codeBlock).not.toContain("react-syntax-highlighter")
    expect(highlightedCode).toContain("PrismLight as SyntaxHighlighter")
    expect(highlightedCode).toContain("registerLanguage")
    expect(codeBlock).toContain("inferCodeLanguage")
  })

  it("treats fenced code blocks without a language as block code when they contain newlines", () => {
    const enhancedMarkdown = read("components/chat/EnhancedMarkdown.tsx")
    const messageBubble = read("components/chat/MessageBubble.tsx")

    expect(enhancedMarkdown).toContain('!rawCode.includes("\\n")')
    expect(messageBubble).toContain('!rawCode.includes("\\n")')
  })

  it("infers common AI reply code languages when the model omits the fence language", () => {
    const codeBlock = read("components/chat/MarkdownCodeBlock.tsx")

    expect(codeBlock).toContain("JSON.parse(trimmed)")
    expect(codeBlock).toContain('return "typescript"')
    expect(codeBlock).toContain('return "python"')
    expect(codeBlock).toContain('return "bash"')
  })
})
