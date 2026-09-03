import { buildDifyServiceUser } from "@/lib/openclaw-dify-user"

describe("buildDifyServiceUser", () => {
  it("keeps the existing user identifier for non-OpenClaw models", () => {
    expect(buildDifyServiceUser({
      model: "general-chat",
      userId: "user-123",
      sessionId: "session-a",
      conversationId: null,
    })).toBe("user-123")
  })

  it("creates a stable opaque OpenClaw user per main-site session", () => {
    const first = buildDifyServiceUser({
      model: "open-claw",
      userId: "user-123",
      sessionId: "session-a",
      conversationId: null,
    })
    const repeated = buildDifyServiceUser({
      model: "open-claw",
      userId: "user-123",
      sessionId: "session-a",
      conversationId: "dify-conversation-1",
    })
    const nextSession = buildDifyServiceUser({
      model: "open-claw",
      userId: "user-123",
      sessionId: "session-b",
      conversationId: null,
    })

    expect(first).toBe(repeated)
    expect(first).toMatch(/^openclaw-[a-f0-9]{40}$/)
    expect(first).not.toContain("user-123")
    expect(nextSession).not.toBe(first)
  })

  it("uses the Dify conversation as a compatibility scope when no site session exists", () => {
    const scoped = buildDifyServiceUser({
      model: "open-claw",
      userId: "user-123",
      sessionId: null,
      conversationId: "dify-conversation-1",
    })

    expect(scoped).toMatch(/^openclaw-[a-f0-9]{40}$/)
  })

  it("preserves the legacy user identifier when no conversation scope is available", () => {
    expect(buildDifyServiceUser({
      model: "open-claw",
      userId: "user-123",
      sessionId: null,
      conversationId: null,
    })).toBe("user-123")
  })
})
