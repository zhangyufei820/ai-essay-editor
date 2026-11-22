import { NextRequest } from "next/server"
import { POST } from "@/app/api/share/route"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

jest.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: jest.fn() }))
jest.mock("@/lib/learning-user", () => ({ requireLearningUserId: jest.fn(async () => ({ userId: "user" })) }))
jest.mock("@/lib/rate-limit", () => ({
  getClientIP: jest.fn(() => "127.0.0.1"),
  checkIpRateLimit: jest.fn(() => ({ allowed: true })),
}))

const failedAnswer = '```json\n{\n  "skill": "thesis-helper",\n  服务暂时不可用，请稍后重试。\n}\n```'

it.each([
  { messages: [{ role: "user", content: "请帮我提炼论文问题" }, { role: "assistant", content: failedAnswer }] },
  { content_data: { ai_result: failedAnswer } },
])("rejects a failed generated answer before publishing or rewarding", async (body) => {
  const request = new NextRequest("https://shenxiang.school/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "论文写作", ...body }),
  })

  const response = await POST(request)

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ error: "回复未完成，暂时无法分享" })
  expect(getSupabaseAdmin).not.toHaveBeenCalled()
})
