package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
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
