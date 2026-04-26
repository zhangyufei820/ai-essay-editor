/**
 * lib/pricing.ts 单元测试 v2.0
 * 
 * 计费规则：
 * - 智能体（standard, teaching-pro）：10 积分/1K Token
 * - 独立模型（gpt-5, claude-opus, gemini-pro）：20 积分/1K Token
 * - 多媒体模型：按次固定扣费（成本/0.4）
 */

import {
  calculatePreviewCost,
  calculateActualCost,
  MODEL_COSTS,
  PROFIT_MARGIN,
  ModelType,
  DAILY_FREE_LIMIT,
  LUXURY_THRESHOLD,
  LUXURY_CREDITS,
  AGENT_TOKEN_RATE,
  STANDALONE_TOKEN_RATE,
  getModelDisplayName,
  getModelMode,
  getModelCategory,
  getTokenRate,
  validateProfitMargin,
} from '../lib/pricing'

describe('lib/pricing.ts v2.0 - 计费公式测试', () => {
  
  // ============================================
  // 1. Token 单价配置测试
  // ============================================
  describe('Token 单价配置', () => {
    test('智能体 Token 单价应为 10 积分/1K Token', () => {
      expect(AGENT_TOKEN_RATE).toBe(10)
    })

    test('独立模型 Token 单价应为 20 积分/1K Token', () => {
      expect(STANDALONE_TOKEN_RATE).toBe(20)
    })

    test('利润率系数应为 0.4（成本占比 40%）', () => {
      expect(PROFIT_MARGIN).toBe(0.4)
    })
  })

  // ============================================
  // 2. 模型配置测试
  // ============================================
  describe('模型配置', () => {
    const allModels: ModelType[] = [
      'standard', 'teaching-pro', 'gpt-5', 'claude-opus', 'gemini-pro',
      'banana-2-pro', 'gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini',
      'suno-v5', 'grok-4.2', 'open-claw'
    ]

    test.each(allModels)('模型 %s 应有有效的配置', (model) => {
      const config = MODEL_COSTS[model]
      expect(config).toBeDefined()
      expect(config.displayName).toBeTruthy()
      expect(['text', 'image', 'music', 'video']).toContain(config.mode)
      expect(['agent', 'standalone', 'media']).toContain(config.category)
    })

    test('智能体模型应有正确的 tokenRate', () => {
      const agents: ModelType[] = ['standard', 'teaching-pro']
      agents.forEach(model => {
        const config = MODEL_COSTS[model]
        expect(config.category).toBe('agent')
        expect(config.tokenRate).toBe(AGENT_TOKEN_RATE)
      })
    })

    test('独立模型应有正确的 tokenRate', () => {
      const standalones: ModelType[] = ['gpt-5', 'claude-opus', 'gemini-pro', 'grok-4.2', 'open-claw']
      standalones.forEach(model => {
        const config = MODEL_COSTS[model]
        expect(config.category).toBe('standalone')
        expect(config.tokenRate).toBe(STANDALONE_TOKEN_RATE)
      })
    })

    test('多媒体模型应有 fixedCost', () => {
      const mediaModels: ModelType[] = ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini', 'suno-v5']
      mediaModels.forEach(model => {
        const config = MODEL_COSTS[model]
        expect(config.category).toBe('media')
        expect(config.fixedCost).toBeGreaterThan(0)
      })
    })
  })

  // ============================================
  // 3. calculatePreviewCost 测试（前端预估）
  // ============================================
  describe('calculatePreviewCost - 前端预估消耗', () => {
    
    test('standard 智能体：预估 2K tokens → 20 积分', () => {
      const cost = calculatePreviewCost('standard')
      // 2000 tokens / 1000 * 10 = 20
      expect(cost).toBe(20)
    })

    test('teaching-pro 智能体：预估 2.5K tokens → 25 积分', () => {
      const cost = calculatePreviewCost('teaching-pro')
      // 2500 tokens / 1000 * 10 = 25
      expect(cost).toBe(25)
    })

    test('gpt-5 独立模型：预估 1.5K tokens → 30 积分', () => {
      const cost = calculatePreviewCost('gpt-5')
      // 1500 tokens / 1000 * 20 = 30
      expect(cost).toBe(30)
    })

    test('claude-opus 独立模型：预估 2K tokens → 40 积分', () => {
      const cost = calculatePreviewCost('claude-opus')
      // 2000 tokens / 1000 * 20 = 40
      expect(cost).toBe(40)
    })

    test('banana-2-pro 图片：预估仅含 LLM 成本', () => {
      const cost = calculatePreviewCost('banana-2-pro')
      expect(cost).toBe(10)
    })

    test('gpt-image-2 图片：固定 200 积分', () => {
      const cost = calculatePreviewCost('gpt-image-2')
      expect(cost).toBe(200)
    })

    test('suno-v5 音乐：固定成本加 token 成本后加 20% 利润', () => {
      const cost = calculatePreviewCost('suno-v5')
      expect(cost).toBe(102)
    })

    test('自定义输入 Token 数量', () => {
      const cost = calculatePreviewCost('standard', { estimatedInputTokens: 5000 })
      // 5000 tokens / 1000 * 10 = 50
      expect(cost).toBe(50)
    })
  })

  // ============================================
  // 4. calculateActualCost 测试（后端静默扣费）
  // ============================================
  describe('calculateActualCost - 后端静默扣费', () => {
    
    test('智能体 1000 tokens → 10 积分', () => {
      const cost = calculateActualCost('standard', { totalTokens: 1000 })
      // 1000 / 1000 * 10 = 10
      expect(cost).toBe(10)
    })

    test('智能体 2500 tokens → 25 积分', () => {
      const cost = calculateActualCost('teaching-pro', { totalTokens: 2500 })
      // 2500 / 1000 * 10 = 25
      expect(cost).toBe(25)
    })

    test('独立模型 1000 tokens → 20 积分', () => {
      const cost = calculateActualCost('gpt-5', { totalTokens: 1000 })
      // 1000 / 1000 * 20 = 20
      expect(cost).toBe(20)
    })

    test('独立模型 3000 tokens → 60 积分', () => {
      const cost = calculateActualCost('claude-opus', { totalTokens: 3000 })
      // 3000 / 1000 * 20 = 60
      expect(cost).toBe(60)
    })

    test('最低消费 5 积分', () => {
      const cost = calculateActualCost('standard', { totalTokens: 100 })
      // 100 / 1000 * 10 = 1，但最低 5
      expect(cost).toBe(5)
    })

    test('使用 inputTokens + outputTokens', () => {
      const cost = calculateActualCost('gpt-5', { inputTokens: 500, outputTokens: 500 })
      // (500 + 500) / 1000 * 20 = 20
      expect(cost).toBe(20)
    })

    test('无 Token 信息时使用预估值', () => {
      const cost = calculateActualCost('standard')
      // 使用预估 2000 tokens: 2000 / 1000 * 10 = 20
      expect(cost).toBe(20)
    })

    test('多媒体模型固定价格', () => {
      expect(calculateActualCost('gpt-image-2')).toBe(200)
      expect(calculateActualCost('suno-v5')).toBe(102)
    })

    test('banana-2-pro 无图像时仅按 token 计费，生成图像时叠加图像成本', () => {
      expect(calculateActualCost('banana-2-pro')).toBe(10)
      expect(calculateActualCost('banana-2-pro', { totalTokens: 500 }, { hasGeneratedImage: true })).toBe(100)
    })

    test('未知模型返回默认价格 20', () => {
      const cost = calculateActualCost('unknown-model' as ModelType)
      expect(cost).toBe(20)
    })
  })

  // ============================================
  // 5. 辅助函数测试
  // ============================================
  describe('辅助函数', () => {
    test('getModelDisplayName 返回正确的显示名称', () => {
      expect(getModelDisplayName('standard')).toBe('作文批改智能体')
      expect(getModelDisplayName('teaching-pro')).toBe('教学评智能助手')
      expect(getModelDisplayName('gpt-5')).toBe('ChatGPT 5.4')
      expect(getModelDisplayName('claude-opus')).toBe('Claude opus4.6thinking')
      expect(getModelDisplayName('gemini-pro')).toBe('Gemini 3.1 pro')
      expect(getModelDisplayName('grok-4.2')).toBe('Grok-4.2')
      expect(getModelDisplayName('open-claw')).toBe('Open Claw')
    })

    test('getModelMode 返回正确的生成模式', () => {
      expect(getModelMode('standard')).toBe('text')
      expect(getModelMode('banana-2-pro')).toBe('image')
      expect(getModelMode('suno-v5')).toBe('music')
    })

    test('getModelCategory 返回正确的模型类别', () => {
      expect(getModelCategory('standard')).toBe('agent')
      expect(getModelCategory('teaching-pro')).toBe('agent')
      expect(getModelCategory('gpt-5')).toBe('standalone')
      expect(getModelCategory('banana-2-pro')).toBe('standalone')
      expect(getModelCategory('gpt-image-2')).toBe('media')
    })

    test('getTokenRate 返回正确的 Token 单价', () => {
      expect(getTokenRate('standard')).toBe(10)
      expect(getTokenRate('gpt-5')).toBe(20)
      expect(getTokenRate('banana-2-pro')).toBe(20)
      expect(getTokenRate('gpt-image-2')).toBe(0)
    })
  })

  // ============================================
  // 6. 会员配置测试
  // ============================================
  describe('会员配置', () => {
    test('DAILY_FREE_LIMIT 应为 20', () => {
      expect(DAILY_FREE_LIMIT).toBe(20)
    })

    test('LUXURY_THRESHOLD 应为 1000', () => {
      expect(LUXURY_THRESHOLD).toBe(1000)
    })

    test('LUXURY_CREDITS 应为 12000', () => {
      expect(LUXURY_CREDITS).toBe(12000)
    })
  })

  // ============================================
  // 7. 利润验证测试
  // ============================================
  describe('利润验证', () => {
    test('validateProfitMargin 应返回 true（成本 ≤ 40%）', () => {
      const result = validateProfitMargin()
      expect(result).toBe(true)
    })

    test('豪华会员 12000 积分全用于智能体时成本验证', () => {
      // 12000 积分 / 10 积分每1K Token = 1200K Tokens
      // 成本 = 1200K * 4 积分/1K Token = 4800 积分
      // 成本占比 = 4800 / 12000 = 40%
      const totalCredits = LUXURY_CREDITS
      const tokensUsable = (totalCredits / AGENT_TOKEN_RATE) * 1000
      const costPerKToken = AGENT_TOKEN_RATE * PROFIT_MARGIN
      const totalCost = (tokensUsable / 1000) * costPerKToken
      const costRatio = totalCost / totalCredits
      
      expect(costRatio).toBeLessThanOrEqual(0.4)
    })
  })
})
