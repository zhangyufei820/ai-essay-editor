const JSON_CREDENTIAL_PATTERN = /("(?:authorization|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|cookie|set-cookie)"\s*:\s*")([^"]*)(")/gi
const QUERY_CREDENTIAL_PATTERN = /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password)=)([^&#\s]+)/gi
const CREDENTIAL_KEY_PATTERN = /^(?:authorization|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|cookie|set-cookie)$/i

export function redact(value) {
  if (typeof value === "string") return redactText(value)
  const sanitized = sanitizeValue(value, new WeakSet())
  const serialized = JSON.stringify(sanitized)
  return typeof serialized === "string" ? serialized : String(serialized)
}

function redactText(value) {
  return value
    .replace(JSON_CREDENTIAL_PATTERN, "$1[REDACTED]$3")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(QUERY_CREDENTIAL_PATTERN, "$1[REDACTED]")
}

function sanitizeValue(value, seen) {
  if (typeof value === "string") return redactText(value)
  if (!value || typeof value !== "object") return value
  if (seen.has(value)) return "[Circular]"
  seen.add(value)

  if (Array.isArray(value)) {
    const sanitized = value.map((item) => sanitizeValue(item, seen))
    seen.delete(value)
    return sanitized
  }

  const sanitized = {}
  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = CREDENTIAL_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeValue(item, seen)
  }
  seen.delete(value)
  return sanitized
}

export function createLogger(level = "info") {
  const levels = new Map([
    ["debug", 10],
    ["info", 20],
    ["warn", 30],
    ["error", 40],
  ])
  const threshold = levels.get(level) || 20

  function emit(name, payload) {
    if ((levels.get(name) || 99) < threshold) return
    const record = {
      ts: new Date().toISOString(),
      level: name,
      ...payload,
    }
    console.log(redact(record))
  }

  return {
    debug: (payload) => emit("debug", payload),
    info: (payload) => emit("info", payload),
    warn: (payload) => emit("warn", payload),
    error: (payload) => emit("error", payload),
  }
}
