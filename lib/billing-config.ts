export type ProductType = "membership" | "credits" | "enterprise"
export type BillingCycle = "monthly" | "annual"
export type MembershipTier = "basic" | "pro" | "premium" | "enterprise" | "campus"

export type ProductCatalogItem = {
  id: string
  name: string
  description: string
  priceInCents: number
  credits: number
  features: string[]
  popular?: boolean
  requiresMembership?: boolean
  allowedMemberships?: MembershipTier[]
  purchasable?: boolean
  productType: ProductType
}

export type TextTokenBillingConfig = {
  inputCreditsPer1K: number
  outputCreditsPer1K: number
  minimumCredits: number
  minimumRequiredCredits: number
  longOutputMinimumRequiredCredits: number
  assumedProviderInputVcoinsPer1M: number
  assumedProviderOutputVcoinsPer1M: number
}

export type MediaBillingItem = {
  fixedCredits: number
  baseCredits?: number
  riskMultiplier?: number
  minimumMembership?: MembershipTier
  allowlistUserIdsEnv?: string
  allowlistEmailsEnv?: string
}

export const TEXT_INPUT_CREDITS_PER_1K = 5
export const TEXT_OUTPUT_CREDITS_PER_1K = 20
export const TEXT_MIN_CHARGE_CREDITS = 5
export const TEXT_MIN_REQUIRED_CREDITS = 20
export const LONG_TEXT_MIN_REQUIRED_CREDITS = 100

export const ASSUMED_PROVIDER_INPUT_VCOINS_PER_1M = 30
export const ASSUMED_PROVIDER_OUTPUT_VCOINS_PER_1M = 150
export const PRICING_VERSION = "text-split-v2026-05-03"

export const TEXT_WORKFLOW_MIN_REQUIRED_CREDITS = {
  default_text: TEXT_MIN_REQUIRED_CREDITS,
  short_agent: TEXT_MIN_REQUIRED_CREDITS,
  essay_correction: LONG_TEXT_MIN_REQUIRED_CREDITS,
  long_writing: LONG_TEXT_MIN_REQUIRED_CREDITS,
  suno: 100,
} as const

export const TEXT_WORKFLOW_MAX_OUTPUT_TOKENS = {
  default_text: 4000,
  short_agent: 3000,
  ordinary_writing: 8000,
  essay_correction: 25000,
  long_writing: 20000,
} as const

export const HIGH_CONSUMPTION_TEXT_OUTPUT_TOKENS = 12000
export const HIGH_CONSUMPTION_TEXT_CREDITS = 500

export const IMAGE2_CREDITS = 260
export const GPT_IMAGE_15_CREDITS = 200
export const GPT_IMAGE_1_CREDITS = 150
export const GPT_IMAGE_1_MINI_CREDITS = 80
export const BANANA2_PRO_IMAGE_BASE_CREDITS = 150
export const BANANA2_PRO_IMAGE_RISK_MULTIPLIER = 1.1
export const BANANA2_PRO_IMAGE_CREDITS = Math.ceil(BANANA2_PRO_IMAGE_BASE_CREDITS * BANANA2_PRO_IMAGE_RISK_MULTIPLIER)
export const GEMINI_IMAGE_CREDITS = BANANA2_PRO_IMAGE_CREDITS
export const SUNO_BASE_CREDITS = 100
export const WORKSHEET_DIAGNOSIS_MAX_IMAGES = 6
export const WORKSHEET_DIAGNOSIS_BASE_CREDITS = 80
export const WORKSHEET_DIAGNOSIS_EXTRA_IMAGE_CREDITS = 30
export const WORKSHEET_REPORT_IMAGE_CREDITS = IMAGE2_CREDITS
export const WORKSHEET_REPORT_REGENERATE_CREDITS = 160

export function calculateWorksheetDiagnosisCredits(imageCount: number): number {
  const safeCount = Math.min(
    WORKSHEET_DIAGNOSIS_MAX_IMAGES,
    Math.max(1, Math.floor(Number(imageCount) || 1)),
  )
  return WORKSHEET_DIAGNOSIS_BASE_CREDITS + Math.max(0, safeCount - 1) * WORKSHEET_DIAGNOSIS_EXTRA_IMAGE_CREDITS
}

export const BILLING_CONFIG = {
  pricingVersion: PRICING_VERSION,
  annualMembershipDiscount: 0.8,
  textToken: {
    inputCreditsPer1K: TEXT_INPUT_CREDITS_PER_1K,
    outputCreditsPer1K: TEXT_OUTPUT_CREDITS_PER_1K,
    minimumCredits: TEXT_MIN_CHARGE_CREDITS,
    minimumRequiredCredits: TEXT_MIN_REQUIRED_CREDITS,
    longOutputMinimumRequiredCredits: LONG_TEXT_MIN_REQUIRED_CREDITS,
    assumedProviderInputVcoinsPer1M: ASSUMED_PROVIDER_INPUT_VCOINS_PER_1M,
    assumedProviderOutputVcoinsPer1M: ASSUMED_PROVIDER_OUTPUT_VCOINS_PER_1M,
  } satisfies TextTokenBillingConfig,
  products: [
    {
      id: "basic",
      name: "基础版",
      description: "适合入门体验",
      priceInCents: 2800,
      credits: 2000,
      features: ["每月 2,000 积分", "统一文本计费", "标准生成速度", "社区支持", "可调用专业学习工具"],
      productType: "membership",
    },
    {
      id: "pro",
      name: "专业版",
      description: "适合高频学生",
      priceInCents: 6800,
      credits: 5000,
      features: ["每月 5,000 积分", "统一文本计费", "优先生成速度", "高级润色工具", "可调用专业学习工具"],
      popular: true,
      productType: "membership",
    },
    {
      id: "premium",
      name: "豪华版",
      description: "适合重度用户/教育者",
      priceInCents: 12800,
      credits: 12000,
      features: ["每月 12,000 积分", "统一文本计费", "最高优先速度", "高级润色工具", "可调用专业学习工具"],
      productType: "membership",
    },
    {
      id: "credits-500",
      name: "500 积分充值包",
      description: "永久有效，订阅用户可买",
      priceInCents: 500,
      credits: 500,
      features: ["500 积分", "永久有效", "可用于 AI 生成与学习服务", "订阅用户可买"],
      requiresMembership: true,
      productType: "credits",
    },
    {
      id: "credits-1000",
      name: "1000 积分充值包",
      description: "永久有效，订阅用户可买",
      priceInCents: 1000,
      credits: 1000,
      features: ["1000 积分", "永久有效", "可用于 AI 生成与学习服务", "订阅用户可买"],
      requiresMembership: true,
      productType: "credits",
    },
    {
      id: "credits-5000",
      name: "5000 积分充值包",
      description: "永久有效，专业版及以上可买",
      priceInCents: 4800,
      credits: 5000,
      features: ["5000 积分", "永久有效", "可用于 AI 生成与学习服务", "仅限专业版及以上购买"],
      requiresMembership: true,
      allowedMemberships: ["pro", "premium", "enterprise", "campus"],
      productType: "credits",
    },
    {
      id: "credits-10000",
      name: "10000 积分充值包",
      description: "永久有效，豪华版及以上可买",
      priceInCents: 10800,
      credits: 10000,
      features: ["10000 积分", "永久有效", "可用于 AI 生成与学习服务", "仅限豪华版及以上购买"],
      requiresMembership: true,
      allowedMemberships: ["premium", "enterprise", "campus"],
      productType: "credits",
    },
    {
      id: "enterprise",
      name: "企业版",
      description: "按需定价，联系商务，定制权益",
      priceInCents: 0,
      credits: 0,
      features: ["定制积分额度", "组织管理", "专属支持", "可配置专属工作流"],
      productType: "enterprise",
      purchasable: false,
    },
    {
      id: "campus",
      name: "校园版",
      description: "按需定价，联系商务，定制权益",
      priceInCents: 0,
      credits: 0,
      features: ["校园批量授权", "班级/教师场景支持", "定制权益", "专属支持"],
      productType: "enterprise",
      purchasable: false,
    },
  ] satisfies ProductCatalogItem[],
  media: {
    "banana-2-pro": {
      fixedCredits: BANANA2_PRO_IMAGE_CREDITS,
      baseCredits: BANANA2_PRO_IMAGE_BASE_CREDITS,
      riskMultiplier: BANANA2_PRO_IMAGE_RISK_MULTIPLIER,
    },
    "gemini-image": {
      fixedCredits: GEMINI_IMAGE_CREDITS,
      baseCredits: BANANA2_PRO_IMAGE_BASE_CREDITS,
      riskMultiplier: BANANA2_PRO_IMAGE_RISK_MULTIPLIER,
    },
    "gpt-image-2": {
      fixedCredits: IMAGE2_CREDITS,
      minimumMembership: "basic",
      allowlistUserIdsEnv: "IMAGE2_WHITELIST_USER_IDS",
      allowlistEmailsEnv: "IMAGE2_WHITELIST_EMAILS",
    },
    "gpt-image-1.5": { fixedCredits: GPT_IMAGE_15_CREDITS },
    "gpt-image-1": { fixedCredits: GPT_IMAGE_1_CREDITS },
    "gpt-image-1-mini": { fixedCredits: GPT_IMAGE_1_MINI_CREDITS },
    "suno-v5": { fixedCredits: SUNO_BASE_CREDITS },
  } satisfies Record<string, MediaBillingItem>,
} as const

export const PRODUCT_CATALOG = BILLING_CONFIG.products
export const TEXT_TOKEN_BILLING = BILLING_CONFIG.textToken
export const MEDIA_BILLING = BILLING_CONFIG.media

export function getCatalogProduct(productId: string): ProductCatalogItem | undefined {
  return PRODUCT_CATALOG.find((product) => product.id === productId)
}

export function getCatalogPriceInCents(productId: string, billing: string = "monthly"): number | null {
  const product = getCatalogProduct(productId)
  if (!product) return null
  if (product.purchasable === false) return null
  if (billing === "annual" && product.productType === "membership") {
    return Math.round(product.priceInCents * 12 * BILLING_CONFIG.annualMembershipDiscount)
  }
  return product.priceInCents
}

export function getCatalogCredits(productId: string): number {
  return getCatalogProduct(productId)?.credits || 0
}

export function isCatalogMembershipProduct(productId: string): boolean {
  return getCatalogProduct(productId)?.productType === "membership"
}

export function isCatalogCreditsProduct(productId: string): boolean {
  return getCatalogProduct(productId)?.productType === "credits"
}
