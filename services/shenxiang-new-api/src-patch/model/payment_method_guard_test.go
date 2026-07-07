package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func insertUserForPaymentGuardTest(t *testing.T, id int, quota int) {
	t.Helper()
	user := &User{
		Id:       id,
		Username: "payment_guard_user",
		Status:   common.UserStatusEnabled,
		Quota:    quota,
	}
	require.NoError(t, DB.Create(user).Error)
}

func insertSubscriptionPlanForPaymentGuardTest(t *testing.T, id int) *SubscriptionPlan {
	t.Helper()
	plan := &SubscriptionPlan{
		Id:            id,
		Title:         "Guard Plan",
		PriceAmount:   9.99,
		Currency:      "USD",
		DurationUnit:  SubscriptionDurationMonth,
		DurationValue: 1,
		Enabled:       true,
		TotalAmount:   1000,
	}
	require.NoError(t, DB.Create(plan).Error)
	return plan
}

func insertSubscriptionOrderForPaymentGuardTest(t *testing.T, tradeNo string, userID int, planID int, paymentProvider string) {
	t.Helper()
	order := &SubscriptionOrder{
		UserId:          userID,
		PlanId:          planID,
		Money:           9.99,
		TradeNo:         tradeNo,
		PaymentMethod:   paymentProvider,
		PaymentProvider: paymentProvider,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	require.NoError(t, order.Insert())
}

func insertTopUpForPaymentGuardTest(t *testing.T, tradeNo string, userID int, paymentProvider string) {
	t.Helper()
	topUp := &TopUp{
		UserId:          userID,
		Amount:          2,
		Money:           9.99,
		TradeNo:         tradeNo,
		PaymentMethod:   paymentProvider,
		PaymentProvider: paymentProvider,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	require.NoError(t, topUp.Insert())
}

func getTopUpStatusForPaymentGuardTest(t *testing.T, tradeNo string) string {
	t.Helper()
	topUp := GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, topUp)
	return topUp.Status
}

func countUserSubscriptionsForPaymentGuardTest(t *testing.T, userID int) int64 {
	t.Helper()
	var count int64
	require.NoError(t, DB.Model(&UserSubscription{}).Where("user_id = ?", userID).Count(&count).Error)
	return count
}

func getUserQuotaForPaymentGuardTest(t *testing.T, userID int) int {
	t.Helper()
	var user User
	require.NoError(t, DB.Select("quota").Where("id = ?", userID).First(&user).Error)
	return user.Quota
}

func getUserAffiliateQuotaForPaymentGuardTest(t *testing.T, userID int) (int, int) {
	t.Helper()
	var user User
	require.NoError(t, DB.Select("aff_quota", "aff_history").Where("id = ?", userID).First(&user).Error)
	return user.AffQuota, user.AffHistoryQuota
}

func setAffiliateRebateRatesForPaymentGuardTest(t *testing.T, raw string) {
	t.Helper()
	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = map[string]string{}
	}
	old, hadOld := common.OptionMap[AffiliateUserRebateRatesOptionKey]
	common.OptionMap[AffiliateUserRebateRatesOptionKey] = raw
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		defer common.OptionMapRWMutex.Unlock()
		if hadOld {
			common.OptionMap[AffiliateUserRebateRatesOptionKey] = old
			return
		}
		delete(common.OptionMap, AffiliateUserRebateRatesOptionKey)
	})
}

func setQuotaPerUnitForPaymentGuardTest(t *testing.T, quotaPerUnit float64) {
	t.Helper()
	old := common.QuotaPerUnit
	common.QuotaPerUnit = quotaPerUnit
	t.Cleanup(func() {
		common.QuotaPerUnit = old
	})
}

func TestRechargeWaffoPancake_RejectsMismatchedPaymentMethod(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 101, 0)
	insertTopUpForPaymentGuardTest(t, "waffo-pancake-guard", 101, PaymentProviderStripe)

	err := RechargeWaffoPancake("waffo-pancake-guard")
	require.Error(t, err)

	topUp := GetTopUpByTradeNo("waffo-pancake-guard")
	require.NotNil(t, topUp)
	assert.Equal(t, common.TopUpStatusPending, topUp.Status)
	assert.Equal(t, 0, getUserQuotaForPaymentGuardTest(t, 101))
}

func TestRechargeWaffo_AwardsConfiguredInviterRebateOnce(t *testing.T) {
	truncateTables(t)
	setQuotaPerUnitForPaymentGuardTest(t, 100)
	setAffiliateRebateRatesForPaymentGuardTest(t, `{"14":0.3}`)

	require.NoError(t, DB.Create(&User{Id: 14, Username: "inviter", Status: common.UserStatusEnabled, AffCode: "aff14"}).Error)
	require.NoError(t, DB.Create(&User{Id: 1401, Username: "buyer", Status: common.UserStatusEnabled, AffCode: "buy14", InviterId: 14}).Error)
	require.NoError(t, (&TopUp{
		UserId:          1401,
		Amount:          10,
		Money:           10,
		TradeNo:         "waffo-affiliate-rebate",
		PaymentMethod:   PaymentProviderWaffo,
		PaymentProvider: PaymentProviderWaffo,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}).Insert())

	require.NoError(t, RechargeWaffo("waffo-affiliate-rebate", "127.0.0.1"))
	require.NoError(t, RechargeWaffo("waffo-affiliate-rebate", "127.0.0.1"))

	assert.Equal(t, 1000, getUserQuotaForPaymentGuardTest(t, 1401))
	affQuota, affHistory := getUserAffiliateQuotaForPaymentGuardTest(t, 14)
	assert.Equal(t, 300, affQuota)
	assert.Equal(t, 300, affHistory)
}

func TestUpdatePendingTopUpStatus_RejectsMismatchedPaymentProvider(t *testing.T) {
	testCases := []struct {
		name                    string
		tradeNo                 string
		storedPaymentProvider   string
		expectedPaymentProvider string
		targetStatus            string
	}{
		{
			name:                    "stripe expire",
			tradeNo:                 "stripe-expire-guard",
			storedPaymentProvider:   PaymentProviderCreem,
			expectedPaymentProvider: PaymentProviderStripe,
			targetStatus:            common.TopUpStatusExpired,
		},
		{
			name:                    "waffo failed",
			tradeNo:                 "waffo-failed-guard",
			storedPaymentProvider:   PaymentProviderStripe,
			expectedPaymentProvider: PaymentProviderWaffo,
			targetStatus:            common.TopUpStatusFailed,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			truncateTables(t)
			insertUserForPaymentGuardTest(t, 150, 0)
			insertTopUpForPaymentGuardTest(t, tc.tradeNo, 150, tc.storedPaymentProvider)

			err := UpdatePendingTopUpStatus(tc.tradeNo, tc.expectedPaymentProvider, tc.targetStatus)
			require.ErrorIs(t, err, ErrPaymentMethodMismatch)
			assert.Equal(t, common.TopUpStatusPending, getTopUpStatusForPaymentGuardTest(t, tc.tradeNo))
		})
	}
}

func TestCompleteSubscriptionOrder_RejectsMismatchedPaymentProvider(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 202, 0)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 301)
	insertSubscriptionOrderForPaymentGuardTest(t, "sub-guard-order", 202, plan.Id, PaymentProviderStripe)

	err := CompleteSubscriptionOrder("sub-guard-order", `{"provider":"epay"}`, PaymentProviderEpay, "alipay")
	require.ErrorIs(t, err, ErrPaymentMethodMismatch)

	order := GetSubscriptionOrderByTradeNo("sub-guard-order")
	require.NotNil(t, order)
	assert.Equal(t, common.TopUpStatusPending, order.Status)
	assert.Zero(t, countUserSubscriptionsForPaymentGuardTest(t, 202))

	topUp := GetTopUpByTradeNo("sub-guard-order")
	assert.Nil(t, topUp)
}

func TestCompleteSubscriptionOrder_AwardsConfiguredInviterRebateOnce(t *testing.T) {
	truncateTables(t)
	setAffiliateRebateRatesForPaymentGuardTest(t, `{"32":0.3}`)

	require.NoError(t, DB.Create(&User{Id: 32, Username: "sub_inviter", Status: common.UserStatusEnabled, AffCode: "aff32"}).Error)
	require.NoError(t, DB.Create(&User{Id: 3201, Username: "sub_buyer", Status: common.UserStatusEnabled, AffCode: "buy32", InviterId: 32}).Error)
	plan := &SubscriptionPlan{
		Id:            501,
		Title:         "Affiliate Plan",
		PriceAmount:   9.99,
		Currency:      "USD",
		DurationUnit:  SubscriptionDurationMonth,
		DurationValue: 1,
		Enabled:       true,
		TotalAmount:   1000,
	}
	require.NoError(t, DB.Create(plan).Error)
	insertSubscriptionOrderForPaymentGuardTest(t, "sub-affiliate-rebate", 3201, plan.Id, PaymentProviderStripe)

	require.NoError(t, CompleteSubscriptionOrder("sub-affiliate-rebate", `{"provider":"stripe"}`, PaymentProviderStripe, PaymentProviderStripe))
	require.NoError(t, CompleteSubscriptionOrder("sub-affiliate-rebate", `{"provider":"stripe"}`, PaymentProviderStripe, PaymentProviderStripe))

	assert.Equal(t, int64(1), countUserSubscriptionsForPaymentGuardTest(t, 3201))
	affQuota, affHistory := getUserAffiliateQuotaForPaymentGuardTest(t, 32)
	assert.Equal(t, 300, affQuota)
	assert.Equal(t, 300, affHistory)
}

func TestExpireSubscriptionOrder_RejectsMismatchedPaymentProvider(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 303, 0)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 401)
	insertSubscriptionOrderForPaymentGuardTest(t, "sub-expire-guard", 303, plan.Id, PaymentProviderStripe)

	err := ExpireSubscriptionOrder("sub-expire-guard", PaymentProviderCreem)
	require.ErrorIs(t, err, ErrPaymentMethodMismatch)

	order := GetSubscriptionOrderByTradeNo("sub-expire-guard")
	require.NotNil(t, order)
	assert.Equal(t, common.TopUpStatusPending, order.Status)
}
