package service

import (
	"fmt"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMonthlyCardTextBillingQuotaUsesOnePointEightEquivalent(t *testing.T) {
	assert.Equal(t, 0, MonthlyCardTextBillingQuota(0))
	assert.Equal(t, 1, MonthlyCardTextBillingQuota(1))
	assert.Equal(t, 100, MonthlyCardTextBillingQuota(180))
	assert.Equal(t, 164_228, MonthlyCardTextBillingQuota(295_609))
}

func TestMonthlyCardTextBillingQuotaUsesPlanSpecificTiers(t *testing.T) {
	assert.Equal(t, 100, MonthlyCardTextBillingQuotaForPlan(180, 2, "¥100 月卡"))
	assert.Equal(t, 100, MonthlyCardTextBillingQuotaForPlan(190, 3, "¥200 月卡"))
	assert.Equal(t, 100, MonthlyCardTextBillingQuotaForPlan(200, 4, "¥300 月卡"))
	assert.Equal(t, 100, MonthlyCardTextBillingQuotaForPlan(205, 5, "¥500 月卡"))
	assert.Equal(t, 100, MonthlyCardTextBillingQuotaForPlan(208, 6, "¥1000 月卡"))
}

func TestMonthlyCardTextPlanBilledQuotaSkipsExtraValueForDiscountGroup(t *testing.T) {
	assert.Equal(t, 100, monthlyCardTextPlanBilledQuota(200, 4, "¥300 月卡", true))
	assert.Equal(t, 200, monthlyCardTextPlanBilledQuota(200, 4, "¥300 月卡", false))
}

func TestMonthlyCardTextDiscountOnlyAppliesToCurrentTextMonthlyPlans(t *testing.T) {
	assert.True(t, model.IsCurrentMonthlyCardTextDiscountPlanInfo(4, "¥300 月卡"))
	assert.False(t, model.IsCurrentMonthlyCardTextDiscountPlanInfo(1, "VIP 旧版 ¥500 月卡"))
	assert.False(t, MonthlyCardTextSupportsModel("gpt-image-2-4K"))
	assert.False(t, MonthlyCardTextSupportsModel(model.ImageBenefitModelName))
	assert.True(t, MonthlyCardTextSupportsModel("gpt-5.5"))
}

func TestEffectiveMonthlyCardTextBillingQuota(t *testing.T) {
	info := &relaycommon.RelayInfo{
		BillingSource:         BillingSourceSubscription,
		OriginModelName:       "gpt-5.5",
		SubscriptionPlanId:    4,
		SubscriptionPlanTitle: "¥300 月卡",
	}
	assert.Equal(t, 90, EffectiveMonthlyCardTextBillingQuota(info, 180))

	info.UsingGroup = DiscountPricingGroupName
	assert.Equal(t, 180, EffectiveMonthlyCardTextBillingQuota(info, 180))
	info.UsingGroup = "default"

	info.SubscriptionPlanId = 1
	info.SubscriptionPlanTitle = "VIP 旧版 ¥500 月卡"
	assert.Equal(t, 180, EffectiveMonthlyCardTextBillingQuota(info, 180))

	info.SubscriptionPlanId = 4
	info.SubscriptionPlanTitle = "¥300 月卡"
	info.OriginModelName = "gpt-image-2-4K"
	assert.Equal(t, 180, EffectiveMonthlyCardTextBillingQuota(info, 180))

	info.OriginModelName = model.ImageBenefitModelName
	assert.Equal(t, 180, EffectiveMonthlyCardTextBillingQuota(info, 180))
}

func TestDiscountGroupMonthlyCardBillingUsesRetailQuotaOnSelectedPlan(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for index, actualQuota := range []int{150, 250} {
		actualQuota := actualQuota
		t.Run(fmt.Sprintf("settle_%d", actualQuota), func(t *testing.T) {
			truncate(t)
			userID := 700 + index
			planID := 800 + index
			subscriptionID := 900 + index
			seedUser(t, userID, 0)
			require.NoError(t, model.DB.Create(&model.SubscriptionPlan{
				Id:                 planID,
				Title:              "¥300 月卡",
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

			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			ctx.Set("monthly_card_token", true)
			ctx.Set("token_name", "月卡专用 Key")
			relayInfo := &relaycommon.RelayInfo{
				UserId:          userID,
				RequestId:       fmt.Sprintf("discount-monthly-%d", index),
				OriginModelName: "gpt-5.5",
				UsingGroup:      DiscountPricingGroupName,
			}

			session, apiErr := NewBillingSession(ctx, relayInfo, 200)
			require.Nil(t, apiErr)
			require.NotNil(t, session)
			assert.Equal(t, 200, session.GetPreConsumedQuota())
			assert.Equal(t, BillingSourceSubscription, relayInfo.BillingSource)
			assert.Equal(t, planID, relayInfo.SubscriptionPlanId)
			assert.Equal(t, int64(200), relayInfo.SubscriptionPreConsumed)

			var subscription model.UserSubscription
			require.NoError(t, model.DB.First(&subscription, subscriptionID).Error)
			assert.Equal(t, int64(200), subscription.AmountUsed)
			assert.Equal(t, int64(200), subscription.MonthlyAmountUsed)

			require.NoError(t, session.Settle(actualQuota))
			require.NoError(t, model.DB.First(&subscription, subscriptionID).Error)
			assert.Equal(t, int64(actualQuota), subscription.AmountUsed)
			assert.Equal(t, int64(actualQuota), subscription.MonthlyAmountUsed)
		})
	}
}
