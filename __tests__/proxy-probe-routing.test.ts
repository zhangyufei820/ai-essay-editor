import { NextRequest, NextResponse } from "next/server"
import { proxy } from "@/proxy"
import { updateSession } from "@/lib/supabase/middleware"

jest.mock("@/lib/supabase/middleware", () => ({ updateSession: jest.fn() }))

const session = jest.mocked(updateSession)
const base = "https://shenxiang.school"

beforeEach(() => {
  session.mockReset()
  session.mockResolvedValue(NextResponse.next())
})

it.each(["/.env", "/backup/.env.production", "/.git/config", "/wp-login.php", "/wordpress/wp-admin/"])(
  "returns 404 for %s without invoking session middleware",
  async (path) => {
    const response = await proxy(new NextRequest(`${base}${path}?code=unused`))
    expect(response.status).toBe(404)
    expect(session).not.toHaveBeenCalled()
  },
)

it("also short-circuits HEAD and preserves the disabled Server Action response", async () => {
  const head = await proxy(new NextRequest(`${base}/.env`, { method: "HEAD" }))
  const action = await proxy(new NextRequest(`${base}/.env`, { headers: { "next-action": "test" } }))
  expect(head.status).toBe(404)
  expect(head.body).toBeNull()
  expect(action.status).toBe(410)
  expect(session).not.toHaveBeenCalled()
})

it.each(["/", "/pricing", "/auth/callback", "/.well-known/acme-challenge/token", "/api/dify-upload"])(
  "still runs session middleware for %s",
  async (path) => {
    await proxy(new NextRequest(`${base}${path}`))
    expect(session).toHaveBeenCalledTimes(1)
  },
)
