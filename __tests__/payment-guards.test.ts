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
    expect(source).toContain('const userId = auth.user!.id')
    expect(source).toContain('.eq("user_id", userId)')
    expect(source).toContain('calculateActualCost(billingModelType || "gpt-image-2") * imageInputsForBilling.n')
    expect(source).toContain('createBillingAuditMetadata')
    expect(source).toContain('feature: imageBillingModel === "gpt-image-2" ? "image2" : "image"')
    expect(source).toContain('usageSource: "fixed"')
  })

  it('does not trust browser-provided X-User-Id for protected chat APIs', () => {
    const difyChat = read('app/api/dify-chat/route.ts')
    const chatSession = read('app/api/chat-session/route.ts')
    const taskStatus = read('app/api/task-status/route.ts')
    const saveMessage = read('app/api/save-message/route.ts')

    expect(difyChat).toContain('requireUser(request)')
    expect(chatSession).toContain('requireUser(request)')
    expect(taskStatus).toContain('requireUser(request)')
    expect(saveMessage).toContain('requireUser(request)')
    expect(`${difyChat}\n${chatSession}\n${taskStatus}\n${saveMessage}`).not.toContain('request.headers.get("X-User-Id")')
  })

  it('requires a verified user before syncing Authing profile data', () => {
    const source = read('app/api/auth/sync/route.ts')

    expect(source).toContain('requireUser(request)')
    expect(source).toContain('const verifiedUserId = auth.user!.id')
    expect(source).toContain('user_id && user_id !== verifiedUserId')
    expect(source).not.toContain('const { user_id, email, nickname, avatar, phone } = body\\n\\n    if (!user_id)')
  })

  it('checks session ownership before cross-user chat resource access', () => {
    const difyChat = read('app/api/dify-chat/route.ts')
    const chatSession = read('app/api/chat-session/route.ts')
    const saveMessage = read('app/api/save-message/route.ts')

    expect(difyChat).toContain('.select("user_id")')
    expect(difyChat).toContain('sessionOwner.user_id !== userId')
    expect(difyChat).toContain('status: 403')
    expect(chatSession).toContain('.eq("user_id", user.id)')
    expect(saveMessage).toContain('.select("id,user_id")')
    expect(saveMessage).toContain('session.user_id !== user.id')
    expect(saveMessage).toContain('status: 403')
  })

  it('keeps ChatPerf and API logs free of sensitive headers and message body previews', () => {
    const source = read('components/chat/enhanced-chat-interface.tsx')
    const difyChat = read('app/api/dify-chat/route.ts')
    const login = read('app/login/page.tsx')
    const suno = read('app/api/suno/route.ts')

    expect(source).toContain('stage: "request_headers"')
    expect(source).toContain('hasAuthorization')
    expect(source).toContain('hasCookie')
    expect(`${source}\n${difyChat}`).not.toContain('Object.fromEntries(res.headers.entries())')
    expect(source).not.toContain('[API 响应] Headers')
    expect(source).not.toContain('query: txt.slice')
    expect(source).not.toContain('query: userMsg.content')
    expect(source).not.toContain('userId,\\n          model: selectedModel')
    expect(login).not.toContain("console.log('登录成功:', userInfo)")
    expect(suno).not.toContain("JSON.stringify(formData, null, 2)")
    expect(suno).not.toContain("JSON.stringify(inputs, null, 2)")
    expect(suno).not.toContain("inputs.lyrics?.slice")
    expect(suno).not.toContain("inputs.prompt?.slice")
  })

  it('does not send X-User-Id from chat clients to protected APIs', () => {
    const clients = [
      read('components/chat/enhanced-chat-interface.tsx'),
      read('components/chat/gpt-image2-chat-interface.tsx'),
      read('components/chat/banana-chat-interface.tsx'),
      read('app/history/page.tsx'),
      read('components/essay-grader.tsx'),
    ].join('\n')

    expect(clients).not.toContain('"X-User-Id"')
    expect(clients).not.toContain("'X-User-Id'")
  })

  it('lets Bearer requests reach route-level verified auth instead of Supabase-only middleware', () => {
    const middleware = read('lib/supabase/middleware.ts')

    expect(middleware).toContain('if (!user && bearerToken)')
    expect(middleware).toContain('return supabaseResponse')
    expect(middleware).toContain('Authing Bearer tokens are verified inside route handlers by requireUser()')
    expect(middleware).not.toContain('request.headers.get("X-User-Id")')
  })

  it('keeps Suno base and token deductions in unified billing audit metadata', () => {
    const source = read('app/api/suno/route.ts')
    expect(source).toContain('createBillingAuditMetadata')
    expect(source).toContain("feature: 'suno'")
    expect(source).toContain("usageSource: 'fixed'")
    expect(source).toContain("actionType: 'suno_llm_token'")
  })
})
