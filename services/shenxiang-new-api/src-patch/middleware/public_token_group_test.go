package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func publicClaudeTokenModelLimits(t *testing.T, group string) string {
	t.Helper()
	models, ok := service.PublicClaudeTokenModels(group)
	require.True(t, ok)
	return strings.Join(models, ",")
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
			Group              string `json:"group"`
			CrossGroupRetry    bool   `json:"cross_group_retry"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.True(t, request.ModelLimitsEnabled)
		require.Equal(t, publicClaudeTokenModelLimits(t, service.ClaudeExternalPricingGroupName), request.ModelLimits)
		require.Equal(t, "claude-external", request.Group)
		require.False(t, request.CrossGroupRetry)
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

func TestEnforcePublicTokenGroupSelectionAllowsStableClaudeModels(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		request := struct {
			ModelLimits string `json:"model_limits"`
			Group       string `json:"group"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.Equal(t, publicClaudeTokenModelLimits(t, service.ClaudeKiroStablePricingGroupName), request.ModelLimits)
		require.Equal(t, "kiro-stable", request.Group)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`{"name":"Claude","group":"kiro-stable"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionAllowsKiroClaudeModels(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		request := struct {
			ModelLimits string `json:"model_limits"`
			Group       string `json:"group"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.Equal(t, publicClaudeTokenModelLimits(t, service.ClaudeKiroPricingGroupName), request.ModelLimits)
		require.Equal(t, "kiro", request.Group)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`{"name":"Claude","group":"kiro"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionAllowsStandaloneWelfareClaudeModels(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		request := struct {
			ModelLimits string `json:"model_limits"`
			Group       string `json:"group"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.Equal(t, publicClaudeTokenModelLimits(t, service.ClaudeWelfarePricingGroupName), request.ModelLimits)
		require.Equal(t, service.ClaudeWelfarePricingGroupName, request.Group)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`{"name":"Claude","group":"welfare"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionAllowsStandaloneWelfare001ClaudeModels(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		request := struct {
			ModelLimits string `json:"model_limits"`
			Group       string `json:"group"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.Equal(t, publicClaudeTokenModelLimits(t, service.ClaudeWelfare001PricingGroupName), request.ModelLimits)
		require.Equal(t, service.ClaudeWelfare001PricingGroupName, request.Group)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`{"name":"Claude","group":"welfare-001"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionRejectsWelfareFallbackChain(t *testing.T) {
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
		strings.NewReader(`{"name":"Claude","group":"welfare,claude-external"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.False(t, called)
}

func TestEnforcePublicTokenGroupSelectionNormalizesSystemClaudeTokenUpdate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.PUT("/api/token/", func(c *gin.Context) {
		request := struct {
			Group              string `json:"group"`
			ModelLimitsEnabled bool   `json:"model_limits_enabled"`
			ModelLimits        string `json:"model_limits"`
			CrossGroupRetry    bool   `json:"cross_group_retry"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.Equal(t, service.ClaudeKiroPricingGroupName, request.Group)
		require.True(t, request.ModelLimitsEnabled)
		require.Equal(t, publicClaudeTokenModelLimits(t, service.ClaudeKiroPricingGroupName), request.ModelLimits)
		require.False(t, request.CrossGroupRetry)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPut,
		"/api/token/",
		strings.NewReader(`{"id":28,"name":"星人 Claude 高阶令牌","group":"kiro","model_limits_enabled":false,"model_limits":"claude-haiku-4-5-20251001","cross_group_retry":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionRejectsClaudeOnNonClaudeGroup(t *testing.T) {
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
		strings.NewReader(`{"name":"Claude","group":"plus"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.False(t, called)
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

func TestEnforcePublicTokenGroupSelectionNormalizesOrderedGroupChain(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		request := struct {
			Group           string `json:"group"`
			CrossGroupRetry bool   `json:"cross_group_retry"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.Equal(t, "default,discount,plus", request.Group)
		require.False(t, request.CrossGroupRetry)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`{"group":" default,discount,default,plus ","cross_group_retry":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionRejectsPrivateGroupInChain(t *testing.T) {
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
		strings.NewReader(`{"group":"default,internal"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.False(t, called)
}

func TestEnforcePublicTokenGroupSelectionMergesClaudeChainModelLimits(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		request := struct {
			Group       string `json:"group"`
			ModelLimits string `json:"model_limits"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.Equal(t, "kiro,claude-external", request.Group)
		models, ok := service.PublicClaudeTokenModelsForGroupChain(request.Group)
		require.True(t, ok)
		require.Equal(t, strings.Join(models, ","), request.ModelLimits)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`{"name":"Claude","group":"kiro,claude-external"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionAllowsClaudeTerminalGroupChain(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.POST("/api/token/", func(c *gin.Context) {
		request := struct {
			Group       string `json:"group"`
			ModelLimits string `json:"model_limits"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.Equal(t, "kiro,ccmax-terminal,claude-external", request.Group)
		models, ok := service.PublicClaudeTokenModelsForGroupChain(request.Group)
		require.True(t, ok)
		require.Equal(t, strings.Join(models, ","), request.ModelLimits)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/token/",
		strings.NewReader(`{"name":"星人 Claude 高阶令牌","group":"kiro,ccmax-terminal,claude-external"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionRejectsTerminalGroupForGenericToken(t *testing.T) {
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
		strings.NewReader(`{"name":"普通令牌","group":"ccmax-terminal"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.False(t, called)
}

func TestEnforcePublicTokenGroupSelectionRejectsGrokInFallbackChain(t *testing.T) {
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
		strings.NewReader(`{"name":"星人 Grok 4.5 专用令牌","group":"grok45,default","model_limits_enabled":true,"model_limits":"grok-4.5","unlimited_quota":true,"remain_quota":0,"expired_time":-1}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.False(t, called)
}

func TestEnforcePublicTokenGroupSelectionAllowsManagedCodexTextChain(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnforcePublicTokenGroupSelection())
	engine.PUT("/api/token/", func(c *gin.Context) {
		request := struct {
			Group string `json:"group"`
		}{}
		require.NoError(t, c.ShouldBindJSON(&request))
		require.Equal(t, "default,discount,plus", request.Group)
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(
		http.MethodPut,
		"/api/token/",
		strings.NewReader(`{"id":9,"name":"星人 Codex 文本令牌","group":"default,discount,plus"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestEnforcePublicTokenGroupSelectionRejectsClaudeGroupForManagedCodexTextToken(t *testing.T) {
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
		strings.NewReader(`{"id":9,"name":"星人 Codex 文本令牌","group":"default,kiro"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.False(t, called)
}
