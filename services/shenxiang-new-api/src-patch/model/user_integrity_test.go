package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestHardDeleteUserByIdDeletesOAuthBindings(t *testing.T) {
	truncateTables(t)

	const userID = 8101
	require.NoError(t, DB.Create(&User{
		Id:       userID,
		Username: "hard-delete-user",
		Status:   common.UserStatusEnabled,
	}).Error)
	require.NoError(t, DB.Create(&UserOAuthBinding{
		UserId:         userID,
		ProviderId:     91,
		ProviderUserId: "oauth-user-8101",
	}).Error)

	require.NoError(t, HardDeleteUserById(userID))

	var userCount int64
	require.NoError(t, DB.Unscoped().Model(&User{}).Where("id = ?", userID).Count(&userCount).Error)
	require.Zero(t, userCount)
	var bindingCount int64
	require.NoError(t, DB.Model(&UserOAuthBinding{}).Where("user_id = ?", userID).Count(&bindingCount).Error)
	require.Zero(t, bindingCount)
}

func TestHardDeleteUserByIdRollsBackOAuthBindingDelete(t *testing.T) {
	truncateTables(t)

	const userID = 8102
	require.NoError(t, DB.Create(&User{
		Id:       userID,
		Username: "hard-delete-rollback-user",
		Status:   common.UserStatusEnabled,
	}).Error)
	require.NoError(t, DB.Create(&UserOAuthBinding{
		UserId:         userID,
		ProviderId:     92,
		ProviderUserId: "oauth-user-8102",
	}).Error)
	require.NoError(t, DB.Exec(`
		CREATE TRIGGER prevent_user_delete_8102
		BEFORE DELETE ON users
		WHEN OLD.id = 8102
		BEGIN
			SELECT RAISE(ABORT, 'blocked user delete');
		END
	`).Error)
	t.Cleanup(func() {
		DB.Exec("DROP TRIGGER IF EXISTS prevent_user_delete_8102")
	})

	require.Error(t, HardDeleteUserById(userID))

	var userCount int64
	require.NoError(t, DB.Unscoped().Model(&User{}).Where("id = ?", userID).Count(&userCount).Error)
	require.EqualValues(t, 1, userCount)
	var bindingCount int64
	require.NoError(t, DB.Model(&UserOAuthBinding{}).Where("user_id = ?", userID).Count(&bindingCount).Error)
	require.EqualValues(t, 1, bindingCount)
}

func TestUserHardDeleteDeletesOAuthBindings(t *testing.T) {
	truncateTables(t)

	user := &User{
		Id:       8104,
		Username: "hard-delete-method-user",
		Status:   common.UserStatusEnabled,
	}
	require.NoError(t, DB.Create(user).Error)
	require.NoError(t, DB.Create(&UserOAuthBinding{
		UserId:         user.Id,
		ProviderId:     94,
		ProviderUserId: "oauth-user-8104",
	}).Error)

	require.NoError(t, user.HardDelete())

	var userCount int64
	require.NoError(t, DB.Unscoped().Model(&User{}).Where("id = ?", user.Id).Count(&userCount).Error)
	require.Zero(t, userCount)
	var bindingCount int64
	require.NoError(t, DB.Model(&UserOAuthBinding{}).Where("user_id = ?", user.Id).Count(&bindingCount).Error)
	require.Zero(t, bindingCount)
}

func TestUserQueriesOmitAccessTokenUnlessExplicitlyRequested(t *testing.T) {
	truncateTables(t)

	const userID = 8103
	accessToken := "test-management-token"
	require.NoError(t, DB.Create(&User{
		Id:          userID,
		Username:    "user-query-token-guard",
		DisplayName: "token guard",
		Status:      common.UserStatusEnabled,
		AccessToken: &accessToken,
	}).Error)

	users, total, err := GetAllUsers(&common.PageInfo{Page: 1, PageSize: 10})
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Len(t, users, 1)
	require.Nil(t, users[0].AccessToken)

	users, total, err = SearchUsers("user-query-token-guard", "", nil, nil, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Len(t, users, 1)
	require.Nil(t, users[0].AccessToken)

	user, err := GetUserById(userID, false)
	require.NoError(t, err)
	require.Nil(t, user.AccessToken)

	user, err = GetUserById(userID, true)
	require.NoError(t, err)
	require.Equal(t, accessToken, user.GetAccessToken())
}
