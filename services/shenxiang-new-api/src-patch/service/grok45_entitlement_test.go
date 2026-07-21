package service

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupGrok45EntitlementTestDB(t *testing.T) {
	t.Helper()
	originalDB := model.DB
	originalRedisEnabled := common.RedisEnabled
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.Channel{}, &model.Ability{}))
	model.DB = db
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB = originalDB
		common.RedisEnabled = originalRedisEnabled
	})
}

func createManagedGrok45CapabilityFor(t *testing.T, tag string, baseURL string) int {
	t.Helper()
	channel := model.Channel{
		Status:  common.ChannelStatusEnabled,
		Name:    "managed-grok45",
		Key:     "test-managed-grok45-key",
		BaseURL: &baseURL,
		Models:  Grok45ModelName,
		Group:   Grok45PricingGroupName,
		Tag:     &tag,
	}
	require.NoError(t, model.DB.Create(&channel).Error)
	ability := model.Ability{
		Group:     Grok45PricingGroupName,
		Model:     Grok45ModelName,
		ChannelId: channel.Id,
		Enabled:   true,
		Tag:       &tag,
	}
	require.NoError(t, model.DB.Create(&ability).Error)
	return channel.Id
}

func createManagedGrok45Capability(t *testing.T) int {
	t.Helper()
	return createManagedGrok45CapabilityFor(t, Grok45ManagedChannelTag, Grok45ManagedBaseURL)
}

func createGrok45TestUser(t *testing.T, userID int, role int, status int) {
	t.Helper()
	require.NoError(t, model.DB.Create(&model.User{
		Id:       userID,
		Username: fmt.Sprintf("grok-user-%d", userID),
		AffCode:  fmt.Sprintf("grok-aff-%d", userID),
		Role:     role,
		Status:   status,
		Group:    "default",
	}).Error)
}

func TestEnsureManagedGrok45UserTokenRequiresActiveCapability(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	createGrok45TestUser(t, 101, common.RoleCommonUser, common.UserStatusEnabled)

	result, err := EnsureManagedGrok45UserTokenForUserID(context.Background(), 101)

	require.NoError(t, err)
	require.False(t, result.CapabilityActive)
	require.Zero(t, result.Created)
	var count int64
	require.NoError(t, model.DB.Model(&model.Token{}).Where("user_id = ?", 101).Count(&count).Error)
	require.Zero(t, count)
}

func TestManagedGrok45CapabilityRequiresExactManagedChannelAndAbility(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	channelID := createManagedGrok45Capability(t)

	active, err := ManagedGrok45CapabilityActive(context.Background())
	require.NoError(t, err)
	require.True(t, active)

	require.NoError(t, model.DB.Model(&model.Channel{}).Where("id = ?", channelID).Update("tag", "unmanaged").Error)
	active, err = ManagedGrok45CapabilityActive(context.Background())
	require.NoError(t, err)
	require.False(t, active)

	require.NoError(t, model.DB.Model(&model.Channel{}).Where("id = ?", channelID).Updates(map[string]interface{}{
		"tag":      Grok45ManagedChannelTag,
		"base_url": "https://example.test",
	}).Error)
	active, err = ManagedGrok45CapabilityActive(context.Background())
	require.NoError(t, err)
	require.False(t, active)
}

func TestManagedGrok45CapabilityAcceptsPrimaryAndFallbackChannels(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	createManagedGrok45CapabilityFor(t, Grok45PrimaryManagedChannelTag, Grok45PrimaryManagedBaseURL)

	active, err := ManagedGrok45CapabilityActive(context.Background())
	require.NoError(t, err)
	require.True(t, active)

	createManagedGrok45Capability(t)
	active, err = ManagedGrok45CapabilityActive(context.Background())
	require.NoError(t, err)
	require.True(t, active)
}

func TestEnsureManagedGrok45UserTokenCreatesAndRepairsExactProfile(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	createManagedGrok45Capability(t)
	createGrok45TestUser(t, 102, common.RoleCommonUser, common.UserStatusEnabled)

	created, err := EnsureManagedGrok45UserTokenForUserID(context.Background(), 102)
	require.NoError(t, err)
	require.True(t, created.CapabilityActive)
	require.Equal(t, 1, created.Created)

	var token model.Token
	require.NoError(t, model.DB.Where("user_id = ? AND name = ?", 102, Grok45UserTokenName).First(&token).Error)
	require.True(t, IsExactManagedGrok45UserToken(&token))

	allowIPs := "127.0.0.1"
	require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", token.Id).Updates(map[string]interface{}{
		"status":               common.TokenStatusEnabled,
		"expired_time":         int64(1),
		"remain_quota":         5,
		"unlimited_quota":      false,
		"model_limits_enabled": false,
		"model_limits":         "gpt-5.5," + Grok45ModelName,
		"allow_ips":            allowIPs,
		"group":                "default",
		"cross_group_retry":    true,
	}).Error)

	repaired, err := EnsureManagedGrok45UserTokenForUserID(context.Background(), 102)
	require.NoError(t, err)
	require.Equal(t, 1, repaired.Updated)
	require.NoError(t, model.DB.First(&token, token.Id).Error)
	require.True(t, IsExactManagedGrok45UserToken(&token))
}

func TestEnsureManagedGrok45UserTokenPreservesUserRevocation(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	createManagedGrok45Capability(t)
	createGrok45TestUser(t, 108, common.RoleCommonUser, common.UserStatusEnabled)
	emptyAllowIPs := ""
	revoked := model.Token{
		UserId:             108,
		Key:                "revoked-grok45-key",
		Status:             common.TokenStatusDisabled,
		Name:               Grok45UserTokenName,
		ExpiredTime:        -1,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: true,
		ModelLimits:        Grok45ModelName,
		AllowIps:           &emptyAllowIPs,
		Group:              Grok45PricingGroupName,
		CrossGroupRetry:    false,
	}
	require.NoError(t, model.DB.Create(&revoked).Error)

	result, err := EnsureManagedGrok45UserTokenForUserID(context.Background(), 108)

	require.NoError(t, err)
	require.Equal(t, 1, result.Skipped)
	var persisted model.Token
	require.NoError(t, model.DB.First(&persisted, revoked.Id).Error)
	require.Equal(t, common.TokenStatusDisabled, persisted.Status)
	require.Equal(t, revoked.Key, persisted.Key)
	entitled, err := UserHasManagedGrok45Entitlement(context.Background(), 108)
	require.NoError(t, err)
	require.False(t, entitled)
}

func TestEnsureManagedGrok45UserTokenDisablesActiveDuplicates(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	createManagedGrok45Capability(t)
	createGrok45TestUser(t, 109, common.RoleCommonUser, common.UserStatusEnabled)
	_, err := EnsureManagedGrok45UserTokenForUserID(context.Background(), 109)
	require.NoError(t, err)
	var canonical model.Token
	require.NoError(t, model.DB.Where("user_id = ? AND name = ?", 109, Grok45UserTokenName).First(&canonical).Error)
	duplicate := canonical
	duplicate.Id = 0
	duplicate.Key = "duplicate-grok45-key"
	require.NoError(t, model.DB.Create(&duplicate).Error)

	beforeRepair, err := UserHasManagedGrok45Entitlement(context.Background(), 109)
	require.NoError(t, err)
	require.False(t, beforeRepair)
	repaired, err := EnsureManagedGrok45UserTokenForUserID(context.Background(), 109)
	require.NoError(t, err)
	require.Equal(t, 1, repaired.Updated)
	var activeCount int64
	require.NoError(t, model.DB.Model(&model.Token{}).
		Where("user_id = ? AND name = ? AND status = ?", 109, Grok45UserTokenName, common.TokenStatusEnabled).
		Count(&activeCount).Error)
	require.EqualValues(t, 1, activeCount)
	entitled, err := UserHasManagedGrok45Entitlement(context.Background(), 109)
	require.NoError(t, err)
	require.True(t, entitled)
}

func TestManagedGrok45EntitlementRequiresCapabilityAndExactToken(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	channelID := createManagedGrok45Capability(t)
	createGrok45TestUser(t, 103, common.RoleCommonUser, common.UserStatusEnabled)

	entitled, err := UserHasManagedGrok45Entitlement(context.Background(), 103)
	require.NoError(t, err)
	require.False(t, entitled)

	_, err = EnsureManagedGrok45UserTokenForUserID(context.Background(), 103)
	require.NoError(t, err)
	entitled, err = UserHasManagedGrok45Entitlement(context.Background(), 103)
	require.NoError(t, err)
	require.True(t, entitled)

	require.NoError(t, model.DB.Model(&model.Ability{}).Where("channel_id = ?", channelID).Update("enabled", false).Error)
	entitled, err = UserHasManagedGrok45Entitlement(context.Background(), 103)
	require.NoError(t, err)
	require.False(t, entitled)
}

func TestReconcileManagedGrok45UserTokensCoversEnabledCommonUsersOnly(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	createManagedGrok45Capability(t)
	createGrok45TestUser(t, 104, common.RoleCommonUser, common.UserStatusEnabled)
	createGrok45TestUser(t, 105, common.RoleCommonUser, common.UserStatusEnabled)
	createGrok45TestUser(t, 106, common.RoleCommonUser, common.UserStatusDisabled)
	createGrok45TestUser(t, 107, common.RoleAdminUser, common.UserStatusEnabled)
	createGrok45TestUser(t, 108, common.RoleCommonUser, common.UserStatusEnabled)
	emptyAllowIPs := ""
	require.NoError(t, model.DB.Create(&model.Token{
		UserId:             108,
		Key:                "revoked-reconcile-grok45-key",
		Status:             common.TokenStatusDisabled,
		Name:               Grok45UserTokenName,
		ExpiredTime:        -1,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: true,
		ModelLimits:        Grok45ModelName,
		AllowIps:           &emptyAllowIPs,
		Group:              Grok45PricingGroupName,
	}).Error)

	result, err := ReconcileManagedGrok45UserTokens(context.Background())

	require.NoError(t, err)
	require.True(t, result.CapabilityActive)
	require.Equal(t, 2, result.Created)
	require.Equal(t, 2, result.UsersScanned)
	var userIDs []int
	require.NoError(t, model.DB.Model(&model.Token{}).Where("name = ?", Grok45UserTokenName).Order("user_id").Pluck("user_id", &userIDs).Error)
	require.Equal(t, []int{104, 105, 108}, userIDs)

	secondResult, err := ReconcileManagedGrok45UserTokens(context.Background())
	require.NoError(t, err)
	require.Zero(t, secondResult.UsersScanned)
}

func TestAdminSystemTokenDisablesCrossGroupRetryForFixedPricingTokens(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	createManagedGrok45Capability(t)
	createGrok45TestUser(t, AdminSystemTokenUserID, common.RoleRootUser, common.UserStatusEnabled)

	result, err := EnsureSystemTokensForUserID(context.Background(), AdminSystemTokenUserID)

	require.NoError(t, err)
	require.Greater(t, result.Created, 0)
	var grokToken model.Token
	require.NoError(t, model.DB.Where("user_id = ? AND name = ?", AdminSystemTokenUserID, Grok45AdminTokenName).First(&grokToken).Error)
	require.False(t, grokToken.CrossGroupRetry)
	entitled, err := UserHasManagedGrok45Entitlement(context.Background(), AdminSystemTokenUserID)
	require.NoError(t, err)
	require.True(t, entitled)
	var codexToken model.Token
	require.NoError(t, model.DB.Where("user_id = ? AND name = ?", AdminSystemTokenUserID, "星人 Codex 文本令牌").First(&codexToken).Error)
	require.False(t, codexToken.CrossGroupRetry)
}

func TestAdminSystemCodexTokenFollowsTextPricingPreference(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	createManagedGrok45Capability(t)
	createGrok45TestUser(t, AdminSystemTokenUserID, common.RoleRootUser, common.UserStatusEnabled)

	var user model.User
	require.NoError(t, model.DB.First(&user, AdminSystemTokenUserID).Error)
	setting := user.GetSetting()
	setting.TextPricingGroup = model.TextPricingGroupDiscount
	user.SetSetting(setting)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", user.Id).Update("setting", user.Setting).Error)

	_, err := EnsureSystemTokensForUserID(context.Background(), AdminSystemTokenUserID)
	require.NoError(t, err)

	var codexToken model.Token
	require.NoError(t, model.DB.Where("user_id = ? AND name = ?", AdminSystemTokenUserID, "星人 Codex 文本令牌").First(&codexToken).Error)
	require.Equal(t, model.TextPricingGroupDiscount, codexToken.Group)
	require.False(t, codexToken.CrossGroupRetry)
}
