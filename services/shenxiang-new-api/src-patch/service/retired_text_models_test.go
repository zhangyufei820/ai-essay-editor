package service

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestIsRetiredTextModelNameMatchesOnlyRetiredProducts(t *testing.T) {
	for _, model := range []string{"gpt-5.5", "gpt-5.6", " GPT-5.5 "} {
		require.True(t, IsRetiredTextModelName(model))
	}
	for _, model := range []string{"gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.5-openai-compact", "gpt-6.1-sol", "codex-auto-review"} {
		require.False(t, IsRetiredTextModelName(model))
	}
	for _, profile := range SystemTokenProfiles() {
		for _, model := range profile.Models {
			require.False(t, IsRetiredTextModelName(model), "bootstrap token must not advertise retired models")
		}
	}
	for _, modelName := range MonthlyCardAllowedModels() {
		require.False(t, IsRetiredTextModelName(modelName), "monthly-card token repair must not restore retired models")
	}
}
