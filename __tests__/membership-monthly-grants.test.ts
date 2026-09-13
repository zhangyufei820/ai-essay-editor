import { grantDueAnnualMembershipCredits } from "@/lib/membership-monthly-grants"

const now = new Date("2026-08-15T00:00:00Z")
const order = { id: 15, user_id: "legacy-user", status: "paid", product_id: "premium", product_name: "高级版", amount: 1228.8, created_at: "2026-07-15T00:00:00Z" }
function database({ existing = false, rpcError = null, applied = true }: { existing?: boolean; rpcError?: unknown; applied?: boolean } = {}) {
  const rpc = jest.fn().mockResolvedValue({ data: rpcError ? null : [{ applied, credit_user_id: "canonical-user", balance_before: 1000, balance_after: applied ? 13000 : 1000 }], error: rpcError })
  const from = jest.fn((table: string) => {
    if (!["orders", "membership_credit_grants"].includes(table)) throw new Error("non-atomic credit access forbidden")
    const query: any = {
      select: () => query, eq: () => query, in: () => query, gte: () => query, order: () => query,
      maybeSingle: async () => ({ data: existing ? { order_id: 15 } : null, error: null }),
      then: (resolve: any, reject: any) => Promise.resolve({ data: [order], error: null }).then(resolve, reject),
    }
    return query
  })
  return { rpc, from }
}

describe("monthly membership credit grants", () => {
  it("grants one due period through the atomic RPC and reports the canonical account", async () => {
    const supabase = database()
    const result = await grantDueAnnualMembershipCredits({ now, supabase: supabase as any })
    expect(result).toMatchObject({ dueGrants: 1, granted: 1, skipped: 0, errors: [] })
    expect(result.grants[0].userId).toBe("canonical-user")
    expect(supabase.rpc).toHaveBeenCalledWith("grant_membership_credits_once", expect.objectContaining({ p_order_id: 15, p_period: 1, p_credits: 12000 }))
  })
  it("skips a reconciled historical period", async () => {
    const supabase = database({ existing: true })
    expect(await grantDueAnnualMembershipCredits({ now, supabase: supabase as any })).toMatchObject({ granted: 0, skipped: 1 })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
  it("counts a concurrent duplicate as skipped rather than granted", async () => {
    const result = await grantDueAnnualMembershipCredits({ now, supabase: database({ applied: false }) as any })
    expect(result).toMatchObject({ granted: 0, skipped: 1, errors: [] })
  })
  it("reports database errors without retrying non-atomic writes", async () => {
    const supabase = database({ rpcError: { message: "ledger insert failed", code: "23514" } })
    const result = await grantDueAnnualMembershipCredits({ now, supabase: supabase as any })
    expect(result).toMatchObject({ granted: 0, errors: [{ referenceId: "membership_monthly:15:1", error: "ledger insert failed" }] })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })
  it("dry-run never calls a mutation RPC", async () => {
    const supabase = database()
    expect(await grantDueAnnualMembershipCredits({ now, dryRun: true, supabase: supabase as any })).toMatchObject({ dueGrants: 1, errors: [] })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})
