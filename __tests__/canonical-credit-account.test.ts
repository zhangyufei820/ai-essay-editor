import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireUser } from "@/lib/auth/verified-user"
import { getUserEntitlementSummary } from "@/lib/user-entitlements"
import { ensureCreditAccount } from "@/lib/credit-account"
import { GET } from "@/app/api/user/credits/route"

jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }))
jest.mock("@/lib/auth/verified-user", () => ({ requireUser: jest.fn() }))
jest.mock("@/lib/user-entitlements", () => ({ getUserEntitlementSummary: jest.fn() }))

const canonical = "11111111-1111-4111-8111-111111111111"
describe("canonical credit account boundary", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    ;(requireUser as jest.Mock).mockResolvedValue({ user: { id: "legacy-user" }, response: null })
  })
  afterEach(() => jest.useRealTimers())

  it("bounds a stalled account read and marks its balance unavailable", async () => {
    jest.useFakeTimers()
    ;(createClient as jest.Mock).mockReturnValue({ rpc: () => new Promise(() => {}) })
    const pending = GET(new NextRequest("https://www.shenxiang.school/api/user/credits"))
    await jest.advanceTimersByTimeAsync(4001)
    expect(await (await pending).json()).toMatchObject({ degraded: true, creditStatus: "unavailable" })
    expect(getUserEntitlementSummary).not.toHaveBeenCalled()
  })

  it("returns the committed balance when optional membership resolution stalls", async () => {
    jest.useFakeTimers()
    ;(createClient as jest.Mock).mockReturnValue({ rpc: async () => ({ data: [{ credit_user_id: canonical, credits: 154, is_pro: false, initialized: false }], error: null }) })
    ;(getUserEntitlementSummary as jest.Mock).mockReturnValue(new Promise(() => {}))
    const pending = GET(new NextRequest("https://www.shenxiang.school/api/user/credits"))
    await jest.advanceTimersByTimeAsync(2501)
    expect(await (await pending).json()).toMatchObject({ credits: 154, entitlementUserId: canonical, is_pro: false })
  })

  it("initializes and resolves only through the atomic RPC", async () => {
    const row = { credit_user_id: canonical, credits: 154, is_pro: false, initialized: false }
    const rpc = jest.fn().mockResolvedValue({ data: [row], error: null })
    const from = jest.fn(() => { throw new Error("direct write forbidden") })
    await expect(ensureCreditAccount({ rpc, from } as any, "legacy-user")).resolves.toEqual(row)
    expect(rpc).toHaveBeenCalledWith("ensure_credit_account", { p_user_id: "legacy-user" })
    expect(from).not.toHaveBeenCalled()
  })

  it("serves canonical zero without replacing it with signup credits", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ credit_user_id: canonical, credits: 0, is_pro: false, initialized: false }], error: null })
    ;(createClient as jest.Mock).mockReturnValue({ rpc })
    ;(getUserEntitlementSummary as jest.Mock).mockResolvedValue(null)
    const response = await GET(new NextRequest("https://www.shenxiang.school/api/user/credits"))
    expect(await response.json()).toMatchObject({ credits: 0, entitlementUserId: canonical, isNew: false })
    expect(getUserEntitlementSummary).toHaveBeenCalledWith(canonical, expect.any(Object))
  })

  it("uses the committed account balance while resolving membership separately", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ credit_user_id: canonical, credits: 154, is_pro: false, initialized: false }], error: null })
    ;(createClient as jest.Mock).mockReturnValue({ rpc })
    ;(getUserEntitlementSummary as jest.Mock).mockResolvedValue({ credits: 95, entitlementUserId: "legacy-user", isPro: true, membershipStatus: "basic" })
    const response = await GET(new NextRequest("https://www.shenxiang.school/api/user/credits"))
    expect(await response.json()).toMatchObject({ credits: 154, entitlementUserId: canonical, is_pro: true })
  })

  it("does not fabricate a balance when the account RPC fails", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: "database unavailable" } })
    ;(createClient as jest.Mock).mockReturnValue({ rpc })
    const response = await GET(new NextRequest("https://www.shenxiang.school/api/user/credits"))
    expect(response.status).toBe(500)
    expect(await response.json()).not.toHaveProperty("credits")
    expect(getUserEntitlementSummary).not.toHaveBeenCalled()
  })

  it("rejects invalid RPC data instead of inventing an account", async () => {
    await expect(ensureCreditAccount({ rpc: async () => ({ data: [], error: null }) } as any, "legacy-user")).rejects.toThrow("无效数据")
  })
})
