package helper

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestSeedream55PreauthorizationAndSettlementUseSameQuote(t *testing.T) {
	oldQuota, oldRate := common.QuotaPerUnit, operation_setting.USDExchangeRate
	common.QuotaPerUnit, operation_setting.USDExchangeRate = 500000, 7.3
	defer func() { common.QuotaPerUnit, operation_setting.USDExchangeRate = oldQuota, oldRate }()
	c, _ := gin.CreateTestContext(nil)
	c.Set("auto_group", "vip")
	r := &dto.ImageRequest{Model: dto.Seedream55Model, Prompt: "画一棵树", Size: "1K"}
	info := &relaycommon.RelayInfo{OriginModelName: r.Model, RelayMode: relayconstant.RelayModeImagesGenerations, Request: r}
	p, err := ModelPriceHelper(c, info, 0, nil)
	require.NoError(t, err)
	require.Equal(t, 7479, p.QuotaToPreConsume)
	require.Equal(t, 1.0, p.GroupRatioInfo.GroupRatio)
	require.Equal(t, "vip", info.UsingGroup)
	require.True(t, info.ForcePreConsume)
	r.Image = json.RawMessage(`"https://a.test/in.png"`)
	r.LayerDecomposition = true
	max := 5
	r.LayerDecompositionOptions = &dto.Seedream55LayerOptions{MaxImages: &max}
	p, err = ModelPriceHelper(c, info, 0, nil)
	require.NoError(t, err)
	require.Equal(t, 40274, p.QuotaToPreConsume)
	bill := service.GetSeedream55Billing(c)
	require.Zero(t, bill.Quota(0))
	operation_setting.USDExchangeRate = 8
	require.Equal(t, 25315, bill.Quota(3))
	bill.ActualOutputs = 3
	log := map[string]interface{}{}
	bill.Audit(log)
	require.Equal(t, "0.3696", log["image_total_cny"])
	require.Equal(t, 3, log["image_output_count"])
	info.RelayMode = relayconstant.RelayModeImagesEdits
	_, err = ModelPriceHelper(c, info, 0, nil)
	require.Error(t, err)
}
