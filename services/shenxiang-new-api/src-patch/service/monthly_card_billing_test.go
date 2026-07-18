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

func TestMonthlyCardAndWalletBillingPreferenceSplitsFunding(t *testing.T) {
	gin.SetMode(gin.TestMode)
	testCases := []struct {
		name                 string
		userID               int
		planID               int
		subscriptionID       int
		userQuota            int
		monthlyCard          bool
		legacyClaudeEnabled  bool
		modelName            string
		subscriptionTotal    int64
		subscriptionUsed     int64
		wantBillingSource    string
		wantSubscriptionUsed int64
		wantUserQuota        int
		wantError            bool
	}{
		{
			name:                 "uses_monthly_card_for_supported_openai_model",
			userID:               1_101,
			planID:               1_201,
			subscriptionID:       1_301,
			userQuota:            500,
			monthlyCard:          true,
			modelName:            "gpt-5.5",
			subscriptionTotal:    1_000,
			wantBillingSource:    BillingSourceSubscription,
			wantSubscriptionUsed: 49,
			wantUserQuota:        500,
		},
		{
			name:                 "uses_wallet_for_model_outside_monthly_card_whitelist",
			userID:               1_102,
			planID:               1_202,
			subscriptionID:       1_302,
			userQuota:            500,
			monthlyCard:          true,
			modelName:            "claude-opus-4-6",
			subscriptionTotal:    1_000,
			wantBillingSource:    BillingSourceWallet,
			wantSubscriptionUsed: 0,
			wantUserQuota:        400,
		},
		{
			name:                 "uses_monthly_card_for_legacy_claude_entitlement",
			userID:               1_105,
			planID:               1_205,
			subscriptionID:       1_305,
			userQuota:            500,
			monthlyCard:          true,
			legacyClaudeEnabled:  true,
			modelName:            "claude-opus-4-6",
			subscriptionTotal:    1_000,
			wantBillingSource:    BillingSourceSubscription,
			wantSubscriptionUsed: 100,
			wantUserQuota:        500,
		},
		{
			name:                 "legacy_claude_entitlement_does_not_open_other_models",
			userID:               1_106,
			planID:               1_206,
			subscriptionID:       1_306,
			userQuota:            500,
			monthlyCard:          true,
			legacyClaudeEnabled:  true,
			modelName:            "grok-4.5",
			subscriptionTotal:    1_000,
			wantBillingSource:    BillingSourceWallet,
			wantSubscriptionUsed: 0,
			wantUserQuota:        400,
		},
		{
			name:                 "does_not_fall_back_to_wallet_when_monthly_card_quota_is_exhausted",
			userID:               1_103,
			planID:               1_203,
			subscriptionID:       1_303,
			userQuota:            500,
			monthlyCard:          true,
			modelName:            "gpt-5.5",
			subscriptionTotal:    100,
			subscriptionUsed:     100,
			wantSubscriptionUsed: 100,
			wantUserQuota:        500,
			wantError:            true,
		},
		{
			name:                 "does_not_use_non_monthly_subscription",
			userID:               1_104,
			planID:               1_204,
			subscriptionID:       1_304,
			userQuota:            500,
			modelName:            "gpt-5.5",
			subscriptionTotal:    1_000,
			wantBillingSource:    BillingSourceWallet,
			wantSubscriptionUsed: 0,
			wantUserQuota:        400,
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			truncate(t)
			seedUser(t, testCase.userID, testCase.userQuota)
			planTitle := "普通订阅"
			planPrice := 100.0
			if testCase.monthlyCard {
				planTitle = "¥500 月卡"
				planPrice = 500
			}
			require.NoError(t, model.DB.Create(&model.SubscriptionPlan{
				Id:          testCase.planID,
				Title:       planTitle,
				PriceAmount: planPrice,
				Currency:    "CNY",
				Enabled:     true,
				TotalAmount: testCase.subscriptionTotal,
			}).Error)
			require.NoError(t, model.DB.Create(&model.UserSubscription{
				Id:                  testCase.subscriptionID,
				UserId:              testCase.userID,
				PlanId:              testCase.planID,
				AmountTotal:         testCase.subscriptionTotal,
				AmountUsed:          testCase.subscriptionUsed,
				AllowWalletOverflow: true,
				Status:              "active",
				StartTime:           time.Now().Unix(),
				EndTime:             time.Now().Add(30 * 24 * time.Hour).Unix(),
			}).Error)

			relayInfo := &relaycommon.RelayInfo{
				UserId:          testCase.userID,
				RequestId:       fmt.Sprintf("monthly-card-and-wallet-%d", testCase.userID),
				OriginModelName: testCase.modelName,
				IsPlayground:    true,
			}
			relayInfo.UserSetting.BillingPreference = "monthly_card_and_wallet"
			relayInfo.UserSetting.LegacyMonthlyCardClaudeEnabled = testCase.legacyClaudeEnabled
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())

			session, apiErr := NewBillingSession(ctx, relayInfo, 100)
			if testCase.wantError {
				require.Nil(t, session)
				require.NotNil(t, apiErr)
			} else {
				require.NotNil(t, session)
				require.Nil(t, apiErr)
				assert.Equal(t, testCase.wantBillingSource, relayInfo.BillingSource)
			}

			var subscription model.UserSubscription
			require.NoError(t, model.DB.First(&subscription, testCase.subscriptionID).Error)
			assert.Equal(t, testCase.wantSubscriptionUsed, subscription.AmountUsed)

			quota, err := model.GetUserQuota(testCase.userID, false)
			require.NoError(t, err)
			assert.Equal(t, testCase.wantUserQuota, quota)
		})
	}
}

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
