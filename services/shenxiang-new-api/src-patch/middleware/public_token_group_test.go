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
