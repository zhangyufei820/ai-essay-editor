import { claimFreeTrial } from "@/lib/free-trial"
import {
  disableFreeTrialConsumption,
  getBooleanRuntimeFlag,
  RUNTIME_CONFIG_KEYS,
} from "@/lib/free-trial-runtime-config"
import { calculateSurveyQualityScore, submitSurveyResponse } from "@/lib/surveys"
import { consumeWithTrialCredits } from "@/lib/trial-credits"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { spendRealCredits } from "@/lib/credits"

jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}))

jest.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: jest.fn(),
}))

jest.mock("@/lib/credits", () => ({
  spendRealCredits: jest.fn(),
}))

type Row = Record<string, any>
type Tables = Record<string, Row[]>

const today = new Date().toISOString().slice(0, 10)

function createGrant(overrides: Partial<Row> = {}): Row {
  return {
    id: "grant-1",
    user_id: "user-1",
    grant_type: "campaign",
    start_at: new Date(Date.now() - 60_000).toISOString(),
    end_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    daily_quota: 2000,
    total_quota: null,
    status: "active",
    requires_daily_survey: true,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function createTemplate(overrides: Partial<Row> = {}): Row {
  return {
    id: "template-daily",
    template_key: "daily_v1",
    title: "每日问卷",
    description: null,
    audience: "all",
    cadence: "daily",
    questions_json: [],
    active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function matchesFilters(row: Row, filters: Array<{ column: string; value: any }>): boolean {
  return filters.every((filter) => row[filter.column] === filter.value)
}

function createSupabaseMock(seed: Partial<Tables> = {}) {
  const tables: Tables = {
    free_trial_grants: [],
    survey_templates: [],
    survey_responses: [],
    trial_credit_usages: [],
    free_trial_runtime_config: [],
    monitor_incidents: [],
    monitor_runs: [],
    user_trial_status: [],
    user_credits: [],
    orders: [],
    credit_transactions: [],
    ...seed,
  }

  const supabase = {
    tables,
    from: jest.fn((table: string) => {
      const state = {
        table,
        filters: [] as Array<{ column: string; value: any }>,
        insertPayload: null as Row | Row[] | null,
        updatePayload: null as Row | null,
        limitCount: null as number | null,
        orderBy: [] as Array<{ column: string; ascending: boolean }>,
      }

      const resolveRows = () => {
        let rows = [...(tables[table] || [])].filter((row) => matchesFilters(row, state.filters))
        if (table === "free_trial_grants") {
          rows = rows.filter((row) => {
            const now = Date.now()
            const startsOk = !row.start_at || new Date(row.start_at).getTime() <= now
            const endsOk = !row.end_at || new Date(row.end_at).getTime() > now
            return startsOk && endsOk
          })
        }
        for (const order of [...state.orderBy].reverse()) {
          rows.sort((a, b) => {
            const left = String(a[order.column] || "")
            const right = String(b[order.column] || "")
            return order.ascending ? left.localeCompare(right) : right.localeCompare(left)
          })
        }
        if (state.limitCount !== null) rows = rows.slice(0, state.limitCount)
        return rows
      }

      const applyInsert = () => {
        const payloads = Array.isArray(state.insertPayload) ? state.insertPayload : [state.insertPayload]
        const inserted = payloads.filter(Boolean).map((payload) => ({
          id: payload?.id || `${table}-${tables[table].length + 1}`,
          created_at: payload?.created_at || new Date().toISOString(),
          updated_at: payload?.updated_at || new Date().toISOString(),
          ...payload,
        }))
        tables[table].push(...inserted)
        return inserted
      }

      const chain: any = {
        select: jest.fn(() => chain),
        eq: jest.fn((column: string, value: any) => {
          state.filters.push({ column, value })
          return chain
        }),
        lte: jest.fn(() => chain),
        gt: jest.fn(() => chain),
        order: jest.fn((column: string, options?: { ascending?: boolean }) => {
          state.orderBy.push({ column, ascending: options?.ascending !== false })
          return chain
        }),
        limit: jest.fn((count: number) => {
          state.limitCount = count
          return chain
        }),
        insert: jest.fn((payload: Row | Row[]) => {
          state.insertPayload = payload
          return chain
        }),
        upsert: jest.fn((payload: Row | Row[]) => {
          state.insertPayload = payload
          const payloads = Array.isArray(payload) ? payload : [payload]
          for (const item of payloads) {
            const key = item.config_key
            const existing = key ? tables[table].find((row) => row.config_key === key) : null
            if (existing) Object.assign(existing, item)
          }
          return chain
        }),
        update: jest.fn((payload: Row) => {
          state.updatePayload = payload
          return chain
        }),
        maybeSingle: jest.fn(async () => {
          const row = resolveRows()[0] || null
          return { data: row, error: null }
        }),
        single: jest.fn(async () => {
          if (state.insertPayload) {
            return { data: applyInsert()[0], error: null }
          }
          if (state.updatePayload) {
            const row = resolveRows()[0]
            if (row) Object.assign(row, state.updatePayload)
            return { data: row || null, error: null }
          }
          return { data: resolveRows()[0] || null, error: null }
        }),
        then: (resolve: any, reject: any) => Promise.resolve({ data: resolveRows(), error: null }).then(resolve, reject),
      }

      return chain
    }),
  }

  return supabase
}

describe("free trial libraries", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("claimFreeTrial grants a new campaign trial", async () => {
    const supabase = createSupabaseMock()
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    const result = await claimFreeTrial("user-1")

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      user_id: "user-1",
      grant_type: "campaign",
      daily_quota: 2000,
      status: "active",
      requires_daily_survey: true,
    })
    expect(supabase.tables.free_trial_grants).toHaveLength(1)
  })

  it("claimFreeTrial returns an existing active grant instead of creating a duplicate", async () => {
    const existingGrant = createGrant({ id: "existing-grant" })
    const supabase = createSupabaseMock({ free_trial_grants: [existingGrant] })
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    const result = await claimFreeTrial("user-1")

    expect(result.success).toBe(true)
    expect(result.data?.id).toBe("existing-grant")
    expect(supabase.tables.free_trial_grants).toHaveLength(1)
  })
})

describe("survey libraries", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("calculateSurveyQualityScore penalizes fast and empty answers", () => {
    expect(calculateSurveyQualityScore({ use_case: "作文批改", feedback_text: "挺好用" }, { durationSeconds: 30 })).toBe(100)
    expect(calculateSurveyQualityScore({ rating: 4, feedback_text: "" }, { durationSeconds: 10 })).toBe(50)
    expect(calculateSurveyQualityScore({}, { durationSeconds: 10 })).toBe(20)
  })

  it("submitSurveyResponse allows one response per day and returns the existing response on repeat", async () => {
    const supabase = createSupabaseMock({
      survey_templates: [createTemplate({ cadence: "onboarding", id: "template-onboarding" })],
    })
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    const first = await submitSurveyResponse("user-1", { feedback_text: "报告很清楚" }, { durationSeconds: 30 })
    const second = await submitSurveyResponse("user-1", { feedback_text: "重复提交" }, { durationSeconds: 30 })

    expect(first.success).toBe(true)
    expect(first.data).toMatchObject({
      todaySurveyCompleted: true,
      streakDay: 1,
      qualityScore: 100,
    })
    expect(second.success).toBe(true)
    expect(second.data?.response?.answers_json).toEqual({ feedback_text: "报告很清楚" })
    expect(supabase.tables.survey_responses).toHaveLength(1)
    expect(supabase.tables.survey_responses[0]).toMatchObject({
      user_id: "user-1",
      survey_date: today,
    })
  })
})

describe("trial credit libraries", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.FREE_TRIAL_CONSUMPTION_ENABLED
    ;(spendRealCredits as jest.Mock).mockResolvedValue(true)
  })

  it("consumeWithTrialCredits blocks active trial usage when today's survey is missing", async () => {
    const supabase = createSupabaseMock({
      free_trial_grants: [createGrant({ requires_daily_survey: true })],
    })
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    const result = await consumeWithTrialCredits({
      userId: "user-1",
      amount: 100,
      actionType: "essay_review",
    })

    expect(result).toMatchObject({
      success: true,
      blocked: true,
      reason: "survey_required",
      trialUsed: 0,
      realCreditsUsed: 0,
      grantId: "grant-1",
    })
    expect(spendRealCredits).not.toHaveBeenCalled()
  })

  it("consumeWithTrialCredits uses trial credits only when quota is enough", async () => {
    const supabase = createSupabaseMock({
      free_trial_grants: [createGrant()],
      survey_responses: [{ id: "survey-1", user_id: "user-1", survey_date: today }],
      user_trial_status: [{
        user_id: "user-1",
        active_grant_id: "grant-1",
        today_trial_remaining: 2000,
      }],
      user_credits: [{ user_id: "user-1", credits: 500 }],
    })
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    const result = await consumeWithTrialCredits({
      userId: "user-1",
      amount: 300,
      actionType: "essay_review",
      referenceId: "msg-1",
    })

    expect(result).toMatchObject({
      success: true,
      blocked: false,
      trialUsed: 300,
      realCreditsUsed: 0,
      remainingToday: 1700,
      grantId: "grant-1",
      realCreditsSpent: false,
    })
    expect(supabase.tables.trial_credit_usages).toHaveLength(1)
    expect(spendRealCredits).not.toHaveBeenCalled()
  })

  it("consumeWithTrialCredits charges real credits for overage when trial quota is insufficient", async () => {
    const supabase = createSupabaseMock({
      free_trial_grants: [createGrant()],
      survey_responses: [{ id: "survey-1", user_id: "user-1", survey_date: today }],
      trial_credit_usages: [{
        id: "usage-existing",
        user_id: "user-1",
        grant_id: "grant-1",
        usage_date: today,
        action_type: "essay_review",
        amount: 1880,
        reference_id: "existing",
        metadata: {},
        created_at: new Date().toISOString(),
      }],
      user_credits: [{ user_id: "user-1", credits: 500 }],
    })
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    const result = await consumeWithTrialCredits({
      userId: "user-1",
      amount: 200,
      actionType: "essay_review",
      referenceId: "msg-2",
    })

    expect(result).toMatchObject({
      success: true,
      trialUsed: 120,
      realCreditsUsed: 80,
      remainingToday: 0,
      shouldUseRealCredits: true,
      realCreditsSpent: true,
    })
    expect(spendRealCredits).toHaveBeenCalledWith(
      "user-1",
      80,
      "essay_review",
      expect.stringContaining("超出体验额度"),
      "msg-2",
      expect.objectContaining({ chargedCredits: 80, skipTrialBilling: true }),
    )
  })

  it("consumeWithTrialCredits uses campaign quota while paid extension removes the survey gate", async () => {
    const supabase = createSupabaseMock({
      free_trial_grants: [
        createGrant({ id: "campaign-grant", grant_type: "campaign", requires_daily_survey: true, daily_quota: 2000 }),
        createGrant({ id: "paid-extension", grant_type: "paid_extension", requires_daily_survey: false, daily_quota: 0 }),
      ],
      user_trial_status: [{
        user_id: "user-1",
        active_grant_id: "campaign-grant",
        today_trial_remaining: 2000,
      }],
      user_credits: [{ user_id: "user-1", credits: 500 }],
    })
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    const result = await consumeWithTrialCredits({
      userId: "user-1",
      amount: 100,
      actionType: "paid_user_agent",
      referenceId: "paid-1",
    })

    expect(result).toMatchObject({
      success: true,
      blocked: false,
      grantId: "campaign-grant",
      trialUsed: 100,
      realCreditsUsed: 0,
      remainingToday: 1900,
      realCreditsSpent: false,
    })
    expect(spendRealCredits).not.toHaveBeenCalled()
    expect(supabase.tables.trial_credit_usages).toEqual([
      expect.objectContaining({
        user_id: "user-1",
        grant_id: "campaign-grant",
        amount: 100,
        action_type: "paid_user_agent",
        reference_id: "paid-1",
      }),
    ])
  })

  it("consumeWithTrialCredits auto-grants campaign trial for users without an active grant while campaign is open", async () => {
    const supabase = createSupabaseMock()
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    const result = await consumeWithTrialCredits({
      userId: "user-2",
      amount: 50,
      actionType: "essay_review",
      referenceId: "msg-3",
    })

    expect(result).toMatchObject({
      success: true,
      blocked: true,
      reason: "survey_required",
      shouldUseRealCredits: false,
      trialUsed: 0,
      realCreditsUsed: 0,
      realCreditsSpent: false,
    })
    expect(supabase.tables.free_trial_grants).toEqual([
      expect.objectContaining({
        user_id: "user-2",
        grant_type: "campaign",
        daily_quota: 2000,
        requires_daily_survey: true,
        status: "active",
        metadata: expect.objectContaining({ source: "auto_trial_consumption_campaign" }),
      }),
    ])
    expect(spendRealCredits).not.toHaveBeenCalled()
  })

  it("consumeWithTrialCredits auto-grants no-survey paid extension for paid users without an active grant", async () => {
    const supabase = createSupabaseMock({
      user_credits: [{ user_id: "paid-user", credits: 500, is_pro: true }],
    })
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    const result = await consumeWithTrialCredits({
      userId: "paid-user",
      amount: 50,
      actionType: "essay_review",
      referenceId: "paid-msg-1",
    })

    expect(result).toMatchObject({
      success: true,
      blocked: false,
      shouldUseRealCredits: false,
      trialUsed: 50,
      realCreditsUsed: 0,
      remainingToday: 1950,
      realCreditsSpent: false,
    })
    expect(supabase.tables.free_trial_grants).toEqual([
      expect.objectContaining({
        user_id: "paid-user",
        grant_type: "paid_extension",
        requires_daily_survey: false,
        metadata: expect.objectContaining({ source: "auto_trial_consumption_paid_extension" }),
      }),
    ])
    expect(supabase.tables.trial_credit_usages).toEqual([
      expect.objectContaining({
        user_id: "paid-user",
        amount: 50,
        reference_id: "paid-msg-1",
      }),
    ])
    expect(spendRealCredits).not.toHaveBeenCalled()
  })

  it("consumeWithTrialCredits falls back to real credits when campaign runtime flag is disabled for non-trial users", async () => {
    const supabase = createSupabaseMock({
      free_trial_runtime_config: [{
        id: "runtime-campaign-off",
        config_key: RUNTIME_CONFIG_KEYS.campaign,
        config_value: { enabled: false },
      }],
    })
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    const result = await consumeWithTrialCredits({
      userId: "user-2",
      amount: 50,
      actionType: "essay_review",
      referenceId: "msg-3",
    })

    expect(result).toMatchObject({
      success: true,
      reason: "no_active_trial",
      shouldUseRealCredits: true,
      trialUsed: 0,
      realCreditsUsed: 50,
      realCreditsSpent: true,
    })
    expect(spendRealCredits).toHaveBeenCalledWith(
      "user-2",
      50,
      "essay_review",
      expect.stringContaining("消费 50 积分"),
      "msg-3",
      expect.objectContaining({ skipTrialBilling: true }),
    )
  })

  it("consumeWithTrialCredits ignores active trial quota when consumption flag is disabled", async () => {
    process.env.FREE_TRIAL_CONSUMPTION_ENABLED = "false"
    const supabase = createSupabaseMock({
      free_trial_grants: [createGrant()],
      survey_responses: [{ id: "survey-1", user_id: "user-1", survey_date: today }],
      user_trial_status: [{
        user_id: "user-1",
        active_grant_id: "grant-1",
        today_trial_remaining: 2000,
      }],
    })
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    const result = await consumeWithTrialCredits({
      userId: "user-1",
      amount: 100,
      actionType: "essay_review",
      referenceId: "flag-off-1",
    })

    expect(result).toMatchObject({
      success: true,
      reason: "env_free_trial_consumption_disabled",
      shouldUseRealCredits: true,
      trialUsed: 0,
      realCreditsUsed: 100,
      realCreditsSpent: true,
    })
    expect(supabase.tables.trial_credit_usages).toHaveLength(0)
    expect(spendRealCredits).toHaveBeenCalledWith(
      "user-1",
      100,
      "essay_review",
      expect.stringContaining("消费 100 积分"),
      "flag-off-1",
      expect.objectContaining({
        skipTrialBilling: true,
        rawProviderMetadata: expect.objectContaining({
          trialDisabledReason: "env_free_trial_consumption_disabled",
        }),
      }),
    )
  })

  it("consumeWithTrialCredits ignores active trial quota when runtime consumption flag is disabled", async () => {
    process.env.FREE_TRIAL_CONSUMPTION_ENABLED = "true"
    const supabase = createSupabaseMock({
      free_trial_grants: [createGrant()],
      survey_responses: [{ id: "survey-1", user_id: "user-1", survey_date: today }],
      user_trial_status: [{
        user_id: "user-1",
        active_grant_id: "grant-1",
        today_trial_remaining: 2000,
      }],
      free_trial_runtime_config: [{
        id: "runtime-1",
        config_key: RUNTIME_CONFIG_KEYS.consumption,
        config_value: { enabled: false },
      }],
    })
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    const result = await consumeWithTrialCredits({
      userId: "user-1",
      amount: 100,
      actionType: "essay_review",
      referenceId: "runtime-off-1",
    })

    expect(result).toMatchObject({
      success: true,
      reason: "runtime_free_trial_consumption_disabled",
      shouldUseRealCredits: true,
      trialUsed: 0,
      realCreditsUsed: 100,
    })
    expect(supabase.tables.trial_credit_usages).toHaveLength(0)
    expect(spendRealCredits).toHaveBeenCalled()
  })
})

describe("runtime config libraries", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("getBooleanRuntimeFlag falls back when DB row is missing", async () => {
    const supabase = createSupabaseMock()
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    await expect(getBooleanRuntimeFlag(RUNTIME_CONFIG_KEYS.consumption, true)).resolves.toBe(true)
  })

  it("getBooleanRuntimeFlag lets DB false override fallback true", async () => {
    const supabase = createSupabaseMock({
      free_trial_runtime_config: [{
        id: "runtime-1",
        config_key: RUNTIME_CONFIG_KEYS.consumption,
        config_value: { enabled: false },
      }],
    })
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    await expect(getBooleanRuntimeFlag(RUNTIME_CONFIG_KEYS.consumption, true)).resolves.toBe(false)
  })

  it("disableFreeTrialConsumption writes config and incident", async () => {
    const supabase = createSupabaseMock()
    ;(getSupabaseAdmin as jest.Mock).mockReturnValue(supabase)

    const result = await disableFreeTrialConsumption("P0 smoke", { source: "test" })

    expect(result.success).toBe(true)
    expect(supabase.tables.free_trial_runtime_config[0]).toMatchObject({
      config_key: RUNTIME_CONFIG_KEYS.consumption,
      config_value: expect.objectContaining({ enabled: false, reason: "P0 smoke" }),
      updated_by: "monitor",
    })
    expect(supabase.tables.monitor_incidents[0]).toMatchObject({
      incident_type: "disable_free_trial_consumption",
      severity: "p0",
      auto_action_taken: "free_trial_consumption_enabled=false",
    })
  })
})
