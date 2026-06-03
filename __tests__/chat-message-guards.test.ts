import { isAssistantFailureContent } from "@/lib/chat-message-guards"
import { getSafeUpstreamErrorMessage, hasTechnicalUpstreamErrorText } from "@/lib/chat-error-sanitizer"
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

  it("hides technical upstream error details from the user-facing copy", () => {
    const technicalMessage = "req_id: 073a50cd02 PluginInvokeError: {'args':{'description':'[models] Error: API request failed with status code 408: {\"error\":{\"message\":\"LiteLLM.Timeout: APITimeoutError - Request timed out. Error_str: Request timed out... No fallback model group found for original_model_group=gemini-3.1-pro-preview\"}}'}}"

    expect(hasTechnicalUpstreamErrorText(technicalMessage)).toBe(true)
    expect(getSafeUpstreamErrorMessage(technicalMessage, "模型服务暂时不可用，请稍后重试。")).toBe("模型服务响应超时或备用线路不可用。请先刷新当前会话或历史记录查看是否已有结果；若仍无结果，再重新提交。")
    expect(getSafeUpstreamErrorMessage("正常业务文案", "模型服务暂时不可用，请稍后重试。")).toBeNull()
  })

  it("uses the guard before showing share rewards or creating share links", () => {
    const messageBubble = read("components/chat/MessageBubble.tsx")
    const enhancedChat = read("components/chat/enhanced-chat-interface.tsx")

    expect(messageBubble).toContain("isAssistantFailureContent")
    expect(messageBubble).toContain("!isFailureContent ? <ShareRewardCallout")
    expect(messageBubble).toContain("!isFailureContent ? (")
    expect(messageBubble).toContain("<MessageActionToolbar")
    expect(enhancedChat).toContain("isAssistantFailureContent(message.content)")
    expect(enhancedChat).toContain("不能分享到创作广场")
    expect(enhancedChat).toContain("normalizeChatTaskFailureMessage")
  })
})
