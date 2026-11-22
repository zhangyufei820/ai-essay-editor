import { splitThinkingContent } from "@/lib/think-content"
import { getWritingAnswerFailure } from "@/lib/workflow-skill-result"

const ASSISTANT_FAILURE_MARKERS = [
  "### 当前回复未完整送达",
  "当前回复未完整送达",
  "### 响应没有完整送达",
  "响应没有完整送达",
  "OpenClaw 任务已结束，但没有返回可展示内容",
  "OpenClaw 上游模型本次返回为空",
  "任务已结束，但没有返回可展示内容。请",
  "图片任务已结束，但没有返回图片或可展示说明。",
  "我没有收到可展示的回复，请再试一次。",
  "我没有收到可展示的作文批改结果，请重新提交一次。",
  "OPENCLAW_EMPTY_UPSTREAM_RESPONSE",
  "PluginInvokeError",
  "contents is required",
] as const

const INTERRUPTED_ASSISTANT_REPLY = /(?:^|\r?\n)\*内容生成已中断[：:][^\r\n]*\*$/

export function isAssistantFailureContent(content: string): boolean {
  const text = content.trim()
  if (!text) return false

  const answer = /<think>/i.test(text) ? splitThinkingContent(text).answer : text
  return ASSISTANT_FAILURE_MARKERS.some((marker) => text.includes(marker))
    || INTERRUPTED_ASSISTANT_REPLY.test(text)
    || getWritingAnswerFailure(answer) !== null
}

export function redactAssistantRoutingPayload(content: string): string {
  const answer = /<think>/i.test(content) ? splitThinkingContent(content).answer : content
  if (getWritingAnswerFailure(answer) !== "routing_payload") return content

  return "### 当前回复未完整送达\n\n本次没有生成可展示的回复，请稍后重试。"
}
