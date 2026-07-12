import crypto from "node:crypto"
import { StringDecoder } from "node:string_decoder"

const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_MAX_SSE_BUFFER_BYTES = 1024 * 1024
const DEFAULT_MAX_NON_STREAM_RESPONSE_BYTES = 16 * 1024 * 1024

export function resolveModel(config, requestedModel) {
  const id = requestedModel || config.defaultModel
  return config.modelMap.get(id) || config.modelMap.get(config.defaultModel) || [...config.modelMap.values()][0]
}

export function anthropicToOpenAI(body, route, options = {}) {
  const messages = []

  if (body.system) {
    messages.push({
      role: "system",
      content: normalizeSystem(body.system),
    })
  }

  for (const message of body.messages || []) {
    const converted = convertAnthropicMessage(message)
    if (Array.isArray(converted)) messages.push(...converted)
    else if (converted) messages.push(converted)
  }

  const payload = {
    model: route.targetModel,
    messages,
    stream: Boolean(body.stream || options.forceStream),
  }

  if (typeof body.max_tokens === "number") payload.max_tokens = body.max_tokens
  else payload.max_tokens = DEFAULT_MAX_TOKENS

  if (typeof body.temperature === "number") payload.temperature = body.temperature
  if (typeof body.top_p === "number") payload.top_p = body.top_p
  if (Array.isArray(body.stop_sequences)) payload.stop = body.stop_sequences

  const tools = convertTools(body.tools)
  if (tools.length > 0) payload.tools = tools

  if (body.tool_choice) {
    payload.tool_choice = convertToolChoice(body.tool_choice)
  }

  return payload
}

export function openAIToAnthropic(openaiJson, route) {
  const choice = openaiJson?.choices?.[0] || {}
  const message = choice.message || {}
  const content = []

  if (typeof message.content === "string" && message.content.length > 0) {
    content.push({ type: "text", text: message.content })
  }

  for (const toolCall of message.tool_calls || []) {
    if (toolCall.type !== "function") continue
    content.push({
      type: "tool_use",
      id: toolCall.id || `toolu_${cryptoRandomId()}`,
      name: toolCall.function?.name || "tool",
      input: parseJsonObject(toolCall.function?.arguments),
    })
  }

  return {
    id: `msg_${openaiJson?.id || cryptoRandomId()}`,
    type: "message",
    role: "assistant",
    model: route.id,
    content,
    stop_reason: mapFinishReason(choice.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: openaiJson?.usage?.prompt_tokens || 0,
      output_tokens: openaiJson?.usage?.completion_tokens || 0,
    },
  }
}

export async function openAIStreamToAnthropicMessage(upstream, route, options = {}) {
  const nodeStream = await import("node:stream").then(({ Readable }) => Readable.fromWeb(upstream.body))
  const maxBufferBytes = positiveLimit(options.maxBufferBytes, DEFAULT_MAX_SSE_BUFFER_BYTES)
  const maxResponseBytes = positiveLimit(options.maxResponseBytes, DEFAULT_MAX_NON_STREAM_RESPONSE_BYTES)
  const decoder = new StringDecoder("utf8")
  let buffer = ""
  let responseBytes = 0
  let text = ""
  let finishReason = "end_turn"
  let promptTokens = 0
  let completionTokens = 0
  let completed = false
  const toolCalls = new Map()

  const consumeLine = (line) => {
    if (Buffer.byteLength(line) > maxBufferBytes) throw upstreamLimitError("UPSTREAM_SSE_EVENT_TOO_LARGE")
    if (!line.startsWith("data:")) return
    const jsonText = line.replace(/^data:\s*/, "").trim()
    if (!jsonText) return
    if (jsonText === "[DONE]") {
      completed = true
      return
    }
    let parsed
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      throw upstreamStreamError("INVALID_UPSTREAM_SSE")
    }
    const choice = parsed.choices?.[0] || {}
    const delta = choice.delta || {}
    const message = choice.message || {}

    if (typeof delta.content === "string") text += delta.content
    if (typeof message.content === "string") text += message.content
    accumulateToolCalls(toolCalls, delta.tool_calls || message.tool_calls || [])
    if (choice.finish_reason) {
      finishReason = mapFinishReason(choice.finish_reason)
      completed = true
    }
    if (parsed.usage?.prompt_tokens) promptTokens = parsed.usage.prompt_tokens
    if (parsed.usage?.completion_tokens) completionTokens = parsed.usage.completion_tokens
  }

  for await (const chunk of nodeStream) {
    responseBytes += chunk.byteLength
    if (responseBytes > maxResponseBytes) throw upstreamLimitError("UPSTREAM_RESPONSE_TOO_LARGE")
    buffer += decoder.write(chunk)
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ""
    if (Buffer.byteLength(buffer) > maxBufferBytes) throw upstreamLimitError("UPSTREAM_SSE_EVENT_TOO_LARGE")
    for (const line of lines) consumeLine(line)
  }
  buffer += decoder.end()
  if (buffer) consumeLine(buffer)
  if (!completed) throw upstreamStreamError("UPSTREAM_STREAM_INCOMPLETE")

  const content = []
  if (text) content.push({ type: "text", text })
  for (const toolCall of toolCallsToAnthropic(toolCalls)) content.push(toolCall)

  return {
    id: `msg_${cryptoRandomId()}`,
    type: "message",
    role: "assistant",
    model: route.id,
    content,
    stop_reason: finishReason,
    stop_sequence: null,
    usage: {
      input_tokens: promptTokens,
      output_tokens: completionTokens || Math.max(0, Math.ceil(text.length / 4)),
    },
  }
}

export function countApproxTokens(body) {
  const text = [
    typeof body.system === "string" ? body.system : JSON.stringify(body.system || ""),
    ...(body.messages || []).map((item) => JSON.stringify(item)),
    ...(body.tools || []).map((item) => JSON.stringify(item)),
  ].join("\n")

  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length
  const latin = text.replace(/[\u3400-\u9fff]/g, " ")
  const words = (latin.match(/[A-Za-z0-9_]+/g) || []).length
  const punctuation = (latin.match(/[^\sA-Za-z0-9_]/g) || []).length

  return Math.max(1, Math.ceil(cjk * 0.9 + words * 1.3 + punctuation * 0.2))
}

export function toAnthropicSse(openaiLine, state) {
  const jsonText = openaiLine.replace(/^data:\s*/, "").trim()
  if (!jsonText || jsonText === "[DONE]") {
    if (!state.closed) {
      state.closed = true
      return flushStreamFinalEvents(state)
    }
    return ""
  }

  let chunk
  try {
    chunk = JSON.parse(jsonText)
  } catch {
    return ""
  }

  const choice = chunk.choices?.[0] || {}
  const delta = choice.delta || {}
  const out = []

  if (!state.started) {
    state.started = true
    state.messageId = `msg_${chunk.id || cryptoRandomId()}`
    out.push(
      eventLine("message_start", {
        type: "message_start",
        message: {
          id: state.messageId,
          type: "message",
          role: "assistant",
          model: state.routeId,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      }),
    )
  }

  if (!state.textBlockStarted && typeof delta.content === "string") {
    state.textBlockStarted = true
    out.push(eventLine("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }))
  }

  if (typeof delta.content === "string" && delta.content.length > 0) {
    state.outputTokens = (state.outputTokens || 0) + approxDeltaTokens(delta.content)
    out.push(
      eventLine("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: delta.content },
      }),
    )
  }

  if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
    accumulateToolCalls(state.toolCalls || (state.toolCalls = new Map()), delta.tool_calls)
  }

  if (choice.finish_reason) {
    state.stopReason = mapFinishReason(choice.finish_reason)
  }

  return out.join("")
}

function normalizeSystem(system) {
  if (typeof system === "string") return system
  if (Array.isArray(system)) {
    return system
      .map((item) => {
        if (typeof item === "string") return item
        if (item?.type === "text") return item.text || ""
        return JSON.stringify(item)
      })
      .filter(Boolean)
      .join("\n")
  }
  return JSON.stringify(system)
}

function convertAnthropicMessage(message) {
  if (!message || typeof message !== "object") return null
  const role = message.role === "assistant" ? "assistant" : "user"
  const content = message.content

  if (typeof content === "string") return { role, content }
  if (!Array.isArray(content)) return { role, content: String(content || "") }

  const textParts = []
  const toolUses = []
  const toolResults = []

  for (const block of content) {
    if (!block) continue
    if (block.type === "text") textParts.push(block.text || "")
    else if (block.type === "image") textParts.push(convertImageBlock(block))
    else if (block.type === "tool_use" && role === "assistant") {
      toolUses.push({
        id: block.id || `toolu_${cryptoRandomId()}`,
        type: "function",
        function: {
          name: block.name || "tool",
          arguments: JSON.stringify(block.input || {}),
        },
      })
    } else if (block.type === "tool_result") {
      toolResults.push({
        role: "tool",
        tool_call_id: block.tool_use_id || `toolu_${cryptoRandomId()}`,
        content: stringifyToolResult(block.content),
      })
    }
  }

  if (toolResults.length > 0) return toolResults
  if (toolUses.length > 0) {
    return {
      role: "assistant",
      content: textParts.join("\n") || null,
      tool_calls: toolUses,
    }
  }
  return { role, content: textParts.filter(Boolean).join("\n") }
}

function convertImageBlock(block) {
  const source = block.source || {}
  if (source.type === "base64" && source.data) {
    return `[image:${source.media_type || "image/png"};base64,${source.data}]`
  }
  if (source.type === "url" && source.url) {
    return `[image:${source.url}]`
  }
  return "[image]"
}

function stringifyToolResult(content) {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item
        if (item?.type === "text") return item.text || ""
        return JSON.stringify(item)
      })
      .join("\n")
  }
  return JSON.stringify(content || "")
}

function convertTools(tools) {
  if (!Array.isArray(tools)) return []
  return tools
    .filter((tool) => tool?.name)
    .map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: tool.input_schema || { type: "object", properties: {} },
      },
    }))
}

function convertToolChoice(choice) {
  if (!choice || typeof choice !== "object") return undefined
  if (choice.type === "auto") return "auto"
  if (choice.type === "any") return "required"
  if (choice.type === "tool" && choice.name) {
    return { type: "function", function: { name: choice.name } }
  }
  return undefined
}

function mapFinishReason(reason) {
  if (!reason) return "end_turn"
  if (reason === "stop") return "end_turn"
  if (reason === "length") return "max_tokens"
  if (reason === "tool_calls") return "tool_use"
  if (reason === "content_filter") return "stop_sequence"
  return "end_turn"
}

export function flushStreamFinalEvents(state) {
  const out = []
  if (state.textBlockStarted && !state.textBlockClosed) {
    state.textBlockClosed = true
    out.push(eventLine("content_block_stop", { type: "content_block_stop", index: 0 }))
  }

  if (!state.toolBlocksEmitted && state.toolCalls?.size) {
    let index = state.textBlockStarted ? 1 : 0
    for (const block of toolCallsToAnthropic(state.toolCalls)) {
      out.push(
        eventLine("content_block_start", {
          type: "content_block_start",
          index,
          content_block: { type: "tool_use", id: block.id, name: block.name, input: {} },
        }),
      )
      out.push(
        eventLine("content_block_delta", {
          type: "content_block_delta",
          index,
          delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input || {}) },
        }),
      )
      out.push(eventLine("content_block_stop", { type: "content_block_stop", index }))
      index += 1
    }
    state.toolBlocksEmitted = true
  }

  out.push(
    eventLine("message_delta", {
      type: "message_delta",
      delta: { stop_reason: state.stopReason || "end_turn", stop_sequence: null },
      usage: { output_tokens: state.outputTokens || 0 },
    }),
  )
  out.push(eventLine("message_stop", { type: "message_stop" }))
  return out.join("")
}

function parseJsonObject(value) {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function accumulateToolCalls(store, toolCalls) {
  if (!Array.isArray(toolCalls)) return
  for (const item of toolCalls) {
    const key = String(item.index ?? item.id ?? store.size)
    const existing = store.get(key) || { id: "", name: "", arguments: "" }
    if (item.id) existing.id = item.id
    if (item.function?.name) existing.name = item.function.name
    if (typeof item.function?.arguments === "string") existing.arguments += item.function.arguments
    store.set(key, existing)
  }
}

function toolCallsToAnthropic(store) {
  return [...store.values()].map((item) => ({
    type: "tool_use",
    id: item.id || `toolu_${cryptoRandomId()}`,
    name: item.name || "tool",
    input: parseJsonObject(item.arguments),
  }))
}

function approxDeltaTokens(text) {
  return Math.max(1, Math.ceil(String(text).length / 4))
}

function eventLine(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function cryptoRandomId() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16)
}

function positiveLimit(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

function upstreamLimitError(code) {
  const error = new Error("Upstream response exceeded the configured safety limit")
  error.code = code
  return error
}

function upstreamStreamError(code) {
  const error = new Error("Upstream stream ended without a valid completion event")
  error.code = code
  return error
}
