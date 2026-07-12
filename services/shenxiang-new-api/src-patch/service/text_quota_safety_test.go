package service

import (
	"math"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

func TestCalculateTextQuotaSummarySaturatesRatioBilling(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	relayInfo := &relaycommon.RelayInfo{
		OriginModelName: "overflow-ratio-model",
		PriceData: types.PriceData{
			ModelRatio:      math.MaxFloat64,
			CompletionRatio: 1,
			GroupRatioInfo:  types.GroupRatioInfo{GroupRatio: 1},
		},
		StartTime: time.Now(),
	}

	summary := calculateTextQuotaSummary(ctx, relayInfo, &dto.Usage{PromptTokens: 1, TotalTokens: 1})

	require.Equal(t, common.MaxQuota, summary.Quota)
	require.NotNil(t, relayInfo.QuotaClamp)
	require.Equal(t, common.QuotaClampOverflow, relayInfo.QuotaClamp.Kind)
}

func TestCalculateTextQuotaSummarySaturatesFixedPriceBilling(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	relayInfo := &relaycommon.RelayInfo{
		OriginModelName: "overflow-price-model",
		PriceData: types.PriceData{
			UsePrice:       true,
			ModelPrice:     math.MaxFloat64,
			ModelRatio:     1,
			GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1},
		},
		StartTime: time.Now(),
	}

	summary := calculateTextQuotaSummary(ctx, relayInfo, &dto.Usage{PromptTokens: 1, TotalTokens: 1})

	require.Equal(t, common.MaxQuota, summary.Quota)
	require.NotNil(t, relayInfo.QuotaClamp)
	require.Equal(t, common.QuotaClampOverflow, relayInfo.QuotaClamp.Kind)
}

func TestComposeTieredTextQuotaSaturatesFinalSum(t *testing.T) {
	relayInfo := &relaycommon.RelayInfo{
		TieredBillingSnapshot: &billingexpr.BillingSnapshot{GroupRatio: 1},
	}
	summary := textQuotaSummary{ToolCallSurchargeQuota: decimal.NewFromInt(1)}

	quota := composeTieredTextQuota(relayInfo, summary, common.MaxQuota, nil)

	require.Equal(t, common.MaxQuota, quota)
	require.NotNil(t, relayInfo.QuotaClamp)
	require.Equal(t, common.QuotaClampOverflow, relayInfo.QuotaClamp.Kind)
}

func TestApplyUpstreamCostBillingSaturatesPersistentQuota(t *testing.T) {
	relayInfo := &relaycommon.RelayInfo{}

	quota, result := ApplyUpstreamCostBilling(relayInfo, &dto.Usage{CostUSD: 1_000_000}, 10)

	require.NotNil(t, result)
	require.True(t, result.Applied)
	require.Equal(t, common.MaxQuota, quota)
	require.NotNil(t, relayInfo.QuotaClamp)
	require.Equal(t, common.QuotaClampOverflow, relayInfo.QuotaClamp.Kind)
}
