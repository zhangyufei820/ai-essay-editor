package service

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
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

func TestApplyUpstreamCostBillingSkipsFixedPriceImageModel(t *testing.T) {
	quota, result := ApplyUpstreamCostBilling(&relaycommon.RelayInfo{
		OriginModelName: EcommerceBanana2Model,
	}, &dto.Usage{
		Cost: 9.99,
	}, 42500)

	require.False(t, result.Applied)
	require.Equal(t, "fixed_model_price", result.FallbackReason)
	require.Equal(t, 42500, quota)
	require.Equal(t, 42500, result.FinalQuota)
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

func TestCopyResponseHeaderCostFieldsUsesUSDHeader(t *testing.T) {
	usage := &dto.Usage{}
	headers := http.Header{}
	headers.Set("X-Upstream-Cost-Usd", "0.25")

	CopyResponseHeaderCostFields(usage, headers)
	cost, currency, source, ok, reason := ExtractUpstreamCostFromUsage(usage)

	require.True(t, ok, reason)
	require.Equal(t, "usage.cost_usd", source)
	require.Equal(t, "USD", currency)
	require.InDelta(t, 0.25, cost, 0.000001)
}

func TestMergeRealtimeUpstreamCostSkipsCurrencyMismatch(t *testing.T) {
	total := &dto.RealtimeUsage{
		CostUSD: 0.25,
	}

	MergeRealtimeUpstreamCost(total, &dto.RealtimeUsage{
		CostCNY: 1.00,
	})

	normalUsage := &dto.Usage{
		CostUSD:      total.CostUSD,
		CostCNY:      total.CostCNY,
		CostCurrency: total.CostCurrency,
		Currency:     total.Currency,
		CostDetails:  total.CostDetails,
		Billing:      total.Billing,
	}
	cost, currency, source, ok, reason := ExtractUpstreamCostFromUsage(normalUsage)
	require.True(t, ok, reason)
	require.Equal(t, "usage.cost_usd", source)
	require.Equal(t, "USD", currency)
	require.InDelta(t, 0.25, cost, 0.000001)
}

func TestMergeRealtimeUpstreamCostAddsMatchingCurrency(t *testing.T) {
	total := &dto.RealtimeUsage{
		CostUSD: 0.25,
	}

	MergeRealtimeUpstreamCost(total, &dto.RealtimeUsage{
		CostUSD: 0.10,
	})

	normalUsage := &dto.Usage{
		CostUSD:      total.CostUSD,
		CostCurrency: total.CostCurrency,
		Currency:     total.Currency,
		CostDetails:  total.CostDetails,
		Billing:      total.Billing,
	}
	cost, currency, _, ok, reason := ExtractUpstreamCostFromUsage(normalUsage)
	require.True(t, ok, reason)
	require.Equal(t, "USD", currency)
	require.InDelta(t, 0.35, cost, 0.000001)
}
