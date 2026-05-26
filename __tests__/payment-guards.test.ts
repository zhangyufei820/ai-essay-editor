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
    expect(source).toContain('logger.error("[xunhupay] invalid signature")')
    expect(source).toContain('return new NextResponse("fail", { status: 400 })')
    expect(source).toContain('parseOrderSnapshotAmountInCents(order.amount)')
    expect(source).toContain('paidAmountInCents !== expectedAmountInCents')
    expect(source).toContain('const credits = snapshotCredits > 0 ? snapshotCredits : catalogCredits')
    expect(source).toContain('credits !== expectedCredits')
    expect(source).toContain('isPurchasableProduct(order.product_id)')
    expect(source).toContain('直接用 paid 抢占 pending 订单')
    expect(source).toContain('status: "paid"')
    expect(source).toContain('.eq("status", "pending")')
    expect(source).toContain('newCredits > MAX_CREDITS')
    expect(source).toContain('restoreClaimedOrderToPending')
    expect(source).toContain('.eq("status", "paid")')
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
    expect(source).toContain('hasGptImageModelInput(inputs) && !isDirectImageGatewayRequest')
    expect(source).toContain('function isGptImageGatewayModel(model: unknown)')
    expect(source).toContain('const userId = auth.user!.id')
    expect(source).toContain('const hasActiveTrialForRequest = Boolean(trialPrecheck.data?.grantId)')
    expect(source).toContain('!hasActiveTrialForRequest && !canUseImage2')
    expect(source).toContain('.eq("user_id", userId)')
    expect(source).toContain('calculateGptImageGatewayCredits(imageInputsForBilling)')
    expect(source).toContain('createBillingAuditMetadata')
    expect(source).toContain('feature: imageBillingModel === "gpt-image-2" ? "image2" : "image"')
    expect(source).toContain('usageSource: "fixed"')
  })

  it('does not show the old subscriber-only copy for GPT Image 2 during co-creation access', () => {
    const route = read('app/api/dify-chat/route.ts')
    const chat = read('components/chat/enhanced-chat-interface.tsx')
    const image2 = read('components/chat/gpt-image2-chat-interface.tsx')

    expect(route).toContain('GPT Image 2 当前共创体验期内登录用户可用')
    expect(route).not.toContain('GPT Image 2 当前仅订阅用户可用，请升级会员后使用。')
    expect(chat).not.toContain('return "GPT Image 2 当前仅订阅用户可用，请升级会员后使用。"')
    expect(image2).not.toContain('return "GPT Image 2 当前仅订阅用户可用，请升级会员后使用。"')
  })

  it('routes GPT Image 2 through the direct image gateway after server-side billing guards', () => {
    const source = read('app/api/dify-chat/route.ts')
    const billingCheckIndex = source.indexOf('const estimatedMinCost = imageInputsForBilling')
    const directGatewayIndex = source.indexOf('console.log("🎨 [GPT Image] 使用 VivaAPI 图片通道，绕过 Dify chatflow")')
    const difyCallIndex = source.indexOf('const callDify = async')

    expect(source).toContain('callImageGatewayDirect(effectiveQuery, inputs)')
    expect(source).toContain('chargeImageGatewayCredits({')
    expect(source).toContain('gatewayName: process.env.VIVAAPI_IMAGE_API_KEY ? "vivaapi-image" : "dify-image-gateway"')
    expect(source).toContain('VIVAAPI_IMAGE_BASE_URL')
    expect(source).toContain('/v1/images/generations')
    expect(source).toContain('usageSource: "fixed"')
    expect(source).toContain('if (!selectedCredential && !isDirectImageGatewayRequest)')
    expect(directGatewayIndex).toBeGreaterThan(billingCheckIndex)
    expect(difyCallIndex).toBeGreaterThan(directGatewayIndex)
  })

  it('routes Gemini image through the dedicated gateway after server-side billing guards', () => {
    const source = read('app/api/dify-chat/route.ts')
    const billingCheckIndex = source.indexOf('const estimatedMinCost = imageInputsForBilling')
    const geminiGatewayIndex = source.indexOf('console.log("🎨 [Gemini Image] 使用直连 Gemini 图片网关，绕过 Dify workflow")')
    const difyCallIndex = source.indexOf('const callDify = async')

    expect(source).toContain('const GEMINI_IMAGE_GATEWAY_URL')
    expect(source).toContain('callGeminiImageGatewayDirect(effectiveQuery, inputs)')
    expect(source).toContain('gatewayName: "gemini-image-gateway"')
    expect(geminiGatewayIndex).toBeGreaterThan(billingCheckIndex)
    expect(difyCallIndex).toBeGreaterThan(geminiGatewayIndex)
  })

  it('keeps Gemini image out of Dify workflow app routing', () => {
    const source = read('app/api/dify-chat/route.ts')

    expect(source).toContain('const WORKFLOW_MODELS = new Set(["vocab-card"])')
    expect(source).not.toContain('const WORKFLOW_MODELS = new Set(["gemini-image"')
  })

  it('keeps the Image 2 workspace locked to the default GPT Image 2 model', () => {
    const image2 = read('components/chat/gpt-image2-chat-interface.tsx')

    expect(image2).toContain('const showModelSelector = isGeminiWorkspace')
    expect(image2).toContain('model: isGeminiWorkspace ? model : "gpt-image-2"')
    expect(image2).toContain(': "gpt-image-2"')
    expect(image2).not.toContain('options={isGeminiWorkspace ? GEMINI_MODEL_OPTIONS : MODEL_OPTIONS}')
  })

  it('keeps legacy direct gateway polling errors diagnosable for existing async tasks', () => {
    const route = read('app/api/dify-chat/route.ts')
    const image2 = read('components/chat/gpt-image2-chat-interface.tsx')

    expect(route).toContain('signImageTaskPollToken')
    expect(route).toContain('verifyImageTaskPollToken')
    expect(route).toContain('request.headers.get("X-Image-Task-Poll-Token")')
    expect(route).toContain('code: "IMAGE_TASK_FORBIDDEN"')
    expect(route).toContain('code: "IMAGE2_ACCESS_DENIED"')
    expect(route).toContain('code: "CHAT_SESSION_FORBIDDEN"')

    expect(image2).toContain('pollImageTask(payload.imageTaskId, payload.requestId || requestId, payload.pollToken)')
    expect(image2).toContain('"X-Image-Task-Poll-Token": pollToken')
    expect(image2).toContain('IMAGE_TASK_FORBIDDEN')
    expect(image2).toContain('requestId=')
    expect(image2).not.toContain('return "当前账号暂时无法提交图片生成，请刷新页面后重试；若仍失败，请重新登录。"')
  })

  it('returns handled async Image 2 task failures as task results instead of API 5xx noise', () => {
    const route = read('app/api/dify-chat/route.ts')
    const timeoutIndex = route.indexOf('code: "IMAGE_TASK_POLL_TIMEOUT"')
    const timeoutBlock = route.slice(Math.max(0, timeoutIndex - 600), timeoutIndex + 800)

    expect(route).toContain('const GPT_IMAGE_ASYNC_TASK_MAX_AGE_MS = 30 * 60 * 1000')
    expect(route).toContain('upstreamStatusCode: statusCode')
    expect(route).toContain('code: "IMAGE_TASK_POLL_TIMEOUT"')
    expect(route).not.toContain('{ status: statusCode },')
    expect(timeoutBlock).not.toContain('{ status: 504 },')
  })

  it('reports missing image workflow credentials as service configuration errors', () => {
    const chatRoute = read('app/api/dify-chat/route.ts')
    const uploadRoute = read('app/api/dify-upload/route.ts')

    expect(chatRoute).toContain('const MISSING_DIFY_CREDENTIAL_STATUS = 503')
    expect(chatRoute).toContain('code: "DIFY_CREDENTIAL_MISSING"')
    expect(chatRoute).toContain('function isDifyCredentialInvalidResponse')
    expect(chatRoute).toContain('code: handledErrorCode')
    expect(chatRoute).toContain('DIFY_CREDENTIAL_INVALID')
    expect(chatRoute).toContain('请在生产环境变量中配置')
    expect(uploadRoute).toContain('code: "DIFY_UPLOAD_CREDENTIAL_MISSING"')
    expect(uploadRoute).toContain('status: 503')
  })

  it('does not mislabel Dify credential failures as user login failures in image workspaces', () => {
    const image2 = read('components/chat/gpt-image2-chat-interface.tsx')

    expect(image2).toContain('DIFY_CREDENTIAL_INVALID')
    expect(image2).toContain('图像工作流凭据失效，请管理员更新 Dify 应用 API Key 后重试。')
  })

  it('keeps the standalone image workspace generation request independent from stale chat session ownership', () => {
    const image2 = read('components/chat/gpt-image2-chat-interface.tsx')
    const fetchStart = image2.indexOf('fetch(`${API_BASE}/api/dify-chat`')
    const bodyStart = image2.indexOf('body: JSON.stringify({', fetchStart)
    const bodyEnd = image2.indexOf('}),', bodyStart)
    const requestBody = image2.slice(bodyStart, bodyEnd)

    expect(requestBody).toContain('requestId')
    expect(requestBody).not.toContain('sessionId:')
    expect(requestBody).not.toContain('conversation_id:')
    expect(image2).not.toContain('currentSessionIdRef.current = json.conversation_id')
  })

  it('keeps Image 2 prompt optimization authenticated and server-side', () => {
    const route = read('app/api/image-prompt/optimize/route.ts')
    const client = read('components/chat/gpt-image2-chat-interface.tsx')

    expect(route).toContain('requireUser(request)')
    expect(route).toContain('DIFY_IMAGE_PROMPT_OPTIMIZER_API_KEY')
    expect(route).toContain('/chat-messages')
    expect(route).toContain('/workflows/run')
    expect(route).toContain('Gemini 图像生成')
    expect(client).toContain('model: isGeminiWorkspace ? "gemini-image"')
    expect(client).toContain('/api/image-prompt/optimize')
    expect(client).toContain('自动优化')
    expect(`${route}\n${client}`).not.toContain('app-VLBApoujAy64G9KdvcmZPpHq')
  })

  it('does not trust browser-provided X-User-Id for protected chat APIs', () => {
    const difyChat = read('app/api/dify-chat/route.ts')
    const chatSession = read('app/api/chat-session/route.ts')
    const taskStatus = read('app/api/task-status/route.ts')
    const mediaTaskStatus = read('app/api/media/tasks/[taskId]/route.ts')
    const relaydanceVideo = read('app/api/media/video/relaydance/route.ts')
    const saveMessage = read('app/api/save-message/route.ts')

    expect(difyChat).toContain('requireUser(request)')
    expect(chatSession).toContain('requireUser(request)')
    expect(taskStatus).toContain('requireUser(request)')
    expect(mediaTaskStatus).toContain('requireUser(request)')
    expect(relaydanceVideo).toContain('requireUser(request)')
    expect(saveMessage).toContain('requireUser(request)')
    expect(`${difyChat}\n${chatSession}\n${taskStatus}\n${mediaTaskStatus}\n${relaydanceVideo}\n${saveMessage}`).not.toContain('request.headers.get("X-User-Id")')
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
    const suno = read('app/api/suno/run/route.ts')

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
      read('app/history/page.tsx'),
      read('components/essay-grader.tsx'),
    ].join('\n')

    expect(clients).not.toContain('"X-User-Id"')
    expect(clients).not.toContain("'X-User-Id'")
  })

  it('keeps standalone essay image upload authenticated', () => {
    const source = read('components/essay-grader.tsx')
    const uploadStart = source.indexOf('/api/dify-upload')
    const uploadBlock = source.slice(Math.max(0, uploadStart - 250), uploadStart + 350)
    const route = read('app/api/essay-grade/route.ts')

    expect(source).toContain('getRequiredAuthHeaders')
    expect(uploadBlock).toContain('...(await getRequiredAuthHeaders())')
    expect(uploadBlock).toContain('"X-Model": "essay-correction"')
    expect(source).toContain("readUploadError")
    expect(source).toContain('json.event === "status"')
    expect(route).toContain('const userId = auth.user!.id')
    expect(route).toContain('user: userId')
    expect(route).toContain('export const maxDuration = 300')
    expect(route).toContain('essay-grade-keepalive')
    expect(source).toContain('json.event === "error"')
    expect(route).not.toContain('user: "essay-correction-user"')
    expect(source).not.toContain('essay-correction-user')
    expect(source).toContain('id="essay-image-upload"')
    expect(source).toContain('htmlFor="essay-image-upload"')
    expect(source).toContain('aria-label="上传作文图片"')
    expect(source).toContain('className="sr-only sx-file-input"')
    expect(source).not.toContain('htmlFor="file-upload"')
    expect(source).not.toContain('fileInputRef.current?.click()')
  })

  it('keeps chat agent uploads on the shared verified auth helper', () => {
    const chat = read('components/chat/enhanced-chat-interface.tsx')
    const imageWorkspace = read('components/chat/gpt-image2-chat-interface.tsx')
    const worksheet = read('components/worksheet-diagnosis-app.tsx')
    const checkout = read('app/checkout/[productId]/page.tsx')

    for (const source of [chat, imageWorkspace, worksheet]) {
      expect(source).toContain('getVerifiedAuthHeaders')
      expect(source).toContain('getRequiredAuthHeaders')
      expect(source).toContain('from "@/lib/client-auth"')
      expect(source).not.toContain('async function getVerifiedAuthHeaders(): Promise<Record<string, string>>')
    }

    expect(checkout).toContain('getVerifiedAuthHeaders')
    expect(checkout).toContain('from "@/lib/client-auth"')
    expect(checkout).not.toContain('async function getVerifiedAuthHeaders(): Promise<Record<string, string>>')
  })

  it('routes the legacy analyze page through the live essay grader path', () => {
    const source = read('app/analyze/page.tsx')

    expect(source).toContain('import { EssayGrader } from "@/components/essay-grader"')
    expect(source).toContain('<EssayGrader />')
    expect(source).not.toContain('EssayAnalyzer')
    expect(source).not.toContain('/api/analyze')
  })

  it('keeps daily survey gate actions reachable on mobile viewports', () => {
    const source = read('components/trial/DailySurveyGate.tsx')
    const chat = read('components/chat/enhanced-chat-interface.tsx')
    const essay = read('components/essay-grader.tsx')

    expect(source).toContain('SURVEY_FETCH_TIMEOUT_MS')
    expect(source).toContain('const [loadError, setLoadError]')
    expect(source).toContain('signal: controller.signal')
    expect(source).toContain('重新加载')
    expect(source).toContain('今日问卷加载失败，请稍后重试；你也可以先点“稍后再说”退出。')
    expect(source).toContain('h-[calc(100svh-1rem)]')
    expect(source).toContain('flex-1 touch-pan-y')
    expect(source).toContain('overflow-y-auto')
    expect(source).toContain('pb-[max(0.75rem,env(safe-area-inset-bottom))]')
    expect(source).toContain('grid shrink-0 grid-cols-2')
    expect(chat).toContain('const openedSurveyGate = await openTrialSurveyGate')
    expect(chat).toContain('setSurveyGateOpen(openedSurveyGate)')
    expect(essay).toContain('const openedSurveyGate = await openTrialSurveyGate')
    expect(essay).toContain('setSurveyGateOpen(openedSurveyGate)')
  })

  it('keeps the global daily survey prompt behind runtime stop-loss flags', () => {
    const source = read('components/trial/DailySurveyAutoPrompt.tsx')

    expect(source).toContain('loaded: false')
    expect(source).toContain('SESSION_REFRESH_TIMEOUT_MS')
    expect(source).toContain('fetchWithTimeout')
    expect(source).toContain('consumptionEnabled: false')
    expect(source).toContain('autoPromptEnabled: false')
    expect(source).toContain('today_survey_refresh_failed')
    expect(source).toContain('setSurveyOpen(false)')
    expect(source).toContain('const surveyGateEnabled = runtimeFlags.loaded')
    expect(source).toContain('&& runtimeFlags.consumptionEnabled')
    expect(source).toContain('&& runtimeFlags.autoPromptEnabled')
    expect(source).toContain('enabled={surveyGateEnabled}')
    expect(source).toContain('runtimeFlags.loaded && runtimeFlags.campaignEnabled && runtimeFlags.consumptionEnabled && announcementOpen')
  })

  it('lets Bearer requests reach route-level verified auth instead of Supabase-only middleware', () => {
    const middleware = read('lib/supabase/middleware.ts')

    expect(middleware).toContain('if (!user && bearerToken)')
    expect(middleware).toContain('return supabaseResponse')
    expect(middleware).toContain('Authing Bearer tokens are verified inside route handlers by requireUser()')
    expect(middleware).not.toContain('request.headers.get("X-User-Id")')
  })

  it('keeps Suno base and token deductions in unified billing audit metadata', () => {
    const source = `${read('app/api/suno/run/route.ts')}\n${read('lib/suno-billing.ts')}`
    expect(source).toContain('createBillingAuditMetadata')
    expect(source).toContain('feature: "suno"')
    expect(source).toContain('usageSource: "fixed"')
    expect(source).toContain('actionType: "suno_llm_token"')
  })
})
