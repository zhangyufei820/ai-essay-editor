type DifyTerminalFailureCode =
  | "DIFY_INVALID_UPLOAD_FILE"
  | "DIFY_UPSTREAM_UNAVAILABLE"
  | "DIFY_WORKFLOW_FAILED"

export type DifyTerminalFailure = {
  code: DifyTerminalFailureCode
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

const FAILURE_STATUS_VALUES = new Set(["failed", "error", "exception", "stopped", "cancelled", "canceled"])
const FAILURE_FIELD_KEYS = [
  "error",
  "error_message",
  "exception",
  "provider_error",
  "failure",
  "failure_reason",
  "last_error",
] as const

const TECHNICAL_FAILURE_PATTERN = /(?:plugininvokeerror|provider[_\s-]?error|upstream|api\s+request\s+failed|user\s+quota|quota\s+(?:is\s+)?(?:not\s+enough|exceeded)|(?:status(?:\s+code)?|http|returned)\s*[:=]?\s*(?:4|5)\d\d|forbidden|unauthori[sz]ed|service\s+unavailable|timeout|timed\s*out|no\s+available|无可用|额度不足|权限不足|服务不可用|请求失败)/i

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function findStructuredFailure(value: unknown, depth = 0): string {
  if (depth > 6) return ""
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findStructuredFailure(item, depth + 1)
      if (nested) return nested
    }
    return ""
  }
  const record = asRecord(value)
  if (!record) return ""

  for (const key of FAILURE_FIELD_KEYS) {
    const candidate = record[key]
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
    const nested = findStructuredFailure(candidate, depth + 1)
    if (nested) return nested
  }

  for (const key of ["outputs", "output", "result", "data", "details", "metadata"] as const) {
    const candidate = record[key]
    if (typeof candidate === "string" && /^[\[{]/.test(candidate.trim())) {
      try {
        const nested = findStructuredFailure(JSON.parse(candidate), depth + 1)
        if (nested) return nested
      } catch {
        // A normal string result may begin with punctuation; leave it untouched.
      }
    }
    const nested = findStructuredFailure(candidate, depth + 1)
    if (nested) return nested
  }

  return ""
}

function classifyFailure(rawMessage: string, publicMessage?: string): DifyTerminalFailure {
  if (/invalid upload file/i.test(rawMessage)) {
    return {
      code: "DIFY_INVALID_UPLOAD_FILE",
      publicMessage: "附件已失效或与当前批阅工具不匹配，请重新上传文件后再试。",
      rawMessage,
    }
  }

  if (TECHNICAL_FAILURE_PATTERN.test(rawMessage)) {
    return {
      code: "DIFY_UPSTREAM_UNAVAILABLE",
      publicMessage: publicMessage || "作文批改服务暂时不可用，请稍后重试。本次未扣费。",
      rawMessage,
    }
  }

  return {
    code: "DIFY_WORKFLOW_FAILED",
    publicMessage: publicMessage || "任务处理失败，请稍后重试。本次未扣费。",
    rawMessage,
  }
}

export type DifyTerminalFailureOptions = {
  /** Public copy for technical failures in non-essay routes. */
  publicMessage?: string
}

export function getDifyTerminalFailure(
  value: unknown,
  options: DifyTerminalFailureOptions = {},
): DifyTerminalFailure | null {
  const event = asRecord(value)
  if (!event || !["workflow_finished", "message_end", "error"].includes(String(event.event))) return null

  const data = asRecord(event.data) || {}
  const metadata = asRecord(event.metadata) || asRecord(data.metadata) || {}
  const status = (readString(data, ["status"]) || readString(event, ["status"]) || readString(metadata, ["status"]))
    .toLowerCase()
    .replace(/_/g, "-")
  const statusFailure = FAILURE_STATUS_VALUES.has(status)
  if (event.event === "workflow_finished" || event.event === "message_end") {
    const structuredFailure = findStructuredFailure(data) || findStructuredFailure(event)
    if (!statusFailure && !structuredFailure) return null
  }

  const rawMessage = readString(data, ["error", "error_message", "exception", "provider_error", "message"])
    || readString(event, ["error", "error_message", "exception", "provider_error", "message"])
    || findStructuredFailure(data)
    || findStructuredFailure(event)
    || "Workflow execution failed"

  return classifyFailure(rawMessage, options.publicMessage)
}
