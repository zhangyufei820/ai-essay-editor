import { NextRequest } from "next/server"

const requireUser = jest.fn()
const getTaskRunForUser = jest.fn()
const internalDifyFetch = jest.fn()

jest.mock("@/lib/auth/verified-user", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }))
jest.mock("@/lib/ai-task-trace", () => ({ getTaskRunForUser: (...args: unknown[]) => getTaskRunForUser(...args) }))
jest.mock("@/lib/internal-dify-fetch", () => ({ internalDifyFetch: (...args: unknown[]) => internalDifyFetch(...args) }))

const requestId = "chat_1900fc43-2556-4f39-8309-9eecd6ac1973"
const report = "作文批改报告\n总分：85分\n优点：主题清楚，开头具体。\n建议：结尾呼应主题，调整段落结构。".repeat(3)
const task = {
  id: requestId,
  model: "standard",
  kind: "dify",
  conversation_id: "conversation-1",
  session_id: "session-1",
  created_at: "2026-10-10T16:09:26.276Z",
  upstream_task_id: null,
}

function makeRequest(id = requestId) {
  return new NextRequest(`http://localhost/api/essay-result/recover?requestId=${encodeURIComponent(id)}`)
}

describe("GET /api/essay-result/recover", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.ESSAY_CORRECTION_API_KEY = "test-credential"
    process.env.DIFY_INTERNAL_URL = "http://docker-api-1:5001/v1"
    requireUser.mockResolvedValue({ user: { id: "owner-1" }, response: null })
    getTaskRunForUser.mockResolvedValue(task)
    internalDifyFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{
        id: "message-1",
        conversation_id: task.conversation_id,
        created_at: Date.parse(task.created_at) / 1000 + 1,
        status: "normal",
        answer: report,
      }] }),
    })
  })

  it("returns the owned completed report without exposing the upstream credential", async () => {
    const { GET } = await import("@/app/api/essay-result/recover/route")
    const response = await GET(makeRequest())
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload).toEqual({ ready: true, answer: report, sessionId: task.session_id })
    expect(getTaskRunForUser).toHaveBeenCalledWith({ userId: "owner-1", taskId: requestId })
    expect(String(internalDifyFetch.mock.calls[0][0])).toContain("user=owner-1")
    expect(JSON.stringify(payload)).not.toContain("test-credential")
  })

  it("rejects unauthenticated and unrelated tasks before calling Dify", async () => {
    const { GET } = await import("@/app/api/essay-result/recover/route")
    requireUser.mockResolvedValueOnce({ user: null, response: new Response("unauthorized", { status: 401 }) })
    expect((await GET(makeRequest())).status).toBe(401)
    expect(internalDifyFetch).not.toHaveBeenCalled()

    getTaskRunForUser.mockResolvedValueOnce(null)
    expect((await GET(makeRequest())).status).toBe(404)
    expect(internalDifyFetch).not.toHaveBeenCalled()
  })

  it("waits while Dify has not produced a complete report", async () => {
    const { GET } = await import("@/app/api/essay-result/recover/route")
    internalDifyFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
    const response = await GET(makeRequest())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ready: false })
  })
})
