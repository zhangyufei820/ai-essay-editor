/**
 * 🔥 前端成本计算器（基于网站实际扣分规则）
 * 
 * 扣分规则：
 * - 智能体（standard, teaching-pro）：10 积分/1K Token
 * - 独立模型（gpt-5, claude-opus, gemini-pro）：20 积分/1K Token
 * - Banana 2 Pro：Token 成本 + 图像成本（仅生成图像时）
 * - Suno V5：固定成本 + Token 成本
 * 
 * 前端计算基于字符数估算 Token 数：
 * - 中文：1 字符 ≈ 1.5 Token
 * - 英文：1 字符 ≈ 0.25 Token
 * - 平均：1 字符 ≈ 0.5 Token
 */

import { ModelType, MODEL_COSTS, AGENT_TOKEN_RATE, STANDALONE_TOKEN_RATE } from "@/lib/pricing"

export interface CostCalculationInput {
  modelType: ModelType
  inputText: string
  outputText: string
  hasGeneratedImage?: boolean
}

export interface CostCalculationResult {
  estimatedTokens: number
  estimatedCost: number
  breakdown: string
}

/**
 * 估算文本的 Token 数
 * 中文：1 字符 ≈ 1.5 Token
 * 英文：1 字符 ≈ 0.25 Token
 * 平均：1 字符 ≈ 0.5 Token
 */
function estimateTokens(text: string): number {
  if (!text) return 0
  
  // 简单估算：中文字符较多时按 1.5 倍计算，英文较多时按 0.25 倍计算
  const chineseRegex = /[\u4E00-\u9FFF]/g
  const chineseCount = (text.match(chineseRegex) || []).length
  const englishCount = text.length - chineseCount
  
  // 中文：1 字符 = 1.5 Token，英文：1 字符 = 0.25 Token
  const tokens = Math.ceil(chineseCount * 1.5 + englishCount * 0.25)
  
  return Math.max(tokens, 1)
}

/**
 * 根据模型类型获取 Token 单价
 */
function getTokenRate(modelType: ModelType): number {
  const config = MODEL_COSTS[modelType]
  
  if (!config) return AGENT_TOKEN_RATE
  
  // 智能体：10 积分/1K Token
  if (config.category === "agent") {
    return AGENT_TOKEN_RATE
  }
  
  // 独立模型和多媒体：20 积分/1K Token
  return STANDALONE_TOKEN_RATE
}

/**
 * 🔥 前端计算成本（基于网站实际规则）
 */
export function calculateFrontendCost(input: CostCalculationInput): CostCalculationResult {
  const { modelType, inputText, outputText, hasGeneratedImage = false } = input
  
  // 估算 Token 数
  const inputTokens = estimateTokens(inputText)
  const outputTokens = estimateTokens(outputText)
  const totalTokens = inputTokens + outputTokens
  
  // 获取 Token 单价
  const tokenRate = getTokenRate(modelType)
  
  // 计算基础成本（Token 成本）
  let estimatedCost = Math.ceil((totalTokens / 1000) * tokenRate)
  
  // 特殊处理：Banana 2 Pro（如果生成了图像，加上图像成本）
  if (modelType === "banana-2-pro" && hasGeneratedImage) {
    const imageCost = MODEL_COSTS[modelType]?.fixedCost || 80
    const totalCost = estimatedCost + imageCost
    estimatedCost = Math.ceil(totalCost * 1.1)  // 加 10% 利润
    
    console.log(`🎨 [Banana 前端计算] Token: ${totalTokens} → ${Math.ceil((totalTokens / 1000) * tokenRate)}积分 + 图像: ${imageCost}积分 = ${totalCost}积分 × 1.1 = ${estimatedCost}积分`)
  } else if (modelType === "banana-2-pro") {
    // 仅对话，不生成图像
    console.log(`💬 [Banana 前端计算] 仅对话 Token: ${totalTokens} → ${estimatedCost}积分（无图像生成）`)
  }
  
  // 特殊处理：Suno V5（固定成本 + Token 成本）
  if (modelType === "suno-v5") {
    const fixedCost = MODEL_COSTS[modelType]?.fixedCost || 80
    const tokenCost = Math.ceil((totalTokens / 1000) * tokenRate)
    const totalCost = fixedCost + tokenCost
    estimatedCost = Math.ceil(totalCost * 1.2)  // 加 20% 利润
    
    console.log(`🎵 [Suno 前端计算] 固定成本: ${fixedCost}积分 + Token(${totalTokens}): ${tokenCost}积分 = ${totalCost}积分 × 1.2 = ${estimatedCost}积分`)
  }
  
  // 最低消费 5 积分
  estimatedCost = Math.max(estimatedCost, 5)
  
  const breakdown = `
Token 估算: ${totalTokens} (输入: ${inputTokens} + 输出: ${outputTokens})
单价: ${tokenRate} 积分/1K Token
基础成本: ${Math.ceil((totalTokens / 1000) * tokenRate)} 积分
${hasGeneratedImage ? `图像成本: ${MODEL_COSTS[modelType]?.fixedCost || 80} 积分` : ''}
总成本: ${estimatedCost} 积分
  `.trim()
  
  console.log(`💰 [前端成本计算] 模型: ${modelType}\n${breakdown}`)
  
  return { estimatedTokens: totalTokens, estimatedCost, breakdown }
}

/**
 * 生成成本摘要（用于前端显示）
 */
export function generateCostSummary(result: CostCalculationResult): string {
  return `本次对话预计消耗 ${result.estimatedCost} 积分`
}
