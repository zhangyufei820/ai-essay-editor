package service

import (
	"fmt"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type missingUsageBillingRecorder struct {
	preConsumed  int
	settledQuota []int
}

func (recorder *missingUsageBillingRecorder) Settle(actualQuota int) error {
	recorder.settledQuota = append(recorder.settledQuota, actualQuota)
	return nil
}

func (recorder *missingUsageBillingRecorder) Refund(*gin.Context) {}

func (recorder *missingUsageBillingRecorder) NeedsRefund() bool {
	return false
}

func (recorder *missingUsageBillingRecorder) GetPreConsumedQuota() int {
	return recorder.preConsumed
}

func (recorder *missingUsageBillingRecorder) Reserve(int) error {
	return nil
}

func TestPostTextConsumeQuotaRetainsPreconsumeWhenOutputLacksUsage(t *testing.T) {
	truncate(t)
	gin.SetMode(gin.TestMode)
	seedUser(t, 901, 1_000)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	context.Set("response_stream_output_sent", true)
	context.Set("response_stream_usage_drain_attempted", true)
	context.Set("response_stream_usage_drain_timed_out", true)
	billing := &missingUsageBillingRecorder{preConsumed: 100}
	relayInfo := &relaycommon.RelayInfo{
		UserId:                901,
		OriginModelName:       "gpt-5.6",
		IsStream:              true,
		StartTime:             time.Now(),
		FinalPreConsumedQuota: 100,
		Billing:               billing,
		BillingSource:         BillingSourceSubscription,
		SubscriptionPlanId:    3,
		SubscriptionPlanTitle: "¥200 月卡",
		ChannelMeta:           &relaycommon.ChannelMeta{},
	}

	PostTextConsumeQuota(context, relayInfo, &dto.Usage{}, nil)

	require.Equal(t, []int{100}, billing.settledQuota)
	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, 100, log.Quota)
	other := getLastLogOther(t)
	assert.Equal(t, "preconsume_retained_missing_usage_after_output", other["billing_settlement"])
	assert.Equal(t, true, other["missing_usage_after_output"])
	assert.Equal(t, float64(100), other["pre_consumed_quota"])
	assert.Equal(t, float64(100), other["charged_quota"])
	assert.Equal(t, true, other["upstream_usage_drain_attempted"])
	assert.Equal(t, true, other["upstream_usage_drain_timed_out"])
	assert.NotContains(t, other, "refund_reason")
	var user model.User
	require.NoError(t, model.DB.Select("used_quota", "request_count").Where("id = ?", 901).First(&user).Error)
	assert.Equal(t, 100, user.UsedQuota)
	assert.Equal(t, 1, user.RequestCount)
}

func TestPostTextConsumeQuotaRefundsPreconsumeWhenNoOutputLacksUsage(t *testing.T) {
	truncate(t)
	gin.SetMode(gin.TestMode)
	seedUser(t, 902, 1_000)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	billing := &missingUsageBillingRecorder{preConsumed: 100}
	relayInfo := &relaycommon.RelayInfo{
		UserId:                902,
		OriginModelName:       "gpt-5.6",
		IsStream:              true,
		StartTime:             time.Now(),
		FinalPreConsumedQuota: 100,
		Billing:               billing,
		ChannelMeta:           &relaycommon.ChannelMeta{},
	}

	PostTextConsumeQuota(context, relayInfo, &dto.Usage{}, nil)

	require.Equal(t, []int{0}, billing.settledQuota)
	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, 0, log.Quota)
	other := getLastLogOther(t)
	assert.Equal(t, "preconsume_refund_no_usage", other["billing_settlement"])
}

func TestPostTextConsumeQuotaRetainsMonthlyCardPreconsumeWithoutDoubleConversion(t *testing.T) {
	truncate(t)
	gin.SetMode(gin.TestMode)
	const userID = 903
	const planID = 903
	const subscriptionID = 903
	seedUser(t, userID, 0)
	require.NoError(t, model.DB.Create(&model.SubscriptionPlan{
		Id:                 planID,
		Title:              "¥200 月卡",
		Currency:           "CNY",
		Enabled:            true,
		TotalAmount:        1_000,
		MonthlyAmountTotal: 1_000,
	}).Error)
	require.NoError(t, model.DB.Create(&model.UserSubscription{
		Id:                 subscriptionID,
		UserId:             userID,
		PlanId:             planID,
		AmountTotal:        1_000,
		MonthlyAmountTotal: 1_000,
		Status:             "active",
		StartTime:          time.Now().Unix(),
		EndTime:            time.Now().Add(30 * 24 * time.Hour).Unix(),
	}).Error)

	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	context.Set("monthly_card_token", true)
	context.Set("token_name", "月卡专用 Key")
	context.Set("response_stream_output_sent", true)
	relayInfo := &relaycommon.RelayInfo{
		UserId:          userID,
		RequestId:       fmt.Sprintf("missing-usage-monthly-%d", userID),
		OriginModelName: "gpt-5.5",
		IsStream:        true,
		StartTime:       time.Now(),
		ChannelMeta:     &relaycommon.ChannelMeta{},
	}
	require.Nil(t, PreConsumeBilling(context, 190, relayInfo))
	require.Equal(t, 100, relayInfo.FinalPreConsumedQuota)

	PostTextConsumeQuota(context, relayInfo, &dto.Usage{}, nil)

	var subscription model.UserSubscription
	require.NoError(t, model.DB.First(&subscription, subscriptionID).Error)
	assert.Equal(t, int64(100), subscription.AmountUsed)
	assert.Equal(t, int64(100), subscription.MonthlyAmountUsed)
	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, 100, log.Quota)
	other := getLastLogOther(t)
	assert.Equal(t, "preconsume_retained_missing_usage_after_output", other["billing_settlement"])
}

func TestHasTextOutputSentUsesNativeResponsesSuccessMarker(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	_, err := context.Writer.WriteString("response headers were committed")
	require.NoError(t, err)
	context.Set("responses_stream_output_tracking", true)

	assert.False(t, HasTextOutputSent(context))

	context.Set("response_stream_output_sent", true)
	assert.True(t, HasTextOutputSent(context))
}
