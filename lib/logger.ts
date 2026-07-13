const isDevelopment = process.env.NODE_ENV === "development"
const SECRET_KEY_PATTERN = /(?:authorization|cookie|email|phone|password|secret|signature|token|api[_-]?key|credential)/i
const IDENTITY_KEY_PATTERN = /^(?:user_?id|student_?id|teacher_?id|provider_?user_?id)$/i
const CORRELATION_KEY_PATTERN = /^(?:request_?id|trace_?id|task_?id|run_?id)$/i

function sanitizeString(value: string) {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/((?:password|secret|token|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
}

export function sanitizeLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return sanitizeString(value)
  if (value === null || typeof value !== "object") return value

  if (value instanceof Error) {
    const code = "code" in value && typeof value.code === "string" ? value.code : undefined
    return {
      name: value.name,
      message: sanitizeString(value.message),
      ...(code ? { code } : {}),
    }
  }

  if (seen.has(value)) return "[CIRCULAR]"
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, seen))
  }

  return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => {
    if (CORRELATION_KEY_PATTERN.test(key)) return [key, sanitizeLogValue(nestedValue, seen)]
    if (IDENTITY_KEY_PATTERN.test(key)) return [key, "[REDACTED_ID]"]
    if (SECRET_KEY_PATTERN.test(key)) return [key, "[REDACTED]"]
    return [key, sanitizeLogValue(nestedValue, seen)]
  }))
}

type LogLevel = "debug" | "info" | "warn" | "error"

function emit(level: LogLevel, args: unknown[]) {
  if (level === "debug" && !isDevelopment) return

  if (isDevelopment) {
    console[level](`[${level.toUpperCase()}]`, ...args.map((value) => sanitizeLogValue(value)))
    return
  }

  const [message, ...context] = args
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: typeof message === "string" ? sanitizeString(message) : "application_log",
    ...(context.length > 0 ? { context: sanitizeLogValue(context.length === 1 ? context[0] : context) } : {}),
  }
  console[level](JSON.stringify(entry))
}

export const logger = {
  debug: (...args: unknown[]) => emit("debug", args),
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
}
