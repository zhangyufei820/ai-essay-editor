package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/require"
)

func TestIsGrok45PricingGroupUsesResolvedOrTokenGroup(t *testing.T) {
	require.True(t, IsGrok45PricingGroup(&relaycommon.RelayInfo{UsingGroup: Grok45PricingGroupName}))
	require.True(t, IsGrok45PricingGroup(&relaycommon.RelayInfo{TokenGroup: Grok45PricingGroupName}))
	require.True(t, IsGrok45PricingGroup(&relaycommon.RelayInfo{UsingGroup: "default", TokenGroup: Grok45PricingGroupName}))
	require.False(t, IsGrok45PricingGroup(&relaycommon.RelayInfo{UsingGroup: "default"}))
	require.False(t, IsGrok45PricingGroup(nil))
}

func TestIsExactGrok45TokenConfigurationAllowsCustomName(t *testing.T) {
	allowIPs := ""
	token := &model.Token{
		Name:               "用户自定义 Grok 名称",
		ExpiredTime:        -1,
		RemainQuota:        0,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: true,
		ModelLimits:        Grok45ModelName,
		AllowIps:           &allowIPs,
		Group:              Grok45PricingGroupName,
		CrossGroupRetry:    false,
	}

	require.True(t, IsExactGrok45TokenConfiguration(token))
}

func TestIsExactGrok45TokenConfigurationRejectsBroaderContracts(t *testing.T) {
	allowIPs := ""
	exact := model.Token{
		ExpiredTime:        -1,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: true,
		ModelLimits:        Grok45ModelName,
		AllowIps:           &allowIPs,
		Group:              Grok45PricingGroupName,
	}

	tests := map[string]func(*model.Token){
		"wrong group":          func(token *model.Token) { token.Group = "default" },
		"multiple models":      func(token *model.Token) { token.ModelLimits += ",gpt-5.5" },
		"duplicate model":      func(token *model.Token) { token.ModelLimits += "," + Grok45ModelName },
		"limits disabled":      func(token *model.Token) { token.ModelLimitsEnabled = false },
		"limited quota":        func(token *model.Token) { token.UnlimitedQuota = false },
		"nonzero quota":        func(token *model.Token) { token.RemainQuota = 1 },
		"finite expiration":    func(token *model.Token) { token.ExpiredTime = 1 },
		"ip restriction":       func(token *model.Token) { value := "127.0.0.1"; token.AllowIps = &value },
		"cross-group fallback": func(token *model.Token) { token.CrossGroupRetry = true },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			token := exact
			mutate(&token)
			require.False(t, IsExactGrok45TokenConfiguration(&token))
		})
	}
	require.False(t, IsExactGrok45TokenConfiguration(nil))
}
