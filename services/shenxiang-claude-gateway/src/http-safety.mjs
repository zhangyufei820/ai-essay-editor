export class GatewayError extends Error {
  constructor(statusCode, errorType, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined)
    this.name = "GatewayError"
    this.statusCode = statusCode
    this.errorType = errorType
    this.code = options.code || "GATEWAY_ERROR"
  }
}

export class ClientDisconnectedError extends Error {
  constructor() {
    super("Client disconnected")
    this.name = "ClientDisconnectedError"
    this.code = "CLIENT_DISCONNECTED"
  }
}

export function requireAuthorization(req) {
  const authorization = firstHeader(req.headers.authorization).trim()
  const apiKey = firstHeader(req.headers["x-api-key"]).trim()

  if (!authorization && !apiKey) {
    throw new GatewayError(401, "authentication_error", "Missing Authorization bearer token", {
      code: "MISSING_AUTHORIZATION",
    })
  }

  if (authorization) {
    const bearer = authorization.match(/^Bearer[\t ]+(\S+)[\t ]*$/i)
    if (bearer) return `Bearer ${bearer[1]}`
    if (!/\s/.test(authorization)) return `Bearer ${authorization}`
    throw invalidAuthorization()
  }

  if (/\s/.test(apiKey)) throw invalidAuthorization()
  return `Bearer ${apiKey}`
}

export async function readJsonBody(req, options) {
  const maxBytes = options.maxBytes
  const signal = options.signal
  const declaredLength = firstHeader(req.headers["content-length"]).trim()
  const contentEncoding = firstHeader(req.headers["content-encoding"]).trim().toLowerCase()

  if (contentEncoding && contentEncoding !== "identity") {
    throw new GatewayError(415, "invalid_request_error", "Unsupported Content-Encoding", {
      code: "UNSUPPORTED_CONTENT_ENCODING",
    })
  }

  if (declaredLength) {
    const parsedLength = Number(declaredLength)
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new GatewayError(400, "invalid_request_error", "Invalid Content-Length", {
        code: "INVALID_CONTENT_LENGTH",
      })
    }
    if (parsedLength > maxBytes) throw requestTooLarge()
  }

  const { chunks, receivedBytes } = await collectBody(req, maxBytes, signal)

  throwIfAborted(signal)
  let raw
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, receivedBytes))
  } catch (error) {
    throw new GatewayError(400, "invalid_request_error", "Request body must be valid UTF-8", {
      code: "INVALID_UTF8_BODY",
      cause: error,
    })
  }

  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new GatewayError(400, "invalid_request_error", "Invalid JSON body", {
      code: "INVALID_JSON_BODY",
      cause: error,
    })
  }
}

export async function readJsonResponse(response, options) {
  const maxBytes = options.maxBytes
  const signal = options.signal
  const declaredLength = response.headers.get("content-length") || ""
  if (declaredLength) {
    const parsedLength = Number(declaredLength)
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maxBytes) {
      await response.body?.cancel().catch(() => {})
      throw invalidUpstreamBody("UPSTREAM_RESPONSE_TOO_LARGE")
    }
  }
  if (!response.body) throw invalidUpstreamBody("MISSING_UPSTREAM_BODY")

  const reader = response.body.getReader()
  const chunks = []
  let receivedBytes = 0
  try {
    while (true) {
      throwIfAborted(signal)
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      receivedBytes += chunk.byteLength
      if (receivedBytes > maxBytes) {
        await reader.cancel().catch(() => {})
        throw invalidUpstreamBody("UPSTREAM_RESPONSE_TOO_LARGE")
      }
      chunks.push(chunk)
    }
  } catch (error) {
    if (signal?.aborted) throw abortReason(signal)
    if (error instanceof GatewayError) throw error
    throw invalidUpstreamBody("INVALID_UPSTREAM_RESPONSE", error)
  } finally {
    reader.releaseLock()
  }

  let raw
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, receivedBytes))
    return JSON.parse(raw)
  } catch (error) {
    throw invalidUpstreamBody("INVALID_UPSTREAM_RESPONSE", error)
  }
}

export function createClientContext(req, res) {
  const controller = new AbortController()
  const abort = () => {
    if (!controller.signal.aborted) controller.abort(new ClientDisconnectedError())
  }
  const handleResponseClose = () => {
    if (!res.writableEnded) abort()
  }

  req.once("aborted", abort)
  res.once("close", handleResponseClose)

  return {
    signal: controller.signal,
    cleanup() {
      req.off("aborted", abort)
      res.off("close", handleResponseClose)
    },
  }
}

export function createDeadlineContext(parentSignal, timeoutMs) {
  const controller = new AbortController()
  const timeoutError = new GatewayError(504, "api_error", "服务响应超时，请稍后重试。", {
    code: "UPSTREAM_TIMEOUT",
  })
  const abortFromParent = () => {
    if (!controller.signal.aborted) controller.abort(abortReason(parentSignal))
  }
  const timeout = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(timeoutError)
  }, timeoutMs)
  timeout.unref?.()

  if (parentSignal?.aborted) abortFromParent()
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true })

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout)
      parentSignal?.removeEventListener("abort", abortFromParent)
    },
  }
}

export async function writeWithBackpressure(res, chunk, signal) {
  throwIfAborted(signal)
  if (res.destroyed || res.writableEnded) throw new ClientDisconnectedError()
  if (res.write(chunk)) return

  await new Promise((resolve, reject) => {
    const cleanup = () => {
      res.off("drain", handleDrain)
      res.off("close", handleClose)
      res.off("error", handleError)
      signal?.removeEventListener("abort", handleAbort)
    }
    const settle = (callback, value) => {
      cleanup()
      callback(value)
    }
    const handleDrain = () => settle(resolve)
    const handleClose = () => settle(reject, new ClientDisconnectedError())
    const handleError = (error) => settle(reject, error)
    const handleAbort = () => settle(reject, abortReason(signal))

    res.once("drain", handleDrain)
    res.once("close", handleClose)
    res.once("error", handleError)
    signal?.addEventListener("abort", handleAbort, { once: true })

    if (signal?.aborted) handleAbort()
    else if (res.destroyed || res.writableEnded) handleClose()
  })
}

export function abortReason(signal) {
  return signal?.reason instanceof Error ? signal.reason : new ClientDisconnectedError()
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal)
}

function requestTooLarge() {
  return new GatewayError(413, "invalid_request_error", "Request body is too large", {
    code: "REQUEST_BODY_TOO_LARGE",
  })
}

function invalidAuthorization() {
  return new GatewayError(401, "authentication_error", "Invalid Authorization bearer token", {
    code: "INVALID_AUTHORIZATION",
  })
}

function invalidUpstreamBody(code, cause) {
  return new GatewayError(502, "api_error", "服务暂时不可用，请稍后重试。", {
    code,
    cause,
  })
}

function collectBody(req, maxBytes, signal) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let receivedBytes = 0
    let settled = false

    const cleanup = () => {
      req.off("data", handleData)
      req.off("end", handleEnd)
      req.off("aborted", handleAborted)
      req.off("error", handleError)
      signal?.removeEventListener("abort", handleSignalAbort)
    }
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      cleanup()
      callback(value)
    }
    const handleData = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      receivedBytes += buffer.byteLength
      if (receivedBytes > maxBytes) {
        req.pause()
        finish(reject, requestTooLarge())
        return
      }
      chunks.push(buffer)
    }
    const handleEnd = () => finish(resolve, { chunks, receivedBytes })
    const handleAborted = () => finish(reject, new ClientDisconnectedError())
    const handleError = (error) => {
      if (error?.code === "ECONNRESET") finish(reject, new ClientDisconnectedError())
      else {
        finish(
          reject,
          new GatewayError(400, "invalid_request_error", "Request body could not be read", {
            code: "INVALID_REQUEST_BODY",
            cause: error,
          }),
        )
      }
    }
    const handleSignalAbort = () => finish(reject, abortReason(signal))

    req.on("data", handleData)
    req.once("end", handleEnd)
    req.once("aborted", handleAborted)
    req.once("error", handleError)
    signal?.addEventListener("abort", handleSignalAbort, { once: true })

    if (signal?.aborted) handleSignalAbort()
  })
}

function firstHeader(value) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "")
}
