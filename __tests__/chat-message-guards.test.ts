import { isAssistantFailureContent } from "@/lib/chat-message-guards"
import { readFileSync } from "fs"
import path from "path"

const root = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

describe("chat message guards", () => {
  it("marks upstream failure messages as non-shareable assistant content", () => {
    expect(isAssistantFailureContent("### 响应没有完整送达\n\nOpenClaw 上游模型本次返回为空，请重新提交。")).toBe(true)
    expect(isAssistantFailureContent("OpenClaw 任务已结束，但没有返回可展示内容。")).toBe(true)
    expect(isAssistantFailureContent("PluginInvokeError: contents is required")).toBe(true)
    expect(isAssistantFailureContent("这是一份正常的教学评价报告。")).toBe(false)
  })

  it("uses the guard before showing share rewards or creating share links", () => {
    const messageBubble = read("components/chat/MessageBubble.tsx")
    const enhancedChat = read("components/chat/enhanced-chat-interface.tsx")

    expect(messageBubble).toContain("isAssistantFailureContent")
    expect(messageBubble).toContain("!isFailureContent ? <ShareRewardCallout")
    expect(messageBubble).toContain("!isFailureContent ? <MessageActionToolbar")
    expect(enhancedChat).toContain("isAssistantFailureContent(message.content)")
    expect(enhancedChat).toContain("不能分享到创作广场")
  })
})
