package model

import (
	"math"
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
		StartTime:          1000,
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
		StartTime:          1000,
		Status:             "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	record := &SubscriptionPreConsumeRecord{
		RequestId:          "financial-refund-request",
		UserId:             1,
		UserSubscriptionId: subscription.Id,
		PreConsumed:        40,
		ResetEpoch:         1000,
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

func TestRefundSubscriptionPreConsumeWithDeltaIsAtomicAndIdempotent(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	subscription := &UserSubscription{
		UserId: 1, PlanId: 1, AmountTotal: 1000, AmountUsed: 140,
		MonthlyAmountTotal: 1000, MonthlyAmountUsed: 140, StartTime: 1000, Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	record := &SubscriptionPreConsumeRecord{
		RequestId: "financial-adjusted-refund", UserId: 1,
		UserSubscriptionId: subscription.Id, PreConsumed: 100, Status: "consumed",
		ResetEpoch: 1000,
	}
	require.NoError(t, DB.Create(record).Error)

	require.NoError(t, RefundSubscriptionPreConsumeWithDelta(record.RequestId, 40))
	require.NoError(t, RefundSubscriptionPreConsumeWithDelta(record.RequestId, 40))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	require.Zero(t, gotSubscription.AmountUsed)
	require.Zero(t, gotSubscription.MonthlyAmountUsed)
	var gotRecord SubscriptionPreConsumeRecord
	require.NoError(t, DB.First(&gotRecord, record.Id).Error)
	require.Equal(t, "refunded", gotRecord.Status)
}

func TestRefundSubscriptionPreConsumeWithDeltaRejectsInvalidBounds(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	subscription := &UserSubscription{UserId: 1, PlanId: 1, AmountTotal: 1000, AmountUsed: 100, Status: "active"}
	require.NoError(t, DB.Create(subscription).Error)
	record := &SubscriptionPreConsumeRecord{
		RequestId: "financial-adjusted-refund-bounds", UserId: 1,
		UserSubscriptionId: subscription.Id, PreConsumed: 100, Status: "consumed",
	}
	require.NoError(t, DB.Create(record).Error)

	require.EqualError(t, RefundSubscriptionPreConsumeWithDelta(record.RequestId, -101), "subscription refund amount is negative")
	require.EqualError(t, RefundSubscriptionPreConsumeWithDelta(record.RequestId, math.MaxInt64), "subscription refund amount would overflow")
	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	require.EqualValues(t, 100, gotSubscription.AmountUsed)
	var gotRecord SubscriptionPreConsumeRecord
	require.NoError(t, DB.First(&gotRecord, record.Id).Error)
	require.Equal(t, "consumed", gotRecord.Status)
}

func TestRefundSubscriptionPreConsumeAfterResetPreservesCurrentUsage(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	firstEpoch := int64(1_700_000_000)
	subscription := &UserSubscription{
		UserId: 1, PlanId: 1, AmountTotal: 1000, AmountUsed: 30,
		MonthlyAmountTotal: 1000, MonthlyAmountUsed: 140,
		StartTime: firstEpoch, LastResetTime: firstEpoch + 3600, Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	record := &SubscriptionPreConsumeRecord{
		RequestId: "financial-reset-refund", UserId: 1,
		UserSubscriptionId: subscription.Id, PreConsumed: 100,
		ResetEpoch: firstEpoch, Status: "consumed",
	}
	require.NoError(t, DB.Create(record).Error)

	require.NoError(t, RefundSubscriptionPreConsume(record.RequestId))
	require.NoError(t, RefundSubscriptionPreConsume(record.RequestId))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	require.EqualValues(t, 30, gotSubscription.AmountUsed)
	require.EqualValues(t, 40, gotSubscription.MonthlyAmountUsed)
	var gotRecord SubscriptionPreConsumeRecord
	require.NoError(t, DB.First(&gotRecord, record.Id).Error)
	require.Equal(t, "refunded", gotRecord.Status)
}

func TestRefundSubscriptionPreConsumeAfterResetRejectsMonthlyUnderflow(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	firstEpoch := int64(1_700_000_000)
	subscription := &UserSubscription{
		UserId: 1, PlanId: 1, AmountTotal: 1000, AmountUsed: 30,
		MonthlyAmountTotal: 1000, MonthlyAmountUsed: 20,
		StartTime: firstEpoch, LastResetTime: firstEpoch + 3600, Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	record := &SubscriptionPreConsumeRecord{
		RequestId: "financial-reset-refund-underflow", UserId: 1,
		UserSubscriptionId: subscription.Id, PreConsumed: 100,
		ResetEpoch: firstEpoch, Status: "consumed",
	}
	require.NoError(t, DB.Create(record).Error)

	require.Error(t, RefundSubscriptionPreConsume(record.RequestId))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	require.EqualValues(t, 30, gotSubscription.AmountUsed)
	require.EqualValues(t, 20, gotSubscription.MonthlyAmountUsed)
	var gotRecord SubscriptionPreConsumeRecord
	require.NoError(t, DB.First(&gotRecord, record.Id).Error)
	require.Equal(t, "consumed", gotRecord.Status)
}

func TestLegacySubscriptionPreConsumeEpochBeforeResetUsesHistoricalSentinel(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	subscription := &UserSubscription{
		UserId: 1, PlanId: 1, AmountTotal: 1000, AmountUsed: 30,
		MonthlyAmountTotal: 1000, MonthlyAmountUsed: 140,
		StartTime: 1000, LastResetTime: 2000, Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	record := &SubscriptionPreConsumeRecord{
		RequestId: "legacy-epoch-before-reset", UserId: 1,
		UserSubscriptionId: subscription.Id, PreConsumed: 100, Status: "consumed",
	}
	require.NoError(t, DB.Create(record).Error)
	require.NoError(t, DB.Model(&SubscriptionPreConsumeRecord{}).Where("id = ?", record.Id).Update("created_at", 1500).Error)

	require.NoError(t, RefundSubscriptionPreConsume(record.RequestId))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	require.EqualValues(t, 30, gotSubscription.AmountUsed)
	require.EqualValues(t, 40, gotSubscription.MonthlyAmountUsed)
}

func TestLegacySubscriptionPreConsumeEpochInCurrentPeriodAdjustsBothCounters(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	subscription := &UserSubscription{
		UserId: 1, PlanId: 1, AmountTotal: 1000, AmountUsed: 100,
		MonthlyAmountTotal: 1000, MonthlyAmountUsed: 100,
		StartTime: 1000, LastResetTime: 2000, Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	record := &SubscriptionPreConsumeRecord{
		RequestId: "legacy-epoch-current", UserId: 1,
		UserSubscriptionId: subscription.Id, PreConsumed: 40, Status: "consumed",
	}
	require.NoError(t, DB.Create(record).Error)
	require.NoError(t, DB.Model(&SubscriptionPreConsumeRecord{}).Where("id = ?", record.Id).Update("created_at", 2500).Error)

	require.NoError(t, RefundSubscriptionPreConsume(record.RequestId))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	require.EqualValues(t, 60, gotSubscription.AmountUsed)
	require.EqualValues(t, 60, gotSubscription.MonthlyAmountUsed)
}

func TestLegacySubscriptionPreConsumeUnknownEpochFailsClosed(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	subscription := &UserSubscription{
		UserId: 1, PlanId: 1, AmountTotal: 1000, AmountUsed: 100,
		MonthlyAmountTotal: 1000, MonthlyAmountUsed: 100, Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	record := &SubscriptionPreConsumeRecord{
		RequestId: "legacy-epoch-unknown", UserId: 1,
		UserSubscriptionId: subscription.Id, PreConsumed: 40, Status: "consumed",
	}
	require.NoError(t, DB.Create(record).Error)

	require.Error(t, RefundSubscriptionPreConsume(record.RequestId))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	require.EqualValues(t, 100, gotSubscription.AmountUsed)
	require.EqualValues(t, 100, gotSubscription.MonthlyAmountUsed)
	var gotRecord SubscriptionPreConsumeRecord
	require.NoError(t, DB.First(&gotRecord, record.Id).Error)
	require.Equal(t, "consumed", gotRecord.Status)
}

func TestLegacySubscriptionPreConsumeEpochEqualToResetFailsClosed(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	subscription := &UserSubscription{
		UserId: 1, PlanId: 1, AmountTotal: 1000, AmountUsed: 100,
		MonthlyAmountTotal: 1000, MonthlyAmountUsed: 100,
		StartTime: 1000, LastResetTime: 2000, Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	record := &SubscriptionPreConsumeRecord{
		RequestId: "legacy-epoch-equal-reset", UserId: 1,
		UserSubscriptionId: subscription.Id, PreConsumed: 40, Status: "consumed",
	}
	require.NoError(t, DB.Create(record).Error)
	require.NoError(t, DB.Model(&SubscriptionPreConsumeRecord{}).Where("id = ?", record.Id).Update("created_at", 2000).Error)

	require.Error(t, RefundSubscriptionPreConsume(record.RequestId))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	require.EqualValues(t, 100, gotSubscription.AmountUsed)
	require.EqualValues(t, 100, gotSubscription.MonthlyAmountUsed)
}

func TestCleanupSubscriptionPreConsumeRecordsOnlyDeletesRefunded(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	consumed := &SubscriptionPreConsumeRecord{
		RequestId: "cleanup-consumed", UserId: 1, UserSubscriptionId: 1,
		PreConsumed: 10, ResetEpoch: 1000, Status: "consumed",
	}
	refunded := &SubscriptionPreConsumeRecord{
		RequestId: "cleanup-refunded", UserId: 1, UserSubscriptionId: 1,
		PreConsumed: 10, ResetEpoch: 1000, Status: "refunded",
	}
	require.NoError(t, DB.Create(consumed).Error)
	require.NoError(t, DB.Create(refunded).Error)
	oldTimestamp := GetDBTimestamp() - 3600
	require.NoError(t, DB.Model(&SubscriptionPreConsumeRecord{}).Where("id IN ?", []int{consumed.Id, refunded.Id}).Updates(map[string]interface{}{
		"created_at": oldTimestamp,
		"updated_at": oldTimestamp,
	}).Error)

	deleted, err := CleanupSubscriptionPreConsumeRecords(60)
	require.NoError(t, err)
	require.EqualValues(t, 1, deleted)
	var consumedCount int64
	require.NoError(t, DB.Model(&SubscriptionPreConsumeRecord{}).Where("id = ?", consumed.Id).Count(&consumedCount).Error)
	require.EqualValues(t, 1, consumedCount)
	var refundedCount int64
	require.NoError(t, DB.Model(&SubscriptionPreConsumeRecord{}).Where("id = ?", refunded.Id).Count(&refundedCount).Error)
	require.Zero(t, refundedCount)
}

func TestManualSubscriptionResetAdvancesUsageEpochWithoutMovingSchedule(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	plan := &SubscriptionPlan{QuotaResetPeriod: SubscriptionResetDaily}
	subscription := &UserSubscription{
		UserId: 1, PlanId: 1, AmountTotal: 1000, AmountUsed: 100,
		StartTime: 1000, LastResetTime: 1000, NextResetTime: 3000, Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)

	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return resetUserSubscriptionTx(tx, subscription, plan, 2000, false)
	}))

	var got UserSubscription
	require.NoError(t, DB.First(&got, subscription.Id).Error)
	require.Zero(t, got.AmountUsed)
	require.EqualValues(t, 2000, got.UsageResetEpoch)
	require.EqualValues(t, 1000, got.LastResetTime)
	require.EqualValues(t, 3000, got.NextResetTime)
}

func TestManualSubscriptionResetEpochAdvancesWithinSameSecond(t *testing.T) {
	resetFinancialSafetyFixtures(t)
	plan := &SubscriptionPlan{QuotaResetPeriod: SubscriptionResetDaily}
	subscription := &UserSubscription{
		UserId: 1, PlanId: 1, AmountTotal: 1000, AmountUsed: 100,
		StartTime: 1000, LastResetTime: 1000, NextResetTime: 3000, Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)

	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		if err := resetUserSubscriptionTx(tx, subscription, plan, 2000, false); err != nil {
			return err
		}
		subscription.AmountUsed = 50
		return resetUserSubscriptionTx(tx, subscription, plan, 2000, false)
	}))

	var got UserSubscription
	require.NoError(t, DB.First(&got, subscription.Id).Error)
	require.Zero(t, got.AmountUsed)
	require.EqualValues(t, 2001, got.UsageResetEpoch)
}
