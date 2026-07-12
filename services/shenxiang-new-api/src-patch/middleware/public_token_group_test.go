package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

const exactGrok45TokenBody = `{
	"id":17,
	"name":"custom-grok-token-name",
	"expired_time":-1,
	"remain_quota":0,
	"unlimited_quota":true,
	"model_limits_enabled":true,
	"model_limits":"grok-4.5",
	"allow_ips":"",
	"group":"grok45",
	"cross_group_retry":false
}`

func configureGrok45TokenEntitlements(t *testing.T) {
	t.Helper()
	originalGroups := setting.UserUsableGroups2JSONString()
	specialGroups := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
	originalSpecialGroups := specialGroups.ReadAll()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalGroups))
		specialGroups.Clear()
		specialGroups.AddAll(originalSpecialGroups)
	})
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{
		"default":"原价",
		"discount":"特价",
		"grok45":"Grok 4.5 专用通道"
	}`))
	specialGroups.Clear()
	specialGroups.Set("restricted", map[string]string{"-:grok45": "不可用"})
}

func addAuthenticatedUserContext(engine *gin.Engine, userGroup string) {
	engine.Use(func(c *gin.Context) {
		c.Set("id", 42)
		c.Set("user_group", userGroup)
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
		require.Equal(t, "discount", request.Group)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`{"group":"discount"}`),
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

func TestEnforcePublicTokenGroupSelectionAllowsExactGrok45CreateAndUpdateWithCustomName(t *testing.T) {
	configureGrok45TokenEntitlements(t)
	gin.SetMode(gin.TestMode)

	for _, method := range []string{http.MethodPost, http.MethodPut} {
		t.Run(method, func(t *testing.T) {
			called := false
			engine := gin.New()
			addAuthenticatedUserContext(engine, "entitled")
			engine.Use(EnforcePublicTokenGroupSelection())
			engine.Handle(method, "/api/token/", func(c *gin.Context) {
				request := struct {
					Name  string `json:"name"`
					Group string `json:"group"`
				}{}
				require.NoError(t, c.ShouldBindJSON(&request))
				require.Equal(t, "custom-grok-token-name", request.Name)
				require.Equal(t, service.Grok45PricingGroupName, request.Group)
				called = true
				c.Status(http.StatusNoContent)
			})
			request := httptest.NewRequest(method, "/api/token/", strings.NewReader(exactGrok45TokenBody))
			request.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()

			engine.ServeHTTP(recorder, request)

			require.Equal(t, http.StatusNoContent, recorder.Code)
			require.True(t, called)
		})
	}
}

func TestEnforcePublicTokenGroupSelectionRejectsUnauthenticatedGrok45Token(t *testing.T) {
	configureGrok45TokenEntitlements(t)
	gin.SetMode(gin.TestMode)
	called := false
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		called = true
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodPost, "/api/token/", strings.NewReader(exactGrok45TokenBody))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusUnauthorized, recorder.Code)
	require.False(t, called)
}

func TestEnforcePublicTokenGroupSelectionRejectsGrok45WithoutEntitlement(t *testing.T) {
	configureGrok45TokenEntitlements(t)
	gin.SetMode(gin.TestMode)
	called := false
	engine := gin.New()
	addAuthenticatedUserContext(engine, "restricted")
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		called = true
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodPost, "/api/token/", strings.NewReader(exactGrok45TokenBody))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusForbidden, recorder.Code)
	require.False(t, called)
}

func TestEnforcePublicTokenGroupSelectionRejectsInexactGrok45Contracts(t *testing.T) {
	configureGrok45TokenEntitlements(t)
	gin.SetMode(gin.TestMode)
	tests := map[string]string{
		"multiple models":      strings.Replace(exactGrok45TokenBody, `"grok-4.5"`, `"grok-4.5,gpt-5.5"`, 1),
		"limits disabled":      strings.Replace(exactGrok45TokenBody, `"model_limits_enabled":true`, `"model_limits_enabled":false`, 1),
		"limited quota":        strings.Replace(exactGrok45TokenBody, `"unlimited_quota":true`, `"unlimited_quota":false`, 1),
		"nonzero quota":        strings.Replace(exactGrok45TokenBody, `"remain_quota":0`, `"remain_quota":1`, 1),
		"finite expiration":    strings.Replace(exactGrok45TokenBody, `"expired_time":-1`, `"expired_time":3600`, 1),
		"ip restriction":       strings.Replace(exactGrok45TokenBody, `"allow_ips":""`, `"allow_ips":"127.0.0.1"`, 1),
		"cross-group fallback": strings.Replace(exactGrok45TokenBody, `"cross_group_retry":false`, `"cross_group_retry":true`, 1),
	}
	for name, body := range tests {
		t.Run(name, func(t *testing.T) {
			called := false
			engine := gin.New()
			addAuthenticatedUserContext(engine, "entitled")
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
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/user/reset",
		strings.NewReader(`{"group":"internal"}`),
	)
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
