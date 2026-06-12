const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
  /("authorization"\s*:\s*")([^"]+)(")/gi,
]

export function redact(value) {
  let text = typeof value === "string" ? value : JSON.stringify(value)
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match, prefix, secret, suffix) => {
      if (prefix && suffix) return `${prefix}[REDACTED]${suffix}`
      if (prefix) return `${prefix}[REDACTED]`
      return "[REDACTED]"
    })
  }
  return text
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
    console.log(redact(JSON.stringify(record)))
  }

  return {
    debug: (payload) => emit("debug", payload),
    info: (payload) => emit("info", payload),
    warn: (payload) => emit("warn", payload),
    error: (payload) => emit("error", payload),
  }
}
