package model

import (
	"errors"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func setupSubscriptionLimitTestDB(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&SubscriptionPreConsumeRecord{}))
	truncateTables(t)
	DB.Exec("DELETE FROM subscription_pre_consume_records")
}

func TestCreateUserSubscriptionCopiesMonthlyAndConcurrencyLimits(t *testing.T) {
	setupSubscriptionLimitTestDB(t)
	require.NoError(t, DB.Create(&User{Id: 1, Username: "sub-user", Status: common.UserStatusEnabled}).Error)
	plan := &SubscriptionPlan{
		Id:                 10,
		Title:              "¥500 月卡",
		PriceAmount:        500,
		DurationUnit:       SubscriptionDurationDay,
		DurationValue:      30,
		TotalAmount:        80_000_000,
		MonthlyAmountTotal: 2_400_000_000,
		ConcurrencyLimit:   5,
		QuotaResetPeriod:   SubscriptionResetDaily,
	}
	require.NoError(t, DB.Create(plan).Error)

	sub, err := CreateUserSubscriptionFromPlanTx(DB, 1, plan, "test")
	require.NoError(t, err)

	require.EqualValues(t, 80_000_000, sub.AmountTotal)
	require.EqualValues(t, 2_400_000_000, sub.MonthlyAmountTotal)
	require.Equal(t, 5, sub.ConcurrencyLimit)
	require.Equal(t, "active", sub.Status)
	require.GreaterOrEqual(t, sub.EndTime-sub.StartTime, int64(30*24*60*60-5))
}

func TestHasActiveUserSubscriptionPlanTitle(t *testing.T) {
	setupSubscriptionLimitTestDB(t)
	now := time.Now().Unix()
	require.NoError(t, DB.Create(&SubscriptionPlan{
		Id:            11,
		Title:         "¥500 月卡",
		DurationUnit:  SubscriptionDurationDay,
		DurationValue: 30,
		Enabled:       true,
	}).Error)
	require.NoError(t, DB.Create(&SubscriptionPlan{
		Id:            12,
		Title:         "其它套餐",
		DurationUnit:  SubscriptionDurationDay,
		DurationValue: 30,
		Enabled:       true,
	}).Error)
	require.NoError(t, DB.Create(&UserSubscription{
		UserId:    1,
		PlanId:    11,
		Status:    "active",
		StartTime: now - 60,
		EndTime:   now + 3600,
	}).Error)
	require.NoError(t, DB.Create(&UserSubscription{
		UserId:    2,
		PlanId:    11,
		Status:    "active",
		StartTime: now - 7200,
		EndTime:   now - 3600,
	}).Error)
	require.NoError(t, DB.Create(&UserSubscription{
		UserId:    3,
		PlanId:    12,
		Status:    "active",
		StartTime: now - 60,
		EndTime:   now + 3600,
	}).Error)

	ok, err := HasActiveUserSubscriptionPlanTitle(1, "¥500 月卡")
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = HasActiveUserSubscriptionPlanTitle(2, "¥500 月卡")
	require.NoError(t, err)
	require.False(t, ok)

	ok, err = HasActiveUserSubscriptionPlanTitle(3, "¥500 月卡")
	require.NoError(t, err)
	require.False(t, ok)
}

func TestPreConsumeUserSubscriptionEnforcesDailyAndMonthlyLimits(t *testing.T) {
	setupSubscriptionLimitTestDB(t)
	require.NoError(t, DB.Create(&SubscriptionPlan{
		Id:                 20,
		Title:              "¥500 月卡",
		DurationUnit:       SubscriptionDurationDay,
		DurationValue:      30,
		TotalAmount:        100,
		MonthlyAmountTotal: 150,
		ConcurrencyLimit:   5,
		QuotaResetPeriod:   SubscriptionResetDaily,
	}).Error)
	require.NoError(t, DB.Create(&UserSubscription{
		Id:                 30,
		UserId:             1,
		PlanId:             20,
		AmountTotal:        100,
		AmountUsed:         40,
		MonthlyAmountTotal: 150,
		MonthlyAmountUsed:  90,
		ConcurrencyLimit:   5,
		Status:             "active",
		StartTime:          time.Now().Unix(),
		EndTime:            time.Now().Add(30 * 24 * time.Hour).Unix(),
	}).Error)

	res, err := PreConsumeUserSubscription("req-ok", 1, "gpt-5.5", 0, 50)
	require.NoError(t, err)
	require.EqualValues(t, 90, res.AmountUsedAfter)
	require.EqualValues(t, 140, res.MonthlyAmountUsedAfter)

	_, err = PreConsumeUserSubscription("req-daily-over", 1, "gpt-5.5", 0, 20)
	require.Error(t, err)
	var limitErr *SubscriptionLimitError
	require.True(t, errors.As(err, &limitErr))
	require.Equal(t, "daily", limitErr.Reason)

	require.NoError(t, DB.Model(&UserSubscription{}).Where("id = ?", 30).Updates(map[string]interface{}{
		"amount_used":         0,
		"monthly_amount_used": 145,
	}).Error)
	_, err = PreConsumeUserSubscription("req-monthly-over", 1, "gpt-5.5", 0, 10)
	require.Error(t, err)
	require.True(t, errors.As(err, &limitErr))
	require.Equal(t, "monthly", limitErr.Reason)
}
