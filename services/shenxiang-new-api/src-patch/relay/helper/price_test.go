package helper

import (
	"encoding/json"
	"math"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	settingconfig "github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type tieredRealtimeBillingRecorder struct {
	preConsumedQuota int
	reserveTargets   []int
}

func (recorder *tieredRealtimeBillingRecorder) Settle(int) error    { return nil }
func (recorder *tieredRealtimeBillingRecorder) Refund(*gin.Context) {}
func (recorder *tieredRealtimeBillingRecorder) NeedsRefund() bool   { return false }
func (recorder *tieredRealtimeBillingRecorder) GetPreConsumedQuota() int {
	return recorder.preConsumedQuota
}
func (recorder *tieredRealtimeBillingRecorder) Reserve(targetQuota int) error {
	recorder.preConsumedQuota = targetQuota
	recorder.reserveTargets = append(recorder.reserveTargets, targetQuota)
	return nil
}

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

func TestHasModelBillingConfigAcceptsPublicDiscountImage2Alias(t *testing.T) {
	oldModelPrice := ratio_setting.ModelPrice2JSONString()
	defer func() {
		require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(oldModelPrice))
	}()

	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"`+service.InternalDiscountImage2ModelName+`":0.03}`))

	require.True(t, HasModelBillingConfig(service.PublicDiscountImage2ModelName))
}

func TestHandleGroupRatioPinsDiscountMarketplaceRatio(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalGroupRatio := ratio_setting.GroupRatio2JSONString()
	originalSpecialRatio := ratio_setting.GroupGroupRatio2JSONString()
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalGroupRatio))
		require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(originalSpecialRatio))
	})
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"discount":0.7}`))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"vip":{"discount":0.3}}`))
	ctx, _ := gin.CreateTestContext(nil)
	relayInfo := &relaycommon.RelayInfo{
		UserGroup:  "vip",
		UsingGroup: service.DiscountPricingGroupName,
	}

	ratioInfo := HandleGroupRatio(ctx, relayInfo)

	require.Equal(t, service.DiscountPricingGroupRatio, ratioInfo.GroupRatio)
	require.False(t, ratioInfo.HasSpecialRatio)
	require.Equal(t, float64(-1), ratioInfo.GroupSpecialRatio)
}

func TestModelPriceHelperChargesFivePercentOfMarketplaceFixedPrice(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalModelPrice := ratio_setting.ModelPrice2JSONString()
	originalGroupRatio := ratio_setting.GroupRatio2JSONString()
	originalQuotaPerUnit := common.QuotaPerUnit
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(originalModelPrice))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalGroupRatio))
		common.QuotaPerUnit = originalQuotaPerUnit
	})
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"gpt-5.5":2}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"discount":0.9}`))
	common.QuotaPerUnit = 500_000
	ctx, _ := gin.CreateTestContext(nil)
	relayInfo := &relaycommon.RelayInfo{
		OriginModelName: "gpt-5.5",
		UsingGroup:      service.DiscountPricingGroupName,
	}

	priceData, err := ModelPriceHelper(ctx, relayInfo, 1, &types.TokenCountMeta{})

	require.NoError(t, err)
	require.True(t, priceData.UsePrice)
	require.Equal(t, service.DiscountPricingGroupRatio, priceData.GroupRatioInfo.GroupRatio)
	require.Equal(t, 50_000, priceData.QuotaToPreConsume)
}

func TestTieredRealtimeBillingUsesFrozenModelRatio(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalModelRatio := ratio_setting.ModelRatio2JSONString()
	originalBillingModes, err := json.Marshal(billing_setting.GetBillingModeCopy())
	require.NoError(t, err)
	originalBillingExprs, err := json.Marshal(billing_setting.GetBillingExprCopy())
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(originalModelRatio))
		require.NoError(t, settingconfig.GlobalConfig.LoadFromDB(map[string]string{
			"billing_setting.billing_mode": string(originalBillingModes),
			"billing_setting.billing_expr": string(originalBillingExprs),
		}))
	})
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"gpt-5.5":2}`))
	require.NoError(t, settingconfig.GlobalConfig.LoadFromDB(map[string]string{
		"billing_setting.billing_mode": `{"gpt-5.5":"tiered_expr"}`,
		"billing_setting.billing_expr": `{"gpt-5.5":"tier(\"base\", p * 1 + c * 6)"}`,
	}))

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	billing := &tieredRealtimeBillingRecorder{}
	relayInfo := &relaycommon.RelayInfo{
		OriginModelName: "gpt-5.5",
		UsingGroup:      service.DiscountPricingGroupName,
		Billing:         billing,
	}
	priceData, err := ModelPriceHelper(ctx, relayInfo, 100, &types.TokenCountMeta{})
	require.NoError(t, err)
	require.Equal(t, 2.0, priceData.ModelRatio)
	require.Equal(t, service.DiscountPricingGroupRatio, priceData.GroupRatioInfo.GroupRatio)

	usage := &dto.RealtimeUsage{
		TotalTokens: 100,
		InputTokens: 100,
		InputTokenDetails: dto.InputTokenDetails{
			TextTokens: 100,
		},
	}
	require.NoError(t, service.PreWssConsumeQuota(ctx, relayInfo, usage))
	require.NoError(t, service.PreWssConsumeQuota(ctx, relayInfo, usage))
	require.Equal(t, []int{10, 20}, billing.reserveTargets)
}

func TestModelPriceHelperSaturatesAndAuditsFixedPriceQuota(t *testing.T) {
	const modelName = "quota-safety-text-fixed-price"

	oldModelPrice := ratio_setting.ModelPrice2JSONString()
	oldQuotaPerUnit := common.QuotaPerUnit
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(oldModelPrice))
		common.QuotaPerUnit = oldQuotaPerUnit
	})

	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"`+modelName+`":1}`))
	common.QuotaPerUnit = math.MaxFloat64

	c, _ := gin.CreateTestContext(nil)
	info := &relaycommon.RelayInfo{OriginModelName: modelName, UsingGroup: "default"}
	priceData, err := ModelPriceHelper(c, info, 1, &types.TokenCountMeta{})

	require.NoError(t, err)
	require.Equal(t, common.MaxQuota, priceData.QuotaToPreConsume)
	require.NotNil(t, info.QuotaClamp)
	require.Equal(t, common.QuotaClampOverflow, info.QuotaClamp.Kind)
	require.Equal(t, common.MaxQuota, info.QuotaClamp.Clamped)
}

func TestModelPriceHelperSaturatesAndAuditsRatioQuota(t *testing.T) {
	const modelName = "quota-safety-text-ratio"

	oldModelPrice := ratio_setting.ModelPrice2JSONString()
	oldModelRatio := ratio_setting.ModelRatio2JSONString()
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(oldModelPrice))
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(oldModelRatio))
	})

	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{}`))
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"`+modelName+`":-1e308}`))

	c, _ := gin.CreateTestContext(nil)
	info := &relaycommon.RelayInfo{OriginModelName: modelName, UsingGroup: "default"}
	priceData, err := ModelPriceHelper(c, info, 1, &types.TokenCountMeta{})

	require.NoError(t, err)
	require.Equal(t, common.MinQuota, priceData.QuotaToPreConsume)
	require.NotNil(t, info.QuotaClamp)
	require.Equal(t, common.QuotaClampUnderflow, info.QuotaClamp.Kind)
	require.Equal(t, common.MinQuota, info.QuotaClamp.Clamped)
}

func TestNotePriceQuotaClampPreservesFirstClamp(t *testing.T) {
	first := &common.QuotaClamp{Op: "first", Kind: common.QuotaClampOverflow, Clamped: common.MaxQuota}
	info := &relaycommon.RelayInfo{QuotaClamp: first}

	notePriceQuotaClamp(info, &common.QuotaClamp{Op: "second", Kind: common.QuotaClampNaN})

	require.Same(t, first, info.QuotaClamp)
}

func TestModelPriceHelperPerCallSaturatesAndAuditsFixedPriceQuota(t *testing.T) {
	const modelName = "quota-safety-fixed-price"

	oldModelPrice := ratio_setting.ModelPrice2JSONString()
	oldQuotaPerUnit := common.QuotaPerUnit
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(oldModelPrice))
		common.QuotaPerUnit = oldQuotaPerUnit
	})

	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"`+modelName+`":1}`))
	common.QuotaPerUnit = math.MaxFloat64

	c, _ := gin.CreateTestContext(nil)
	info := &relaycommon.RelayInfo{OriginModelName: modelName, UsingGroup: "default"}
	priceData, err := ModelPriceHelperPerCall(c, info)

	require.NoError(t, err)
	require.Equal(t, common.MaxQuota, priceData.Quota)
	require.NotNil(t, info.QuotaClamp)
	require.Equal(t, common.QuotaClampOverflow, info.QuotaClamp.Kind)
	require.Equal(t, common.MaxQuota, info.QuotaClamp.Clamped)
}

func TestModelPriceHelperPerCallSaturatesAndAuditsRatioQuota(t *testing.T) {
	const modelName = "quota-safety-ratio"

	oldModelPrice := ratio_setting.ModelPrice2JSONString()
	oldModelRatio := ratio_setting.ModelRatio2JSONString()
	oldQuotaPerUnit := common.QuotaPerUnit
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(oldModelPrice))
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(oldModelRatio))
		common.QuotaPerUnit = oldQuotaPerUnit
	})

	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{}`))
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"`+modelName+`":2}`))

	tests := []struct {
		name         string
		quotaPerUnit float64
		wantQuota    int
		wantKind     string
	}{
		{name: "nan", quotaPerUnit: math.NaN(), wantQuota: 0, wantKind: common.QuotaClampNaN},
		{name: "negative underflow", quotaPerUnit: -math.MaxFloat64, wantQuota: common.MinQuota, wantKind: common.QuotaClampUnderflow},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			common.QuotaPerUnit = test.quotaPerUnit
			c, _ := gin.CreateTestContext(nil)
			info := &relaycommon.RelayInfo{OriginModelName: modelName, UsingGroup: "default"}

			priceData, err := ModelPriceHelperPerCall(c, info)

			require.NoError(t, err)
			require.Equal(t, test.wantQuota, priceData.Quota)
			require.NotNil(t, info.QuotaClamp)
			require.Equal(t, test.wantKind, info.QuotaClamp.Kind)
			require.Equal(t, test.wantQuota, info.QuotaClamp.Clamped)
		})
	}
}

func TestModelPriceHelperTieredSaturatesAndAuditsQuota(t *testing.T) {
	const modelName = "quota-safety-tiered"

	billingConfig, ok := settingconfig.GlobalConfig.Get("billing_setting").(*billing_setting.BillingSetting)
	require.True(t, ok)
	oldBillingModes := billingConfig.BillingMode
	oldBillingExpressions := billingConfig.BillingExpr
	oldQuotaPerUnit := common.QuotaPerUnit
	t.Cleanup(func() {
		billingConfig.BillingMode = oldBillingModes
		billingConfig.BillingExpr = oldBillingExpressions
		common.QuotaPerUnit = oldQuotaPerUnit
	})

	billingConfig.BillingMode = map[string]string{modelName: billing_setting.BillingModeTieredExpr}
	billingConfig.BillingExpr = map[string]string{modelName: "1e308"}
	common.QuotaPerUnit = 500_000

	c, _ := gin.CreateTestContext(nil)
	info := &relaycommon.RelayInfo{OriginModelName: modelName, UsingGroup: "default"}
	priceData, err := ModelPriceHelper(c, info, 1, &types.TokenCountMeta{})

	require.NoError(t, err)
	require.Equal(t, common.MaxQuota, priceData.QuotaToPreConsume)
	require.NotNil(t, info.QuotaClamp)
	require.Equal(t, common.QuotaClampOverflow, info.QuotaClamp.Kind)
	require.Equal(t, "QuotaRound", info.QuotaClamp.Op)
	require.Equal(t, common.MaxQuota, info.QuotaClamp.Clamped)
}
