package router

import (
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAPIRouterPreservesUpstreamAuthorizationGuards(t *testing.T) {
	source, err := os.ReadFile("api-router.go")
	require.NoError(t, err)
	text := string(source)

	require.Contains(t, text, "registerChannelRoutes(apiRouter)")
	require.Contains(t, text, "registerAuthzRoutes(apiRouter)")
	require.NotContains(t, text, `channelRoute := apiRouter.Group("/channel")`)
	require.Contains(t, text, `selfRoute.PUT("/self", middleware.CriticalRateLimit(), controller.UpdateSelf)`)
	require.Contains(t, text, `logRoute.DELETE("/", middleware.RootAuth(), controller.DeleteHistoryLogs)`)
	require.False(t, strings.Contains(text, `logRoute.DELETE("/", middleware.AdminAuth()`))
}

func TestOAuthBindRoutesRequireFreshUserAuthentication(t *testing.T) {
	source, err := os.ReadFile("api-router.go")
	require.NoError(t, err)
	text := string(source)

	require.Contains(t, text, `apiRouter.POST("/oauth/email/bind", middleware.CriticalRateLimit(), middleware.UserAuth(), anonymousRequestBodyLimit, controller.EmailBind)`)
	require.Contains(t, text, `apiRouter.POST("/oauth/wechat/bind", middleware.CriticalRateLimit(), middleware.UserAuth(), anonymousRequestBodyLimit, controller.WeChatBind)`)
	require.Contains(t, text, `apiRouter.POST("/oauth/telegram/bind", middleware.CriticalRateLimit(), middleware.UserAuth(), anonymousRequestBodyLimit, controller.TelegramBind)`)
	require.Contains(t, text, `apiRouter.POST("/oauth/telegram/login", middleware.CriticalRateLimit(), anonymousRequestBodyLimit, controller.TelegramLogin)`)
	require.Contains(t, text, `apiRouter.POST("/oauth/wechat", middleware.CriticalRateLimit(), anonymousRequestBodyLimit, controller.WeChatAuth)`)
	require.NotContains(t, text, `apiRouter.GET("/oauth/wechat"`)
	require.NotContains(t, text, `apiRouter.GET("/oauth/telegram/bind"`)
	require.NotContains(t, text, `apiRouter.GET("/oauth/telegram/login"`)
}

func TestTokenGroupSelectionRunsAfterUserAuthenticationOnlyOnTokenRoutes(t *testing.T) {
	routerSource, err := os.ReadFile("api-router.go")
	require.NoError(t, err)
	routerText := string(routerSource)
	mainSource, err := os.ReadFile("../main.go")
	require.NoError(t, err)

	require.Contains(t, routerText, `tokenRoute.Use(middleware.UserAuth(), middleware.EnforcePublicTokenGroupSelection())`)
	require.Equal(t, 1, strings.Count(routerText, "EnforcePublicTokenGroupSelection"))
	require.NotContains(t, string(mainSource), "server.Use(middleware.EnforcePublicTokenGroupSelection())")
}
