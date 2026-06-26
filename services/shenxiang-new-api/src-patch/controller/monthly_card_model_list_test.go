package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestListModelsMonthlyCardTokenUsesMonthlyCardChannelModels(t *testing.T) {
	withSelfUseModeDisabled(t)
	db := setupModelListControllerTestDB(t)

	require.NoError(t, db.Create(&model.User{
		Id:       1001,
		Username: "monthly-card-model-list-user",
		Password: "password",
		Group:    "default",
		Status:   common.UserStatusEnabled,
	}).Error)
	require.NoError(t, db.Create(&model.Channel{
		Id:       21,
		Name:     "monthly-card-dragtokens",
		Status:   common.ChannelStatusEnabled,
		Models:   "zz-monthly-unpriced-a,zz-monthly-unpriced-b",
		Group:    "default",
		Priority: common.GetPointer[int64](90),
		Weight:   common.GetPointer[uint](100),
		Tag:      common.GetPointer(service.MonthlyCardChannelTag),
	}).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	ctx.Set("id", 1001)
	ctx.Set("token_name", service.MonthlyCardTokenName)
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(ctx, constant.ContextKeyTokenGroup, "default")
	common.SetContextKey(ctx, constant.ContextKeyTokenModelLimitEnabled, true)
	common.SetContextKey(ctx, constant.ContextKeyTokenModelLimit, map[string]bool{
		"zz-monthly-unpriced-a": true,
	})

	ListModels(ctx, constant.ChannelTypeOpenAI)

	ids := decodeListModelsResponse(t, recorder)
	require.Contains(t, ids, "zz-monthly-unpriced-a")
	require.Contains(t, ids, "zz-monthly-unpriced-b")
}

func TestListModelsMonthlyCardTokenUsesTaggedChannelModelsWhenAutoDisabled(t *testing.T) {
	withSelfUseModeDisabled(t)
	db := setupModelListControllerTestDB(t)

	require.NoError(t, db.Create(&model.User{
		Id:       1002,
		Username: "monthly-card-disabled-channel-user",
		Password: "password",
		Group:    "default",
		Status:   common.UserStatusEnabled,
	}).Error)
	require.NoError(t, db.Create(&model.Channel{
		Id:       22,
		Name:     "monthly-card-dragtokens-auto-disabled",
		Status:   common.ChannelStatusAutoDisabled,
		Models:   "zz-monthly-disabled-a,zz-monthly-disabled-b",
		Group:    "default",
		Priority: common.GetPointer[int64](90),
		Weight:   common.GetPointer[uint](100),
		Tag:      common.GetPointer(service.MonthlyCardChannelTag),
	}).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	ctx.Set("id", 1002)
	ctx.Set("token_name", service.MonthlyCardTokenName)
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(ctx, constant.ContextKeyTokenGroup, "default")
	common.SetContextKey(ctx, constant.ContextKeyTokenModelLimitEnabled, true)
	common.SetContextKey(ctx, constant.ContextKeyTokenModelLimit, map[string]bool{
		"zz-monthly-disabled-a": true,
	})

	ListModels(ctx, constant.ChannelTypeOpenAI)

	ids := decodeListModelsResponse(t, recorder)
	require.Contains(t, ids, "zz-monthly-disabled-a")
	require.Contains(t, ids, "zz-monthly-disabled-b")
}
