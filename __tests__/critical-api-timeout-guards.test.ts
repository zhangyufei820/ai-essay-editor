import { readFileSync } from "fs"
import path from "path"

const root = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

describe("critical API timeout guards", () => {
  it("keeps the shared timeout helper explicit and reusable", () => {
    const source = read("lib/server-timeout.ts")

    expect(source).toContain("export class OperationTimeoutError")
    expect(source).toContain("readonly code = \"OPERATION_TIMEOUT\"")
    expect(source).toContain("export async function withTimeout")
    expect(source).toContain("Promise.race")
    expect(source).toContain("timer.unref?.()")
  })

  it("bounds /api/user/credits slow auth, base credits, and optional entitlement reads", () => {
    const source = read("app/api/user/credits/route.ts")

    expect(source).toContain("withTimeout(requireUser(request), AUTH_TIMEOUT_MS")
    expect(source).toContain("BASE_CREDITS_TIMEOUT_MS")
    expect(source).toContain("OPTIONAL_STATUS_TIMEOUT_MS")
    expect(source).toContain("const trialStatusPromise = withTimeout")
    expect(source).toContain("const entitlementPromise = withTimeout")
    expect(source).toContain("const baseCreditsPromise = withTimeout")
    expect(source).toContain("权益合并降级")
    expect(source).toContain("createSafeCreditsDegradedResponse")
    expect(source).toContain("creditStatus: \"unavailable\"")
    expect(source).toContain("CREDITS_TIMEOUT")
    expect(source).not.toContain("{ status: isOperationTimeoutError(baseCredits.error) ? 503 : 500 }")
    expect(source).not.toMatch(/const trialStatusResult = await getUserTrialStatus/)
    expect(source).not.toMatch(/const entitlement = await getUserEntitlementSummary/)
  })

  it("lets /api/surveys/today degrade to an empty prompt instead of returning 504-class failures", () => {
    const source = read("app/api/surveys/today/route.ts")

    expect(source).toContain("withTimeout(requireUser(request), AUTH_TIMEOUT_MS")
    expect(source).toContain("SURVEY_READ_TIMEOUT_MS")
    expect(source).toContain("TRIAL_STATUS_TIMEOUT_MS")
    expect(source).toContain("submittedResult.data")
    expect(source).toContain("degraded:")
    expect(source).toContain("createSafeSurveyDegradedResponse")
    expect(source).not.toContain("status: 503")
    expect(source).not.toContain("status: 500")
    expect(source).not.toContain("getTodaySurveyTemplate(userId),\n      hasSubmittedSurveyToday(userId),")
    expect(source).not.toContain("{ status: 500 },\n      )\n    }\n\n    return NextResponse.json")
  })

  it("bounds /api/free-trial/runtime-flags so runtime config reads cannot hang the app shell", () => {
    const source = read("app/api/free-trial/runtime-flags/route.ts")

    expect(source).toContain("RUNTIME_FLAGS_TIMEOUT_MS")
    expect(source).toContain("withTimeout(")
    expect(source).toContain("free-trial.runtime-flags")
    expect(source).toContain("getSafeRuntimeFlagDefaults")
    expect(source).toContain("degraded: true")
  })

  it("lets /api/chat-session degrade persistence and list reads without blocking chat", () => {
    const source = read("app/api/chat-session/route.ts")

    expect(source).toContain("withTimeout(requireUser(request), AUTH_TIMEOUT_MS")
    expect(source).toContain("SESSION_LOOKUP_TIMEOUT_MS")
    expect(source).toContain("SESSION_WRITE_TIMEOUT_MS")
    expect(source).toContain("SESSION_LIST_TIMEOUT_MS")
    expect(source).toContain("SESSION_MESSAGES_TIMEOUT_MS")
    expect(source).toContain("createDegradedSessionResponse")
    expect(source).toContain("SESSION_PERSISTENCE_DEGRADED")
    expect(source).toContain("SESSION_READ_DEGRADED")
    expect(source).toContain("{ status: 202 }")
    expect(source).toContain("isTransientSessionPersistenceError")
  })

  it("keeps /api/save-message core writes bounded and file metadata best-effort", () => {
    const source = read("app/api/save-message/route.ts")

    expect(source).toContain("withTimeout(requireUser(request), AUTH_TIMEOUT_MS")
    expect(source).toContain("SESSION_LOOKUP_TIMEOUT_MS")
    expect(source).toContain("MESSAGE_INSERT_TIMEOUT_MS")
    expect(source).toContain("FILE_METADATA_TIMEOUT_MS")
    expect(source).toContain("void persistUploadedFileMetadata")
    expect(source).toContain("save-message.message-insert")
    expect(source).toContain("save-message.file-metadata")
    expect(source).toContain("createPersistenceDegradedResponse")
    expect(source).toContain("SAVE_MESSAGE_PERSISTENCE_DEGRADED")
    expect(source).toContain("{ status: 202 }")
    expect(source).toContain("isTransientPersistenceError")
    expect(source).not.toContain("for (const file of files) {\n        try {")
  })
})
