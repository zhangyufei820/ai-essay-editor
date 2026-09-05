package service

import (
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/require"
)

func TestApplyUpstreamCostBillingKeepsFixedGrok45Price(t *testing.T) {
	relayInfo := &relaycommon.RelayInfo{UsingGroup: Grok45PricingGroupName, OriginModelName: Grok45ModelName}

	quota, result := ApplyUpstreamCostBilling(relayInfo, &dto.Usage{CostUSD: 9.99}, 321)

	require.False(t, result.Applied)
	require.Equal(t, "grok45_static_pricing", result.FallbackReason)
	require.Equal(t, 321, quota)
	require.Equal(t, 321, result.FinalQuota)
}

func TestApplyUpstreamCostBillingKeepsFixedKimiK3Price(t *testing.T) {
	relayInfo := &relaycommon.RelayInfo{UsingGroup: KimiK3PricingGroupName, OriginModelName: KimiK3ModelName}

	quota, result := ApplyUpstreamCostBilling(relayInfo, &dto.Usage{CostCNY: 999}, 321)

	require.False(t, result.Applied)
	require.Equal(t, "kimi_k3_static_pricing", result.FallbackReason)
	require.Equal(t, 321, quota)
}

func TestApplyUpstreamCostBillingKeepsFixedGpt6AstraPrice(t *testing.T) {
	relayInfo := &relaycommon.RelayInfo{UsingGroup: Gpt6AstraPricingGroupName, OriginModelName: Gpt6AstraModelName}

	quota, result := ApplyUpstreamCostBilling(relayInfo, &dto.Usage{CostCNY: 999}, 321)

	require.False(t, result.Applied)
	require.Equal(t, "gpt6_astra_static_pricing", result.FallbackReason)
	require.Equal(t, 321, quota)
	require.Equal(t, 321, result.FinalQuota)
}
