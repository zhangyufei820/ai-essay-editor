package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func terminalGroupTestEngine(t *testing.T, group, channelTag string, called *bool) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
		if channelTag != "" {
			c.Set(SelectedChannelTagContextKey, channelTag)
		}
		c.Next()
	})
	engine.Use(EnforceClaudeTerminalGroup())
	engine.POST("/v1/messages", func(c *gin.Context) {
		*called = true
		c.Status(http.StatusNoContent)
	})
	engine.POST("/v1/chat/completions", func(c *gin.Context) {
		*called = true
		c.Status(http.StatusNoContent)
	})
	return engine
}

func TestEnforceClaudeTerminalGroupAllowsMessages(t *testing.T) {
	called := false
	engine := terminalGroupTestEngine(t, service.ClaudeTerminalPricingGroupName, claudeTerminalChannelTag, &called)
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/v1/messages", strings.NewReader(`{}`)))

	require.Equal(t, http.StatusNoContent, recorder.Code)
	require.True(t, called)
}

func TestEnforceClaudeTerminalGroupRejectsOpenAIChat(t *testing.T) {
	called := false
	engine := terminalGroupTestEngine(t, service.ClaudeTerminalPricingGroupName, claudeTerminalChannelTag, &called)
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{}`)))

	require.Equal(t, http.StatusForbidden, recorder.Code)
	require.False(t, called)
	require.NotContains(t, recorder.Body.String(), "pdhlzy")
	require.NotContains(t, recorder.Body.String(), "ccmax")
}

func TestEnforceClaudeTerminalGroupRejectsSpecificChannelBypass(t *testing.T) {
	called := false
	engine := terminalGroupTestEngine(t, "default", claudeTerminalChannelTag, &called)
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{}`)))

	require.Equal(t, http.StatusForbidden, recorder.Code)
	require.False(t, called)
}

func TestEnforceClaudeTerminalGroupAllowsOtherGroups(t *testing.T) {
	called := false
	engine := terminalGroupTestEngine(t, service.ClaudeExternalPricingGroupName, "", &called)
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{}`)))

	require.Equal(t, http.StatusNoContent, recorder.Code)
	require.True(t, called)
}

func TestSetupContextForSelectedChannelRejectsTerminalChannelOnRetry(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{}`))
	tag := claudeTerminalChannelTag
	channel := &model.Channel{Tag: &tag}

	newAPIError := SetupContextForSelectedChannel(context, channel, "claude-sonnet-5")

	require.Error(t, newAPIError)
	require.Equal(t, http.StatusForbidden, newAPIError.StatusCode)
	require.Equal(t, types.ErrorCodeAccessDenied, newAPIError.GetErrorCode())
	require.Equal(t, claudeTerminalOnlyMessage, newAPIError.Error())
}

func TestSetupContextForSelectedChannelDoesNotRejectTerminalMessages(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", strings.NewReader(`{}`))
	tag := claudeTerminalChannelTag
	channel := &model.Channel{Tag: &tag}

	newAPIError := SetupContextForSelectedChannel(context, channel, "claude-sonnet-5")

	require.Nil(t, newAPIError)
	require.Equal(t, claudeTerminalChannelTag, context.GetString(SelectedChannelTagContextKey))
}

func TestSetupContextForSelectedChannelPreservesNonTerminalSetupError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{}`))
	channel := &model.Channel{
		ChannelInfo: model.ChannelInfo{IsMultiKey: true},
	}

	newAPIError := SetupContextForSelectedChannel(context, channel, "claude-sonnet-5")

	require.Error(t, newAPIError)
	require.Equal(t, http.StatusInternalServerError, newAPIError.StatusCode)
	require.Equal(t, types.ErrorCodeChannelNoAvailableKey, newAPIError.GetErrorCode())
	require.NotEqual(t, claudeTerminalOnlyMessage, newAPIError.Error())
}
