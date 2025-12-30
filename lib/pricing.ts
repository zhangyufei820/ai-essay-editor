/**
 * 统一计费中心 v2.0
 * 
 * 计费规则：
 * - 智能体（standard, teaching-pro）：10 积分/1K Token
 * - 独立模型（gpt-5, claude-opus, gemini-pro 等）：20 积分/1K Token
 * - 多媒体模型：按次固定扣费（成本/0.4）
 * 
 * 扣费流程：
 * - 前端：显示"预计消耗"（基于估算 Token 数）
 * - 后端：等 Dify 回答完后根据实际 Token 数静默结算
 * 
 * 利润保障：
 * - 豪华会员 12,000 积分全额消耗时，VivaAPI 成本占比 ≤ 40%
 */

// ============================================
// 1. 类型定义
// ============================================

export type ModelType = 
  | "standard" 
  | "teaching-pro"
  | "gpt-5" 
  | "claude-opus" 
  | "gemini-pro" 
  | "banana-2-pro" 
  | "suno-v5" 
  | "sora-2-pro"

export type GenMode = "text" | "image" | "music" | "video"

/** 模型类别：智能体 vs 独立模型 */
export type ModelCategory = "agent" | "standalone" | "media"

interface ModelCostConfig {
  /** 模型类别 */
  category: ModelCategory
  /** Token 单价（积分/1K tokens），仅文本模型有效 */
  tokenRate?: number
  /** 固定成本（用于多媒体模型，单位：积分） */
  fixedCost?: number
  /** 模型显示名称 */
  displayName: string
  /** 生成模式 */
  mode: GenMode
  /** 预估平均 Token 数（用于前端预览） */
  estimatedTokens?: number
}

// ============================================
// 2. 计费配置
// ============================================

/** 智能体 Token 单价：10 积分/1K Token */
export const AGENT_TOKEN_RATE = 10

/** 独立模型 Token 单价：20 积分/1K Token */
export const STANDALONE_TOKEN_RATE = 20

/** 利润率系数（成本占比 40%，利润 60%） */
export const PROFIT_MARGIN = 0.4

/**
 * 各模型配置
 */
export const MODEL_COSTS: Record<ModelType, ModelCostConfig> = {
  // ========== 智能体（10 积分/1K Token）==========
  "standard": { 
    category: "agent",
    tokenRate: AGENT_TOKEN_RATE,
    displayName: "作文批改智能体",
    mode: "text",
    estimatedTokens: 2000  // 预估平均 2K tokens
  },
  "teaching-pro": { 
    category: "agent",
    tokenRate: AGENT_TOKEN_RATE,
    displayName: "教学评智能助手",
    mode: "text",
    estimatedTokens: 2500  // 预估平均 2.5K tokens
  },
  
  // ========== 独立模型（20 积分/1K Token）==========
  "gpt-5": { 
    category: "standalone",
    tokenRate: STANDALONE_TOKEN_RATE,
    displayName: "ChatGPT 5.1",
    mode: "text",
    estimatedTokens: 1500  // 预估平均 1.5K tokens
  },
  "claude-opus": { 
    category: "standalone",
    tokenRate: STANDALONE_TOKEN_RATE,
    displayName: "Claude Opus 4.5",
    mode: "text",
    estimatedTokens: 2000  // 预估平均 2K tokens
  },
  "gemini-pro": { 
    category: "standalone",
    tokenRate: STANDALONE_TOKEN_RATE,
    displayName: "Gemini 3.0 Pro",
    mode: "text",
    estimatedTokens: 1500  // 预估平均 1.5K tokens
  },
  
  // ========== 多媒体模型（按次固定扣费）==========
  "banana-2-pro": { 
    category: "media",
    fixedCost: 50,  // 成本 50 积分 → 用户扣费 125 积分
    displayName: "Banana 2 Pro",
    mode: "image"
  },
  "suno-v5": { 
    category: "media",
    fixedCost: 100, // 成本 100 积分 → 用户扣费 250 积分
    displayName: "Suno V5",
    mode: "music"
  },
  "sora-2-pro": { 
    category: "media",
    fixedCost: 300, // 成本 300 积分 → 用户扣费 750 积分
    displayName: "Sora 2 Pro",
    mode: "video"
  },
}

// ============================================
// 3. 计费函数
// ============================================

/**
 * 计算预估消耗（前端预览用）
 * 
 * @param model - 模型类型
 * @param options - 可选参数
 * @returns 预估积分消耗
 */
export function calculatePreviewCost(
  model: ModelType,
  options?: {
    isLuxury?: boolean
    estimatedInputTokens?: number
  }
): number {
  const config = MODEL_COSTS[model]
  
  if (!config) {
    console.warn(`[Pricing] 未知模型: ${model}，使用默认价格`)
    return 20
  }
  
  // 多媒体模型：固定价格
  if (config.category === "media" && config.fixedCost) {
    return Math.ceil(config.fixedCost / PROFIT_MARGIN)
  }
  
  // 文本模型：基于预估 Token 数计算
  const estimatedTokens = options?.estimatedInputTokens || config.estimatedTokens || 1500
  const tokenRate = config.tokenRate || AGENT_TOKEN_RATE
  
  // 预估消耗 = Token 数 / 1000 * 单价
  const estimatedCost = Math.ceil((estimatedTokens / 1000) * tokenRate)
  
  return estimatedCost
}

/**
 * 计算实际扣费金额（后端静默结算用）
 * 
 * @param model - 模型类型
 * @param tokenUsage - 实际 Token 使用量
 * @returns 应扣积分数
 */
export function calculateActualCost(
  model: ModelType,
  tokenUsage?: {
    totalTokens?: number
    inputTokens?: number
    outputTokens?: number
  }
): number {
  const config = MODEL_COSTS[model]
  
  if (!config) {
    console.warn(`[Pricing] 未知模型: ${model}，使用默认价格`)
    return 20
  }
  
  // 多媒体模型：固定价格
  if (config.category === "media" && config.fixedCost) {
    return Math.ceil(config.fixedCost / PROFIT_MARGIN)
  }
  
  // 文本模型：根据实际 Token 数计费
  const tokenRate = config.tokenRate || AGENT_TOKEN_RATE
  
  // 优先使用 totalTokens，否则使用 input + output
  let totalTokens = tokenUsage?.totalTokens || 0
  if (!totalTokens && tokenUsage) {
    totalTokens = (tokenUsage.inputTokens || 0) + (tokenUsage.outputTokens || 0)
  }
  
  // 如果没有 Token 信息，使用预估值
  if (!totalTokens) {
    totalTokens = config.estimatedTokens || 1500
  }
  
  // 实际消耗 = Token 数 / 1000 * 单价
  const actualCost = Math.ceil((totalTokens / 1000) * tokenRate)
  
  // 最低消费 5 积分
  return Math.max(actualCost, 5)
}

/**
 * 获取模型显示名称
 */
export function getModelDisplayName(model: ModelType): string {
  return MODEL_COSTS[model]?.displayName || model
}

/**
 * 获取模型生成模式
 */
export function getModelMode(model: ModelType): GenMode {
  return MODEL_COSTS[model]?.mode || "text"
}

/**
 * 获取模型类别
 */
export function getModelCategory(model: ModelType): ModelCategory {
  return MODEL_COSTS[model]?.category || "agent"
}

/**
 * 获取模型 Token 单价
 */
export function getTokenRate(model: ModelType): number {
  const config = MODEL_COSTS[model]
  if (!config || config.category === "media") return 0
  return config.tokenRate || AGENT_TOKEN_RATE
}

// ============================================
// 4. 会员配置
// ============================================

/** 非豪华会员每日免费使用高级模型次数 */
export const DAILY_FREE_LIMIT = 20

/** 豪华会员积分阈值（积分超过此值视为豪华会员） */
export const LUXURY_THRESHOLD = 1000

/** 豪华会员套餐积分 */
export const LUXURY_CREDITS = 12000

// ============================================
// 5. 利润验证函数
// ============================================

/**
 * 验证豪华会员积分消耗时的成本占比
 * 
 * 假设豪华会员 12,000 积分全部用于智能体对话：
 * - 用户消耗：12,000 积分
 * - 按 10 积分/1K Token 计算，可使用 1,200K Tokens
 * - VivaAPI 成本（假设 4 积分/1K Token）：4,800 积分
 * - 成本占比：4,800 / 12,000 = 40%
 * 
 * @returns 成本占比是否 ≤ 40%
 */
export function validateProfitMargin(): boolean {
  // 假设 VivaAPI 成本为用户价格的 40%
  const vivaApiCostRate = PROFIT_MARGIN  // 0.4
  
  // 智能体场景
  const agentUserRate = AGENT_TOKEN_RATE  // 10 积分/1K Token
  const agentCostRate = agentUserRate * vivaApiCostRate  // 4 积分/1K Token
  
  // 豪华会员全额消耗
  const totalCredits = LUXURY_CREDITS  // 12,000 积分
  const totalTokens = totalCredits / agentUserRate * 1000  // 1,200,000 Tokens
  const totalCost = (totalTokens / 1000) * agentCostRate  // 4,800 积分
  
  const costRatio = totalCost / totalCredits  // 0.4 = 40%
  
  console.log(`[利润验证] 豪华会员 ${totalCredits} 积分消耗:`)
  console.log(`  - 可使用 Token: ${totalTokens.toLocaleString()}`)
  console.log(`  - VivaAPI 成本: ${totalCost} 积分`)
  console.log(`  - 成本占比: ${(costRatio * 100).toFixed(1)}%`)
  
  return costRatio <= PROFIT_MARGIN
}
