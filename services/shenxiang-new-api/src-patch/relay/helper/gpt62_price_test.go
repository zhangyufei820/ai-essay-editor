package helper

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	settingconfig "github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGpt62MarketplacePricingAllTiersAndMultipliers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalModes, _ := json.Marshal(billing_setting.GetBillingModeCopy())
	originalExprs, _ := json.Marshal(billing_setting.GetBillingExprCopy())
	oldGroups := ratio_setting.GroupRatio2JSONString()
	oldSpecial := ratio_setting.GroupGroupRatio2JSONString()
	t.Cleanup(func() {
		require.NoError(t, settingconfig.GlobalConfig.LoadFromDB(map[string]string{"billing_setting.billing_mode": string(originalModes), "billing_setting.billing_expr": string(originalExprs)}))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(oldGroups))
		require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(oldSpecial))
	})
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"discount":0.25,"plus":0.5,"default":1,"special":0.01,"custom":3}`))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"vip":{"discount":0.1,"plus":0.2,"default":0.3,"custom":0.01}}`))
	for _, model := range []string{service.Gpt62SolModelName, service.Gpt62AstraModelName} {
		scale := 1.0
		if model == service.Gpt62AstraModelName {
			scale = 4
		}
		expr := `len <= 272000 ? tier("base", (p * 2 + c * 10 + cr * 0.1 + cc * 2.5 + cc12h * 5) / 7.3) : tier("longcontext", (p * 4 + c * 15 + cr * 0.2 + cc * 5 + cc12h * 10) / 7.3)`
		if scale == 4 {
			expr = `len <= 272000 ? tier("base", (p * 8 + c * 40 + cr * 0.4 + cc * 10 + cc12h * 20) / 7.3) : tier("longcontext", (p * 16 + c * 60 + cr * 0.8 + cc * 20 + cc12h * 40) / 7.3)`
		}
		modes, _ := json.Marshal(map[string]string{model: "tiered_expr"})
		exprs, _ := json.Marshal(map[string]string{model: expr})
		require.NoError(t, settingconfig.GlobalConfig.LoadFromDB(map[string]string{"billing_setting.billing_mode": string(modes), "billing_setting.billing_expr": string(exprs)}))
		for _, group := range []string{"default", "discount", "plus", "special", "custom", "internal", "code", "standard", "pro"} {
			for _, actual := range []int{271999, 272000, 272001} {
				ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
				ctx.Set("auto_group", group)
				info := &relaycommon.RelayInfo{OriginModelName: model, UsingGroup: "auto", UserGroup: "vip", SubscriptionPlanId: 6, BillingSource: "subscription"}
				data, err := ModelPriceHelper(ctx, info, 100, &types.TokenCountMeta{MaxTokens: 1000})
				require.NoError(t, err)
				require.Equal(t, group, info.UsingGroup)
				require.Equal(t, 1.0, data.GroupRatioInfo.GroupRatio)
				require.False(t, data.GroupRatioInfo.HasSpecialRatio)
				usage := &dto.Usage{PromptTokens: actual, CompletionTokens: 1000, PromptTokensDetails: dto.InputTokenDetails{CachedTokens: 100000, CacheWriteTokens: 50000, CacheWriteTokensDetails: &dto.CacheWriteTokenDetails{TTL30mTokens: 30000, TTL12hTokens: 20000}}}
				params := service.BuildTieredTokenParams(usage, false, billingexpr.UsedVars(expr))
				require.Equal(t, float64(actual), params.Len)
				require.Equal(t, float64(actual-150000), params.P)
				require.Equal(t, 30000.0, params.CC)
				require.Equal(t, 20000.0, params.CC12h)
				ok, quota, result := service.TryTieredSettle(info, params)
				require.True(t, ok)
				require.NotNil(t, result)
				in, out, read, write, write12h, tier := 2.0, 10.0, 0.1, 2.5, 5.0, "base"
				if actual > 272000 {
					in, out, read, write, write12h, tier = 4, 15, 0.2, 5, 10, "longcontext"
				}
				expected := scale * (params.P*in + 1000*out + 100000*read + 30000*write + 20000*write12h) / 1000000
				require.Equal(t, tier, result.MatchedTier)
				require.InDelta(t, expected, float64(quota)/common.QuotaPerUnit*7.3, 7.3/common.QuotaPerUnit)
				require.Equal(t, quota, service.EffectiveMonthlyCardTextBillingQuota(info, quota))
				require.True(t, service.MonthlyCardChannelSupportsModel(model))
				require.False(t, service.MonthlyCardTextSupportsModel(model))
			}
		}
	}
}
