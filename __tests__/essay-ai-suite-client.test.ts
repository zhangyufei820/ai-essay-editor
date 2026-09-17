jest.mock("@/lib/internal-dify-fetch", () => ({
  internalDifyFetch: jest.fn(),
}))

import { callEssayAiSuite } from "@/lib/essay-ai-suite-client"
import { internalDifyFetch } from "@/lib/internal-dify-fetch"

const internalDifyFetchMock = internalDifyFetch as jest.Mock

describe("essay AI suite client cancellation", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("combines a caller signal with its timeout signal", async () => {
    const caller = new AbortController()
    let forwardedSignal: AbortSignal | undefined
    internalDifyFetchMock.mockImplementation((_: string, init: RequestInit) => {
      forwardedSignal = init.signal as AbortSignal
      return new Promise<Response>((_resolve, reject) => {
        const rejectAborted = () => reject(new DOMException("Aborted", "AbortError"))
        if (forwardedSignal?.aborted) rejectAborted()
        else forwardedSignal?.addEventListener("abort", rejectAborted, { once: true })
      })
    })

    const resultPromise = callEssayAiSuite(
      "/api/essay/grade-single",
      { text: "一篇用于测试取消传播的作文正文。" },
      60_000,
      caller.signal,
    )

    expect(forwardedSignal).toBeDefined()
    expect(forwardedSignal).not.toBe(caller.signal)
    expect(forwardedSignal?.aborted).toBe(false)

    caller.abort()

    await expect(resultPromise).resolves.toEqual(expect.objectContaining({ ok: false }))
    expect(forwardedSignal?.aborted).toBe(true)
  })
})
