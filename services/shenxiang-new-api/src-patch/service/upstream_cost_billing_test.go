package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/require"
)

func TestApplyUpstreamCostBillingUsesUSDPlusMarkup(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500_000
	defer func() { common.QuotaPerUnit = oldQuotaPerUnit }()

	quota, result := ApplyUpstreamCostBilling(nil, &dto.Usage{
		Cost: 1.0,
	}, 123)

	require.True(t, result.Applied)
	require.Equal(t, "usage.cost", result.Source)
	require.Equal(t, "USD", result.UpstreamCostCurrency)
	require.Equal(t, 540000, quota)
	require.Equal(t, 123, result.PreviousQuota)
	require.Equal(t, 540000, result.FinalQuota)
}

func TestApplyUpstreamCostBillingConvertsCNYPlusMarkup(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	oldExchangeRate := operation_setting.USDExchangeRate
	common.QuotaPerUnit = 500_000
	operation_setting.USDExchangeRate = 7.3
	defer func() {
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.USDExchangeRate = oldExchangeRate
	}()

	quota, result := ApplyUpstreamCostBilling(nil, &dto.Usage{
		CostCNY: 7.3,
	}, 123)

	require.True(t, result.Applied)
	require.Equal(t, "usage.cost_cny", result.Source)
	require.Equal(t, "CNY", result.UpstreamCostCurrency)
	require.Equal(t, 540000, quota)
}

func TestApplyUpstreamCostBillingFallsBackWhenCostMissing(t *testing.T) {
	quota, result := ApplyUpstreamCostBilling(nil, &dto.Usage{
		PromptTokens:     100,
		CompletionTokens: 20,
	}, 321)

	require.False(t, result.Applied)
	require.Equal(t, "missing_upstream_cost", result.FallbackReason)
	require.Equal(t, 321, quota)
	require.Equal(t, 321, result.FinalQuota)
}

func TestCopyResponsesCostFieldsPreservesTopLevelCost(t *testing.T) {
	usage := &dto.Usage{}
	response := &dto.OpenAIResponsesResponse{
		Cost:         "0.25",
		CostCurrency: "usd",
	}

	CopyResponsesCostFields(usage, response)
	cost, currency, source, ok, reason := ExtractUpstreamCostFromUsage(usage)

	require.True(t, ok, reason)
	require.Equal(t, "usage.cost", source)
	require.Equal(t, "USD", currency)
	require.Equal(t, 0.25, cost)
}

func TestMergeRealtimeUpstreamCostSkipsCurrencyMismatch(t *testing.T) {
	total := &dto.Usage{
		CostUSD: 0.25,
	}

	MergeRealtimeUpstreamCost(total, &dto.Usage{
		CostCNY: 1.00,
	})

	cost, currency, source, ok, reason := ExtractUpstreamCostFromUsage(total)
	require.True(t, ok, reason)
	require.Equal(t, "usage.cost_usd", source)
	require.Equal(t, "USD", currency)
	require.InDelta(t, 0.25, cost, 0.000001)
}

func TestMergeRealtimeUpstreamCostAddsMatchingCurrency(t *testing.T) {
	total := &dto.Usage{
		CostUSD: 0.25,
	}

	MergeRealtimeUpstreamCost(total, &dto.Usage{
		CostUSD: 0.10,
	})

	cost, currency, _, ok, reason := ExtractUpstreamCostFromUsage(total)
	require.True(t, ok, reason)
	require.Equal(t, "USD", currency)
	require.InDelta(t, 0.35, cost, 0.000001)
}
