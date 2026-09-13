import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getUserEntitlementSummary } from "@/lib/user-entitlements"
import { GET as getTransactions } from "@/app/api/user/transactions/route"

const legacyId = "aaaaaaaaaaaaaaaaaaaaaaaa"
const targetId = "11111111-1111-4111-8111-111111111111"
const transferRef = `identity-merge:${legacyId}:${targetId}`
let signedInId = legacyId

jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }))
jest.mock("@/lib/auth/verified-user", () => ({
  requireUser: jest.fn(async () => ({ user: { id: signedInId }, response: null })),
}))

type Row = Record<string, unknown>

function database(tables: Record<string, Row[]>) {
  return {
    from: jest.fn((table: string) => {
      if (!(table in tables)) throw new Error(`Unexpected table: ${table}`)
      let rows = [...tables[table]]
      const result = () => ({ data: rows, error: null })
      const query: any = {
        select: jest.fn(() => query),
        eq: jest.fn((key: string, value: unknown) => {
          rows = rows.filter((row) => row[key] === value)
          return query
        }),
        in: jest.fn((key: string, values: unknown[]) => {
          rows = rows.filter((row) => values.includes(row[key]))
          return query
        }),
        gt: jest.fn((key: string, value: number) => {
          rows = rows.filter((row) => Number(row[key]) > value)
          return query
        }),
        order: jest.fn((key: string, options: { ascending: boolean }) => {
          rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (options.ascending ? 1 : -1))
          return query
        }),
        limit: jest.fn((limit: number) => { rows = rows.slice(0, limit); return query }),
        maybeSingle: jest.fn(async () => ({ data: rows[0] || null, error: null })),
        then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
      }
      return query
    }),
  }
}

describe("paid credits survive identity migration", () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  let tables: Record<string, Row[]>

  beforeEach(() => {
    jest.clearAllMocks()
    signedInId = legacyId
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
    tables = {
      auth_user_bridges: [{ provider: "authing", provider_user_id: legacyId, supabase_user_id: targetId }],
      user_profiles: [],
      orders: [{ id: 168, user_id: legacyId, product_id: "pro", amount: 68, status: "paid", created_at: "2026-05-10" }],
      user_credits: [
        { user_id: legacyId, credits: 0, is_pro: false },
        { user_id: targetId, credits: 4423, is_pro: true },
      ],
      credit_transactions: [
        { id: 1, user_id: legacyId, amount: 5000, type: "purchase", created_at: "2026-05-10" },
        { id: 2, user_id: legacyId, amount: -450, type: "consume", created_at: "2026-05-11" },
        { id: 3, user_id: legacyId, amount: -4634, type: "manual", reference_id: `${transferRef}:out`, created_at: "2026-08-29T14:50:22Z" },
        { id: 4, user_id: targetId, amount: 4634, type: "manual", reference_id: `${transferRef}:in`, created_at: "2026-08-29T14:50:22Z" },
        { id: 5, user_id: targetId, amount: -100, type: "consume", created_at: "2026-08-29T14:54:04Z" },
        { id: 6, user_id: targetId, amount: -111, type: "consume", created_at: "2026-08-29T14:59:52Z" },
        { id: 7, user_id: "unrelated-user", amount: 9999, type: "purchase", created_at: "2026-09-01" },
      ],
    }
    ;(createClient as jest.Mock).mockImplementation(() => database(tables))
  })

  afterAll(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey
  })

  it.each([legacyId, targetId])("reads the same 4423 paid credits from either verified identity: %s", async (id) => {
    expect(await getUserEntitlementSummary(id)).toMatchObject({
      entitlementUserId: targetId, credits: 4423, isPro: true, membershipStatus: "pro",
    })
  })

  it("preserves a real zero balance in the migrated account", async () => {
    tables.user_credits[1].credits = 0
    expect(await getUserEntitlementSummary(legacyId)).toMatchObject({ entitlementUserId: targetId, credits: 0 })
  })

  it.each([legacyId, targetId])("shows purchases and consumption from both identities without counting the transfer: %s", async (id) => {
    signedInId = id
    const response = await getTransactions(new NextRequest("https://www.shenxiang.school/api/user/transactions"))
    expect(response.status).toBe(200)
    const { transactions } = await response.json()
    expect(transactions.map((row: { id: number }) => row.id)).toEqual([6, 5, 2, 1])
    expect(transactions.filter((row: { amount: number }) => row.amount > 0).reduce((sum: number, row: { amount: number }) => sum + row.amount, 0)).toBe(5000)
  })

  it("rejects requests to inspect another user's ledger", async () => {
    const response = await getTransactions(new NextRequest("https://www.shenxiang.school/api/user/transactions?user_id=unrelated-user"))
    expect(response.status).toBe(403)
    expect(createClient).not.toHaveBeenCalled()
  })

  it("keeps an unbridged user's history limited to their own identity", async () => {
    tables.auth_user_bridges = []
    const response = await getTransactions(new NextRequest("https://www.shenxiang.school/api/user/transactions"))
    expect(response.status).toBe(200)
    expect((await response.json()).transactions.map((row: { id: number }) => row.id)).toEqual([3, 2, 1])
  })

  it("fails closed if the identity bridge cannot be read", async () => {
    const from = jest.fn(() => {
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: null, error: { message: "bridge unavailable" } }),
      }
      return query
    })
    ;(createClient as jest.Mock).mockReturnValue({ from })
    const response = await getTransactions(new NextRequest("https://www.shenxiang.school/api/user/transactions"))
    expect(response.status).toBe(500)
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith("auth_user_bridges")
  })
})
