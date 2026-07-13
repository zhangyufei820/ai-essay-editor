import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { spendRealCredits } from "@/lib/real-credit-spending"

jest.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: jest.fn(),
}))

describe("atomic real-credit spending", () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it("delegates balance mutation and transaction logging to one database RPC", async () => {
    const rpc = jest.fn(async () => ({
      data: [{ spent: true, balance_before: 1000, balance_after: 975 }],
      error: null,
    }))
    const from = jest.fn(() => {
      throw new Error("non-atomic table mutation is forbidden")
    })
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue({ rpc, from })

    await expect(spendRealCredits(
      "00000000-0000-4000-8000-000000000001",
      25,
      "consume",
      "安全测试扣费",
      "request-1",
      { requestId: "request-1" },
    )).resolves.toBe(true)

    expect(rpc).toHaveBeenCalledWith("spend_real_credits_atomic", expect.objectContaining({
      p_user_id: "00000000-0000-4000-8000-000000000001",
      p_amount: 25,
      p_type: "consume",
      p_description: "安全测试扣费",
      p_reference_id: "request-1",
      p_billing_metadata: expect.objectContaining({ requestId: "request-1" }),
    }))
    expect(from).not.toHaveBeenCalled()
  })

  it("fails closed when the atomic RPC fails", async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { message: "transaction failed" } }))
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue({ rpc })

    await expect(spendRealCredits(
      "00000000-0000-4000-8000-000000000001",
      10,
      "consume",
      "失败测试",
    )).resolves.toBe(false)
  })
})
