export type DifyStreamTimeoutReason = "idle" | "max_duration"

export class DifyStreamTimeoutError extends Error {
  readonly reason: DifyStreamTimeoutReason

  constructor(reason: DifyStreamTimeoutReason) {
    super(reason === "idle" ? "Dify stream idle timeout" : "Dify stream max duration exceeded")
    this.name = "DifyStreamTimeoutError"
    this.reason = reason
  }
}

type WatchdogOptions = {
  idleTimeoutMs?: number
  maxDurationMs?: number
  onTimeout?: (reason: DifyStreamTimeoutReason, error: DifyStreamTimeoutError) => void | Promise<void>
}

function scheduleTimer(callback: () => void, timeoutMs: number) {
  const timer = setTimeout(callback, timeoutMs)
  timer.unref?.()
  return timer
}

/**
 * Bounds a Dify response body while preserving every upstream chunk. The idle
 * timer starts after the first chunk and is reset only by upstream activity;
 * downstream heartbeat bytes are therefore not counted as provider progress.
 */
export function withDifyStreamWatchdog<T>(body: ReadableStream<T>, options: WatchdogOptions = {}) {
  const idleTimeoutMs = Number.isFinite(options.idleTimeoutMs) && (options.idleTimeoutMs || 0) > 0
    ? options.idleTimeoutMs!
    : 0
  const maxDurationMs = Number.isFinite(options.maxDurationMs) && (options.maxDurationMs || 0) > 0
    ? options.maxDurationMs!
    : 0

  let reader: ReadableStreamDefaultReader<T> | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let maxTimer: ReturnType<typeof setTimeout> | null = null
  let firstChunkReceived = false
  let closed = false
  let timedOut = false

  const clearTimers = () => {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
    if (maxTimer) {
      clearTimeout(maxTimer)
      maxTimer = null
    }
  }

  return new ReadableStream<T>({
    start(controller) {
      const fail = (reason: DifyStreamTimeoutReason) => {
        if (closed || timedOut) return
        timedOut = true
        clearTimers()
        const timeoutError = new DifyStreamTimeoutError(reason)

        try {
          // Invoke the callback before erroring the downstream stream so the
          // caller can record the timeout reason before an abort propagates.
          const callbackResult = options.onTimeout?.(reason, timeoutError)
          Promise.resolve(callbackResult).catch((error) => {
            console.warn("[Dify Stream Watchdog] timeout callback failed:", error)
          })
        } catch (error) {
          console.warn("[Dify Stream Watchdog] timeout callback failed:", error)
        }

        if (!closed) {
          closed = true
          try {
            controller.error(timeoutError)
          } catch {
            // The consumer may have cancelled the stream while the callback awaited.
          }
        }

        void reader?.cancel(timeoutError).catch(() => undefined)
      }

      const armIdleTimer = () => {
        if (!idleTimeoutMs || closed || timedOut || !firstChunkReceived) return
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = scheduleTimer(() => {
          fail("idle")
        }, idleTimeoutMs)
      }

      reader = body.getReader()

      if (maxDurationMs) {
        maxTimer = scheduleTimer(() => {
          fail("max_duration")
        }, maxDurationMs)
      }

      ;(async () => {
        try {
          while (true) {
            const { done, value } = await reader!.read()
            if (closed || timedOut) return
            if (done) {
              closed = true
              clearTimers()
              controller.close()
              return
            }

            firstChunkReceived = true
            armIdleTimer()
            controller.enqueue(value)
          }
        } catch (error) {
          if (closed || timedOut) return
          closed = true
          clearTimers()
          controller.error(error)
        }
      })()
    },
    async cancel(reason) {
      if (closed) return
      closed = true
      clearTimers()
      await reader?.cancel(reason).catch(() => undefined)
    },
  })
}
