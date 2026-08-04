package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupMonthlyCardTokenTestDB(t *testing.T) {
	t.Helper()
	originalDB := model.DB
	originalRedisEnabled := common.RedisEnabled
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.SubscriptionPlan{}, &model.UserSubscription{}))
	model.DB = db
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB = originalDB
		common.RedisEnabled = originalRedisEnabled
	})
}

func createMonthlyCardTokenTestUser(t *testing.T, userID int, subscriptionID int, planID int) {
	createMonthlyCardTokenTestUserWithPlan(t, userID, subscriptionID, planID, "100元月卡", "CNY", 500)
}

func createMonthlyCardTokenTestUserWithPlan(t *testing.T, userID int, subscriptionID int, planID int, title string, currency string, priceAmount float64) {
	t.Helper()
	require.NoError(t, model.DB.Create(&model.User{
		Id:       userID,
		Username: fmt.Sprintf("monthly-token-user-%d", userID),
		AffCode:  fmt.Sprintf("monthly-token-aff-%d", userID),
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}).Error)
	require.NoError(t, model.DB.Create(&model.SubscriptionPlan{
		Id:          planID,
		Title:       title,
		PriceAmount: priceAmount,
		Currency:    currency,
		Enabled:     true,
		TotalAmount: 1_000_000,
	}).Error)
	require.NoError(t, model.DB.Create(&model.UserSubscription{
		Id:                 subscriptionID,
		UserId:             userID,
		PlanId:             planID,
		Status:             "active",
		StartTime:          time.Now().Add(-time.Hour).Unix(),
		EndTime:            time.Now().Add(30 * 24 * time.Hour).Unix(),
		MonthlyAmountTotal: 1_000_000,
	}).Error)
}

func TestMonthlyCardTokenForUserCreatesAndReusesOwnedToken(t *testing.T) {
	setupMonthlyCardTokenTestDB(t)
	createMonthlyCardTokenTestUser(t, 501, 601, 701)

	first, created, err := EnsureMonthlyCardTokenForUser(context.Background(), 501)
	require.NoError(t, err)
	require.True(t, created)
	require.Equal(t, 501, first.UserId)
	require.Equal(t, MonthlyCardTokenName, first.Name)
	require.NotEmpty(t, first.Key)
	require.True(t, first.UnlimitedQuota)
	require.Equal(t, strings.Join(MonthlyCardAllowedModels(), ","), first.ModelLimits)

	second, created, err := EnsureMonthlyCardTokenForUser(context.Background(), 501)
	require.NoError(t, err)
	require.False(t, created)
	require.Equal(t, first.Id, second.Id)
	require.Equal(t, first.Key, second.Key)

	var count int64
	require.NoError(t, model.DB.Model(&model.Token{}).Where("user_id = ? AND name = ?", 501, MonthlyCardTokenName).Count(&count).Error)
	require.EqualValues(t, 1, count)
}

func TestMonthlyCardTokenForUserNeverReusesAnotherUsersToken(t *testing.T) {
	setupMonthlyCardTokenTestDB(t)
	createMonthlyCardTokenTestUser(t, 502, 602, 702)
	createMonthlyCardTokenTestUser(t, 503, 603, 703)

	first, _, err := EnsureMonthlyCardTokenForUser(context.Background(), 502)
	require.NoError(t, err)
	second, _, err := EnsureMonthlyCardTokenForUser(context.Background(), 503)
	require.NoError(t, err)

	require.NotEqual(t, first.Id, second.Id)
	require.NotEqual(t, first.Key, second.Key)
	require.Equal(t, 502, first.UserId)
	require.Equal(t, 503, second.UserId)
}

func TestMonthlyCardTokenForUserRejectsAccountWithoutActiveCard(t *testing.T) {
	setupMonthlyCardTokenTestDB(t)
	require.NoError(t, model.DB.Create(&model.User{
		Id:       504,
		Username: "monthly-token-ineligible",
		AffCode:  "monthly-token-ineligible-aff",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}).Error)

	token, created, err := EnsureMonthlyCardTokenForUser(context.Background(), 504)
	require.Error(t, err)
	require.True(t, errors.Is(err, ErrNoActiveMonthlyCard))
	require.Nil(t, token)
	require.False(t, created)
}

func TestMonthlyCardTokenForUserRejectsDisabledTokenWithoutReplacement(t *testing.T) {
	setupMonthlyCardTokenTestDB(t)
	createMonthlyCardTokenTestUser(t, 505, 605, 705)

	disabled := BuildMonthlyCardToken(505, "disabled-monthly-card-key")
	disabled.Status = common.TokenStatusDisabled
	require.NoError(t, model.DB.Create(&disabled).Error)

	token, created, err := EnsureMonthlyCardTokenForUser(context.Background(), 505)
	require.ErrorIs(t, err, ErrMonthlyCardTokenUnavailable)
	require.Nil(t, token)
	require.False(t, created)

	var storedDisabled model.Token
	require.NoError(t, model.DB.First(&storedDisabled, disabled.Id).Error)
	require.Equal(t, common.TokenStatusDisabled, storedDisabled.Status)
	var count int64
	require.NoError(t, model.DB.Model(&model.Token{}).Where("user_id = ? AND name = ?", 505, MonthlyCardTokenName).Count(&count).Error)
	require.EqualValues(t, 1, count)
}

func TestMonthlyCardTokenForUserRejectsHighPriceNonMonthlySubscription(t *testing.T) {
	setupMonthlyCardTokenTestDB(t)
	require.NoError(t, model.DB.Create(&model.User{
		Id:       507,
		Username: "non-monthly-paid-user",
		AffCode:  "non-monthly-paid-aff",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}).Error)
	require.NoError(t, model.DB.Create(&model.SubscriptionPlan{
		Id:          707,
		Title:       "VIP 年度订阅",
		PriceAmount: 50_000,
		Currency:    "CNY",
		Enabled:     true,
		TotalAmount: 1_000_000,
	}).Error)
	require.NoError(t, model.DB.Create(&model.UserSubscription{
		Id:                 607,
		UserId:             507,
		PlanId:             707,
		Status:             "active",
		StartTime:          time.Now().Add(-time.Hour).Unix(),
		EndTime:            time.Now().Add(30 * 24 * time.Hour).Unix(),
		MonthlyAmountTotal: 1_000_000,
	}).Error)

	token, created, err := EnsureMonthlyCardTokenForUser(context.Background(), 507)
	require.ErrorIs(t, err, ErrNoActiveMonthlyCard)
	require.Nil(t, token)
	require.False(t, created)
}

func TestMonthlyCardTokenForUserRejectsLegacyVIPMonthlySubscription(t *testing.T) {
	setupMonthlyCardTokenTestDB(t)
	createMonthlyCardTokenTestUserWithPlan(t, 508, 608, 708, "VIP 旧版 ¥500 月卡", "CNY", 500)

	token, created, err := EnsureMonthlyCardTokenForUser(context.Background(), 508)
	require.ErrorIs(t, err, ErrNoActiveMonthlyCard)
	require.Nil(t, token)
	require.False(t, created)
}

func TestMonthlyCardTokenForUserRejectsNonCNYMonthlySubscription(t *testing.T) {
	setupMonthlyCardTokenTestDB(t)
	createMonthlyCardTokenTestUserWithPlan(t, 509, 609, 709, "100元月卡", "USD", 500)

	token, created, err := EnsureMonthlyCardTokenForUser(context.Background(), 509)
	require.ErrorIs(t, err, ErrNoActiveMonthlyCard)
	require.Nil(t, token)
	require.False(t, created)
}

func TestMonthlyCardTokenForUserRepairsOwnedEnabledTokenPolicy(t *testing.T) {
	setupMonthlyCardTokenTestDB(t)
	createMonthlyCardTokenTestUser(t, 506, 606, 706)

	existing := BuildMonthlyCardToken(506, "existing-monthly-card-key")
	existing.UnlimitedQuota = false
	existing.ModelLimitsEnabled = false
	existing.ModelLimits = "gpt-5.5"
	existing.ExpiredTime = 123
	existing.Group = "special"
	existing.CrossGroupRetry = true
	require.NoError(t, model.DB.Create(&existing).Error)

	token, created, err := EnsureMonthlyCardTokenForUser(context.Background(), 506)
	require.NoError(t, err)
	require.False(t, created)
	require.Equal(t, existing.Id, token.Id)
	require.Equal(t, existing.Key, token.Key)
	require.True(t, token.UnlimitedQuota)
	require.True(t, token.ModelLimitsEnabled)
	require.Equal(t, strings.Join(MonthlyCardAllowedModels(), ","), token.ModelLimits)
	require.EqualValues(t, -1, token.ExpiredTime)
	require.Equal(t, "default", token.Group)
	require.False(t, token.CrossGroupRetry)
}

func TestMonthlyCardTokenForUserReplacesWhitespaceOnlyKey(t *testing.T) {
	setupMonthlyCardTokenTestDB(t)
	createMonthlyCardTokenTestUser(t, 510, 610, 710)

	existing := BuildMonthlyCardToken(510, " \t\n ")
	require.NoError(t, model.DB.Create(&existing).Error)

	token, created, err := EnsureMonthlyCardTokenForUser(context.Background(), 510)
	require.NoError(t, err)
	require.False(t, created)
	require.Equal(t, existing.Id, token.Id)
	require.NotEmpty(t, strings.TrimSpace(token.Key))
	require.NotEqual(t, existing.Key, token.Key)
}
