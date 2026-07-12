import assert from "node:assert/strict"
import test from "node:test"
import {
  anthropicToOpenAI,
  flushStreamFinalEvents,
  openAIStreamToAnthropicMessage,
  openAIToAnthropic,
  toAnthropicSse,
} from "../src/anthropic-openai.mjs"

const route = {
  id: "cc-gpt-sonnet",
  targetModel: "gpt-5.5",
}

test("maps Anthropic text, system and tools into OpenAI chat completions", () => {
  const payload = anthropicToOpenAI(
    {
      model: "cc-gpt-sonnet",
      system: "You are concise.",
      max_tokens: 128,
      tools: [
        {
          name: "read_file",
          description: "Read a file",
          input_schema: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
          },
        },
      ],
      messages: [{ role: "user", content: [{ type: "text", text: "open package.json" }] }],
    },
    route,
  )

  assert.equal(payload.model, "gpt-5.5")
  assert.equal(payload.messages[0].role, "system")
  assert.equal(payload.messages[1].content, "open package.json")
  assert.equal(payload.tools[0].function.name, "read_file")
})

test("maps OpenAI tool calls back into Anthropic tool_use blocks", () => {
  const result = openAIToAnthropic(
    {
      id: "chatcmpl_test",
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "read_file", arguments: "{\"path\":\"package.json\"}" },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 4 },
    },
    route,
  )

  assert.equal(result.stop_reason, "tool_use")
  assert.equal(result.content[0].type, "tool_use")
  assert.equal(result.content[0].name, "read_file")
  assert.equal(result.content[0].input.path, "package.json")
})

test("flushes collected streaming tool calls as Anthropic tool_use events", () => {
  const state = {
    routeId: "cc-gpt-sonnet",
    started: false,
    textBlockStarted: false,
    textBlockClosed: false,
    closed: false,
    outputTokens: 0,
    toolCalls: new Map(),
    toolBlocksEmitted: false,
  }

  const start = toAnthropicSse(
    'data: {"id":"abc","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\\"path\\":"}}]}}]}',
    state,
  )
  const next = toAnthropicSse(
    'data: {"id":"abc","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"package.json\\"}"}}]},"finish_reason":"tool_calls"}]}',
    state,
  )
  const done = flushStreamFinalEvents(state)

  assert.match(start, /message_start/)
  assert.equal(next, "")
  assert.match(done, /content_block_start/)
  assert.match(done, /tool_use/)
  assert.match(done, /input_json_delta/)
  assert.match(done, /package\.json/)
  assert.match(done, /message_stop/)
})

test("bounds buffered non-stream responses from an upstream SSE stream", async () => {
  const encoder = new TextEncoder()
  const upstream = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${"x".repeat(2_048)}`))
        controller.close()
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  )

  await assert.rejects(
    openAIStreamToAnthropicMessage(upstream, route, {
      maxBufferBytes: 1_024,
      maxResponseBytes: 4_096,
    }),
    (error) => error.code === "UPSTREAM_SSE_EVENT_TOO_LARGE",
  )
})

test("preserves UTF-8 characters split across upstream SSE chunks", async () => {
  const encoded = new TextEncoder().encode(
    'data: {"id":"utf8","choices":[{"delta":{"content":"中文"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
  )
  const splitAt = encoded.indexOf(0xe4) + 1
  const upstream = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoded.slice(0, splitAt))
        setTimeout(() => {
          controller.enqueue(encoded.slice(splitAt))
          controller.close()
        }, 5)
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  )

  const result = await openAIStreamToAnthropicMessage(upstream, route)

  assert.equal(result.content[0].text, "中文")
})

test("rejects an upstream SSE response that ends before completion", async () => {
  const upstream = new Response('data: {"id":"cutoff","choices":[{"delta":{"content":"partial"}}]}\n\n', {
    headers: { "Content-Type": "text/event-stream" },
  })

  await assert.rejects(
    openAIStreamToAnthropicMessage(upstream, route),
    (error) => error.code === "UPSTREAM_STREAM_INCOMPLETE",
  )
})
