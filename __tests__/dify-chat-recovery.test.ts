jest.mock("server-only", () => ({}))

jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { credits: 100_000 }, error: null }) }) }),
    }),
  }),
}))
jest.mock("@/lib/auth/verified-user", () => ({
  requireUser: async () => ({ user: { id: "essay-test-user" }, response: null }),
}))
jest.mock("@/lib/credit-account", () => ({
  ensureCreditAccount: async () => ({ credit_user_id: "essay-test-user" }),
}))
jest.mock("@/lib/user-entitlements", () => ({
  getUserEntitlementSummary: async () => null,
  resolveRelatedUserIds: async () => ["essay-test-user"],
}))
jest.mock("@/lib/dify-credentials", () => ({
  getDifyCredentialForModel: () => ({ credential: "test-key", keySource: "test" }),
}))
jest.mock("@/lib/rate-limit", () => ({
  getClientIP: () => "test-client",
  checkIpRateLimit: () => ({ allowed: true }),
}))
jest.mock("@/lib/ai-task-trace", () => ({
  ...jest.requireActual("@/lib/ai-task-trace"),
  createTaskRun: async () => ({ persisted: true }),
  updateTaskRun: jest.fn().mockResolvedValue(undefined),
}))
jest.mock("@/lib/internal-dify-fetch", () => ({ internalDifyFetch: jest.fn() }))
jest.mock("@/lib/billing", () => ({
  ...jest.requireActual("@/lib/billing"),
  chargeCreditsSafely: jest.fn().mockResolvedValue({ success: true }),
}))
jest.mock("@/lib/essay-image-fallback", () => ({
  ...jest.requireActual("@/lib/essay-image-fallback"),
  gradeEssayWithFallback: jest.fn(),
}))

import { NextRequest } from "next/server"
import { POST } from "@/app/api/dify-chat/route"
import { updateTaskRun } from "@/lib/ai-task-trace"
import { chargeCreditsSafely } from "@/lib/billing"
import { gradeEssayWithFallback } from "@/lib/essay-image-fallback"
import { internalDifyFetch } from "@/lib/internal-dify-fetch"

const pastedEssay = [
  "周六早上，老师带同学们到校园种花。我们先松土，再把花苗轻轻放进去，最后小心地浇水。",
  "一阵风吹过来把花苗吹歪了。我一只手扶住它，另一只手压紧泥土，旁边的同学递给我一根竹签。",
  "看到小花苗直起了身子，我想起上次在同一片草地上踢球时留下的脚印，心里有一点惭愧。",
  "放学时，我们一起回头看校园里的小花圃。大家约好每周轮流浇水，我也明白了，合作需要每个人承担具体责任。",
].join("\n")

const gradingReport = [
  "综合评分：86/100分",
  "总评：文章围绕校园种花展开，松土到浇水的过程清楚，内容具体。",
  "优点：扶花苗的动作描写贴合情境，前后段落有衔接。",
  "修改建议：在结尾点明轮流浇水的具体安排，呼应中心。也可以补充递竹签的同学说的话，使合作过程更立体。",
].join("\n")

function difyStream(...events: object[]) {
  return new Response(encodeDifyEvents(events), {
    headers: { "Content-Type": "text/event-stream" },
  })
}

function encodeDifyEvents(events: object[]) {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
}

function unfinishedDifyStream(events: object[], signal?: AbortSignal | null) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(encodeDifyEvents(events)))
      signal?.addEventListener("abort", () => controller.error(signal.reason), { once: true })
    },
  })
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } })
}

function requestEssay(query: string, fileIds?: string[]) {
  return new NextRequest("http://localhost/api/dify-chat", {
    method: "POST",
    body: JSON.stringify({ model: "standard", query, fileIds }),
  })
}

function requestDeepChat(overrides: Record<string, unknown> = {}, signal?: AbortSignal) {
  return new NextRequest("http://localhost/api/dify-chat", {
    method: "POST",
    body: JSON.stringify({ model: "gpt-5", query: "请解释这个数学问题", ...overrides }),
    signal,
  })
}

function getEvents(response: string) {
  return response.split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => JSON.parse(line.slice("data: ".length)))
}

describe("Dify chat recovery", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(updateTaskRun).mockResolvedValue(undefined)
    jest.mocked(chargeCreditsSafely).mockResolvedValue(true)
  })

  it("replaces a failed pasted-essay grading stream with one validated no-charge report", async () => {
    jest.mocked(internalDifyFetch).mockResolvedValueOnce(difyStream(
      { event: "message", answer: "无法提供评分，请稍后重试。" },
      { event: "node_finished", data: { status: "exception", title: "LLM", error: "request timed out" } },
      { event: "workflow_finished", data: { status: "partial-succeeded", outputs: {} } },
    ))
    jest.mocked(gradeEssayWithFallback).mockResolvedValueOnce({
      markdownReport: gradingReport, provider: "llm", model: "test-model", promptVersion: null,
    })

    const response = await POST(requestEssay(`请完整批改以下作文：\n${pastedEssay}`))
    const events = getEvents(await response.text())

    expect(jest.mocked(gradeEssayWithFallback)).toHaveBeenCalledTimes(1)
    expect(gradeEssayWithFallback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining(pastedEssay),
    }))
    expect(events.filter(({ event }) => event === "message").map(({ answer }) => answer)).toEqual([gradingReport])
    expect(events.filter(({ event }) => event === "message_end")).toHaveLength(1)
    expect(events).not.toEqual(expect.arrayContaining([expect.objectContaining({ event: "error" })]))
    expect(chargeCreditsSafely).not.toHaveBeenCalled()
    expect(updateTaskRun).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      status: "succeeded",
      metadata: expect.objectContaining({ essay_fallback_used: true, charged_credits: 0 }),
    }))
  })

  it("does not grade a short instruction or text accompanying an unverified attachment", async () => {
    for (const request of [requestEssay("请批改这篇作文"), requestEssay(pastedEssay, ["test-unverified-file"])]) {
      jest.mocked(internalDifyFetch).mockResolvedValueOnce(difyStream(
        { event: "workflow_finished", data: { status: "partial-succeeded", error: "request timed out" } },
      ))

      const response = await POST(request)
      const events = getEvents(await response.text())

      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ event: "error" })]))
      expect(events.some(({ event }) => event === "message")).toBe(false)
    }
    expect(gradeEssayWithFallback).not.toHaveBeenCalled()
    expect(chargeCreditsSafely).not.toHaveBeenCalled()
  })

  it("fails without charging when the pasted-essay fallback cannot return a model-generated report", async () => {
    jest.mocked(internalDifyFetch).mockResolvedValueOnce(difyStream(
      { event: "message", answer: "临时回复，作文正在处理。" },
      { event: "workflow_finished", data: { status: "partial-succeeded", total_tokens: 850 } },
    ))
    jest.mocked(gradeEssayWithFallback).mockResolvedValueOnce({
      markdownReport: gradingReport, provider: "local", model: null, promptVersion: null,
    })

    const response = await POST(requestEssay(pastedEssay))
    const events = getEvents(await response.text())

    expect(gradeEssayWithFallback).toHaveBeenCalledTimes(1)
    expect(events.some(({ event }) => event === "message" || event === "message_end")).toBe(false)
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ event: "error" })]))
    expect(chargeCreditsSafely).not.toHaveBeenCalled()
    expect(updateTaskRun).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: "failed" }))
  })

  it("uses the complete terminal report when Dify partially succeeds with usable output", async () => {
    jest.mocked(internalDifyFetch).mockResolvedValueOnce(difyStream(
      { event: "message", answer: "临时回复，作文正在处理。" },
      { event: "workflow_finished", status: "partial_succeeded", outputs: { answer: gradingReport } },
      { event: "message_end" },
    ))

    const response = await POST(requestEssay(pastedEssay))
    const events = getEvents(await response.text())

    expect(gradeEssayWithFallback).not.toHaveBeenCalled()
    expect(events.filter(({ event }) => event === "message").map(({ answer }) => answer)).toEqual([gradingReport])
    expect(events.some(({ event }) => event === "error")).toBe(false)
  })

  it("finishes a successful deep chat when Dify sends the final answer but leaves the connection open", async () => {
    jest.useFakeTimers()
    try {
      const answer = "把等式两边的同类项分别合并。"
      jest.mocked(internalDifyFetch).mockResolvedValueOnce(unfinishedDifyStream([
        { event: "message", answer },
        { event: "workflow_finished", data: { status: "succeeded", outputs: { answer } } },
      ]))

      const response = await POST(requestDeepChat())
      const result = response.text()
      await jest.advanceTimersByTimeAsync(180_000)
      const events = getEvents(await result)

      expect(events.filter(({ event }) => event === "message").map(({ answer }) => answer)).toEqual([answer])
      expect(events.some(({ event }) => event === "error")).toBe(false)
      expect(updateTaskRun).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: "succeeded" }))
    } finally {
      jest.useRealTimers()
    }
  })

  it("preserves a no-charge timeout when deep chat stops before a confirmed final answer", async () => {
    jest.useFakeTimers()
    try {
      jest.mocked(internalDifyFetch).mockResolvedValueOnce(unfinishedDifyStream([
        { event: "workflow_started" },
      ]))

      const response = await POST(requestDeepChat())
      const result = response.text()
      await jest.advanceTimersByTimeAsync(180_000)
      const events = getEvents(await result)

      expect(events.some(({ event }) => event === "message")).toBe(false)
      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ event: "error" })]))
      expect(internalDifyFetch).toHaveBeenCalledTimes(1)
      expect(chargeCreditsSafely).not.toHaveBeenCalled()
      expect(updateTaskRun).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        status: "timeout", errorCode: "DIFY_STREAM_IDLE_TIMEOUT",
      }))
    } finally {
      jest.useRealTimers()
    }
  })

  it("retries a fresh deep-chat request once in blocking mode after a ping-only stream stalls", async () => {
    jest.useFakeTimers()
    try {
      const answer = "把等式两边的同类项分别合并。"
      const conversationId = "1e4151e1-3b96-47fb-8130-b3500c53a69b"
      jest.mocked(internalDifyFetch)
        .mockImplementationOnce(async (_url, options) => unfinishedDifyStream([{ event: "ping" }], options?.signal))
        .mockResolvedValueOnce(Response.json({
          event: "message", answer, conversation_id: conversationId,
          metadata: { usage: { prompt_tokens: 45, completion_tokens: 16 } },
        }))

      const response = await POST(requestDeepChat())
      const result = response.text()
      await jest.advanceTimersByTimeAsync(120_000)
      const events = getEvents(await result)

      expect(internalDifyFetch).toHaveBeenCalledTimes(2)
      const requests = jest.mocked(internalDifyFetch).mock.calls
      expect(requests[0]?.[1]?.signal?.aborted).toBe(true)
      expect(requests[1]?.[0]).toBe(requests[0]?.[0])
      expect(JSON.parse(String(requests[1]?.[1]?.body))).toMatchObject({
        response_mode: "blocking", query: "请解释这个数学问题", conversation_id: null,
      })
      expect(events.filter(({ event }) => event === "message").map(({ answer }) => answer)).toEqual([answer])
      expect(events.some(({ event }) => event === "error")).toBe(false)
      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ event: "conversation", conversation_id: conversationId })]))
      expect(chargeCreditsSafely).toHaveBeenCalledTimes(1)
      expect(updateTaskRun).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        status: "succeeded",
        metadata: expect.objectContaining({ dify_response_mode: "blocking", deep_chat_idle_retry: true }),
      }))
    } finally {
      jest.useRealTimers()
    }
  })

  it("ends a failed deep-chat retry once at its deadline without charging", async () => {
    jest.useFakeTimers()
    try {
      jest.mocked(internalDifyFetch)
        .mockImplementationOnce(async (_url, options) => unfinishedDifyStream([{ event: "ping" }], options?.signal))
        .mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true })
        }))

      const response = await POST(requestDeepChat())
      const result = response.text()
      await jest.advanceTimersByTimeAsync(165_000)
      const events = getEvents(await result)

      expect(internalDifyFetch).toHaveBeenCalledTimes(2)
      expect(jest.mocked(internalDifyFetch).mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
      expect(events.filter(({ event }) => event === "error")).toHaveLength(1)
      expect(chargeCreditsSafely).not.toHaveBeenCalled()
      expect(updateTaskRun).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        status: "timeout", errorCode: "DIFY_STREAM_IDLE_TIMEOUT",
      }))
    } finally {
      jest.useRealTimers()
    }
  })

  it.each([
    { conversation_id: "1e4151e1-3b96-47fb-8130-b3500c53a69b" },
    { fileIds: ["test-file"] },
    { inputs: { custom: "value" } },
    { workflowSkillId: "shenxiang-zuowen-shengge" },
  ])("does not replay a stalled deep-chat request with %j", async (overrides) => {
    jest.useFakeTimers()
    try {
      jest.mocked(internalDifyFetch).mockResolvedValueOnce(unfinishedDifyStream([{ event: "ping" }]))

      const response = await POST(requestDeepChat(overrides))
      const result = response.text()
      await jest.advanceTimersByTimeAsync(180_000)
      const events = getEvents(await result)

      expect(internalDifyFetch).toHaveBeenCalledTimes(1)
      expect(events.filter(({ event }) => event === "error")).toHaveLength(1)
      expect(chargeCreditsSafely).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it("cancels an in-flight blocking retry when the client disconnects", async () => {
    jest.useFakeTimers()
    try {
      const client = new AbortController()
      jest.mocked(internalDifyFetch)
        .mockImplementationOnce(async (_url, options) => unfinishedDifyStream([{ event: "ping" }], options?.signal))
        .mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true })
        }))

      const response = await POST(requestDeepChat({}, client.signal))
      const result = response.text()
      await jest.advanceTimersByTimeAsync(120_000)
      client.abort()
      const events = getEvents(await result)

      expect(internalDifyFetch).toHaveBeenCalledTimes(2)
      expect(jest.mocked(internalDifyFetch).mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
      expect(events.some(({ event }) => event === "message" || event === "error")).toBe(false)
      expect(chargeCreditsSafely).not.toHaveBeenCalled()
      expect(updateTaskRun).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: "cancelled" }))
      expect(updateTaskRun).not.toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: "timeout" }))
    } finally {
      jest.useRealTimers()
    }
  })

  it("settles normal deep chat with the usage Dify sends on message_end", async () => {
    const answer = "把等式两边的同类项分别合并。"
    jest.mocked(internalDifyFetch).mockResolvedValueOnce(difyStream(
      { event: "message", answer },
      { event: "workflow_finished", data: { status: "succeeded", outputs: { answer } } },
      { event: "message_end", metadata: { usage: { prompt_tokens: 45, completion_tokens: 16 } } },
    ))

    const response = await POST(requestDeepChat())
    const events = getEvents(await response.text())

    expect(events.filter(({ event }) => event === "message").map(({ answer }) => answer)).toEqual([answer])
    expect(chargeCreditsSafely).toHaveBeenCalledTimes(1)
    expect(updateTaskRun).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      status: "succeeded",
      metadata: expect.objectContaining({ prompt_tokens: 45, completion_tokens: 16 }),
    }))
  })
})
