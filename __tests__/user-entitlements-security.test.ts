import { createClient } from "@supabase/supabase-js"
import { getUserEntitlementSummary, resolveRelatedUserIds } from "@/lib/user-entitlements"

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}))

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

  it("uses the exact bridge target balance when the paid order belongs to the legacy identity", async () => {
    const legacyUserId = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const canonicalUserId = "11111111-1111-4111-8111-111111111111"

    function createQuery(data: unknown, maybeSingleData: unknown = null) {
      const query: any = {
        select: jest.fn(() => query),
        eq: jest.fn(() => query),
        in: jest.fn(() => query),
        gt: jest.fn(() => query),
        order: jest.fn(() => query),
        limit: jest.fn(() => query),
        maybeSingle: jest.fn(async () => ({ data: maybeSingleData, error: null })),
        then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
          Promise.resolve({ data, error: null }).then(resolve, reject),
      }
      return query
    }

    const bridgeQuery = createQuery([], {
      provider_user_id: legacyUserId,
      supabase_user_id: canonicalUserId,
    })
    const profileQuery = createQuery([
      { user_id: legacyUserId },
      { user_id: canonicalUserId },
    ])
    const orderQuery = createQuery([{
      id: 123,
      user_id: legacyUserId,
      product_id: "basic",
      product_name: "基础会员",
      amount: 9900,
      created_at: "2026-08-01T00:00:00.000Z",
    }])
    const creditQuery = createQuery([
      { user_id: legacyUserId, credits: 0, is_pro: false },
      { user_id: canonicalUserId, credits: 2_020_693, is_pro: true },
    ])
    const supabaseMock = {
      from: jest.fn((table: string) => {
        if (table === "auth_user_bridges") return bridgeQuery
        if (table === "user_profiles") return profileQuery
        if (table === "orders") return orderQuery
        if (table === "user_credits") return creditQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
    ;(createClient as jest.Mock).mockReturnValue(supabaseMock)

    try {
      const result = await getUserEntitlementSummary(legacyUserId, {
        phone: "13806807799",
      })

      expect(supabaseMock.from).toHaveBeenCalledWith("auth_user_bridges")
      expect(result).toMatchObject({
        userId: legacyUserId,
        entitlementUserId: canonicalUserId,
        credits: 2_020_693,
        isPro: true,
        membershipStatus: "basic",
      })
      expect(result?.relatedUserIds).toEqual(expect.arrayContaining([legacyUserId, canonicalUserId]))
    } finally {
      if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey
    }
  })

  it("keeps the legacy balance until the atomic bridge migration has completed", async () => {
    const legacyUserId = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const canonicalUserId = "22222222-2222-4222-8222-222222222222"

    function createQuery(data: unknown, maybeSingleData: unknown = null) {
      const query: any = {
        select: jest.fn(() => query),
        eq: jest.fn(() => query),
        in: jest.fn(() => query),
        gt: jest.fn(() => query),
        order: jest.fn(() => query),
        limit: jest.fn(() => query),
        maybeSingle: jest.fn(async () => ({ data: maybeSingleData, error: null })),
        then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
          Promise.resolve({ data, error: null }).then(resolve, reject),
      }
      return query
    }

    const bridgeQuery = createQuery([], {
      provider_user_id: legacyUserId,
      supabase_user_id: canonicalUserId,
    })
    const profileQuery = createQuery([
      { user_id: legacyUserId },
      { user_id: canonicalUserId },
    ])
    const orderQuery = createQuery([{
      id: 456,
      user_id: legacyUserId,
      product_id: "basic",
      product_name: "基础会员",
      amount: 9900,
      created_at: "2026-08-01T00:00:00.000Z",
    }])
    const creditQuery = createQuery([
      { user_id: legacyUserId, credits: 700, is_pro: true },
      { user_id: canonicalUserId, credits: 1010, is_pro: false },
    ])
    const supabaseMock = {
      from: jest.fn((table: string) => {
        if (table === "auth_user_bridges") return bridgeQuery
        if (table === "user_profiles") return profileQuery
        if (table === "orders") return orderQuery
        if (table === "user_credits") return creditQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
    ;(createClient as jest.Mock).mockReturnValue(supabaseMock)

    try {
      const result = await getUserEntitlementSummary(legacyUserId, {
        phone: "13800138000",
      })

      expect(result).toMatchObject({
        entitlementUserId: legacyUserId,
        credits: 700,
        isPro: true,
      })
    } finally {
      if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey
    }
  })
})
