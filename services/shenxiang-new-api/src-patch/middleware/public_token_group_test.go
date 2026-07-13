package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

const managedGrok45TokenBody = `{
	"id":17,
	"name":"星人 Grok 4.5 专用令牌",
	"expired_time":-1,
	"remain_quota":0,
	"unlimited_quota":true,
	"model_limits_enabled":true,
	"model_limits":"grok-4.5",
	"allow_ips":"",
	"group":"grok45",
	"cross_group_retry":false
}`

func addAuthenticatedUserContext(engine *gin.Engine) {
	engine.Use(func(c *gin.Context) {
		c.Set("id", 42)
		c.Next()
	})
}

func TestEnforcePublicTokenGroupSelectionRejectsLegacyGroup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	called := false
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		called = true
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodPost, "/api/token/", strings.NewReader(`{"group":"internal"}`))
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
		require.Equal(t, "discount", request.Group)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodPost, "/api/token/", strings.NewReader(`{"group":"discount"}`))
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
	request := httptest.NewRequest(http.MethodPost, "/api/token/", strings.NewReader(`{"name":"test","group":""}`))
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
	request := httptest.NewRequest(http.MethodPost, "/api/token/", strings.NewReader(`null`))
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
	request := httptest.NewRequest(http.MethodPut, "/api/token/?status_only=true", strings.NewReader(`{"group":"internal"}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionAllowsManagedGrok45Profile(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	addAuthenticatedUserContext(engine)
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		request := struct {
			Name            string `json:"name"`
			Group           string `json:"group"`
			ModelLimits     string `json:"model_limits"`
			CrossGroupRetry bool   `json:"cross_group_retry"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.Equal(t, service.Grok45UserTokenName, request.Name)
		require.Equal(t, service.Grok45PricingGroupName, request.Group)
		require.Equal(t, service.Grok45ModelName, request.ModelLimits)
		require.False(t, request.CrossGroupRetry)
		c.Status(http.StatusNoContent)
	})
	body := strings.Replace(managedGrok45TokenBody, `"cross_group_retry":false`, `"cross_group_retry":true`, 1)
	request := httptest.NewRequest(http.MethodPost, "/api/token/", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionAllowsManagedGrok45ProfileUpdate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	called := false
	engine := gin.New()
	addAuthenticatedUserContext(engine)
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.PUT("/api/token/", func(c *gin.Context) {
		called = true
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodPut, "/api/token/", strings.NewReader(managedGrok45TokenBody))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
	require.True(t, called)
}

func TestEnforcePublicTokenGroupSelectionRejectsUnauthenticatedGrok45Profile(t *testing.T) {
	gin.SetMode(gin.TestMode)
	called := false
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		called = true
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodPost, "/api/token/", strings.NewReader(managedGrok45TokenBody))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusUnauthorized, recorder.Code)
	require.False(t, called)
}

func TestEnforcePublicTokenGroupSelectionRejectsNonExactGrok45Profile(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := map[string]string{
		"custom name":     strings.Replace(managedGrok45TokenBody, service.Grok45UserTokenName, "custom", 1),
		"multiple models": strings.Replace(managedGrok45TokenBody, service.Grok45ModelName, service.Grok45ModelName+",gpt-5.5", 1),
		"limited quota":   strings.Replace(managedGrok45TokenBody, `"unlimited_quota":true`, `"unlimited_quota":false`, 1),
		"finite expiry":   strings.Replace(managedGrok45TokenBody, `"expired_time":-1`, `"expired_time":3600`, 1),
		"ip restriction":  strings.Replace(managedGrok45TokenBody, `"allow_ips":""`, `"allow_ips":"127.0.0.1"`, 1),
	}
	for name, body := range tests {
		t.Run(name, func(t *testing.T) {
			called := false
			engine := gin.New()
			addAuthenticatedUserContext(engine)
			engine.Use(EnforcePublicTokenGroupSelection())
			engine.POST("/api/token/", func(c *gin.Context) {
				called = true
				c.Status(http.StatusNoContent)
			})
			request := httptest.NewRequest(http.MethodPost, "/api/token/", strings.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()

			engine.ServeHTTP(recorder, request)

			require.Equal(t, http.StatusBadRequest, recorder.Code)
			require.False(t, called)
		})
	}
}

func TestEnforcePublicTokenGroupSelectionDoesNotInspectOtherRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	called := false
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/user/reset", func(c *gin.Context) {
		called = true
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodPost, "/api/user/reset", strings.NewReader(`{"group":"internal"}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
	require.True(t, called)
}

func TestDedicatedGrokTokenContractIsEnforcedAtAuthentication(t *testing.T) {
	allowIPs := ""
	token := &model.Token{
		ExpiredTime:        -1,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: true,
		ModelLimits:        service.Grok45ModelName,
		AllowIps:           &allowIPs,
		Group:              service.Grok45PricingGroupName,
	}

	require.True(t, hasValidDedicatedTokenContract(token))
	token.CrossGroupRetry = true
	require.False(t, hasValidDedicatedTokenContract(token))
	token.Group = "default"
	require.True(t, hasValidDedicatedTokenContract(token))
	require.False(t, hasValidDedicatedTokenContract(nil))
}
