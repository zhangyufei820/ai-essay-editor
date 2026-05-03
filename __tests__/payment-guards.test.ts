import fs from 'fs'
import path from 'path'
import {
  canPurchaseProductWithMembership,
  getProductById,
  getProductCredits,
  getProductPriceInCents,
  isPurchasableProduct,
  validateProductPurchase,
} from '@/lib/products'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Sprint 5 payment / credits / membership guards', () => {
  it('keeps product price and credits as server-side source of truth', () => {
    expect(getProductPriceInCents('basic')).toBe(2800)
    expect(getProductPriceInCents('basic', 'annual')).toBe(26880)
    expect(getProductPriceInCents('pro', 'annual')).toBe(65280)
    expect(getProductPriceInCents('premium', 'annual')).toBe(122880)
    expect(getProductPriceInCents('credits-5000')).toBe(4800)
    expect(getProductPriceInCents('credits-10000')).toBe(10800)
    expect(getProductCredits('basic')).toBe(2000)
    expect(getProductCredits('premium')).toBe(12000)
    expect(getProductCredits('credits-10000')).toBe(10000)
    expect(getProductById('basic')?.credits).toBe(2000)
    expect(getProductPriceInCents('unknown')).toBeNull()
    expect(getProductPriceInCents('enterprise')).toBeNull()
    expect(isPurchasableProduct('enterprise')).toBe(false)
  })

  it('prevents credit pack arbitrage with membership-tier gates', () => {
    expect(canPurchaseProductWithMembership('credits-500', 'basic')).toBe(true)
    expect(canPurchaseProductWithMembership('credits-1000', 'basic')).toBe(true)
    expect(canPurchaseProductWithMembership('credits-5000', 'basic')).toBe(false)
    expect(canPurchaseProductWithMembership('credits-5000', 'pro')).toBe(true)
    expect(canPurchaseProductWithMembership('credits-10000', 'pro')).toBe(false)
    expect(canPurchaseProductWithMembership('credits-10000', 'premium')).toBe(true)
    expect(canPurchaseProductWithMembership('credits-10000', 'enterprise')).toBe(true)
    expect(validateProductPurchase('credits-5000', 'basic')).toMatchObject({ ok: false, status: 403 })
    expect(validateProductPurchase('credits-5000', 'pro')).toMatchObject({ ok: true })
  })

  it('payment creation persists credits_amount from product catalog', () => {
    const source = read('app/api/payment/xunhupay/create/route.ts')
    expect(source).toContain('getProductPriceInCents(productId, billing)')
    expect(source).toContain('const creditsAmount = getProductCredits(productId)')
    expect(source).toContain('credits_amount: creditsAmount')
    expect(source).toContain('canPurchaseProductWithMembership(productId, membershipStatus)')
    expect(source).toContain('isPurchasableProduct(productId)')
    expect(source).toContain(".in('product_id', ['basic', 'pro', 'premium', 'enterprise', 'campus'])")
    expect(source).not.toContain('searchParams.get("amount")')
    expect(source).not.toContain('searchParams.get("price")')
    expect(source).not.toContain('searchParams.get("credits")')
  })

  it('xunhupay callback rejects bad signatures and validates amount / credits before granting权益', () => {
    const source = read('app/api/payment/xunhupay/notify/route.ts')
    expect(source).toContain('签名验证失败，拒绝处理订单')
    expect(source).toContain('return new NextResponse("fail", { status: 400 })')
    expect(source).toContain('parseOrderSnapshotAmountInCents(order.amount)')
    expect(source).toContain('paidAmountInCents !== expectedAmountInCents')
    expect(source).toContain('const credits = snapshotCredits > 0 ? snapshotCredits : catalogCredits')
    expect(source).toContain('credits !== expectedCredits')
    expect(source).toContain('isPurchasableProduct(order.product_id)')
    expect(source).toContain('status: "processing"')
    expect(source).toContain('.eq("status", "pending")')
    expect(source).toContain('.eq("status", "processing")')
    expect(source).toContain('newCredits > MAX_CREDITS')
    expect(source).toContain('restoreClaimedOrderToPending')
    expect(source).toContain('.eq("credits", currentCredits.credits)')
    expect(source).toContain('.select("credits")')
    expect(source).not.toContain('签名验证失败，但继续处理订单')
  })

  it('keeps GPT Image 2 access and billing checks on the server', () => {
    const source = read('app/api/dify-chat/route.ts')
    expect(source).toContain('canUseImage2')
    expect(source).toContain('IMAGE2_WHITELIST_USER_IDS')
    expect(source).toContain('IMAGE2_WHITELIST_EMAILS')
    expect(source).toContain('resolveActiveMembershipStatus')
    expect(source).toContain('hasGptImageModelInput(inputs) && model !== "gpt-image-2"')
    expect(source).toContain('.eq("user_id", headerUserId)')
    expect(source).toContain('calculateActualCost(billingModelType || "gpt-image-2") * imageInputsForBilling.n')
    expect(source).toContain('createBillingAuditMetadata')
    expect(source).toContain('feature: imageBillingModel === "gpt-image-2" ? "image2" : "image"')
    expect(source).toContain('usageSource: "fixed"')
  })

  it('keeps Suno base and token deductions in unified billing audit metadata', () => {
    const source = read('app/api/suno/route.ts')
    expect(source).toContain('createBillingAuditMetadata')
    expect(source).toContain("feature: 'suno'")
    expect(source).toContain("usageSource: 'fixed'")
    expect(source).toContain("actionType: 'suno_llm_token'")
  })
})
