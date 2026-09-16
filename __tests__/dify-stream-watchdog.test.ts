import { readFileSync } from "fs"
import path from "path"
import {
  DifyStreamTimeoutError,
  withDifyStreamWatchdog,
} from "@/lib/dify-stream-watchdog"

const readSource = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), "utf8")

describe("Dify stream watchdog", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("passes a normally completed stream through unchanged", async () => {
    const body = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("message")
        controller.enqueue("message_end")
        controller.close()
      },
    })
    const onTimeout = jest.fn()
    const reader = withDifyStreamWatchdog(body, {
      idleTimeoutMs: 50,
      maxDurationMs: 100,
      onTimeout,
    }).getReader()

    await expect(reader.read()).resolves.toEqual({ done: false, value: "message" })
    await expect(reader.read()).resolves.toEqual({ done: false, value: "message_end" })
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined })
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it("fails a stream that stalls after its first upstream chunk", async () => {
    const cancel = jest.fn()
    const body = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("workflow_started")
      },
      cancel,
    })
    const onTimeout = jest.fn()
    const reader = withDifyStreamWatchdog(body, {
      idleTimeoutMs: 50,
      maxDurationMs: 500,
      onTimeout,
    }).getReader()

    await expect(reader.read()).resolves.toEqual({ done: false, value: "workflow_started" })
    const stalledRead = expect(reader.read()).rejects.toEqual(expect.objectContaining({
      name: "DifyStreamTimeoutError",
      reason: "idle",
    }))
    await jest.advanceTimersByTimeAsync(50)

    await stalledRead
    expect(onTimeout).toHaveBeenCalledWith("idle", expect.any(DifyStreamTimeoutError))
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it("resets idle time only when another upstream chunk arrives", async () => {
    let sourceController: ReadableStreamDefaultController<string> | null = null
    const body = new ReadableStream<string>({
      start(controller) {
        sourceController = controller
        controller.enqueue("workflow_started")
      },
    })
    const reader = withDifyStreamWatchdog(body, {
      idleTimeoutMs: 50,
      maxDurationMs: 500,
    }).getReader()

    await expect(reader.read()).resolves.toEqual({ done: false, value: "workflow_started" })
    await jest.advanceTimersByTimeAsync(40)
    sourceController!.enqueue("node_started")
    await expect(reader.read()).resolves.toEqual({ done: false, value: "node_started" })

    const stalledRead = expect(reader.read()).rejects.toMatchObject({ reason: "idle" })
    await jest.advanceTimersByTimeAsync(49)
    expect(jest.getTimerCount()).toBeGreaterThan(0)
    await jest.advanceTimersByTimeAsync(1)
    await stalledRead
  })

  it("enforces total stream duration even while upstream chunks continue", async () => {
    let sourceController: ReadableStreamDefaultController<string> | null = null
    const body = new ReadableStream<string>({
      start(controller) {
        sourceController = controller
        controller.enqueue("workflow_started")
      },
    })
    const reader = withDifyStreamWatchdog(body, {
      idleTimeoutMs: 80,
      maxDurationMs: 100,
    }).getReader()

    await reader.read()
    await jest.advanceTimersByTimeAsync(60)
    sourceController!.enqueue("node_started")
    await reader.read()

    const finalRead = expect(reader.read()).rejects.toMatchObject({ reason: "max_duration" })
    await jest.advanceTimersByTimeAsync(40)
    await finalRead
  })
})

describe("Dify stream route lifecycle", () => {
  it("turns watchdog failures into a structured SSE error and timeout trace", () => {
    const route = readSource("app/api/dify-chat/route.ts")

    expect(route).toContain("withDifyStreamWatchdog(response.body")
    expect(route).toContain('status: "timeout"')
    expect(route).toContain('code: "DIFY_STREAM_IDLE_TIMEOUT"')
    expect(route).toContain('code: "DIFY_STREAM_MAX_DURATION"')
    expect(route).toContain("error instanceof DifyStreamTimeoutError")
    expect(route).toContain("enqueueSseError(controller, failure.message, failure.code)")
  })

  it("emits an explicit no-charge error when a completed stream has no answer", () => {
    const route = readSource("app/api/dify-chat/route.ts")

    expect(route).toContain("!hasReceivedContent && !workflowNodeFailure")
    expect(route).toContain('code: "DIFY_EMPTY_RESPONSE"')
    expect(route).toContain("作文批改本次没有返回可展示内容，请重新提交。本次未扣费。")
    expect(route).toContain("enqueueSseError(controller, message, workflowNodeFailure.code)")
  })

  it("preserves split UTF-8 characters across Dify chunks", () => {
    const route = readSource("app/api/dify-chat/route.ts")

    expect(route).toContain("const difyStreamDecoder = new TextDecoder()")
    expect(route).toContain("difyStreamDecoder.decode(chunk, { stream: true })")
    expect(route).toContain("const trailingText = difyStreamDecoder.decode()")
  })

  it("settles successful terminal events without waiting for physical EOF", () => {
    const route = readSource("app/api/dify-chat/route.ts")

    expect(route.match(/const reachedDifyTerminalSuccess =/g)).toHaveLength(2)
    expect(route).toContain('json.event === "message_end"')
    expect(route).toContain('WORKFLOW_MODELS.has(model || "") && json.event === "workflow_finished"')
    expect(route).toContain("await finalizeDifyChatResponse(controller")
  })

  it("records an empty upstream body as a terminal no-charge failure", () => {
    const route = readSource("app/api/dify-chat/route.ts")

    expect(route).toContain('code: "DIFY_EMPTY_RESPONSE_BODY"')
    expect(route).toContain('status: "failed"')
    expect(route).toContain('failure_phase: "response_body"')
  })

  it("does not let terminal task tracing hold the user response open indefinitely", () => {
    const route = readSource("app/api/dify-chat/route.ts")
    const trace = readSource("lib/ai-task-trace.ts")

    expect(route).toContain("TASK_TRACE_FINALIZE_TIMEOUT_MS = 4_000")
    expect(route).toContain("await withTimeout(")
    expect(route).toContain('"dify-chat.final-task-trace"')
    expect(route).toContain("nodeEvents: bufferedNodeEvents")
    expect(route).not.toContain("await replaceTaskNodeEvents(taskRun.id, bufferedNodeEvents)")
    expect(trace).toContain("patch.node_events = input.nodeEvents.slice(-80)")
  })
})
