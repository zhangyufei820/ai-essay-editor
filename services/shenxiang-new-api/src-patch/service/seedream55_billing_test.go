package service

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestSeedream55WalletSettlementAndRefund(t *testing.T) {
	truncate(t)
	const userID, startingBalance = 754, 100000
	seedUser(t, userID, startingBalance)
	oldQuota := common.QuotaPerUnit
	common.QuotaPerUnit = 500000
	defer func() { common.QuotaPerUnit = oldQuota }()
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest("POST", "/pg/images/generations", nil)
	bill := StartSeedream55Billing(ctx, dto.Seedream55Quote{InputCount: 1, OutputCap: 5, OutputRate: 1092, Tier: "low"}, 7.3)
	info := &relaycommon.RelayInfo{
		UserId: userID, OriginModelName: dto.Seedream55Model, IsPlayground: true, StartTime: time.Now(),
		UsingGroup: "default", ForcePreConsume: true, ChannelMeta: &relaycommon.ChannelMeta{},
		PriceData: types.PriceData{UsePrice: true, GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1}},
	}
	reserve := bill.Quota(bill.Quote.OutputCap)
	require.Nil(t, PreConsumeBilling(ctx, reserve, info))
	balance := func() int {
		var user model.User
		require.NoError(t, model.DB.First(&user, userID).Error)
		return user.Quota
	}
	require.Equal(t, startingBalance-40274, balance())
	bill.ActualOutputs = 3
	PostTextConsumeQuota(ctx, info, &dto.Usage{CostCNY: 100}, nil)
	require.Equal(t, startingBalance-25315, balance())
	require.Equal(t, 25315, getLastLog(t).Quota)
	require.Equal(t, "0.3696", getLastLogOther(t)["image_total_cny"])
	// A late refund for an already settled request is a no-op.
	info.Billing.Refund(ctx)
	require.Equal(t, startingBalance-25315, balance())

	require.Nil(t, PreConsumeBilling(ctx, reserve, info))
	require.Equal(t, startingBalance-25315-40274, balance())
	info.Billing.Refund(ctx)
	info.Billing.Refund(ctx)
	require.Eventually(t, func() bool { return balance() == startingBalance-25315 }, time.Second, 10*time.Millisecond)
}
