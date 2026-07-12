package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func resetFinancialSafetyFixtures(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&SubscriptionPreConsumeRecord{}))
	for _, table := range []string{"subscription_pre_consume_records", "user_subscriptions", "users"} {
		require.NoError(t, DB.Exec("DELETE FROM "+table).Error)
	}
	t.Cleanup(func() {
		for _, table := range []string{"subscription_pre_consume_records", "user_subscriptions", "users"} {
			DB.Exec("DELETE FROM " + table)
		}
	})
}

func TestUserUpdateDoesNotOverwriteFinancialFields(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	user := &User{
		Username:        "financial-snapshot-user",
		Password:        "password",
		DisplayName:     "before",
		Status:          common.UserStatusEnabled,
		Quota:           1000,
		UsedQuota:       20,
		RequestCount:    3,
		AffCount:        1,
		AffQuota:        100,
		AffHistoryQuota: 200,
	}
	require.NoError(t, DB.Create(user).Error)

	staleUser, err := GetUserById(user.Id, true)
	require.NoError(t, err)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", user.Id).Updates(map[string]interface{}{
		"quota":         gorm.Expr("quota - ?", 400),
		"used_quota":    gorm.Expr("used_quota + ?", 400),
		"request_count": gorm.Expr("request_count + ?", 1),
		"aff_count":     gorm.Expr("aff_count + ?", 1),
		"aff_quota":     gorm.Expr("aff_quota + ?", 50),
		"aff_history":   gorm.Expr("aff_history + ?", 50),
	}).Error)

	staleUser.DisplayName = "after"
	require.NoError(t, staleUser.Update(false))

	var got User
	require.NoError(t, DB.First(&got, user.Id).Error)
	require.Equal(t, "after", got.DisplayName)
	require.Equal(t, 600, got.Quota)
	require.Equal(t, 420, got.UsedQuota)
	require.Equal(t, 4, got.RequestCount)
	require.Equal(t, 2, got.AffCount)
	require.Equal(t, 150, got.AffQuota)
	require.Equal(t, 250, got.AffHistoryQuota)
}

func TestTryDecreaseUserQuotaRejectsInsufficientBalance(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	user := &User{Username: "conditional-debit-user", Status: common.UserStatusEnabled, Quota: 100}
	require.NoError(t, DB.Create(user).Error)

	require.NoError(t, TryDecreaseUserQuota(user.Id, 70))
	require.ErrorIs(t, TryDecreaseUserQuota(user.Id, 40), ErrInsufficientQuota)

	var got User
	require.NoError(t, DB.First(&got, user.Id).Error)
	require.Equal(t, 30, got.Quota)
}

func TestPostConsumeUserSubscriptionDeltaWithTxUsesCallerTransaction(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	subscription := &UserSubscription{
		UserId:             1,
		PlanId:             1,
		AmountTotal:        1000,
		AmountUsed:         100,
		MonthlyAmountTotal: 1000,
		MonthlyAmountUsed:  100,
		Status:             "active",
	}
	require.NoError(t, DB.Create(subscription).Error)

	tx := DB.Begin()
	require.NoError(t, tx.Error)
	require.NoError(t, PostConsumeUserSubscriptionDeltaWithTx(tx, subscription.Id, -40))
	require.NoError(t, tx.Rollback().Error)

	var got UserSubscription
	require.NoError(t, DB.First(&got, subscription.Id).Error)
	require.EqualValues(t, 100, got.AmountUsed)
	require.EqualValues(t, 100, got.MonthlyAmountUsed)
}

func TestRefundSubscriptionPreConsumeIsIdempotent(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	subscription := &UserSubscription{
		UserId:             1,
		PlanId:             1,
		AmountTotal:        1000,
		AmountUsed:         100,
		MonthlyAmountTotal: 1000,
		MonthlyAmountUsed:  100,
		Status:             "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	record := &SubscriptionPreConsumeRecord{
		RequestId:          "financial-refund-request",
		UserId:             1,
		UserSubscriptionId: subscription.Id,
		PreConsumed:        40,
		Status:             "consumed",
	}
	require.NoError(t, DB.Create(record).Error)

	require.NoError(t, RefundSubscriptionPreConsume(record.RequestId))
	require.NoError(t, RefundSubscriptionPreConsume(record.RequestId))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	require.EqualValues(t, 60, gotSubscription.AmountUsed)
	require.EqualValues(t, 60, gotSubscription.MonthlyAmountUsed)
	var gotRecord SubscriptionPreConsumeRecord
	require.NoError(t, DB.First(&gotRecord, record.Id).Error)
	require.Equal(t, "refunded", gotRecord.Status)
}
