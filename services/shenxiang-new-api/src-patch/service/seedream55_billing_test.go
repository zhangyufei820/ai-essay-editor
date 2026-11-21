package service

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
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

func TestSeedream55TaskReservationCommitsWalletAndTokenWithReceipt(t *testing.T) {
	truncate(t)
	const userID, tokenID, channelID, reserve = 781, 782, 783, 500
	seedUser(t, userID, 2000)
	seedToken(t, tokenID, userID, "seedream-test-token", 20)
	require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", tokenID).Update("expired_time", -1).Error)
	task := &model.Task{TaskID: "task_seedream_reservation", UserId: userID,
		Platform: constant.TaskPlatformPlaygroundImage, Status: model.TaskStatusInProgress}
	require.NoError(t, model.DB.Create(task).Error)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Set("playground_image_task_id", task.TaskID)
	info := &relaycommon.RelayInfo{UserId: userID, TokenId: tokenID, OriginModelName: dto.Seedream55Model}
	require.NotNil(t, PreConsumeBilling(ctx, reserve, info))
	require.Equal(t, 2000, getUserQuota(t, userID))
	common.SetContextKey(ctx, constant.ContextKeyChannelId, channelID)
	require.NotNil(t, PreConsumeBilling(ctx, reserve, info))
	require.Equal(t, 2000, getUserQuota(t, userID))
	require.Equal(t, 20, getTokenRemainQuota(t, tokenID))
	require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", tokenID).Update("remain_quota", 1000).Error)
	require.Nil(t, PreConsumeBilling(ctx, reserve, info))
	require.NoError(t, CheckpointSeedream55Reservation(ctx))
	common.SetContextKey(ctx, constant.ContextKeyChannelId, channelID+1)
	require.Error(t, CheckpointSeedream55Reservation(ctx))
	require.NoError(t, model.DB.First(task, task.ID).Error)
	require.Equal(t, reserve, task.Quota)
	require.Equal(t, channelID, task.ChannelId)
	require.Equal(t, tokenID, task.PrivateData.TokenId)
	require.Equal(t, 1500, getUserQuota(t, userID))
	require.Equal(t, 500, getTokenRemainQuota(t, tokenID))
	require.NotNil(t, PreConsumeBilling(ctx, reserve, info))
	require.Equal(t, 1500, getUserQuota(t, userID))
}
