import { findAuthUserIdByEmail } from "@/lib/auth/find-user-by-email"

describe("Supabase auth user email lookup", () => {
  it("uses the restricted lookup RPC instead of enumerating users", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000001", error: null })
    const admin = {
      rpc,
      auth: { admin: { listUsers: jest.fn() } },
    }

    await expect(findAuthUserIdByEmail(admin as never, "Student@Example.com")).resolves.toBe(
      "00000000-0000-4000-8000-000000000001",
    )
    expect(rpc).toHaveBeenCalledWith("find_auth_user_id_by_email", {
      lookup_email: "student@example.com",
    })
    expect(admin.auth.admin.listUsers).not.toHaveBeenCalled()
  })

  it("fails closed when the lookup RPC is unavailable", async () => {
    const admin = {
      rpc: jest.fn().mockResolvedValue({ data: null, error: { message: "function missing" } }),
    }

    await expect(findAuthUserIdByEmail(admin as never, "student@example.com")).rejects.toThrow(
      "AUTH_USER_LOOKUP_UNAVAILABLE",
    )
  })

  it("returns undefined for a missing user and rejects malformed IDs", async () => {
    const missing = { rpc: jest.fn().mockResolvedValue({ data: null, error: null }) }
    const malformed = { rpc: jest.fn().mockResolvedValue({ data: "not-a-uuid", error: null }) }

    await expect(findAuthUserIdByEmail(missing as never, "student@example.com")).resolves.toBeUndefined()
    await expect(findAuthUserIdByEmail(malformed as never, "student@example.com")).rejects.toThrow(
      "AUTH_USER_LOOKUP_UNAVAILABLE",
    )
  })
})
