import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import test from "node:test"
import { writeWithBackpressure } from "../src/http-safety.mjs"

test("waits for drain when the downstream applies backpressure", async () => {
  const response = new FakeResponse(false)
  let settled = false

  const write = writeWithBackpressure(response, "payload").then(() => {
    settled = true
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(settled, false)

  response.emit("drain")
  await write
  assert.equal(settled, true)
  assert.deepEqual(response.chunks, ["payload"])
})

test("rejects a blocked write when the downstream closes", async () => {
  const response = new FakeResponse(false)
  const write = writeWithBackpressure(response, "payload")

  response.destroyed = true
  response.emit("close")

  await assert.rejects(write, (error) => error.code === "CLIENT_DISCONNECTED")
})

class FakeResponse extends EventEmitter {
  constructor(writeResult) {
    super()
    this.writeResult = writeResult
    this.chunks = []
    this.destroyed = false
    this.writableEnded = false
  }

  write(chunk) {
    this.chunks.push(chunk)
    return this.writeResult
  }
}
