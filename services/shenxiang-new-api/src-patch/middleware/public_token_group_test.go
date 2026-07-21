package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestEnforcePublicTokenGroupSelectionRejectsLegacyGroup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	called := false
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		called = true
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`{"group":"internal"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.False(t, called)
}

func TestEnforcePublicTokenGroupSelectionPreservesBodyForController(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		request := struct {
			Group string `json:"group"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.Equal(t, "plus", request.Group)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`{"group":"plus"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionDefaultsEmptyGroupToStable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		request := struct {
			Name  string `json:"name"`
			Group string `json:"group"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.Equal(t, "test", request.Name)
		require.Equal(t, "default", request.Group)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`{"name":"test","group":""}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionRestrictsClaudeTokenModels(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		request := struct {
			ModelLimitsEnabled bool   `json:"model_limits_enabled"`
			ModelLimits        string `json:"model_limits"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.True(t, request.ModelLimitsEnabled)
		require.Equal(t, strings.Join(claudeUserTokenModels, ","), request.ModelLimits)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`{"name":" Claude ","model_limits_enabled":false,"model_limits":"gpt-5.5"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionRejectsNullBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	called := false
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		called = true
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`null`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.False(t, called)
}

func TestEnforcePublicTokenGroupSelectionAllowsLegacyStatusOnlyUpdate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.PUT("/api/token/", func(c *gin.Context) {
		request := struct {
			Group string `json:"group"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.Equal(t, "internal", request.Group)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPut,
		"/api/token/?status_only=true",
		strings.NewReader(`{"group":"internal"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionAllowsManagedGrok45Profile(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		request := struct {
			Name            string `json:"name"`
			Group           string `json:"group"`
			ModelLimits     string `json:"model_limits"`
			CrossGroupRetry bool   `json:"cross_group_retry"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.Equal(t, "星人 Grok 4.5 专用令牌", request.Name)
		require.Equal(t, "grok45", request.Group)
		require.Equal(t, "grok-4.5", request.ModelLimits)
		require.False(t, request.CrossGroupRetry)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`{"name":"星人 Grok 4.5 专用令牌","group":"grok45","model_limits_enabled":true,"model_limits":"grok-4.5","unlimited_quota":true,"remain_quota":0,"expired_time":-1,"allow_ips":"","cross_group_retry":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionAllowsManagedGrok45ProfileUpdate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	called := false
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.PUT("/api/token/", func(c *gin.Context) {
		called = true
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPut,
		"/api/token/",
		strings.NewReader(`{"id":45,"status":1,"name":"星人 Grok 4.5 专用令牌","group":"grok45","model_limits_enabled":true,"model_limits":"grok-4.5","unlimited_quota":true,"remain_quota":0,"expired_time":-1,"allow_ips":"","cross_group_retry":false}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
	require.True(t, called)
}

func TestEnforcePublicTokenGroupSelectionRejectsNonExactGrok45Profile(t *testing.T) {
	gin.SetMode(gin.TestMode)
	called := false
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		called = true
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`{"name":"星人 Grok 4.5 专用令牌","group":"grok45","model_limits_enabled":true,"model_limits":"grok-4.5,gpt-5.5","unlimited_quota":true,"remain_quota":0,"expired_time":-1,"allow_ips":"","cross_group_retry":false}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.False(t, called)
}
