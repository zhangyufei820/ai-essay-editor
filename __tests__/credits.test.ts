import { createClient } from '@supabase/supabase-js'
import { getUserCredits, summarizeCreditTransactions } from '@/lib/credits'
import { hasActiveMembership, resolveMembershipStatus } from '@/lib/products'

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
})
