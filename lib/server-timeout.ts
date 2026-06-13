export class OperationTimeoutError extends Error {
  readonly code = "OPERATION_TIMEOUT"
  readonly operation: string
  readonly timeoutMs: number

  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`)
    this.name = "OperationTimeoutError"
    this.operation = operation
    this.timeoutMs = timeoutMs
  }
}

export function isOperationTimeoutError(error: unknown): error is OperationTimeoutError {
  return error instanceof OperationTimeoutError
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new OperationTimeoutError(operation, timeoutMs)), timeoutMs)
        timer.unref?.()
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
