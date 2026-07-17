type DifyTerminalFailure = {
  code: "DIFY_INVALID_UPLOAD_FILE" | "DIFY_WORKFLOW_FAILED"
  publicMessage: string
  rawMessage: string
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

export function getDifyTerminalFailure(value: unknown): DifyTerminalFailure | null {
  if (!value || typeof value !== "object") return null
  const event = value as Record<string, unknown>
  if (event.event !== "workflow_finished" && event.event !== "error") return null

  const data = event.data && typeof event.data === "object"
    ? event.data as Record<string, unknown>
    : {}
  if (event.event === "workflow_finished") {
    const status = (readString(data, ["status"]) || readString(event, ["status"])).toLowerCase()
    if (!["failed", "error", "stopped", "cancelled", "canceled"].includes(status)) return null
  }

  const rawMessage = readString(data, ["error", "error_message", "message"])
    || readString(event, ["error", "error_message", "message"])
    || "Workflow execution failed"
  if (/invalid upload file/i.test(rawMessage)) {
    return {
      code: "DIFY_INVALID_UPLOAD_FILE",
      publicMessage: "附件已失效或与当前批阅工具不匹配，请重新上传文件后再试。",
      rawMessage,
    }
  }

  return {
    code: "DIFY_WORKFLOW_FAILED",
    publicMessage: "任务处理失败，请稍后重试。",
    rawMessage,
  }
}
