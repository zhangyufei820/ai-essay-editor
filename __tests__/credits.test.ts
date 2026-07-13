import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
import { createBillingAuditMetadata, createUserReferralCode, getUserCredits, spendCredits, summarizeCreditTransactions } from '@/lib/credits'
import { hasActiveMembership, resolveMembershipStatus } from '@/lib/products'
import { canUseImage2, isImage2CoCreationActive, parseAllowlistEnv } from '@/lib/permissions'

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/trial-credits', () => ({
  consumeWithTrialCredits: jest.fn(),
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

  it('keeps legacy is_pro membership derivation outside Image 2 permissions', () => {
    expect(resolveMembershipStatus({ is_pro: true })).toBe('pro')
    expect(resolveMembershipStatus({ is_pro: false })).toBeNull()
    expect(resolveMembershipStatus({ membership_status: 'premium' })).toBe('premium')
    expect(hasActiveMembership(resolveMembershipStatus({ is_pro: true }))).toBe(true)
  })

  it('allows GPT Image 2 for subscribers or configured user/email whitelist entries', () => {
    const oldUserIds = process.env.IMAGE2_WHITELIST_USER_IDS
    const oldEmails = process.env.IMAGE2_WHITELIST_EMAILS
    const oldLegacy = process.env.GPT_IMAGE_2_ALLOWLIST
    const oldOpenAccess = process.env.IMAGE2_TEST_OPEN_ACCESS
    const oldCoCreationEndsAt = process.env.IMAGE2_CO_CREATION_ENDS_AT
    process.env.IMAGE2_WHITELIST_USER_IDS = 'admin-user, test-user '
    process.env.IMAGE2_WHITELIST_EMAILS = 'admin@example.com, TEST@example.com '
    process.env.GPT_IMAGE_2_ALLOWLIST = 'legacy-user'
    delete process.env.IMAGE2_TEST_OPEN_ACCESS
    delete process.env.IMAGE2_CO_CREATION_ENDS_AT

    expect(parseAllowlistEnv(' admin@example.com, , test@example.com ')).toEqual(['admin@example.com', 'test@example.com'])
    expect(canUseImage2(null)).toBe(false)
    expect(canUseImage2({ user_id: 'u1', is_pro: true })).toBe(false)
    expect(canUseImage2({ user_id: 'u1', membership_status: 'basic' })).toBe(true)
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
    if (oldOpenAccess === undefined) delete process.env.IMAGE2_TEST_OPEN_ACCESS
    else process.env.IMAGE2_TEST_OPEN_ACCESS = oldOpenAccess
    if (oldCoCreationEndsAt === undefined) delete process.env.IMAGE2_CO_CREATION_ENDS_AT
    else process.env.IMAGE2_CO_CREATION_ENDS_AT = oldCoCreationEndsAt
  })

  it('opens GPT Image 2 to logged-in users during the 60-day co-creation period', () => {
    const oldCoCreationEndsAt = process.env.IMAGE2_CO_CREATION_ENDS_AT
    process.env.IMAGE2_CO_CREATION_ENDS_AT = '2026-07-19T15:59:59.000Z'

    expect(isImage2CoCreationActive(Date.parse('2026-05-20T00:00:00.000Z'))).toBe(true)
    expect(canUseImage2({ user_id: 'non-member-user' })).toBe(true)
    expect(canUseImage2(null)).toBe(false)

    if (oldCoCreationEndsAt === undefined) delete process.env.IMAGE2_CO_CREATION_ENDS_AT
    else process.env.IMAGE2_CO_CREATION_ENDS_AT = oldCoCreationEndsAt
  })

  it('restores GPT Image 2 subscriber or whitelist rules after co-creation ends', () => {
    const oldCoCreationEndsAt = process.env.IMAGE2_CO_CREATION_ENDS_AT
    const oldOpenAccess = process.env.IMAGE2_TEST_OPEN_ACCESS
    process.env.IMAGE2_CO_CREATION_ENDS_AT = '2026-07-19T15:59:59.000Z'
    delete process.env.IMAGE2_TEST_OPEN_ACCESS

    expect(isImage2CoCreationActive(Date.parse('2026-07-20T00:00:00.000Z'))).toBe(false)
    const afterCoCreation = Date.parse('2026-07-20T00:00:00.000Z')
    expect(canUseImage2({ user_id: 'non-member-user' }, afterCoCreation)).toBe(false)
    expect(canUseImage2({ user_id: 'member-user', membership_status: 'basic' }, afterCoCreation)).toBe(true)

    if (oldCoCreationEndsAt === undefined) delete process.env.IMAGE2_CO_CREATION_ENDS_AT
    else process.env.IMAGE2_CO_CREATION_ENDS_AT = oldCoCreationEndsAt
    if (oldOpenAccess === undefined) delete process.env.IMAGE2_TEST_OPEN_ACCESS
    else process.env.IMAGE2_TEST_OPEN_ACCESS = oldOpenAccess
  })

  it('lets Image 2 server permissions fall back to persisted subscription flags', () => {
    const routeSource = readFileSync(path.join(process.cwd(), 'app/api/dify-chat/route.ts'), 'utf8')

    expect(routeSource).toContain('.from("orders")')
    expect(routeSource).toContain('.in("product_id", MEMBERSHIP_PRODUCT_IDS)')
    expect(routeSource).toContain('resolveRelatedUserIds(userId, identity, supabase)')
    expect(routeSource).toContain('.in("user_id", candidateUserIds)')
    expect(routeSource).toContain('.from("user_credits")')
    expect(routeSource).toContain('.select("is_pro")')
    expect(routeSource).toContain('resolveMembershipStatus({ is_pro: subscribedCredit?.is_pro })')
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

  it('threads referral processing through all first-login auth entry points', () => {
    const syncSource = readFileSync(path.join(process.cwd(), 'app/api/auth/sync/route.ts'), 'utf8')
    const callbackSource = readFileSync(path.join(process.cwd(), 'app/auth/callback/route.ts'), 'utf8')
    const emailOtpSource = readFileSync(
      path.join(process.cwd(), 'app/api/auth/verify-email-otp/route.ts'),
      'utf8',
    )

    expect(syncSource).toContain('handleReferralSignup')
    expect(syncSource).toContain('referralCode')
    expect(callbackSource).toContain('handleReferralSignup')
    expect(callbackSource).toContain('referral_code')
    expect(emailOtpSource).toContain('handleReferralSignup')
    expect(emailOtpSource).toContain('referralCode')
  })

  it('blocks invite-page fallback referral codes that are not persisted server-side', () => {
    const inviteSource = readFileSync(path.join(process.cwd(), 'app/invite/page.tsx'), 'utf8')

    expect(inviteSource).not.toContain('使用本地推荐码')
    expect(inviteSource).not.toContain('generateReferralCode(userId)')
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

  it('keeps server-side credit spending and its audit row in one database transaction', () => {
    const source = [
      readFileSync(path.join(process.cwd(), 'lib/credits.ts'), 'utf8'),
      readFileSync(path.join(process.cwd(), 'lib/real-credit-spending.ts'), 'utf8'),
    ].join('\n')
    const migration = readFileSync(path.join(process.cwd(), 'scripts/025_atomic_real_credit_spending.sql'), 'utf8')

    expect(source).toContain('export async function spendCredits')
    expect(source).toContain('!Number.isInteger(amount) || amount <= 0')
    expect(source).toContain('supabase.rpc("spend_real_credits_atomic"')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.spend_real_credits_atomic')
    expect(migration).toContain('FOR UPDATE')
    expect(migration).toContain('INSERT INTO public.credit_transactions')
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.spend_real_credits_atomic')
  })

  it('routes public spendCredits through trial-first consumption', async () => {
    const { consumeWithTrialCredits } = await import('@/lib/trial-credits')
    ;(consumeWithTrialCredits as jest.Mock).mockResolvedValueOnce({
      success: true,
      blocked: false,
      reason: null,
    })

    await expect(
      spendCredits('user-1', 10, 'consume', '测试消费', 'ref-1', { feature: 'test' }),
    ).resolves.toBe(true)

    expect(consumeWithTrialCredits).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      amount: 10,
      actionType: 'consume',
      description: '测试消费',
      referenceId: 'ref-1',
      billingMetadata: expect.objectContaining({ feature: 'test' }),
    }))
  })

  it('reuses an existing referral code instead of rotating shared invite links', async () => {
    const referralCodeQuery = makeChain({
      data: { code: 'SXOLDABC123' },
      error: null,
    })
    const supabaseMock = {
      from: jest.fn((table: string) => {
        if (table === 'referral_codes') return referralCodeQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    ;(createClient as jest.Mock).mockReturnValue(supabaseMock)

    await expect(createUserReferralCode('user-abc123')).resolves.toBe('SXOLDABC123')

    expect(referralCodeQuery.maybeSingle).toHaveBeenCalled()
    expect(referralCodeQuery.upsert).not.toHaveBeenCalled()
  })
})
