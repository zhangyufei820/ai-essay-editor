import { grantPaymentCreditsWithOptimisticRetry } from "@/lib/payment-credit-grant"

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

type Operation =
  | { table: string; action: "select"; row: unknown }
  | { table: string; action: "insert"; row: unknown }
  | { table: string; action: "update"; row: unknown }

function queryResult(result: unknown) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async () => result),
      })),
    })),
  }
}

function updateResult(table: string, row: unknown, operations: Operation[], result: unknown) {
  operations.push({ table, action: "update", row })
  return {
    eq: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          maybeSingle: jest.fn(async () => result),
        })),
      })),
    })),
  }
}

describe("payment credit grant", () => {
  it("retries a new-user insert conflict as an additive optimistic update", async () => {
    const operations: Operation[] = []
    const selectResults = [
      { data: null, error: null },
      { data: { user_id: "user-1", credits: 100, is_pro: false }, error: null },
    ]
    const insertResults = [{ error: { code: "23505" } }]
    const updateResults = [{ data: { credits: 300 }, error: null }]

    const supabase = {
      from: jest.fn((table: string) => ({
        select: () => queryResult(selectResults.shift()).select(),
        insert: (row: unknown) => {
          operations.push({ table, action: "insert", row })
          return Promise.resolve(insertResults.shift())
        },
        update: (row: unknown) => updateResult(table, row, operations, updateResults.shift()),
      })),
    }

    const result = await grantPaymentCreditsWithOptimisticRetry(supabase, {
      orderNo: "order-1",
      userId: "user-1",
      credits: 200,
      isPro: true,
    })

    expect(result).toMatchObject({ ok: true, balanceBefore: 100, balanceAfter: 300 })
    expect(operations).toEqual([
      { table: "user_credits", action: "insert", row: { user_id: "user-1", credits: 200, is_pro: true } },
      {
        table: "user_credits",
        action: "update",
        row: expect.objectContaining({ credits: 300, is_pro: true }),
      },
    ])
  })

  it("does not overwrite an existing balance with the purchased amount", async () => {
    const operations: Operation[] = []
    const supabase = {
      from: jest.fn((table: string) => ({
        select: () => queryResult({ data: { user_id: "user-1", credits: 500, is_pro: true }, error: null }).select(),
        insert: jest.fn(),
        update: (row: unknown) => updateResult(table, row, operations, { data: { credits: 650 }, error: null }),
      })),
    }

    const result = await grantPaymentCreditsWithOptimisticRetry(supabase, {
      orderNo: "order-2",
      userId: "user-1",
      credits: 150,
      isPro: false,
    })

    expect(result).toMatchObject({ ok: true, balanceBefore: 500, balanceAfter: 650 })
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({
      table: "user_credits",
      action: "update",
      row: expect.objectContaining({ credits: 650, is_pro: true }),
    })
  })
})
