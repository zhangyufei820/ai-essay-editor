import { NextResponse } from "next/server"

const getUserCredits = jest.fn()
const chargeCreditsSafely = jest.fn()
const recordBillingIssue = jest.fn()

jest.mock("@/lib/credits", () => ({
  getUserCredits,
  recordBillingIssue,
}))

jest.mock("@/lib/billing", () => ({
  chargeCreditsSafely,
  createBillingLog: (input: Record<string, unknown>) => ({ ...input, pricingVersion: "test" }),
  parseDifyUsage: jest.requireActual("@/lib/billing").parseDifyUsage,
}))

describe("suno billing", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getUserCredits.mockResolvedValue({ credits: 1000 })
    chargeCreditsSafely.mockResolvedValue(true)
  })

  it("lets sufficient real credits pass the balance guard", async () => {
    const { ensureSunoCredits } = await import("@/lib/suno-billing")

    const response = await ensureSunoCredits("user-1")

    expect(response).toBeNull()
  })

  it("returns insufficient-credit response when real credits are insufficient", async () => {
    getUserCredits.mockResolvedValueOnce({ credits: 0 })
    const { ensureSunoCredits } = await import("@/lib/suno-billing")

    const response = await ensureSunoCredits("user-1")
    const json = await (response as NextResponse).json()

    expect(response?.status).toBe(402)
    expect(json.code).toBe("INSUFFICIENT_CREDITS")
  })

  it("charges base credits with old Suno audit semantics", async () => {
    const { chargeSunoBaseCredits } = await import("@/lib/suno-billing")

    const ok = await chargeSunoBaseCredits({
      userId: "user-1",
      operation: "music_custom",
      referenceId: "task-1",
    })

    expect(ok).toBe(true)
    expect(chargeCreditsSafely).toHaveBeenCalledWith(
      "user-1",
      100,
      "suno_music",
      expect.stringContaining("music_custom"),
      "task-1",
      expect.objectContaining({
        actionType: "suno_music",
        feature: "suno",
        usageSource: "fixed",
        modelId: "suno-v5",
        chargedCredits: 100,
      }),
      {},
    )
  })

  it("charges token supplement when Dify usage is present", async () => {
    const { chargeSunoTokenUsageIfPresent } = await import("@/lib/suno-billing")

    const result = await chargeSunoTokenUsageIfPresent({
      userId: "user-1",
      operation: "music_custom",
      referenceId: "task-1",
      providerPayload: {
        data: {
          outputs: { answer: "完成" },
          metadata: {
            usage: {
              prompt_tokens: 1000,
              completion_tokens: 1000,
              total_tokens: 2000,
            },
          },
        },
      },
    })

    expect(result).toMatchObject({ charged: true, credits: 25 })
    expect(chargeCreditsSafely).toHaveBeenLastCalledWith(
      "user-1",
      25,
      "suno_llm_token",
      expect.stringContaining("music_custom"),
      "task-1",
      expect.objectContaining({
        actionType: "suno_llm_token",
        feature: "suno",
        promptTokens: 1000,
        completionTokens: 1000,
        totalTokens: 2000,
      }),
      {},
    )
  })
})
