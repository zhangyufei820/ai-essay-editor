import { readFileSync } from "fs"
import path from "path"
import { splitThinkingContent } from "@/lib/think-content"

const root = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

describe("chat think rendering and composer layout", () => {
  it("separates thinking tags from the formal answer", () => {
    const parsed = splitThinkingContent("<think>先判断用户意图</think>\n正式回答")

    expect(parsed.thinking).toBe("先判断用户意图")
    expect(parsed.answer).toBe("正式回答")
    expect(parsed.hasThinking).toBe(true)
  })

  it("keeps an unfinished thinking stream out of the formal answer", () => {
    const parsed = splitThinkingContent("<think>还在思考")

    expect(parsed.thinking).toBe("还在思考")
    expect(parsed.answer).toBe("")
    expect(parsed.hasOpenThinking).toBe(true)
  })

  it("anchors the chat composer to the bottom on desktop and mobile", () => {
    const source = read("components/chat/enhanced-chat-interface.tsx")

    expect(source).toContain("className=\"h-full overflow-y-auto custom-scrollbar pb-40 md:pb-44\"")
    expect(source).toContain("absolute inset-x-0 bottom-0 z-30")
    expect(source).not.toContain("md:relative md:p-6")
  })
})
