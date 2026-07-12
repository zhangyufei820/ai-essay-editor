package helper

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestHandleGroupRatioPinsGrok45Price(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalGroupRatio := ratio_setting.GroupRatio2JSONString()
	originalSpecialRatio := ratio_setting.GroupGroupRatio2JSONString()
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalGroupRatio))
		require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(originalSpecialRatio))
	})
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"grok45":0.7}`))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"vip":{"grok45":0.3}}`))
	ctx, _ := gin.CreateTestContext(nil)
	relayInfo := &relaycommon.RelayInfo{
		UserGroup:  "vip",
		UsingGroup: service.Grok45PricingGroupName,
	}

	ratioInfo := HandleGroupRatio(ctx, relayInfo)

	require.Equal(t, service.Grok45PricingGroupRatio, ratioInfo.GroupRatio)
	require.False(t, ratioInfo.HasSpecialRatio)
	require.Equal(t, float64(-1), ratioInfo.GroupSpecialRatio)
}

func TestModelPriceHelperPinsExactGrok45CNYRatios(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalModelPrice := ratio_setting.ModelPrice2JSONString()
	originalExchangeRate := operation_setting.USDExchangeRate
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(originalModelPrice))
		operation_setting.USDExchangeRate = originalExchangeRate
	})
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"grok-4.5":99}`))
	operation_setting.USDExchangeRate = 8
	ctx, _ := gin.CreateTestContext(nil)
	relayInfo := &relaycommon.RelayInfo{
		OriginModelName: service.Grok45ModelName,
		UsingGroup:      service.Grok45PricingGroupName,
	}

	priceData, err := ModelPriceHelper(ctx, relayInfo, 1, &types.TokenCountMeta{})

	require.NoError(t, err)
	require.False(t, priceData.UsePrice)
	require.InDelta(t, 0.125, priceData.ModelRatio, 0.000000001)
	require.Equal(t, service.Grok45CompletionRatio, priceData.CompletionRatio)
	require.Equal(t, service.Grok45CacheReadRatio, priceData.CacheRatio)
	require.Equal(t, service.Grok45PricingGroupRatio, priceData.GroupRatioInfo.GroupRatio)
}
