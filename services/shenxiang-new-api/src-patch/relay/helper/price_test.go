package helper

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestModelPriceHelperUsesImageCNYFixedPrice(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldQuotaPerUnit := common.QuotaPerUnit
	oldRate := operation_setting.USDExchangeRate
	common.QuotaPerUnit = 500_000
	operation_setting.USDExchangeRate = 7.5
	defer func() {
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.USDExchangeRate = oldRate
	}()

	c, _ := gin.CreateTestContext(nil)
	info := &relaycommon.RelayInfo{
		OriginModelName: "geek2api-image-2",
		UsingGroup:      "default",
	}

	priceData, err := ModelPriceHelper(c, info, 1, &types.TokenCountMeta{ImagePriceCNY: 0.06})
	require.NoError(t, err)
	require.True(t, priceData.UsePrice)
	require.InDelta(t, 0.008, priceData.ModelPrice, 0.000001)
	require.Equal(t, 4000, priceData.QuotaToPreConsume)
	require.Equal(t, priceData, info.PriceData)
}
