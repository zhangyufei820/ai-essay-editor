import { extractUserId } from "@/lib/auth-user"

describe("extractUserId", () => {
  it("supports current flat user id fields", () => {
    expect(extractUserId({ id: "id-1" })).toBe("id-1")
    expect(extractUserId({ sub: "sub-1" })).toBe("sub-1")
    expect(extractUserId({ userId: "user-id-1" })).toBe("user-id-1")
    expect(extractUserId({ user_id: "user-id-snake" })).toBe("user-id-snake")
  })

  it("supports nested Authing-like payloads", () => {
    expect(extractUserId({ data: { user_id: "nested-data-id" } })).toBe("nested-data-id")
    expect(extractUserId({ user: { id: "nested-user-id" } })).toBe("nested-user-id")
  })

  it("returns an empty string for missing or blank ids", () => {
    expect(extractUserId(null)).toBe("")
    expect(extractUserId({ user_id: "   " })).toBe("")
    expect(extractUserId({ email: "test@example.com" })).toBe("")
  })
})
