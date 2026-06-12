import http from "node:http"
import { Readable } from "node:stream"
import { loadConfig } from "./config.mjs"
import { createLogger } from "./logger.mjs"
import {
  anthropicToOpenAI,
  countApproxTokens,
  flushStreamFinalEvents,
  openAIToAnthropic,
  openAIStreamToAnthropicMessage,
  resolveModel,
  toAnthropicSse,
} from "./anthropic-openai.mjs"

const config = loadConfig()
const logger = createLogger(config.logLevel)

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res)
  } catch (error) {
    logger.error({ event: "unhandled_error", message: error.message, stack: error.stack })
    sendJson(res, 500, anthropicError("internal_error", "服务暂时不可用，请稍后重试。"))
  }
})

server.headersTimeout = Math.max(config.requestTimeoutMs + 5000, 65000)
server.requestTimeout = Math.max(config.requestTimeoutMs + 10000, 70000)

server.listen(config.port, config.host, () => {
    logger.info({
    event: "started",
    host: config.host,
    port: config.port,
    models: config.modelMap.size,
  })
})

async function route(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1")
  const path = normalizePath(url.pathname)

  if (req.method === "HEAD" && (path === "/health" || path === "/" || path === "/v1/models")) {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    })
    res.end()
    return
  }

  if (req.method === "GET" && (path === "/health" || path === "/")) {
    return sendJson(res, 200, {
      ok: true,
      service: "model-gateway",
      models: config.modelMap.size,
    })
  }

  if (req.method === "GET" && path === "/v1/models") {
    return sendJson(res, 200, listModels())
  }

  if (req.method === "POST" && path === "/v1/messages/count_tokens") {
    const body = await readJson(req)
    return sendJson(res, 200, { input_tokens: countApproxTokens(body) })
  }

  if (req.method === "POST" && path === "/v1/messages") {
    return handleMessages(req, res)
  }

  return sendJson(res, 404, anthropicError("not_found_error", "Not found"))
}

function normalizePath(pathname) {
  let path = pathname || "/"
  if (path.startsWith("/claude/")) path = path.slice("/claude".length)
  if (path === "/claude") path = "/"
  return path.replace(/\/+$/, "") || "/"
}

async function handleMessages(req, res) {
  const auth = req.headers.authorization || req.headers["x-api-key"]
  if (!auth) {
    return sendJson(res, 401, anthropicError("authentication_error", "Missing Authorization bearer token"))
  }

  const body = await readJson(req)
  const routeModel = resolveModel(config, body.model)
  const openaiPayload = anthropicToOpenAI(body, routeModel, { forceStream: true })
  const upstreamUrl = `${config.newApiBaseUrl}/chat/completions`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs)

  logger.info({
    event: "request",
    requested_model: body.model,
    gateway_model: routeModel.id,
    route_type: routeModel.routeType,
    stream: Boolean(body.stream),
  })

  let upstream
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: normalizeAuthorization(auth),
        "X-Shenxiang-Claude-Gateway": "1",
      },
      body: JSON.stringify(openaiPayload),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!upstream.ok) {
    const text = await upstream.text()
    logger.warn({
      event: "model_request_failed",
      status: upstream.status,
      gateway_model: routeModel.id,
    })
    return sendJson(res, upstream.status, anthropicError("api_error", safeUpstreamMessage(text, upstream.status)))
  }

  if (body.stream) {
    return streamAnthropic(upstream, res, routeModel)
  }

  const contentType = upstream.headers.get("content-type") || ""
  if (contentType.includes("text/event-stream")) {
    const anthropicJson = await openAIStreamToAnthropicMessage(upstream, routeModel)
    return sendJson(res, 200, anthropicJson)
  }

  const openaiJson = await upstream.json()
  return sendJson(res, 200, openAIToAnthropic(openaiJson, routeModel))
}

async function streamAnthropic(upstream, res, routeModel) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })

  const state = {
    routeId: routeModel.id,
    started: false,
    textBlockStarted: false,
    textBlockClosed: false,
    closed: false,
    outputTokens: 0,
    toolCalls: new Map(),
    toolBlocksEmitted: false,
  }
  const nodeStream = Readable.fromWeb(upstream.body)
  let buffer = ""

  for await (const chunk of nodeStream) {
    buffer += chunk.toString("utf8")
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ""

    for (const line of lines) {
      if (!line.startsWith("data:")) continue
      const converted = toAnthropicSse(line, state)
      if (converted) res.write(converted)
    }
  }

  const tail = toAnthropicSse("data: [DONE]", state)
  if (tail) res.write(tail)
  res.end()
}

function listModels() {
  const now = Math.floor(Date.now() / 1000)
  return {
    data: [...config.modelMap.values()].map((model) => ({
      type: "model",
      id: model.id,
      display_name: model.displayName,
      created_at: now,
      metadata: model.description ? { description: model.description } : {},
    })),
    first_id: [...config.modelMap.keys()][0],
    has_more: false,
    last_id: [...config.modelMap.keys()].at(-1),
  }
}

function normalizeAuthorization(auth) {
  const value = Array.isArray(auth) ? auth[0] : String(auth || "")
  return value.toLowerCase().startsWith("bearer ") ? value : `Bearer ${value}`
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString("utf8")
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { statusCode: 400 })
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(JSON.stringify(payload))
}

function anthropicError(type, message) {
  return {
    type: "error",
    error: {
      type,
      message,
    },
  }
}

function safeUpstreamMessage(text, status) {
  if ([408, 504, 524].includes(Number(status))) return "服务响应超时，请稍后重试。"
  if ([401, 403].includes(Number(status))) return "当前账号暂时无法使用该服务，请重新登录或联系管理员。"
  if (Number(status) === 429) return "当前请求较多，请稍后重试。"
  return "服务暂时不可用，请稍后重试。"
}
