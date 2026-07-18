package service

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMonthlyCardAllowedModelsMatchSubscriptionWhitelist(t *testing.T) {
	allowed := MonthlyCardAllowedModels()
	removedModel := "gpt-5.4-" + "pro"

	require.Contains(t, allowed, "gpt-5.5")
	require.Contains(t, allowed, "gpt-5.4")
	require.Contains(t, allowed, "gpt-5.4-mini")
	require.Contains(t, allowed, "image 2电商商品图快速通道(1.5K)")
	require.NotContains(t, allowed, removedModel)
	require.NotContains(t, allowed, "gpt-image-2")
	require.NotContains(t, allowed, "gpt-image-2-4K")
	require.NotContains(t, allowed, "claude-opus-4-6")
	require.NotContains(t, allowed, "seedance-2.0-cl-mini")
	require.NotContains(t, allowed, "gpt-5.3-codex-spark")
	require.NotContains(t, allowed, "gpt-5.3-spark")
	require.Contains(t, allowed, "gpt-5.6-luna")
	require.Contains(t, allowed, "gpt-5.6-terra")
	require.Contains(t, allowed, "gpt-5.6-sol")
	require.Contains(t, allowed, "gpt-5.5-openai-compact")
	require.Contains(t, allowed, "codex-auto-review")

	for _, modelName := range allowed {
		require.True(t, MonthlyCardChannelSupportsModel(modelName), "monthly card should support %s", modelName)
	}
}

func TestMonthlyCardChannelSupportsModelNormalizesCaseAndSpace(t *testing.T) {
	require.True(t, MonthlyCardChannelSupportsModel(" image 2电商商品图快速通道(1.5K) "))
	require.False(t, MonthlyCardChannelSupportsModel(" gpt-image-2-4k "))
}

func TestMonthlyCardChannelRejectsClaudeModels(t *testing.T) {
	require.False(t, MonthlyCardChannelSupportsModel("claude-opus-4-6"))
	require.False(t, canUseSubscriptionFundingForModel(true, false, "claude-opus-4-6"))
	require.True(t, canUseSubscriptionFundingForModel(true, true, "claude-opus-4-6"))
	require.True(t, LegacyMonthlyCardClaudeSupportsModel(" claude-sonnet-5 "))
	require.False(t, LegacyMonthlyCardClaudeSupportsModel("grok-4.5"))
}

func TestSubscriptionFundingModelGuardOnlyAppliesToMonthlyCardUsers(t *testing.T) {
	require.True(t, canUseSubscriptionFundingForModel(false, false, "claude-opus-4-6"))
	require.True(t, canUseSubscriptionFundingForModel(true, false, "gpt-5.5"))
	require.True(t, canUseSubscriptionFundingForModel(true, false, "gpt-5.6-luna"))
	require.True(t, canUseSubscriptionFundingForModel(true, false, "gpt-5.6-terra"))
	require.True(t, canUseSubscriptionFundingForModel(true, false, "gpt-5.6-sol"))
	require.True(t, canUseSubscriptionFundingForModel(true, false, "image 2电商商品图快速通道(1.5K)"))
	require.False(t, canUseSubscriptionFundingForModel(true, false, "claude-opus-4-6"))
	require.False(t, canUseSubscriptionFundingForModel(true, true, "seedance-2.0-cl-mini"))
}

func TestMonthlyCardAllowedModelsReturnsCopy(t *testing.T) {
	models := MonthlyCardAllowedModels()
	require.NotEmpty(t, models)

	models[0] = "claude-opus-4-6"

	require.False(t, MonthlyCardChannelSupportsModel("claude-opus-4-6"))
	require.NotEqual(t, "claude-opus-4-6", MonthlyCardAllowedModels()[0])
}
