import http from "node:http"
import { Readable } from "node:stream"
import { StringDecoder } from "node:string_decoder"
import { loadConfig } from "./config.mjs"
import {
  ClientDisconnectedError,
  GatewayError,
  abortReason,
  createClientContext,
  createDeadlineContext,
  readJsonBody,
  readJsonResponse,
  requireAuthorization,
  throwIfAborted,
  writeWithBackpressure,
} from "./http-safety.mjs"
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

const server = http.createServer((req, res) => {
  void dispatch(req, res)
})

server.headersTimeout = config.headersTimeoutMs
server.requestTimeout = config.requestBodyTimeoutMs
server.maxHeadersCount = 100

server.listen(config.port, config.host, () => {
  logger.info({
    event: "started",
    host: config.host,
    port: config.port,
    models: config.modelMap.size,
  })
})

async function dispatch(req, res) {
  const clientContext = createClientContext(req, res)
  try {
    await route(req, res, clientContext.signal)
  } catch (error) {
    handleRequestError(req, res, error)
  } finally {
    clientContext.cleanup()
  }
}

async function route(req, res, clientSignal) {
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
    const authorization = requireAuthorization(req)
    const body = await readJsonBody(req, {
      maxBytes: config.maxRequestBodyBytes,
      signal: clientSignal,
    })
    validateRequestBody(body)
    await validateAuthorization(authorization, clientSignal)
    return sendJson(res, 200, { input_tokens: countApproxTokens(body) })
  }

  if (req.method === "POST" && path === "/v1/messages") {
    const authorization = requireAuthorization(req)
    return handleMessages(req, res, authorization, clientSignal)
  }

  return sendJson(res, 404, anthropicError("not_found_error", "Not found"))
}

function normalizePath(pathname) {
  let path = pathname || "/"
  if (path.startsWith("/claude/")) path = path.slice("/claude".length)
  if (path === "/claude") path = "/"
  return path.replace(/\/+$/, "") || "/"
}

async function handleMessages(req, res, authorization, clientSignal) {
  const body = await readJsonBody(req, {
    maxBytes: config.maxRequestBodyBytes,
    signal: clientSignal,
  })
  validateRequestBody(body)
  const routeModel = resolveModel(config, body.model)
  const openaiPayload = anthropicToOpenAI(body, routeModel, { forceStream: true })
  const upstreamUrl = `${config.newApiBaseUrl}/chat/completions`
  const deadlineContext = createDeadlineContext(clientSignal, config.requestTimeoutMs)

  logger.info({
    event: "request",
    requested_model: body.model,
    gateway_model: routeModel.id,
    route_type: routeModel.routeType,
    stream: Boolean(body.stream),
  })

  try {
    let upstream
    try {
      upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorization,
          "X-Shenxiang-Claude-Gateway": "1",
        },
        body: JSON.stringify(openaiPayload),
        signal: deadlineContext.signal,
      })
    } catch (error) {
      if (deadlineContext.signal.aborted) throw abortReason(deadlineContext.signal)
      throw new GatewayError(502, "api_error", "服务暂时不可用，请稍后重试。", {
        code: "UPSTREAM_CONNECTION_FAILED",
        cause: error,
      })
    }

    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => {})
      const status = normalizeUpstreamStatus(upstream.status)
      logger.warn({
        event: "model_request_failed",
        status,
        gateway_model: routeModel.id,
      })
      return sendJson(res, status, anthropicError(upstreamErrorType(status), safeUpstreamMessage(status)))
    }

    if (body.stream) {
      return await streamAnthropic(upstream, res, routeModel, deadlineContext.signal)
    }

    const contentType = upstream.headers.get("content-type") || ""
    if (contentType.includes("text/event-stream")) {
      const anthropicJson = await openAIStreamToAnthropicMessage(upstream, routeModel, {
        maxBufferBytes: config.maxSseBufferBytes,
        maxResponseBytes: config.maxNonStreamResponseBytes,
      })
      throwIfAborted(deadlineContext.signal)
      return sendJson(res, 200, anthropicJson)
    }

    const openaiJson = await readJsonResponse(upstream, {
      maxBytes: config.maxNonStreamResponseBytes,
      signal: deadlineContext.signal,
    })
    throwIfAborted(deadlineContext.signal)
    return sendJson(res, 200, openAIToAnthropic(openaiJson, routeModel))
  } catch (error) {
    if (deadlineContext.signal.aborted) throw abortReason(deadlineContext.signal)
    if (error instanceof GatewayError || error instanceof ClientDisconnectedError) throw error
    throw new GatewayError(502, "api_error", "服务暂时不可用，请稍后重试。", {
      code: "INVALID_UPSTREAM_RESPONSE",
      cause: error,
    })
  } finally {
    deadlineContext.cleanup()
  }
}

async function validateAuthorization(authorization, clientSignal) {
  const deadlineContext = createDeadlineContext(clientSignal, Math.min(config.requestTimeoutMs, 10000))
  try {
    let upstream
    try {
      upstream = await fetch(`${config.newApiBaseUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: authorization,
          "X-Shenxiang-Claude-Gateway": "1",
        },
        signal: deadlineContext.signal,
      })
    } catch (error) {
      if (deadlineContext.signal.aborted) throw abortReason(deadlineContext.signal)
      throw new GatewayError(502, "api_error", "服务暂时不可用，请稍后重试。", {
        code: "AUTH_VALIDATION_FAILED",
        cause: error,
      })
    }

    await upstream.body?.cancel().catch(() => {})
    if (!upstream.ok) {
      const status = normalizeUpstreamStatus(upstream.status)
      throw new GatewayError(status, upstreamErrorType(status), safeUpstreamMessage(status), {
        code: "AUTH_VALIDATION_REJECTED",
      })
    }
  } finally {
    deadlineContext.cleanup()
  }
}

async function streamAnthropic(upstream, res, routeModel, signal) {
  if (!upstream.body) {
    throw new GatewayError(502, "api_error", "服务暂时不可用，请稍后重试。", {
      code: "MISSING_UPSTREAM_BODY",
    })
  }

  res.statusCode = 200
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders()

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
  const abortStream = () => nodeStream.destroy(abortReason(signal))
  const decoder = new StringDecoder("utf8")
  let buffer = ""

  if (signal.aborted) abortStream()
  else signal.addEventListener("abort", abortStream, { once: true })

  try {
    for await (const chunk of nodeStream) {
      throwIfAborted(signal)
      buffer += decoder.write(chunk)
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ""
      if (Buffer.byteLength(buffer) > config.maxSseBufferBytes) {
        throw new GatewayError(502, "api_error", "服务暂时不可用，请稍后重试。", {
          code: "UPSTREAM_SSE_EVENT_TOO_LARGE",
        })
      }

      for (const line of lines) {
        if (!line.startsWith("data:")) continue
        if (Buffer.byteLength(line) > config.maxSseBufferBytes) {
          throw new GatewayError(502, "api_error", "服务暂时不可用，请稍后重试。", {
            code: "UPSTREAM_SSE_EVENT_TOO_LARGE",
          })
        }
        validateUpstreamSseLine(line)
        const converted = toAnthropicSse(line, state)
        if (converted) await writeWithBackpressure(res, converted, signal)
      }
    }

    buffer += decoder.end()
    if (buffer.startsWith("data:")) {
      validateUpstreamSseLine(buffer)
      const converted = toAnthropicSse(buffer, state)
      if (converted) await writeWithBackpressure(res, converted, signal)
    }
    if (!state.started || (!state.closed && !state.stopReason)) {
      throw new GatewayError(502, "api_error", "服务暂时不可用，请稍后重试。", {
        code: "UPSTREAM_STREAM_INCOMPLETE",
      })
    }
    const tail = toAnthropicSse("data: [DONE]", state)
    if (tail) await writeWithBackpressure(res, tail, signal)
    res.end()
  } finally {
    signal.removeEventListener("abort", abortStream)
    if (!nodeStream.destroyed) nodeStream.destroy()
  }
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

function validateRequestBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GatewayError(400, "invalid_request_error", "Request body must be a JSON object", {
      code: "INVALID_REQUEST_BODY",
    })
  }

  if (body.model !== undefined && (typeof body.model !== "string" || !body.model.trim())) {
    throw new GatewayError(400, "invalid_request_error", "model must be a non-empty string", {
      code: "INVALID_MODEL",
    })
  }
  if (body.messages !== undefined && !Array.isArray(body.messages)) {
    throw new GatewayError(400, "invalid_request_error", "messages must be an array", {
      code: "INVALID_MESSAGES",
    })
  }
  if (body.tools !== undefined && !Array.isArray(body.tools)) {
    throw new GatewayError(400, "invalid_request_error", "tools must be an array", {
      code: "INVALID_TOOLS",
    })
  }
  if (body.stream !== undefined && typeof body.stream !== "boolean") {
    throw new GatewayError(400, "invalid_request_error", "stream must be a boolean", {
      code: "INVALID_STREAM",
    })
  }
}

function validateUpstreamSseLine(line) {
  const jsonText = line.replace(/^data:\s*/, "").trim()
  if (!jsonText || jsonText === "[DONE]") return
  try {
    JSON.parse(jsonText)
  } catch (error) {
    throw new GatewayError(502, "api_error", "服务暂时不可用，请稍后重试。", {
      code: "INVALID_UPSTREAM_SSE",
      cause: error,
    })
  }
}

function sendJson(res, status, payload) {
  if (res.destroyed || res.writableEnded) return
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

function handleRequestError(req, res, error) {
  if (error instanceof ClientDisconnectedError || error?.code === "CLIENT_DISCONNECTED") {
    if (!res.destroyed) res.destroy()
    return
  }

  const gatewayError = normalizeRequestError(error)
  const logRecord = {
    event: gatewayError.statusCode >= 500 ? "request_failed" : "request_rejected",
    status: gatewayError.statusCode,
    code: gatewayError.code,
    response_headers_sent: res.headersSent,
    response_writable_ended: res.writableEnded,
    response_destroyed: res.destroyed,
  }
  if (gatewayError.statusCode >= 500) {
    logger.error({ ...logRecord, message: error?.message, stack: error?.stack })
  } else {
    logger.warn(logRecord)
  }

  if (res.destroyed || res.writableEnded) return
  const payload = anthropicError(gatewayError.errorType, gatewayError.message)
  if (res.headersSent) {
    const contentType = String(res.getHeader("content-type") || "")
    if (contentType.includes("text/event-stream")) {
      res.end(`event: error\ndata: ${JSON.stringify(payload)}\n\n`)
    } else {
      res.destroy()
    }
    return
  }

  if (gatewayError.statusCode === 413) {
    res.shouldKeepAlive = false
    res.setHeader("Connection", "close")
    req.resume()
  }
  sendJson(res, gatewayError.statusCode, payload)
}

function normalizeRequestError(error) {
  if (error instanceof GatewayError) return error
  return new GatewayError(500, "internal_error", "服务暂时不可用，请稍后重试。", {
    code: "INTERNAL_ERROR",
    cause: error,
  })
}

function normalizeUpstreamStatus(status) {
  const numericStatus = Number(status)
  if ([408, 504, 524].includes(numericStatus)) return 504
  if (Number.isInteger(numericStatus) && numericStatus >= 400 && numericStatus <= 599) return numericStatus
  return 502
}

function upstreamErrorType(status) {
  if (status === 401) return "authentication_error"
  if (status === 403) return "permission_error"
  if (status === 429) return "rate_limit_error"
  if ([400, 404, 409, 413, 422].includes(status)) return "invalid_request_error"
  return "api_error"
}

function safeUpstreamMessage(status) {
  if (status === 504) return "服务响应超时，请稍后重试。"
  if ([401, 403].includes(status)) return "当前账号暂时无法使用该服务，请重新登录或联系管理员。"
  if (status === 429) return "当前请求较多，请稍后重试。"
  if ([400, 404, 409, 413, 422].includes(status)) return "请求无效或当前模型不可用。"
  return "服务暂时不可用，请稍后重试。"
}
