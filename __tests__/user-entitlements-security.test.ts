import { resolveRelatedUserIds } from "@/lib/user-entitlements"

type Filter = { operator: string; column: string; value: unknown }

function createProfileQuery() {
  const filters: Filter[] = []
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn((column: string, value: unknown) => {
      filters.push({ operator: "eq", column, value })
      return query
    }),
    ilike: jest.fn((column: string, value: unknown) => {
      filters.push({ operator: "ilike", column, value })
      return query
    }),
    like: jest.fn((column: string, value: unknown) => {
      filters.push({ operator: "like", column, value })
      return query
    }),
    limit: jest.fn(() => query),
    maybeSingle: jest.fn(async () => ({
      data: { email: "victim@example.com", phone: "13900139000" },
      error: null,
    })),
    then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
      const emailFilter = filters.find((filter) => filter.column === "email")
      const phoneFilter = filters.find((filter) => filter.column === "phone")
      let data: Array<{ user_id: string }> = []

      if (emailFilter?.value === "attacker@example.com") data = [{ user_id: "legacy-email-owner" }]
      if (emailFilter?.value === "victim@example.com") data = [{ user_id: "victim-email-owner" }]
      if (phoneFilter?.operator === "eq" && phoneFilter.value === "13800138000") {
        data = [{ user_id: "legacy-phone-owner" }]
      }
      if (phoneFilter?.operator === "like") data = [{ user_id: "victim-fuzzy-owner" }]

      return Promise.resolve({ data, error: null }).then(resolve, reject)
    },
  }
  return query
}

describe("user entitlement identity boundaries", () => {
  it("links only exact, provider-verified contacts and never scans auth metadata", async () => {
    const listUsers = jest.fn(async () => ({
      data: {
        users: [{
          id: "victim-auth-owner",
          email: "victim@example.com",
          user_metadata: { phone: "13800138000" },
        }],
      },
      error: null,
    }))
    const supabase = {
      from: jest.fn((table: string) => {
        expect(table).toBe("user_profiles")
        return createProfileQuery()
      }),
      auth: { admin: { listUsers } },
    }

    const result = await resolveRelatedUserIds(
      "attacker-id",
      {
        email: "attacker@example.com",
        phone: "+86 138-0013-8000",
        metadata: {
          email: "victim@example.com",
          phone: "13900139000",
          mobile: "victim@example.com",
        },
      },
      supabase,
    )

    expect(result.userIds).toEqual(expect.arrayContaining([
      "attacker-id",
      "legacy-email-owner",
      "legacy-phone-owner",
    ]))
    expect(result.userIds).not.toEqual(expect.arrayContaining([
      "victim-auth-owner",
      "victim-email-owner",
      "victim-fuzzy-owner",
    ]))
    expect(result.emails).toEqual(["attacker@example.com"])
    expect(result.phones).toEqual(["13800138000"])
    expect(listUsers).not.toHaveBeenCalled()
  })
})
