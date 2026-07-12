import fs from "node:fs"

const DEFAULT_MODEL_MAP = "/app/config/model-map.json"

export function loadConfig() {
  const modelMapFile = process.env.MODEL_MAP_FILE || DEFAULT_MODEL_MAP
  const raw = fs.readFileSync(modelMapFile, "utf8")
  const parsed = JSON.parse(raw)
  const models = Array.isArray(parsed.models) ? parsed.models : []

  if (models.length === 0) {
    throw new Error(`model map is empty: ${modelMapFile}`)
  }

  const modelMap = new Map()
  for (const item of models) {
    if (!item?.id || !item?.target_model) continue
    modelMap.set(item.id, {
      id: String(item.id),
      displayName: String(item.display_name || item.id),
      routeType: String(item.route_type || "openai-mapped"),
      targetModel: String(item.target_model),
      description: String(item.description || ""),
    })
  }

  return {
    host: process.env.CLAUDE_GATEWAY_HOST || "0.0.0.0",
    port: parseInteger("CLAUDE_GATEWAY_PORT", 3130, { min: 0, max: 65535 }),
    newApiBaseUrl: stripTrailingSlash(process.env.NEW_API_BASE_URL || "http://shenxiang-new-api:3000/v1"),
    publicBaseUrl: stripTrailingSlash(process.env.PUBLIC_BASE_URL || ""),
    defaultModel: process.env.DEFAULT_MODEL || "cc-gpt-sonnet",
    requestTimeoutMs: parseInteger("REQUEST_TIMEOUT_MS", 180000, { min: 1, max: 3600000 }),
    headersTimeoutMs: parseInteger("HEADERS_TIMEOUT_MS", 15000, { min: 1000, max: 120000 }),
    requestBodyTimeoutMs: parseInteger("REQUEST_BODY_TIMEOUT_MS", 60000, { min: 1000, max: 600000 }),
    maxRequestBodyBytes: parseInteger("MAX_REQUEST_BODY_BYTES", 32 * 1024 * 1024, {
      min: 1,
      max: 64 * 1024 * 1024,
    }),
    maxSseBufferBytes: parseInteger("MAX_SSE_BUFFER_BYTES", 1024 * 1024, {
      min: 1024,
      max: 16 * 1024 * 1024,
    }),
    maxNonStreamResponseBytes: parseInteger("MAX_NON_STREAM_RESPONSE_BYTES", 16 * 1024 * 1024, {
      min: 1024,
      max: 64 * 1024 * 1024,
    }),
    logLevel: process.env.LOG_LEVEL || "info",
    modelMap,
  }
}

export function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "")
}

function parseInteger(name, fallback, range) {
  const raw = process.env[name]
  if (raw === undefined || raw === "") return fallback
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < range.min || parsed > range.max) {
    throw new Error(`${name} must be an integer between ${range.min} and ${range.max}`)
  }
  return parsed
}
