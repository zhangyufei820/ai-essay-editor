const TEXT_OUTPUT_KEYS = [
  "answer",
  "result",
  "text",
  "markdown",
  "markdown_report",
  "report",
  "content",
  "message",
] as const

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function safeJsonParse(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

export function extractDifyTextOutput(value: unknown, seen = new Set<unknown>()): string {
  if (value === null || value === undefined) return ""

  if (typeof value === "string") {
    const parsed = safeJsonParse(value)
    if (parsed && !seen.has(parsed)) {
      seen.add(parsed)
      const parsedText = extractDifyTextOutput(parsed, seen)
      if (parsedText.trim()) return parsedText
    }
    return value.trim()
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => extractDifyTextOutput(item, seen))
      .find((item) => item.trim()) || ""
  }

  const record = asRecord(value)
  if (!record || seen.has(record)) return ""
  seen.add(record)

  for (const key of TEXT_OUTPUT_KEYS) {
    const text = extractDifyTextOutput(record[key], seen)
    if (text.trim()) return text
  }

  const nestedCandidates = [
    record.outputs,
    asRecord(record.data)?.outputs,
    record.data,
    record.output,
  ]

  for (const candidate of nestedCandidates) {
    const text = extractDifyTextOutput(candidate, seen)
    if (text.trim()) return text
  }

  return ""
}

export function extractDifySseText(event: unknown): string {
  const record = asRecord(event)
  if (!record) return ""

  const eventName = typeof record.event === "string" ? record.event : ""
  if (typeof record.answer === "string" && record.answer.trim()) return record.answer

  if (eventName === "text_chunk" || eventName === "agent_message") {
    const data = asRecord(record.data)
    const text = data?.text ?? record.text
    return typeof text === "string" ? text : extractDifyTextOutput(text)
  }

  if (eventName === "node_finished") {
    return extractDifyTextOutput(record)
  }

  return ""
}
