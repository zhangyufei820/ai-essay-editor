import { grantPaymentCreditsOnce } from "@/lib/payment-credit-idempotency"

describe("payment credit idempotency", () => {
  it("maps a first atomic grant response", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ applied: true, balance_before: 10, balance_after: 110 }],
      error: null,
    })

    const result = await grantPaymentCreditsOnce({ rpc } as never, {
      provider: "stripe",
      eventId: "evt_1",
      referenceId: "cs_1",
      userId: "00000000-0000-4000-8000-000000000001",
      productId: "credits-100",
      credits: 100,
      isPro: false,
      description: "payment",
    })

    expect(result).toEqual({ ok: true, applied: true, balanceBefore: 10, balanceAfter: 110 })
    expect(rpc).toHaveBeenCalledWith("grant_payment_credits_once", expect.objectContaining({
      p_provider: "stripe",
      p_event_id: "evt_1",
      p_reference_id: "cs_1",
    }))
  })

  it("treats an existing event as a successful duplicate", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ applied: false, balance_before: 110, balance_after: 110 }],
      error: null,
    })

    const result = await grantPaymentCreditsOnce({ rpc } as never, {
      provider: "xunhupay",
      eventId: "trade_1",
      referenceId: "order_1",
      orderNo: "order_1",
      userId: "00000000-0000-4000-8000-000000000001",
      productId: "credits-100",
      credits: 100,
      isPro: false,
      description: "payment",
    })

    expect(result).toMatchObject({ ok: true, applied: false, balanceAfter: 110 })
  })

  it("fails closed when the database function is unavailable", async () => {
    const error = { code: "PGRST202", message: "function missing" }
    const rpc = jest.fn().mockResolvedValue({ data: null, error })

    const result = await grantPaymentCreditsOnce({ rpc } as never, {
      provider: "stripe",
      eventId: "evt_2",
      referenceId: "cs_2",
      userId: "00000000-0000-4000-8000-000000000001",
      productId: "credits-100",
      credits: 100,
      isPro: false,
      description: "payment",
    })

    expect(result).toEqual({ ok: false, applied: false, error })
  })
})
