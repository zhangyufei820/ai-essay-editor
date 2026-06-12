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
    port: Number.parseInt(process.env.CLAUDE_GATEWAY_PORT || "3130", 10),
    newApiBaseUrl: stripTrailingSlash(process.env.NEW_API_BASE_URL || "http://shenxiang-new-api:3000/v1"),
    publicBaseUrl: stripTrailingSlash(process.env.PUBLIC_BASE_URL || ""),
    defaultModel: process.env.DEFAULT_MODEL || "cc-gpt-sonnet",
    requestTimeoutMs: Number.parseInt(process.env.REQUEST_TIMEOUT_MS || "180000", 10),
    logLevel: process.env.LOG_LEVEL || "info",
    modelMap,
  }
}

export function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "")
}
