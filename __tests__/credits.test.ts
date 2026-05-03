import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
import { createBillingAuditMetadata, getUserCredits, summarizeCreditTransactions } from '@/lib/credits'
import { hasActiveMembership, resolveMembershipStatus } from '@/lib/products'
import { canUseImage2, parseAllowlistEnv } from '@/lib/permissions'

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

function makeChain(response: any) {
  const chain: any = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    upsert: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    single: jest.fn(async () => response),
    maybeSingle: jest.fn(async () => response),
    then: (resolve: any, reject: any) => Promise.resolve(response).then(resolve, reject),
  }
  return chain
}

describe('credits helpers', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })

  it('summarizes positive and negative transactions', () => {
    expect(
      summarizeCreditTransactions([
        { amount: 1000 },
        { amount: -120 },
        { amount: 50 },
        { amount: -30 },
      ]),
    ).toEqual({
      total_earned: 1050,
      total_spent: 150,
    })
  })

  it('reads credits without requesting a missing total_earned column and derives totals from transactions', async () => {
    const userCreditsQuery = makeChain({
      data: { credits: 880, is_pro: true },
      error: null,
    })
    const txQuery = makeChain({
      data: [
        { amount: 1000 },
        { amount: -100 },
        { amount: 200 },
      ],
      error: null,
    })
    const supabaseMock = {
      from: jest.fn((table: string) => {
        if (table === 'user_credits') return userCreditsQuery
        if (table === 'credit_transactions') return txQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    ;(createClient as jest.Mock).mockReturnValue(supabaseMock)

    const credits = await getUserCredits('user-1', { includeTotals: true })

    expect(userCreditsQuery.select).toHaveBeenCalledWith('credits, is_pro')
    expect(userCreditsQuery.select.mock.calls[0][0]).not.toContain('total_earned')
    expect(txQuery.select).toHaveBeenCalledWith('amount')
    expect(credits).toEqual({
      credits: 880,
      is_pro: true,
      total_earned: 1200,
      total_spent: 100,
    })
  })

  it('derives active membership from is_pro when membership_status is missing', () => {
    expect(resolveMembershipStatus({ is_pro: true })).toBe('pro')
    expect(resolveMembershipStatus({ is_pro: false })).toBeNull()
    expect(resolveMembershipStatus({ membership_status: 'premium' })).toBe('premium')
    expect(hasActiveMembership(resolveMembershipStatus({ is_pro: true }))).toBe(true)
  })

  it('allows GPT Image 2 for subscribers or configured user/email whitelist entries', () => {
    const oldUserIds = process.env.IMAGE2_WHITELIST_USER_IDS
    const oldEmails = process.env.IMAGE2_WHITELIST_EMAILS
    const oldLegacy = process.env.GPT_IMAGE_2_ALLOWLIST
    process.env.IMAGE2_WHITELIST_USER_IDS = 'admin-user, test-user '
    process.env.IMAGE2_WHITELIST_EMAILS = 'admin@example.com, TEST@example.com '
    process.env.GPT_IMAGE_2_ALLOWLIST = 'legacy-user'

    expect(parseAllowlistEnv(' admin@example.com, , test@example.com ')).toEqual(['admin@example.com', 'test@example.com'])
    expect(canUseImage2(null)).toBe(false)
    expect(canUseImage2({ user_id: 'u1', is_pro: true })).toBe(true)
    expect(canUseImage2({ user_id: 'u2', membership_status: 'campus' })).toBe(true)
    expect(canUseImage2({ user_id: 'test-user' })).toBe(true)
    expect(canUseImage2({ user_id: 'legacy-user' })).toBe(true)
    expect(canUseImage2({ user_id: 'u3', email: 'test@example.com' })).toBe(true)
    expect(canUseImage2({ user_id: 'u4', email: 'other@example.com' })).toBe(false)

    if (oldUserIds === undefined) delete process.env.IMAGE2_WHITELIST_USER_IDS
    else process.env.IMAGE2_WHITELIST_USER_IDS = oldUserIds
    if (oldEmails === undefined) delete process.env.IMAGE2_WHITELIST_EMAILS
    else process.env.IMAGE2_WHITELIST_EMAILS = oldEmails
    if (oldLegacy === undefined) delete process.env.GPT_IMAGE_2_ALLOWLIST
    else process.env.GPT_IMAGE_2_ALLOWLIST = oldLegacy
  })

  it('keeps email OTP signup at one 1000-credit initialization without marking subscription', () => {
    const routeSource = readFileSync(
      path.join(process.cwd(), 'app/api/auth/verify-email-otp/route.ts'),
      'utf8',
    )

    expect(routeSource).toContain('getUserCredits(userId)')
    expect(routeSource).not.toContain('addCredits(userId, 1000, "signup_bonus"')
    expect(routeSource).toContain('is_pro=false')
  })

  it('builds unified billing audit metadata for credit transaction logs', () => {
    const metadata = createBillingAuditMetadata({
      userId: 'user-1',
      actionType: 'consume',
      feature: 'text',
      appId: 'DIFY_APP',
      workflowId: 'workflow-1',
      modelId: 'standard',
      usageSource: 'split_tokens',
      estimated: false,
      promptTokens: 669,
      completionTokens: 88,
      totalTokens: 757,
      chargedCredits: 6,
      balanceBefore: 1000,
      balanceAfter: 994,
      rawUsageJson: {
        total_price: '0',
        currency: 'USD',
      },
      finishReason: 'stop',
      latency: 2.874,
      timeToFirstToken: 2.003,
      conversationId: 'conversation-1',
      messageId: 'message-1',
      requestId: 'request-1',
      description: '作文批改',
    })

    expect(metadata).toMatchObject({
      userId: 'user-1',
      actionType: 'consume',
      appId: 'DIFY_APP',
      workflowId: 'workflow-1',
      modelId: 'standard',
      feature: 'text',
      promptTokens: 669,
      completionTokens: 88,
      totalTokens: 757,
      textInputCreditsPer1K: 5,
      textOutputCreditsPer1K: 20,
      chargedCredits: 6,
      balanceBefore: 1000,
      balanceAfter: 994,
      pricingVersion: expect.stringMatching(/^text-split-v\d{4}-\d{2}-\d{2}$/),
      usageSource: 'dify',
      rawUsageSource: 'split_tokens',
      estimated: false,
      providerTotalPrice: '0',
      providerCurrency: 'USD',
      rawUsageJson: {
        total_price: '0',
        currency: 'USD',
      },
      finishReason: 'stop',
      latency: 2.874,
      timeToFirstToken: 2.003,
      conversationId: 'conversation-1',
      messageId: 'message-1',
      requestId: 'request-1',
      description: '作文批改',
      assumedProviderInputVcoinsPer1M: 30,
      assumedProviderOutputVcoinsPer1M: 150,
    })
    expect(metadata.createdAt).toEqual(expect.any(String))
  })

  it('keeps server-side credit spending guarded by conditional atomic update', () => {
    const source = readFileSync(path.join(process.cwd(), 'lib/credits.ts'), 'utf8')

    expect(source).toContain('export async function spendCredits')
    expect(source).toContain('!Number.isInteger(amount) || amount <= 0')
    expect(source).toContain('.eq("credits", credits.credits)')
    expect(source).toContain('.gte("credits", amount)')
    expect(source).toContain('.select("credits")')
    expect(source).toContain('.maybeSingle()')
    expect(source).toContain('recordTransaction(')
  })
})
