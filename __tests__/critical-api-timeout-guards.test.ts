import { readFileSync } from "fs"
import path from "path"
import { OperationTimeoutError, withTimeout } from "@/lib/server-timeout"

const root = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

describe("critical API timeout guards", () => {
  it("keeps the shared timeout helper explicit and reusable", () => {
    const source = read("lib/server-timeout.ts")

    expect(source).toContain("export class OperationTimeoutError")
    expect(source).toContain("readonly code = \"OPERATION_TIMEOUT\"")
    expect(source).toContain("export async function withTimeout")
    expect(source).toContain("Promise.race")
    expect(source).toContain("timer.unref?.()")
  })

  it("releases callers when a persistence promise never settles", async () => {
    jest.useFakeTimers()
    try {
      const pending = withTimeout(new Promise<never>(() => undefined), 4_000, "dify-chat.final-task-trace")
      const rejected = expect(pending).rejects.toEqual(expect.objectContaining({
        name: "OperationTimeoutError",
        code: "OPERATION_TIMEOUT",
        operation: "dify-chat.final-task-trace",
        timeoutMs: 4_000,
      } satisfies Partial<OperationTimeoutError>))

      await jest.advanceTimersByTimeAsync(4_000)
      await rejected
    } finally {
      jest.useRealTimers()
    }
  })

  // Credit account and membership timeout behavior is exercised with fake
  // timers in canonical-credit-account.test.ts.

  it("lets /api/chat-session degrade persistence and list reads without blocking chat", () => {
    const source = read("app/api/chat-session/route.ts")

    expect(source).toContain("withTimeout(requireUser(request), AUTH_TIMEOUT_MS")
    expect(source).toContain("SESSION_LOOKUP_TIMEOUT_MS")
    expect(source).toContain("SESSION_WRITE_TIMEOUT_MS")
    expect(source).toContain("SESSION_LIST_TIMEOUT_MS")
    expect(source).toContain("SESSION_MESSAGES_TIMEOUT_MS")
    expect(source).toContain("createDegradedSessionResponse")
    expect(source).toContain("SESSION_PERSISTENCE_DEGRADED")
    expect(source).toContain("SESSION_READ_DEGRADED")
    expect(source).toContain("{ status: 202 }")
    expect(source).toContain("isTransientSessionPersistenceError")
  })

  it("keeps /api/save-message core writes bounded and file metadata best-effort", () => {
    const source = read("app/api/save-message/route.ts")

    expect(source).toContain("withTimeout(requireUser(request), AUTH_TIMEOUT_MS")
    expect(source).toContain("SESSION_LOOKUP_TIMEOUT_MS")
    expect(source).toContain("MESSAGE_INSERT_TIMEOUT_MS")
    expect(source).toContain("FILE_METADATA_TIMEOUT_MS")
    expect(source).toContain("void persistUploadedFileMetadata")
    expect(source).toContain("save-message.message-insert")
    expect(source).toContain("save-message.file-metadata")
    expect(source).toContain("createPersistenceDegradedResponse")
    expect(source).toContain("SAVE_MESSAGE_PERSISTENCE_DEGRADED")
    expect(source).toContain("{ status: 202 }")
    expect(source).toContain("isTransientPersistenceError")
    expect(source).not.toContain("for (const file of files) {\n        try {")
  })

  it("bounds task status reads so chat error handling can always finish", () => {
    const route = read("app/api/task-status/route.ts")
    const chat = read("components/chat/enhanced-chat-interface.tsx")

    expect(route).toContain("withTimeout(requireUser(request), AUTH_TIMEOUT_MS")
    expect(route).toContain("TASK_STATUS_QUERY_TIMEOUT_MS = 4_000")
    expect(route).toContain('"task-status.query"')
    expect(route).toContain('code: "TASK_STATUS_UNAVAILABLE"')
    expect(chat).toContain("TASK_STATUS_LOOKUP_TIMEOUT_MS = 4_000")
    expect(chat).toContain("signal: AbortSignal.timeout(TASK_STATUS_LOOKUP_TIMEOUT_MS)")
    expect(chat).toContain('if (["queued", "running"].includes(task.status)) {\n      return null')
  })

  it("prevents late non-terminal trace writes from reopening completed tasks", () => {
    const trace = read("lib/ai-task-trace.ts")

    expect(trace).toContain('input.status === "queued" || input.status === "running"')
    expect(trace).toContain('updateQuery = updateQuery.is("completed_at", null)')
  })

  it("bounds remaining server-side HTTP calls without changing their business flow", () => {
    const cases = [
      ["lib/image-task-refunds.ts", "IMAGE_TASK_QUERY_TIMEOUT_MS"],
      ["app/api/web-search/route.ts", "TAVILY_TIMEOUT_MS"],
      ["lib/xunhupay.ts", "XUNHUPAY_QUERY_TIMEOUT_MS"],
      ["app/api/voice/stt/route.ts", "VOICE_STT_TIMEOUT_MS"],
    ] as const

    for (const [file, timeoutName] of cases) {
      const source = read(file)
      expect(source).toContain(timeoutName)
      expect(source).toContain(`signal: AbortSignal.timeout(${timeoutName})`)
    }
  })

  it("bounds legacy chat upstreams while preserving the metered response path", () => {
    const source = read("app/api/chat/route.ts")

    expect(source).toContain("ESSAY_GRADE_TIMEOUT_MS")
    expect(source).toContain("DIFY_STREAM_TIMEOUT_MS")
    expect(source).toContain("signal: AbortSignal.timeout(ESSAY_GRADE_TIMEOUT_MS)")
    expect(source).toContain("signal: AbortSignal.timeout(DIFY_STREAM_TIMEOUT_MS)")
    expect(source).toContain("createMeteredStreamResponse(essayGradeResponse")
    expect(source).toContain("createMeteredStreamResponse(response")
  })
})
