package model

import (
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupUserTokenCleanupTestDB(t *testing.T) {
	t.Helper()
	originalDB := DB
	originalRedisEnabled := common.RedisEnabled
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}, &Token{}, &UserOAuthBinding{}))
	DB = db
	common.RedisEnabled = false
	t.Cleanup(func() {
		DB = originalDB
		common.RedisEnabled = originalRedisEnabled
	})
}

func TestDeleteUserByIdRevokesAndSoftDeletesTokens(t *testing.T) {
	setupUserTokenCleanupTestDB(t)
	user := &User{
		Id:       501,
		Username: "delete-user-token-cleanup",
		Password: "hashed-password",
		AffCode:  "delete-user-token-cleanup-aff",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}
	require.NoError(t, DB.Create(user).Error)
	token := &Token{
		UserId:         user.Id,
		Key:            "delete-user-token-cleanup-key",
		Status:         common.TokenStatusEnabled,
		Name:           "delete-user-token-cleanup-token",
		ExpiredTime:    -1,
		UnlimitedQuota: true,
		Group:          "default",
	}
	require.NoError(t, DB.Create(token).Error)

	require.NoError(t, DeleteUserById(user.Id))

	var liveTokenCount int64
	require.NoError(t, DB.Model(&Token{}).Where("user_id = ?", user.Id).Count(&liveTokenCount).Error)
	require.Zero(t, liveTokenCount)

	var deletedToken Token
	require.NoError(t, DB.Unscoped().Where("id = ?", token.Id).First(&deletedToken).Error)
	require.Equal(t, common.TokenStatusDisabled, deletedToken.Status)
	require.True(t, deletedToken.DeletedAt.Valid)
}

func TestHardDeleteUserByIdRemovesTokensAndBindings(t *testing.T) {
	setupUserTokenCleanupTestDB(t)
	user := &User{
		Id:       502,
		Username: "hard-delete-user-token-cleanup",
		Password: "hashed-password",
		AffCode:  "hard-delete-user-token-cleanup-aff",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}
	require.NoError(t, DB.Create(user).Error)
	require.NoError(t, DB.Create(&Token{
		UserId:         user.Id,
		Key:            "hard-delete-user-token-cleanup-key",
		Status:         common.TokenStatusEnabled,
		Name:           "hard-delete-user-token-cleanup-token",
		ExpiredTime:    -1,
		UnlimitedQuota: true,
		Group:          "default",
	}).Error)
	require.NoError(t, DB.Create(&UserOAuthBinding{
		UserId:         user.Id,
		ProviderId:     7,
		ProviderUserId: "hard-delete-provider-user",
	}).Error)

	require.NoError(t, HardDeleteUserById(user.Id))

	var userCount int64
	require.NoError(t, DB.Unscoped().Model(&User{}).Where("id = ?", user.Id).Count(&userCount).Error)
	require.Zero(t, userCount)
	var tokenCount int64
	require.NoError(t, DB.Unscoped().Model(&Token{}).Where("user_id = ?", user.Id).Count(&tokenCount).Error)
	require.Zero(t, tokenCount)
	var bindingCount int64
	require.NoError(t, DB.Unscoped().Model(&UserOAuthBinding{}).Where("user_id = ?", user.Id).Count(&bindingCount).Error)
	require.Zero(t, bindingCount)
}
