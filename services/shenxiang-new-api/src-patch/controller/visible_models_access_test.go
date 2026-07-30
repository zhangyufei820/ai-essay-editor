package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestListVisibleModelsOnlyReturnsTokenLimitedRoutableModels(t *testing.T) {
	withSelfUseModeEnabled(t)
	db := setupModelListControllerTestDB(t)

	require.NoError(t, db.Create(&[]model.Channel{
		{
			Id:     101,
			Name:   "visible-model-channel",
			Type:   constant.ChannelTypeOpenAI,
			Status: common.ChannelStatusEnabled,
			Group:  "default",
			Models: "visible-model," + service.InternalStableImage2ModelName + "," + service.InternalDiscountImage2ModelName,
		},
		{
			Id:     102,
			Name:   "disabled-model-channel",
			Type:   constant.ChannelTypeOpenAI,
			Status: common.ChannelStatusManuallyDisabled,
			Group:  "default",
			Models: "disabled-model",
		},
	}).Error)
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "default", Model: "visible-model", ChannelId: 101, Enabled: true},
		{Group: "default", Model: service.InternalStableImage2ModelName, ChannelId: 101, Enabled: true},
		{Group: "default", Model: service.InternalDiscountImage2ModelName, ChannelId: 101, Enabled: true},
		{Group: "default", Model: "disabled-model", ChannelId: 102, Enabled: true},
	}).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	context.Set("id", 101)
	common.SetContextKey(context, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(context, constant.ContextKeyTokenModelLimitEnabled, true)
	common.SetContextKey(context, constant.ContextKeyTokenModelLimit, map[string]bool{
		"visible-model":                       true,
		"token-only-model":                    true,
		"disabled-model":                      true,
		service.PublicStableImage2ModelName:   true,
		service.PublicDiscountImage2ModelName: true,
	})

	ListVisibleModels(context, constant.ChannelTypeOpenAI)

	models := decodeListModelsResponse(t, recorder)
	_, publicAliasVisible := models[service.PublicStableImage2ModelName]
	_, discountAliasVisible := models[service.PublicDiscountImage2ModelName]
	require.Contains(t, models, "visible-model")
	require.True(t, publicAliasVisible)
	require.True(t, discountAliasVisible)
	require.NotContains(t, models, "token-only-model")
	require.NotContains(t, models, "disabled-model")
	require.NotContains(t, models, service.InternalDiscountImage2ModelName)
}

func TestListVisibleModelsUsesExplicitTokenGroupChain(t *testing.T) {
	withSelfUseModeEnabled(t)
	db := setupModelListControllerTestDB(t)

	require.NoError(t, db.Create(&[]model.Channel{
		{
			Id:     151,
			Name:   "plus-fallback-channel",
			Type:   constant.ChannelTypeOpenAI,
			Status: common.ChannelStatusEnabled,
			Group:  service.PlusPricingGroupName,
			Models: "plus-fallback-model,plus-token-blocked-model",
		},
		{
			Id:     152,
			Name:   "default-fallback-channel",
			Type:   constant.ChannelTypeOpenAI,
			Status: common.ChannelStatusEnabled,
			Group:  "default",
			Models: "default-fallback-model",
		},
	}).Error)
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: service.PlusPricingGroupName, Model: "plus-fallback-model", ChannelId: 151, Enabled: true},
		{Group: service.PlusPricingGroupName, Model: "plus-token-blocked-model", ChannelId: 151, Enabled: true},
		{Group: "default", Model: "default-fallback-model", ChannelId: 152, Enabled: true},
	}).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	context.Set("id", 151)
	common.SetContextKey(context, constant.ContextKeyUserGroup, "default")
	service.SetTokenGroupChain(context, []string{
		service.DiscountPricingGroupName,
		service.PlusPricingGroupName,
		"default",
	})
	common.SetContextKey(context, constant.ContextKeyTokenModelLimitEnabled, true)
	common.SetContextKey(context, constant.ContextKeyTokenModelLimit, map[string]bool{
		"plus-fallback-model":    true,
		"default-fallback-model": true,
	})

	ListVisibleModels(context, constant.ChannelTypeOpenAI)

	models := decodeListModelsResponse(t, recorder)
	require.Contains(t, models, "plus-fallback-model")
	require.Contains(t, models, "default-fallback-model")
	require.NotContains(t, models, "plus-token-blocked-model")
}

func TestRetrieveVisibleModelUsesSameTokenAndGroupVisibility(t *testing.T) {
	withSelfUseModeEnabled(t)
	db := setupModelListControllerTestDB(t)

	require.NoError(t, db.Create(&model.Channel{
		Id:     201,
		Name:   "public-alias-channel",
		Type:   constant.ChannelTypeOpenAI,
		Status: common.ChannelStatusEnabled,
		Group:  "default",
		Models: service.InternalStableImage2ModelName + "," + service.InternalDiscountImage2ModelName,
	}).Error)
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "default", Model: service.InternalStableImage2ModelName, ChannelId: 201, Enabled: true},
		{Group: "default", Model: service.InternalDiscountImage2ModelName, ChannelId: 201, Enabled: true},
	}).Error)

	t.Run("returns a visible public alias", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodGet, "/v1/models/public", nil)
		context.Params = gin.Params{{Key: "model", Value: service.PublicStableImage2ModelName}}
		context.Set("id", 201)
		common.SetContextKey(context, constant.ContextKeyUserGroup, "default")
		common.SetContextKey(context, constant.ContextKeyTokenModelLimitEnabled, true)
		common.SetContextKey(context, constant.ContextKeyTokenModelLimit, map[string]bool{
			service.PublicStableImage2ModelName: true,
		})

		RetrieveVisibleModel(context, constant.ChannelTypeOpenAI)

		var response dto.OpenAIModels
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		require.Equal(t, service.PublicStableImage2ModelName, response.Id)
		require.NotContains(t, recorder.Body.String(), service.InternalStableImage2ModelName)
	})

	t.Run("returns the published discount public alias", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodGet, "/v1/models/retired", nil)
		context.Params = gin.Params{{Key: "model", Value: service.PublicDiscountImage2ModelName}}
		context.Set("id", 201)
		common.SetContextKey(context, constant.ContextKeyUserGroup, "default")
		common.SetContextKey(context, constant.ContextKeyTokenModelLimitEnabled, true)
		common.SetContextKey(context, constant.ContextKeyTokenModelLimit, map[string]bool{
			service.PublicDiscountImage2ModelName: true,
		})

		RetrieveVisibleModel(context, constant.ChannelTypeOpenAI)

		var response dto.OpenAIModels
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		require.Equal(t, service.PublicDiscountImage2ModelName, response.Id)
		require.NotContains(t, recorder.Body.String(), service.InternalDiscountImage2ModelName)
	})

	t.Run("hides a token model without a current route", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodGet, "/v1/models/gpt-5.4", nil)
		context.Params = gin.Params{{Key: "model", Value: "gpt-5.4"}}
		context.Set("id", 201)
		common.SetContextKey(context, constant.ContextKeyUserGroup, "default")
		common.SetContextKey(context, constant.ContextKeyTokenModelLimitEnabled, true)
		common.SetContextKey(context, constant.ContextKeyTokenModelLimit, map[string]bool{
			"gpt-5.4": true,
		})

		RetrieveVisibleModel(context, constant.ChannelTypeOpenAI)

		var response struct {
			Error types.OpenAIError `json:"error"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		require.Equal(t, "model_not_found", response.Error.Code)
		require.NotContains(t, recorder.Body.String(), service.InternalDiscountImage2ModelName)
	})

	t.Run("does not echo an unavailable internal identifier", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodGet, "/v1/models/internal", nil)
		context.Params = gin.Params{{Key: "model", Value: service.InternalDiscountImage2ModelName}}
		context.Set("id", 201)
		common.SetContextKey(context, constant.ContextKeyUserGroup, "default")
		common.SetContextKey(context, constant.ContextKeyTokenModelLimitEnabled, true)
		common.SetContextKey(context, constant.ContextKeyTokenModelLimit, map[string]bool{
			service.PublicDiscountImage2ModelName: true,
		})

		RetrieveVisibleModel(context, constant.ChannelTypeOpenAI)

		var response struct {
			Error types.OpenAIError `json:"error"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		require.Equal(t, "model_not_found", response.Error.Code)
		require.NotContains(t, recorder.Body.String(), service.InternalDiscountImage2ModelName)
	})
}
