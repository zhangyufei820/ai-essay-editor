package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func setupRedemptionTestDB(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	for _, table := range []string{
		"redemptions",
		"users",
		"logs",
		"tokens",
		"subscription_plans",
		"user_subscriptions",
	} {
		require.NoError(t, DB.Exec("DELETE FROM "+table).Error)
	}
	t.Cleanup(func() {
		for _, table := range []string{
			"redemptions",
			"users",
			"logs",
			"tokens",
			"subscription_plans",
			"user_subscriptions",
		} {
			DB.Exec("DELETE FROM " + table)
		}
	})
}

func TestRedeemImageBenefitCodeCreatesDedicatedToken(t *testing.T) {
	setupRedemptionTestDB(t)
	require.NoError(t, DB.AutoMigrate(&Token{}))
	require.NoError(t, DB.Create(&User{
		Id:       103,
		Username: "redeem-image-benefit-user",
		Status:   common.UserStatusEnabled,
		Quota:    10,
		Group:    "default",
	}).Error)
	require.NoError(t, DB.Create(&Redemption{
		Key:         "image-benefit-code",
		Name:        ImageBenefitRedemptionName,
		Status:      common.RedemptionCodeStatusEnabled,
		Quota:       30,
		CreatedTime: common.GetTimestamp(),
	}).Error)

	result, err := Redeem("image-benefit-code", 103)
	require.NoError(t, err)
	require.Equal(t, "image_benefit", result.Type)
	require.NotNil(t, result.ImageBenefit)
	require.Equal(t, ImageBenefitModelName, result.ImageBenefit.Model)
	require.Equal(t, ImageBenefitTotalImages, result.ImageBenefit.TotalImages)
	require.Equal(t, ImageBenefitTotalImages, result.ImageBenefit.RemainingImages)
	require.Equal(t, "active", result.ImageBenefit.Status)
	require.Contains(t, result.ImageBenefit.Key, "sk-")

	var user User
	require.NoError(t, DB.Where("id = ?", 103).First(&user).Error)
	require.Equal(t, 10, user.Quota)

	var token Token
	require.NoError(t, DB.Where("user_id = ? AND name = ?", 103, ImageBenefitTokenName).First(&token).Error)
	require.Equal(t, common.TokenStatusEnabled, token.Status)
	require.False(t, token.UnlimitedQuota)
	require.Equal(t, ImageBenefitModelName, token.ModelLimits)
	require.True(t, token.ModelLimitsEnabled)
	require.Greater(t, token.RemainQuota, 0)
	require.GreaterOrEqual(t, token.ExpiredTime-common.GetTimestamp(), int64(7*24*60*60-5))

	var redemption Redemption
	require.NoError(t, DB.Where("`key` = ?", "image-benefit-code").First(&redemption).Error)
	require.Equal(t, common.RedemptionCodeStatusUsed, redemption.Status)
	require.Equal(t, 103, redemption.UsedUserId)
}

func TestImageBenefitCardCountsSuccessfulConsumeLogs(t *testing.T) {
	setupRedemptionTestDB(t)
	require.NoError(t, DB.AutoMigrate(&Token{}))
	quotaPerImage := ImageBenefitQuotaPerImageForGroup("default")
	token := &Token{
		UserId:             104,
		Key:                "image-benefit-token",
		Status:             common.TokenStatusEnabled,
		Name:               ImageBenefitTokenName,
		CreatedTime:        common.GetTimestamp(),
		ExpiredTime:        common.GetTimestamp() + ImageBenefitValidSeconds,
		RemainQuota:        quotaPerImage * (ImageBenefitTotalImages - 2),
		UsedQuota:          quotaPerImage * 20,
		ModelLimitsEnabled: true,
		ModelLimits:        ImageBenefitModelName,
		Group:              "default",
	}
	require.NoError(t, DB.Create(token).Error)
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    104,
		Type:      LogTypeConsume,
		ModelName: ImageBenefitModelName,
		TokenId:   token.Id,
		Quota:     quotaPerImage,
	}).Error)
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    104,
		Type:      LogTypeConsume,
		ModelName: ImageBenefitModelName,
		TokenId:   token.Id,
		Quota:     quotaPerImage,
	}).Error)
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    104,
		Type:      LogTypeError,
		ModelName: ImageBenefitModelName,
		TokenId:   token.Id,
		Quota:     0,
	}).Error)
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    104,
		Type:      LogTypeConsume,
		ModelName: "other-image-model",
		TokenId:   token.Id,
		Quota:     quotaPerImage,
	}).Error)

	result, err := GetLatestImageBenefitTokenResult(104)
	require.NoError(t, err)
	require.Equal(t, ImageBenefitTotalImages, result.TotalImages)
	require.Equal(t, 2, result.UsedImages)
	require.Equal(t, ImageBenefitTotalImages-2, result.RemainingImages)
}

func TestRedeemQuotaCodeKeepsWalletBehavior(t *testing.T) {
	setupRedemptionTestDB(t)
	require.NoError(t, DB.Create(&User{
		Id:       101,
		Username: "redeem-quota-user",
		Status:   common.UserStatusEnabled,
		Quota:    10,
	}).Error)
	require.NoError(t, DB.Create(&Redemption{
		Key:         "quota-code",
		Name:        "quota",
		Status:      common.RedemptionCodeStatusEnabled,
		Quota:       90,
		CreatedTime: common.GetTimestamp(),
	}).Error)

	result, err := Redeem("quota-code", 101)
	require.NoError(t, err)
	require.Equal(t, "quota", result.Type)
	require.Equal(t, 90, result.Quota)

	var user User
	require.NoError(t, DB.Where("id = ?", 101).First(&user).Error)
	require.Equal(t, 100, user.Quota)

	var redemption Redemption
	require.NoError(t, DB.Where("`key` = ?", "quota-code").First(&redemption).Error)
	require.Equal(t, common.RedemptionCodeStatusUsed, redemption.Status)
	require.Equal(t, 101, redemption.UsedUserId)
}

func TestRedeemSubscriptionCodeCreatesUserSubscription(t *testing.T) {
	setupRedemptionTestDB(t)
	require.NoError(t, DB.Create(&User{
		Id:       102,
		Username: "redeem-subscription-user",
		Status:   common.UserStatusEnabled,
		Quota:    10,
	}).Error)
	require.NoError(t, DB.Create(&SubscriptionPlan{
		Id:                 202,
		Title:              "¥500 月卡",
		PriceAmount:        500,
		DurationUnit:       SubscriptionDurationDay,
		DurationValue:      30,
		Enabled:            true,
		TotalAmount:        80_000_000,
		MonthlyAmountTotal: 2_400_000_000,
		ConcurrencyLimit:   5,
		QuotaResetPeriod:   SubscriptionResetDaily,
	}).Error)
	require.NoError(t, DB.Create(&Redemption{
		Key:         "subscription-code",
		Name:        "monthly-card",
		Status:      common.RedemptionCodeStatusEnabled,
		Quota:       0,
		PlanId:      202,
		CreatedTime: common.GetTimestamp(),
	}).Error)

	before := time.Now().Unix()
	result, err := Redeem("subscription-code", 102)
	require.NoError(t, err)
	require.Equal(t, "subscription", result.Type)
	require.Equal(t, 202, result.PlanId)
	require.Equal(t, "¥500 月卡", result.PlanTitle)
	require.Greater(t, result.UserSubscriptionId, 0)

	var user User
	require.NoError(t, DB.Where("id = ?", 102).First(&user).Error)
	require.Equal(t, 10, user.Quota)

	var sub UserSubscription
	require.NoError(t, DB.Where("id = ?", result.UserSubscriptionId).First(&sub).Error)
	require.Equal(t, 102, sub.UserId)
	require.Equal(t, 202, sub.PlanId)
	require.EqualValues(t, 80_000_000, sub.AmountTotal)
	require.EqualValues(t, 2_400_000_000, sub.MonthlyAmountTotal)
	require.Equal(t, 5, sub.ConcurrencyLimit)
	require.Equal(t, "redemption", sub.Source)
	require.Equal(t, "active", sub.Status)
	require.GreaterOrEqual(t, sub.StartTime, before)
	require.GreaterOrEqual(t, sub.EndTime-sub.StartTime, int64(30*24*60*60-5))

	var redemption Redemption
	require.NoError(t, DB.Where("`key` = ?", "subscription-code").First(&redemption).Error)
	require.Equal(t, common.RedemptionCodeStatusUsed, redemption.Status)
	require.Equal(t, 102, redemption.UsedUserId)
}
