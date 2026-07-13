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

func TestManagedGrok45UserTokenProfileRequiresExactIsolation(t *testing.T) {
	valid := Grok45UserTokenProfile{
		Name:               Grok45UserTokenName,
		Group:              Grok45PricingGroupName,
		ModelLimitsEnabled: true,
		ModelLimits:        Grok45ModelName,
		UnlimitedQuota:     true,
		RemainQuota:        0,
		ExpiredTime:        -1,
		AllowIPs:           "",
		CrossGroupRetry:    false,
	}
	require.True(t, IsManagedGrok45UserTokenProfile(valid))

	tests := []struct {
		name   string
		mutate func(*Grok45UserTokenProfile)
	}{
		{name: "name", mutate: func(profile *Grok45UserTokenProfile) { profile.Name = "custom" }},
		{name: "group", mutate: func(profile *Grok45UserTokenProfile) { profile.Group = "default" }},
		{name: "limits disabled", mutate: func(profile *Grok45UserTokenProfile) { profile.ModelLimitsEnabled = false }},
		{name: "extra model", mutate: func(profile *Grok45UserTokenProfile) { profile.ModelLimits += ",gpt-5.5" }},
		{name: "limited quota", mutate: func(profile *Grok45UserTokenProfile) { profile.UnlimitedQuota = false }},
		{name: "remaining quota", mutate: func(profile *Grok45UserTokenProfile) { profile.RemainQuota = 1 }},
		{name: "expiry", mutate: func(profile *Grok45UserTokenProfile) { profile.ExpiredTime = 1 }},
		{name: "ip allowlist", mutate: func(profile *Grok45UserTokenProfile) { profile.AllowIPs = "127.0.0.1" }},
		{name: "cross group retry", mutate: func(profile *Grok45UserTokenProfile) { profile.CrossGroupRetry = true }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			profile := valid
			test.mutate(&profile)
			require.False(t, IsManagedGrok45UserTokenProfile(profile))
		})
	}
}
