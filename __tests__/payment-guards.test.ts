import fs from 'fs'
import path from 'path'
import { getProductCredits, getProductPriceInCents } from '@/lib/products'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Sprint 5 payment / credits / membership guards', () => {
  it('keeps product price and credits as server-side source of truth', () => {
    expect(getProductPriceInCents('basic')).toBe(2800)
    expect(getProductPriceInCents('basic', 'annual')).toBe(26880)
    expect(getProductPriceInCents('credits-5000')).toBe(4800)
    expect(getProductCredits('basic')).toBe(2000)
    expect(getProductCredits('premium')).toBe(12000)
    expect(getProductCredits('credits-10000')).toBe(10000)
    expect(getProductPriceInCents('unknown')).toBeNull()
  })

  it('payment creation persists credits_amount from product catalog', () => {
    const source = read('app/api/payment/xunhupay/create/route.ts')
    expect(source).toContain('getProductPriceInCents(productId, billing)')
    expect(source).toContain('const creditsAmount = getProductCredits(productId)')
    expect(source).toContain('credits_amount: creditsAmount')
    expect(source).not.toContain('searchParams.get("amount")')
  })

  it('xunhupay callback rejects bad signatures and validates amount / credits before granting权益', () => {
    const source = read('app/api/payment/xunhupay/notify/route.ts')
    expect(source).toContain('签名验证失败，拒绝处理订单')
    expect(source).toContain('return new NextResponse("fail", { status: 400 })')
    expect(source).toContain('paidAmountInCents !== expectedAmountInCents')
    expect(source).toContain('credits !== expectedCredits')
    expect(source).toContain('.eq("status", "pending")')
    expect(source).not.toContain('签名验证失败，但继续处理订单')
  })
})
