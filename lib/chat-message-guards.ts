const ASSISTANT_FAILURE_MARKERS = [
  "### 当前回复未完整送达",
  "当前回复未完整送达",
  "### 响应没有完整送达",
  "响应没有完整送达",
  "OpenClaw 任务已结束，但没有返回可展示内容",
  "OpenClaw 上游模型本次返回为空",
  "OPENCLAW_EMPTY_UPSTREAM_RESPONSE",
  "PluginInvokeError",
  "contents is required",
] as const

export function isAssistantFailureContent(content: string): boolean {
  const text = content.trim()
  if (!text) return false

  return ASSISTANT_FAILURE_MARKERS.some((marker) => text.includes(marker))
}
