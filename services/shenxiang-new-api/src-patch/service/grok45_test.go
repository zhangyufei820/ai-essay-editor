package service

import (
	"testing"

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

func TestManagedGrok45UserTokenProfileRequiresExactIsolation(t *testing.T) {
	valid := Grok45UserTokenProfile{
		Name:               Grok45UserTokenName,
		Group:              Grok45PricingGroupName,
		ModelLimitsEnabled: true,
		ModelLimits:        GrokManagedModelLimits,
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

func TestManagedGrok45TextModelsIncludeGrok46(t *testing.T) {
	require.Equal(t, []string{Grok45ModelName, Grok46ModelName}, GrokManagedModelNames())
	require.Equal(t, "grok-4.5,grok-4.6", GrokManagedModelLimits)
	require.True(t, IsManagedGrokTextModelName(Grok45ModelName))
	require.True(t, IsManagedGrokTextModelName(Grok46ModelName))
	require.False(t, IsManagedGrokTextModelName("gpt-5.5"))
}
