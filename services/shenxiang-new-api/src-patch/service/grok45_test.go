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
		ModelLimits:        Grok45ModelName,
		UnlimitedQuota:     true,
		RemainQuota:        0,
		ExpiredTime:        -1,
		AllowIPs:           "",
		CrossGroupRetry:    true,
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
		{name: "cross group retry", mutate: func(profile *Grok45UserTokenProfile) { profile.CrossGroupRetry = false }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			profile := valid
			test.mutate(&profile)
			require.False(t, IsManagedGrok45UserTokenProfile(profile))
		})
	}
}
