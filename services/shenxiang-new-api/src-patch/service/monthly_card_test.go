package service

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMonthlyCardAllowedModelsMatchSubscriptionWhitelist(t *testing.T) {
	allowed := MonthlyCardAllowedModels()

	require.Contains(t, allowed, "gpt-5.5")
	require.Contains(t, allowed, "gpt-5.4")
	require.Contains(t, allowed, "gpt-5.4-mini")
	require.Contains(t, allowed, "gpt-image-2-4K")
	require.NotContains(t, allowed, "gpt-5.4-pro")
	require.NotContains(t, allowed, "gpt-image-2")
	require.Contains(t, allowed, "gpt-5.3-codex-spark")
	require.Contains(t, allowed, "gpt-5.5-openai-compact")
	require.Contains(t, allowed, "codex-auto-review")

	for _, modelName := range allowed {
		require.True(t, MonthlyCardChannelSupportsModel(modelName), "monthly card should support %s", modelName)
	}
}

func TestMonthlyCardChannelSupportsModelNormalizesCaseAndSpace(t *testing.T) {
	require.True(t, MonthlyCardChannelSupportsModel(" gpt-image-2-4k "))
}

func TestMonthlyCardChannelRejectsClaudeModels(t *testing.T) {
	require.False(t, MonthlyCardChannelSupportsModel("claude-opus-4-6"))
	require.False(t, canUseSubscriptionFundingForModel(true, "claude-opus-4-6"))
}

func TestSubscriptionFundingModelGuardOnlyAppliesToMonthlyCardUsers(t *testing.T) {
	require.True(t, canUseSubscriptionFundingForModel(false, "claude-opus-4-6"))
	require.True(t, canUseSubscriptionFundingForModel(true, "gpt-5.5"))
	require.False(t, canUseSubscriptionFundingForModel(true, "claude-opus-4-6"))
}

func TestMonthlyCardAllowedModelsReturnsCopy(t *testing.T) {
	models := MonthlyCardAllowedModels()
	require.NotEmpty(t, models)

	models[0] = "claude-opus-4-6"

	require.False(t, MonthlyCardChannelSupportsModel("claude-opus-4-6"))
	require.NotEqual(t, "claude-opus-4-6", MonthlyCardAllowedModels()[0])
}
