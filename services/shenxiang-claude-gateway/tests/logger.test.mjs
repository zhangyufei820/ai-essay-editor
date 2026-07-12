import assert from "node:assert/strict"
import test from "node:test"
import { createLogger, redact } from "../src/logger.mjs"

test("redacts bearer and structured credential values without reproducing the source", () => {
  const secrets = [
    "bearer-secret-value-123",
    "plain-api-key-value-456",
    "password-value-789",
    "cookie-session-value-012",
  ]
  const source = JSON.stringify({
    authorization: `Bearer ${secrets[0]}`,
    "x-api-key": secrets[1],
    password: secrets[2],
    cookie: `session=${secrets[3]}`,
  })

  const result = redact(source)

  assert.match(result, /\[REDACTED\]/)
  for (const secret of secrets) assert.doesNotMatch(result, new RegExp(secret))
})

test("redacts credential query parameters", () => {
  const result = redact("https://example.test/path?access_token=query-secret-123&mode=test")

  assert.doesNotMatch(result, /query-secret-123/)
  assert.match(result, /access_token=%5BREDACTED%5D|access_token=\[REDACTED\]/)
})

test("redacts credentials embedded in logged error strings", () => {
  const secret = "embedded-credential-value-123"
  const originalConsoleLog = console.log
  const records = []
  console.log = (record) => records.push(record)

  try {
    createLogger("info").error({ message: JSON.stringify({ "x-api-key": secret }) })
  } finally {
    console.log = originalConsoleLog
  }

  assert.equal(records.length, 1)
  assert.doesNotMatch(records[0], new RegExp(secret))
  assert.match(records[0], /\[REDACTED\]/)
})
