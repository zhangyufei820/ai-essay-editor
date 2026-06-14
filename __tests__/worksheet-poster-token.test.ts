import {
  signWorksheetPosterToken,
  verifyWorksheetPosterToken,
} from "@/lib/worksheet-poster-token"

describe("worksheet poster token", () => {
  const oldSecret = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY

  beforeEach(() => {
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = "test-worksheet-poster-secret"
  })

  afterAll(() => {
    if (oldSecret === undefined) delete process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
    else process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = oldSecret
  })

  it("binds poster generation to the diagnosed user, request, and render prompt", () => {
    const now = Date.parse("2026-06-14T10:00:00Z")
    const token = signWorksheetPosterToken({
      userId: "user-1",
      diagnosisRequestId: "worksheet_1",
      renderPrompt: "render this diagnosis",
      now,
    })

    expect(token).toBeTruthy()
    expect(verifyWorksheetPosterToken(token, {
      userId: "user-1",
      diagnosisRequestId: "worksheet_1",
      renderPrompt: "render this diagnosis",
      now: now + 1000,
    })).toBe(true)
    expect(verifyWorksheetPosterToken(token, {
      userId: "user-2",
      diagnosisRequestId: "worksheet_1",
      renderPrompt: "render this diagnosis",
      now: now + 1000,
    })).toBe(false)
    expect(verifyWorksheetPosterToken(token, {
      userId: "user-1",
      diagnosisRequestId: "worksheet_2",
      renderPrompt: "render this diagnosis",
      now: now + 1000,
    })).toBe(false)
    expect(verifyWorksheetPosterToken(token, {
      userId: "user-1",
      diagnosisRequestId: "worksheet_1",
      renderPrompt: "different prompt",
      now: now + 1000,
    })).toBe(false)
    expect(verifyWorksheetPosterToken(`${token}x`, {
      userId: "user-1",
      diagnosisRequestId: "worksheet_1",
      renderPrompt: "render this diagnosis",
      now: now + 1000,
    })).toBe(false)
  })

  it("expires poster tokens after the short handoff window", () => {
    const now = Date.parse("2026-06-14T10:00:00Z")
    const token = signWorksheetPosterToken({
      userId: "user-1",
      diagnosisRequestId: "worksheet_1",
      renderPrompt: "render this diagnosis",
      now,
    })

    expect(verifyWorksheetPosterToken(token, {
      userId: "user-1",
      diagnosisRequestId: "worksheet_1",
      renderPrompt: "render this diagnosis",
      now: now + 31 * 60 * 1000,
    })).toBe(false)
  })
})
