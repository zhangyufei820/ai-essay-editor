import {
  ASSUMED_PROVIDER_INPUT_VCOINS_PER_1M,
  ASSUMED_PROVIDER_OUTPUT_VCOINS_PER_1M,
  INPUT_TOKEN_RATE,
  MIN_TEXT_CHARGE,
  MODEL_COSTS,
  OUTPUT_TOKEN_RATE,
  PRICING_VERSION,
  appendTextOutputLimitInstruction,
  buildTextOutputLimitInstruction,
  calculateActualCost,
  calculatePreviewCost,
  calculateTextUsageCost,
  getMaxOutputTokensForModel,
  getMediaBillingConfig,
  getMinimumRequiredCredits,
  IMAGE_1_5_CREDITS,
  IMAGE_1_CREDITS,
  IMAGE_1_MINI_CREDITS,
  IMAGE2_CREDITS,
  GEMINI_IMAGE_CREDITS,
  SUNO_BASE_CREDITS,
  pricingVersion,
  shouldAuditHighConsumptionTextCall,
  type ModelType,
} from '../lib/pricing'
import {
  calculateImageCredits,
  calculateSunoCredits,
  calculateTextCredits,
  checkMinimumBalance,
  estimateTokensFromText,
  parseDifyUsage,
} from '../lib/billing'

describe('统一计费配置', () => {
  it('uses split input/output token billing for every text model', () => {
    expect(INPUT_TOKEN_RATE).toBe(5)
    expect(OUTPUT_TOKEN_RATE).toBe(20)
    expect(MIN_TEXT_CHARGE).toBe(5)

    const textModels: ModelType[] = ['standard', 'teaching-pro', 'gpt-5', 'claude-opus', 'gemini-pro', 'open-claw']
    textModels.forEach((model) => {
      expect(MODEL_COSTS[model].category).toBe('text')
      expect(calculateActualCost(model, { inputTokens: 1000, outputTokens: 1000 }, { hasOutputContent: true })).toBe(25)
    })
  })

  it('keeps provider cost assumptions for audit without affecting user billing', () => {
    expect(ASSUMED_PROVIDER_INPUT_VCOINS_PER_1M).toBe(30)
    expect(ASSUMED_PROVIDER_OUTPUT_VCOINS_PER_1M).toBe(150)
    expect(PRICING_VERSION).toMatch(/^text-split-v\d{4}-\d{2}-\d{2}$/)
    expect(pricingVersion).toBe(PRICING_VERSION)

    expect(calculateTextUsageCost(
      { inputTokens: 1000, outputTokens: 1000 },
      { hasOutputContent: true },
    )).toBe(25)
  })

  it('parses Dify usage without trusting zero price fields', () => {
    const parsed = parseDifyUsage({
      text: '生成完成',
      reasoning_content: '',
      usage: {
        completion_price: '0',
        completion_tokens: 88,
        currency: 'USD',
        latency: 2.874,
        prompt_price: '0',
        prompt_tokens: 669,
        time_to_first_token: 2.003,
        total_price: '0',
        total_tokens: 757,
      },
      finish_reason: 'stop',
    })

    expect(parsed).toMatchObject({
      promptTokens: 669,
      completionTokens: 88,
      totalTokens: 757,
      hasOutput: true,
      estimated: false,
      finishReason: 'stop',
      latency: 2.874,
      timeToFirstToken: 2.003,
    })
    expect(parsed.rawUsage?.total_price).toBe('0')
  })

  it('calculates text credits from prompt and completion tokens, never price fields', () => {
    expect(calculateTextCredits({
      promptTokens: 669,
      completionTokens: 88,
      totalTokens: 757,
      outputText: '生成完成',
      rawUsage: { total_price: '0', prompt_price: '0', completion_price: '0' },
    })).toBe(6)
  })

  it('uses total tokens only as an estimated fallback when split token counts are unavailable', () => {
    const parsed = parseDifyUsage({
      answer: 'fallback text',
      metadata: {
        usage: {
          total_tokens: 757,
          total_price: '0',
        },
      },
      finish_reason: 'stop',
    })

    expect(parsed).toMatchObject({
      promptTokens: 0,
      completionTokens: 757,
      totalTokens: 757,
      hasOutput: true,
      estimated: true,
      usageSource: 'fallback_total_as_output',
    })
    expect(calculateTextCredits(parsed)).toBe(16)
  })

  it('fills missing completion tokens from total minus prompt tokens', () => {
    const parsed = parseDifyUsage({
      answer: 'partial usage',
      usage: {
        prompt_tokens: 600,
        total_tokens: 900,
      },
    })

    expect(parsed).toMatchObject({
      promptTokens: 600,
      completionTokens: 300,
      totalTokens: 900,
      estimated: true,
      usageSource: 'derived_completion_from_total',
    })
    expect(calculateTextCredits(parsed)).toBe(9)
  })

  it('fills missing prompt tokens from total minus completion tokens', () => {
    const parsed = parseDifyUsage({
      answer: 'partial usage',
      usage: {
        completion_tokens: 300,
        total_tokens: 900,
      },
    })

    expect(parsed).toMatchObject({
      promptTokens: 600,
      completionTokens: 300,
      totalTokens: 900,
      estimated: true,
      usageSource: 'derived_prompt_from_total',
    })
    expect(calculateTextCredits(parsed)).toBe(9)
  })

  it('estimates output tokens from text when usage is missing', () => {
    const parsed = parseDifyUsage({
      text: '这是一个没有 usage 的返回，但包含实际输出内容。',
    })

    expect(parsed.promptTokens).toBe(0)
    expect(parsed.completionTokens).toBeGreaterThan(0)
    expect(parsed).toMatchObject({
      totalTokens: parsed.completionTokens,
      hasOutput: true,
      estimated: true,
      usageSource: 'estimated_from_output_text',
    })
    expect(calculateTextCredits(parsed)).toBe(5)
  })

  it('does not charge empty outputs or reasoning-only metadata separately', () => {
    expect(parseDifyUsage({
      text: '',
      reasoning_content: '',
      usage: { prompt_tokens: 669, completion_tokens: 0, total_tokens: 669 },
    })).toMatchObject({
      hasOutput: false,
      usageSource: 'no_output',
    })

    expect(calculateTextCredits({
      promptTokens: 669,
      completionTokens: 0,
      totalTokens: 669,
      outputText: '',
      usageSource: 'no_output',
    })).toBe(0)

    expect(calculateTextCredits({
      promptTokens: 669,
      completionTokens: 0,
      totalTokens: 669,
      outputText: '',
      reasoningContent: 'internal reasoning trace',
      usageSource: 'no_output',
    })).toBe(0)
  })

  it('charges total_tokens alone as output tokens when output exists', () => {
    expect(calculateTextCredits({
      totalTokens: 3000,
      outputText: 'fallback text',
    })).toBe(60)
    expect(calculateTextUsageCost({ totalTokens: 3000 }, { hasOutputContent: true })).toBe(60)
    expect(calculateActualCost('standard', { totalTokens: 3000 }, { hasOutputContent: true })).toBe(60)
  })

  it('estimates direct text credits from output text when token usage is unavailable', () => {
    expect(calculateTextCredits({
      outputText: '这是一个没有 token usage 的直接扣费调用。',
    })).toBe(5)
  })

  it('applies the 5 credit minimum only when split token usage and output content exist', () => {
    expect(calculateTextUsageCost({ inputTokens: 10, outputTokens: 0 })).toBe(0)
    expect(calculateTextUsageCost({ inputTokens: 10, outputTokens: 0 }, { hasOutputContent: false })).toBe(0)
    expect(calculateTextUsageCost({ inputTokens: 10, outputTokens: 0 }, { hasOutputContent: true })).toBe(5)
    expect(calculateTextUsageCost({ inputTokens: 0, outputTokens: 10 })).toBe(5)
    expect(calculateTextUsageCost({ inputTokens: 2000, outputTokens: 1000 }, { hasOutputContent: true })).toBe(30)
  })

  it('keeps multimedia fixed charges in the same backend config path', () => {
    expect(IMAGE2_CREDITS).toBe(260)
    expect(IMAGE_1_5_CREDITS).toBe(200)
    expect(IMAGE_1_CREDITS).toBe(150)
    expect(IMAGE_1_MINI_CREDITS).toBe(80)
    expect(GEMINI_IMAGE_CREDITS).toBe(165)
    expect(SUNO_BASE_CREDITS).toBe(100)
    expect(calculateActualCost('gpt-image-2')).toBe(260)
    expect(calculateActualCost('gpt-image-1.5')).toBe(200)
    expect(calculateActualCost('gpt-image-1')).toBe(150)
    expect(calculateActualCost('gpt-image-1-mini')).toBe(80)
    expect(calculateActualCost('gemini-image')).toBe(0)
    expect(calculateActualCost('suno-v5')).toBe(100)
    expect(calculateActualCost('suno-v5', { inputTokens: 1000, outputTokens: 1000 }, { hasOutputContent: true })).toBe(125)
    expect(calculateImageCredits('gpt-image-2', 2)).toBe(520)
    expect(calculateSunoCredits({ inputTokens: 1000, outputTokens: 1000 }, { hasOutputContent: true })).toBe(125)
    expect(getMediaBillingConfig('gpt-image-2')).toMatchObject({
      fixedCredits: 260,
      minimumMembership: 'basic',
      allowlistUserIdsEnv: 'IMAGE2_WHITELIST_USER_IDS',
      allowlistEmailsEnv: 'IMAGE2_WHITELIST_EMAILS',
    })
    expect(getMediaBillingConfig('banana-2-pro')).toMatchObject({
      baseCredits: 150,
      riskMultiplier: 1.1,
      fixedCredits: 165,
    })
    expect(getMediaBillingConfig('gemini-image')).toMatchObject({
      baseCredits: 150,
      riskMultiplier: 1.1,
      fixedCredits: 165,
    })
  })

  it('adds workflow image cost only when an image is generated', () => {
    expect(calculateActualCost('banana-2-pro', { inputTokens: 1000, outputTokens: 1000 }, { hasOutputContent: true })).toBe(25)
    expect(calculateActualCost('banana-2-pro', { inputTokens: 1000, outputTokens: 1000 }, { hasGeneratedImage: true, hasOutputContent: true })).toBe(190)
    expect(calculateActualCost('gemini-image', { inputTokens: 1000, outputTokens: 1000 }, { hasOutputContent: true })).toBe(25)
    expect(calculateActualCost('gemini-image', { inputTokens: 1000, outputTokens: 1000 }, { hasGeneratedImage: true, hasOutputContent: true })).toBe(190)
  })

  it('uses backend minimums for request preflight and preview labels', () => {
    expect(getMinimumRequiredCredits('gpt-5')).toBe(20)
    expect(getMinimumRequiredCredits('standard')).toBe(100)
    expect(getMinimumRequiredCredits('ai-writing-paper')).toBe(100)
    expect(getMinimumRequiredCredits('study-abroad')).toBe(100)
    expect(getMinimumRequiredCredits('gpt-image-2')).toBe(260)
    expect(getMinimumRequiredCredits('gemini-image')).toBe(165)
    expect(getMinimumRequiredCredits('suno-v5')).toBe(100)
    expect(calculatePreviewCost('standard')).toBeGreaterThanOrEqual(5)
    expect(calculatePreviewCost('gpt-image-2')).toBe(260)
    expect(calculatePreviewCost('gemini-image')).toBe(165)
    expect(checkMinimumBalance(19, 'gpt-5')).toMatchObject({ ok: false, requiredCredits: 20, currentCredits: 19 })
    expect(checkMinimumBalance(100, 'standard')).toMatchObject({ ok: true, requiredCredits: 100, currentCredits: 100 })
    expect(estimateTokensFromText('这是一个 token 估算测试')).toBeGreaterThan(0)
  })

  it('configures output limits by text workflow class', () => {
    expect(getMaxOutputTokensForModel('gpt-5')).toBe(4000)
    expect(getMaxOutputTokensForModel('vocab-card')).toBe(3000)
    expect(getMaxOutputTokensForModel('resume-optimize')).toBe(8000)
    expect(getMaxOutputTokensForModel('standard')).toBe(25000)
    expect(getMaxOutputTokensForModel('ai-writing-paper')).toBe(20000)
    expect(getMaxOutputTokensForModel('gpt-image-2')).toBeNull()
  })

  it('does not inject prompt-based output length constraints', () => {
    const constrained = appendTextOutputLimitInstruction('请批改作文', 'standard')
    expect(constrained).toBe('请批改作文')
    expect(constrained).not.toContain('[输出长度约束]')
    expect(buildTextOutputLimitInstruction('standard')).toBe('')
    expect(appendTextOutputLimitInstruction('画一张图', 'gpt-image-2')).toBe('画一张图')
  })

  it('flags high-consumption text calls for audit', () => {
    expect(shouldAuditHighConsumptionTextCall('standard', 24000, 485)).toBe(true)
    expect(shouldAuditHighConsumptionTextCall('gpt-5', 1000, 25)).toBe(false)
    expect(shouldAuditHighConsumptionTextCall('gpt-image-2', 30000, 600)).toBe(false)
  })
})
