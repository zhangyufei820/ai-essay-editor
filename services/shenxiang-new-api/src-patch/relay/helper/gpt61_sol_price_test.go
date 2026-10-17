package helper

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	settingconfig "github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGpt61SolMarketplacePricingBoundary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalModes, err := json.Marshal(billing_setting.GetBillingModeCopy())
	require.NoError(t, err)
	originalExprs, err := json.Marshal(billing_setting.GetBillingExprCopy())
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, settingconfig.GlobalConfig.LoadFromDB(map[string]string{
			"billing_setting.billing_mode": string(originalModes),
			"billing_setting.billing_expr": string(originalExprs),
		}))
	})
	exprs, err := json.Marshal(map[string]string{service.Gpt61SolModelName: "len <= 272000 ? tier(\"base\", p * 0.27397260274 + c * 1.369863013699 + cr * 0.27397260274 + cc * 0.27397260274) : tier(\"longcontext\", p * 0.547945205479 + c * 2.054794520548 + cr * 0.547945205479 + cc * 0.547945205479)"})
	require.NoError(t, err)
	require.NoError(t, settingconfig.GlobalConfig.LoadFromDB(map[string]string{
		"billing_setting.billing_mode": `{"gpt-6.1-sol":"tiered_expr"}`,
		"billing_setting.billing_expr": string(exprs),
	}))
	for _, group := range []string{"default", "plus", "discount", "special"} {
		for _, tokens := range []int{271999, 272000, 272001} {
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			info := &relaycommon.RelayInfo{OriginModelName: service.Gpt61SolModelName, UsingGroup: group}
			data, err := ModelPriceHelper(ctx, info, tokens, &types.TokenCountMeta{MaxTokens: 1000})
			require.NoError(t, err)
			require.Equal(t, group, info.UsingGroup)
			require.Equal(t, 1.0, data.GroupRatioInfo.GroupRatio)
			input, output, tier := 2.0, 10.0, "base"
			if tokens > 272000 {
				input, output, tier = 4, 15, "longcontext"
			}
			require.Equal(t, tier, info.TieredBillingSnapshot.EstimatedTier)
			expectedCNY := (float64(tokens)*input + 1000*output) / 1000000
			actualCNY := float64(data.QuotaToPreConsume) / common.QuotaPerUnit * 7.3
			require.InDelta(t, expectedCNY, actualCNY, 7.3/common.QuotaPerUnit, group)
		}
	}
}
