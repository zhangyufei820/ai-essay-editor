const TEXT_OUTPUT_KEYS = [
  "markdown_report",
  "result",
  "text",
  "answer",
  "markdown",
  "report",
  "content",
] as const

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
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
    if (parsed) {
      const parsedText = extractDifyTextOutput(parsed, seen)
      if (parsedText.trim()) return parsedText
    }
    return value.trim()
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractDifyTextOutput(item, seen)
      if (text.trim()) return text
    }
    return ""
  }

  const record = asRecord(value)
  if (!record || seen.has(record)) return ""
  seen.add(record)

  for (const key of TEXT_OUTPUT_KEYS) {
    const text = extractDifyTextOutput(record[key], seen)
    if (text.trim()) return text
  }

  for (const candidate of [record.outputs, asRecord(record.data)?.outputs, record.data, record.output]) {
    const text = extractDifyTextOutput(candidate, seen)
    if (text.trim()) return text
  }

  return ""
}
