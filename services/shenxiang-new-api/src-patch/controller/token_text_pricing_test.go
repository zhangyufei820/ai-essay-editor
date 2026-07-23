package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestManagedTextTokenUpdateSynchronizesPreferenceAndLegacyToken(t *testing.T) {
	db := openTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}))

	user := model.User{
		Username: "pricing-sync-user",
		Password: "password-for-test",
		Status:   common.UserStatusEnabled,
		Group:    model.TextPricingGroupDefault,
	}
	setting := user.GetSetting()
	setting.BillingPreference = "subscription_first"
	user.SetSetting(setting)
	require.NoError(t, db.Create(&user).Error)

	primary := seedToken(t, db, user.Id, "星人 Codex 文本令牌", "pricing-primary-key")
	legacy := seedToken(t, db, user.Id, "星人 Codex 自动令牌", "pricing-legacy-key")

	updateGroup := func(group string) {
		ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/token/", model.Token{
			Id:                 primary.Id,
			Name:               primary.Name,
			Status:             common.TokenStatusEnabled,
			ExpiredTime:        -1,
			UnlimitedQuota:     true,
			ModelLimitsEnabled: false,
			Group:              group,
			CrossGroupRetry:    true,
		}, user.Id)
		UpdateTokenWithTextPricingSync(ctx)
		require.True(t, decodeAPIResponse(t, recorder).Success, recorder.Body.String())

		var currentUser model.User
		require.NoError(t, db.First(&currentUser, user.Id).Error)
		require.Equal(t, group, currentUser.GetSetting().TextPricingGroup)
		require.Equal(t, "subscription_first", currentUser.GetSetting().BillingPreference)

		for _, tokenID := range []int{primary.Id, legacy.Id} {
			var currentToken model.Token
			require.NoError(t, db.First(&currentToken, tokenID).Error)
			require.Equal(t, group, currentToken.Group)
			require.False(t, currentToken.CrossGroupRetry)
		}
	}

	updateGroup(model.TextPricingGroupDiscount)
	updateGroup(model.TextPricingGroupPlus)
	updateGroup(model.TextPricingGroupDefault)
}

func TestManagedTextTokenRejectsUnsupportedPricingGroup(t *testing.T) {
	db := openTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}))
	user := model.User{Username: "invalid-pricing-user", Password: "password-for-test", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, db.Create(&user).Error)
	token := seedToken(t, db, user.Id, "星人 Codex 文本令牌", "invalid-pricing-key")

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/token/", model.Token{
		Id:             token.Id,
		Name:           token.Name,
		Status:         common.TokenStatusEnabled,
		ExpiredTime:    -1,
		UnlimitedQuota: true,
		Group:          "auto",
	}, user.Id)
	UpdateTokenWithTextPricingSync(ctx)
	require.False(t, decodeAPIResponse(t, recorder).Success)

	var current model.Token
	require.NoError(t, db.First(&current, token.Id).Error)
	require.Equal(t, model.TextPricingGroupDefault, current.Group)
}

func TestManagedTextTokenUpdateSupportsOrderedGroupChain(t *testing.T) {
	db := openTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}))
	user := model.User{Username: "pricing-chain-user", Password: "password-for-test", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, db.Create(&user).Error)
	primary := seedToken(t, db, user.Id, "星人 Codex 文本令牌", "pricing-chain-primary-key")
	legacy := seedToken(t, db, user.Id, "星人 Codex 自动令牌", "pricing-chain-legacy-key")

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/token/", model.Token{
		Id:              primary.Id,
		Name:            primary.Name,
		Status:          common.TokenStatusEnabled,
		ExpiredTime:     -1,
		UnlimitedQuota:  true,
		Group:           " default,discount,default,plus ",
		CrossGroupRetry: true,
	}, user.Id)
	UpdateTokenWithTextPricingSync(ctx)

	require.True(t, decodeAPIResponse(t, recorder).Success, recorder.Body.String())
	var currentUser model.User
	require.NoError(t, db.First(&currentUser, user.Id).Error)
	require.Equal(t, model.TextPricingGroupDefault, currentUser.GetSetting().TextPricingGroup)
	for _, tokenID := range []int{primary.Id, legacy.Id} {
		var currentToken model.Token
		require.NoError(t, db.First(&currentToken, tokenID).Error)
		require.Equal(t, "default,discount,plus", currentToken.Group)
		require.False(t, currentToken.CrossGroupRetry)
	}
}

func TestResolveUserTextPricingGroupMigratesLegacyTokenChoice(t *testing.T) {
	db := openTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}))
	user := model.User{Username: "legacy-pricing-user", Password: "password-for-test", Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, db.Create(&user).Error)
	token := seedToken(t, db, user.Id, "星人 Codex 文本令牌", "legacy-pricing-key")
	require.NoError(t, db.Model(&model.Token{}).Where("id = ?", token.Id).Update("group", model.TextPricingGroupDiscount).Error)

	group, err := model.ResolveUserTextPricingGroup(user.Id)
	require.NoError(t, err)
	require.Equal(t, model.TextPricingGroupDiscount, group)
}
