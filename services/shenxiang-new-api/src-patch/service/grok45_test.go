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
