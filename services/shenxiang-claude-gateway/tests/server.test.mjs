import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import http from "node:http"
import { once } from "node:events"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const serverFile = path.join(serviceRoot, "src/server.mjs")
const modelMapFile = path.join(serviceRoot, "config/model-map.json")
const validBody = JSON.stringify({
  model: "cc-gpt-haiku",
  max_tokens: 16,
  messages: [{ role: "user", content: "hello" }],
})
const streamingBody = JSON.stringify({
  model: "cc-gpt-haiku",
  max_tokens: 16,
  stream: true,
  messages: [{ role: "user", content: "hello" }],
})
const integrationTest = (name, fn) => test(name, { timeout: 4_000 }, fn)

integrationTest("authenticates token counting before parsing its request body", async (t) => {
  const gateway = await startGateway(t)

  const response = await fetch(`${gateway.url}/v1/messages/count_tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not-json",
  })

  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.type, "authentication_error")
})

integrationTest("validates token-counting credentials with New API", async (t) => {
  const upstream = await startHttpServer(t, (_req, res) => {
    res.writeHead(401, { "Content-Type": "application/json" })
    res.end('{"error":"invalid token"}')
  })
  const gateway = await startGateway(t, { upstreamUrl: `${upstream.url}/v1` })

  const response = await fetch(`${gateway.url}/v1/messages/count_tokens`, {
    method: "POST",
    headers: {
      Authorization: "Bearer invalid-user-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
  })

  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.type, "authentication_error")
})

integrationTest("counts tokens after New API validates the credential", async (t) => {
  let receivedAuthorization = ""
  const upstream = await startHttpServer(t, (req, res) => {
    receivedAuthorization = req.headers.authorization || ""
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end('{"data":[]}')
  })
  const gateway = await startGateway(t, { upstreamUrl: `${upstream.url}/v1` })

  const response = await fetch(`${gateway.url}/v1/messages/count_tokens`, {
    method: "POST",
    headers: {
      "x-api-key": "valid-user-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
  })

  assert.equal(response.status, 200)
  assert.ok((await response.json()).input_tokens > 0)
  assert.equal(receivedAuthorization, "Bearer valid-user-token")
})

integrationTest("rejects malformed authorization before reading the body", async (t) => {
  const gateway = await startGateway(t, { env: { MAX_REQUEST_BODY_BYTES: "64" } })

  const response = await fetch(`${gateway.url}/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: "Basic invalid-credential",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: "x".repeat(256) }),
  })

  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.type, "authentication_error")
})

integrationTest("returns a 400 Anthropic error for malformed authenticated JSON", async (t) => {
  const gateway = await startGateway(t)

  const response = await fetch(`${gateway.url}/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
    },
    body: "{not-json",
  })

  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.type, "invalid_request_error")
})

integrationTest("rejects oversized chunked bodies before contacting the upstream", async (t) => {
  let upstreamRequests = 0
  const upstream = await startHttpServer(t, (_req, res) => {
    upstreamRequests += 1
    res.writeHead(200, { "Content-Type": "text/event-stream" })
    res.end('data: {"choices":[{"delta":{"content":"unexpected"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')
  })
  const gateway = await startGateway(t, {
    upstreamUrl: `${upstream.url}/v1`,
    env: { MAX_REQUEST_BODY_BYTES: "128" },
  })
  const oversizedBody = JSON.stringify({
    model: "cc-gpt-haiku",
    max_tokens: 16,
    messages: [{ role: "user", content: "x".repeat(256) }],
  })

  const response = await rawRequest(`${gateway.url}/v1/messages`, {
    headers: {
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
    },
    chunks: [oversizedBody.slice(0, 80), oversizedBody.slice(80)],
  })

  assert.equal(response.status, 413)
  assert.equal(JSON.parse(response.body).error.type, "invalid_request_error")
  assert.equal(upstreamRequests, 0)
})

integrationTest("applies the same body limit to token counting", async (t) => {
  const gateway = await startGateway(t, { env: { MAX_REQUEST_BODY_BYTES: "96" } })
  const body = JSON.stringify({ messages: [{ role: "user", content: "x".repeat(200) }] })

  const response = await fetch(`${gateway.url}/v1/messages/count_tokens`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
    },
    body,
  })

  assert.equal(response.status, 413)
  assert.equal((await response.json()).error.type, "invalid_request_error")
})

integrationTest("returns 504 when the upstream does not produce response headers in time", async (t) => {
  let responseTimer
  const upstream = await startHttpServer(t, (_req, res) => {
    responseTimer = setTimeout(() => {
      res.writeHead(200, { "Content-Type": "text/event-stream" })
      res.end("data: [DONE]\n\n")
    }, 1_000)
  })
  t.after(() => clearTimeout(responseTimer))
  const gateway = await startGateway(t, {
    upstreamUrl: `${upstream.url}/v1`,
    env: { REQUEST_TIMEOUT_MS: "80" },
  })

  const response = await fetch(`${gateway.url}/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
    },
    body: validBody,
  })

  assert.equal(response.status, 504)
  assert.equal((await response.json()).error.type, "api_error")
})

integrationTest("keeps the timeout active while consuming an upstream stream", async (t) => {
  let resolveUpstreamClosed
  const upstreamClosed = new Promise((resolve) => {
    resolveUpstreamClosed = resolve
  })
  const upstream = await startHttpServer(t, (_req, res) => {
    res.on("close", resolveUpstreamClosed)
    res.writeHead(200, { "Content-Type": "text/event-stream" })
    res.write('data: {"id":"slow","choices":[{"delta":{"content":"first"}}]}\n\n')
  })
  const gateway = await startGateway(t, {
    upstreamUrl: `${upstream.url}/v1`,
    env: { REQUEST_TIMEOUT_MS: "100" },
  })

  const request = http.request(`${gateway.url}/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(validBody),
    },
  })
  request.on("error", () => {})
  request.end(validBody)

  await withTimeout(upstreamClosed, 800, "upstream stream was not aborted after the timeout")
  request.destroy()
})

integrationTest("emits a sanitized SSE error when a started stream times out", async (t) => {
  const upstream = await startHttpServer(t, (_req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" })
    res.write('data: {"id":"slow","choices":[{"delta":{"content":"first"}}]}\n\n')
  })
  const gateway = await startGateway(t, {
    upstreamUrl: `${upstream.url}/v1`,
    env: { REQUEST_TIMEOUT_MS: "100" },
  })

  const response = await fetch(`${gateway.url}/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
    },
    body: streamingBody,
  })
  let body
  try {
    body = await response.text()
  } catch (error) {
    assert.fail(`${error.stack}\nGateway output:\n${gateway.output()}`)
  }

  assert.equal(response.status, 200)
  assert.match(body, /event: error/)
  assert.match(body, /服务响应超时/)
  assert.doesNotMatch(body, /stack|AbortError|test-user-token/)
})

integrationTest("does not report a truncated upstream stream as successful", async (t) => {
  const upstream = await startHttpServer(t, (_req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" })
    res.end('data: {"id":"cutoff","choices":[{"delta":{"content":"partial"}}]}\n\n')
  })
  const gateway = await startGateway(t, { upstreamUrl: `${upstream.url}/v1` })

  const response = await fetch(`${gateway.url}/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
    },
    body: streamingBody,
  })
  const body = await response.text()

  assert.equal(response.status, 200)
  assert.match(body, /event: error/)
  assert.doesNotMatch(body, /event: message_stop/)
})

integrationTest("aborts the upstream stream when the downstream client disconnects", async (t) => {
  let resolveUpstreamClosed
  const upstreamClosed = new Promise((resolve) => {
    resolveUpstreamClosed = resolve
  })
  let counter = 0
  let streamTimer
  const upstream = await startHttpServer(t, (_req, res) => {
    res.on("close", () => {
      clearInterval(streamTimer)
      resolveUpstreamClosed()
    })
    res.writeHead(200, { "Content-Type": "text/event-stream" })
    streamTimer = setInterval(() => {
      counter += 1
      res.write(`data: {"id":"disconnect","choices":[{"delta":{"content":"${counter}"}}]}\n\n`)
    }, 10)
  })
  t.after(() => clearInterval(streamTimer))
  const gateway = await startGateway(t, {
    upstreamUrl: `${upstream.url}/v1`,
    env: { REQUEST_TIMEOUT_MS: "5000" },
  })

  await withTimeout(
    new Promise((resolve, reject) => {
      const request = http.request(`${gateway.url}/v1/messages`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-user-token",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(streamingBody),
        },
      })
      request.once("error", (error) => {
        if (error.code !== "ECONNRESET") reject(error)
      })
      request.once("response", (response) => {
        response.once("data", () => {
          response.destroy()
          request.destroy()
          resolve()
        })
      })
      request.end(streamingBody)
    }),
    800,
    "gateway did not stream the first upstream event",
  )

  await withTimeout(upstreamClosed, 800, "upstream stream remained open after client disconnect")
})

integrationTest("maps upstream connection failures to 502", async (t) => {
  const unavailablePort = await reservePort()
  const gateway = await startGateway(t, {
    upstreamUrl: `http://127.0.0.1:${unavailablePort}/v1`,
  })

  const response = await fetch(`${gateway.url}/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
    },
    body: validBody,
  })

  assert.equal(response.status, 502)
  assert.equal((await response.json()).error.type, "api_error")
})

integrationTest("preserves authentication failures without exposing upstream secrets", async (t) => {
  const leakedSecret = "upstream-secret-value-123"
  const upstream = await startHttpServer(t, (_req, res) => {
    res.writeHead(401, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: `invalid token ${leakedSecret}` }))
  })
  const gateway = await startGateway(t, { upstreamUrl: `${upstream.url}/v1` })

  const response = await fetch(`${gateway.url}/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
    },
    body: validBody,
  })
  const responseBody = await response.text()

  assert.equal(response.status, 401)
  assert.doesNotMatch(responseBody, new RegExp(leakedSecret))
  assert.equal(JSON.parse(responseBody).error.type, "authentication_error")
})

integrationTest("rejects oversized non-stream upstream responses", async (t) => {
  const upstream = await startHttpServer(t, (_req, res) => {
    const body = JSON.stringify({
      id: "chatcmpl_large",
      choices: [{ finish_reason: "stop", message: { content: "x".repeat(2_048) } }],
      usage: { prompt_tokens: 1, completion_tokens: 512 },
    })
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    })
    res.end(body)
  })
  const gateway = await startGateway(t, {
    upstreamUrl: `${upstream.url}/v1`,
    env: { MAX_NON_STREAM_RESPONSE_BYTES: "1024" },
  })

  const response = await fetch(`${gateway.url}/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
    },
    body: validBody,
  })

  assert.equal(response.status, 502)
  assert.equal((await response.json()).error.type, "api_error")
})

async function startGateway(t, options = {}) {
  const port = await reservePort()
  const child = spawn(process.execPath, [serverFile], {
    cwd: serviceRoot,
    env: {
      ...process.env,
      CLAUDE_GATEWAY_HOST: "127.0.0.1",
      CLAUDE_GATEWAY_PORT: String(port),
      MODEL_MAP_FILE: modelMapFile,
      NEW_API_BASE_URL: options.upstreamUrl || "http://127.0.0.1:9/v1",
      LOG_LEVEL: "error",
      ...options.env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  child.stdout.on("data", (chunk) => {
    output += chunk.toString("utf8")
  })
  child.stderr.on("data", (chunk) => {
    output += chunk.toString("utf8")
  })
  t.after(async () => stopChild(child))

  const url = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`gateway exited early (${child.exitCode}): ${output}`)
    try {
      const response = await fetch(`${url}/health`)
      if (response.ok) return { child, url, output: () => output }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`gateway did not become ready: ${output}`)
}

async function startHttpServer(t, handler) {
  const server = http.createServer(handler)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(async () => {
    server.closeAllConnections()
    server.close()
    if (server.listening) await once(server, "close")
  })
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}

async function reservePort() {
  const server = http.createServer()
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const { port } = server.address()
  server.close()
  await once(server, "close")
  return port
}

async function rawRequest(url, { headers, chunks }) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: "POST", headers }, (response) => {
      const responseChunks = []
      response.on("data", (chunk) => responseChunks.push(chunk))
      response.on("end", () => {
        resolve({
          status: response.statusCode,
          body: Buffer.concat(responseChunks).toString("utf8"),
        })
      })
    })
    request.once("error", reject)
    for (const chunk of chunks) request.write(chunk)
    request.end()
  })
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill("SIGTERM")
  try {
    await withTimeout(once(child, "exit"), 1_000, "gateway did not stop after SIGTERM")
  } catch {
    child.kill("SIGKILL")
    if (child.exitCode === null && child.signalCode === null) {
      await withTimeout(once(child, "exit"), 1_000, "gateway did not stop after SIGKILL")
    }
  }
}

async function withTimeout(promise, timeoutMs, message) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
