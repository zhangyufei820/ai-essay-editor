package router

import (
	"embed"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestSensitiveWebPathDenyList(t *testing.T) {
	require.True(t, isSensitiveWebPath("/.env", "/.env"))
	require.True(t, isSensitiveWebPath("/.git/config", "/.git/config"))
	require.True(t, isSensitiveWebPath("/docker-compose.yml", "/docker-compose.yml"))
	require.True(t, isSensitiveWebPath("/%2eenv", "/%2eenv"))
	require.False(t, isSensitiveWebPath("/assets/app.123.js", "/assets/app.123.js"))
	require.False(t, isSensitiveWebPath("/.well-known/security.txt", "/.well-known/security.txt"))
}

//go:embed testdata/web/default/dist/index.html
var webDefaultFS embed.FS

//go:embed testdata/web/classic/dist/index.html
var webClassicFS embed.FS

func TestSetWebRouterDeniesDotfileBeforeSpaFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	server := gin.New()
	SetWebRouter(server, ThemeAssets{
		DefaultBuildFS:   webDefaultFS,
		DefaultIndexPage: []byte("<html>default</html>"),
		ClassicBuildFS:   webClassicFS,
		ClassicIndexPage: []byte("<html>classic</html>"),
	})

	req := httptest.NewRequest(http.MethodGet, "/.env", nil)
	resp := httptest.NewRecorder()
	server.ServeHTTP(resp, req)

	require.Equal(t, http.StatusNotFound, resp.Code)
	require.NotContains(t, resp.Body.String(), "<html>")
}

func TestRegisterPlaygroundMediaFilesRouteDoesNotUseRelayPerformanceGate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	server := gin.New()

	playgroundMediaRouter := server.Group("/pg/media/files")
	playgroundMediaRouter.Use(middleware.RouteTag("web"))
	playgroundMediaRouter.GET("/*filepath", func(c *gin.Context) {
		require.Equal(t, "web", c.GetString(middleware.RouteTagKey))
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/pg/media/files/u-1/test.png", nil)
	resp := httptest.NewRecorder()
	server.ServeHTTP(resp, req)

	require.Equal(t, http.StatusOK, resp.Code)
	require.Equal(t, "ok", resp.Body.String())
}

func TestPlaygroundServeMediaHandlerIsRegisteredForGet(t *testing.T) {
	gin.SetMode(gin.TestMode)
	server := gin.New()

	playgroundMediaRouter := server.Group("/pg/media/files")
	playgroundMediaRouter.Use(middleware.RouteTag("web"))
	playgroundMediaRouter.GET("/*filepath", controller.PlaygroundServeMedia)

	routes := server.Routes()
	require.Len(t, routes, 1)
	require.Equal(t, http.MethodGet, routes[0].Method)
	require.Equal(t, "/pg/media/files/*filepath", routes[0].Path)
}

func TestPlaygroundMediaCacheRouteDoesNotUseRelayPerformanceGate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	server := gin.New()

	playgroundMediaAPIRouter := server.Group("/pg/media")
	playgroundMediaAPIRouter.Use(middleware.RouteTag("web"))
	{
		playgroundMediaAPIRouter.POST("/cache", func(c *gin.Context) {
			require.Equal(t, "web", c.GetString(middleware.RouteTagKey))
			c.String(http.StatusOK, "cache")
		})
	}

	playgroundRouter := server.Group("/pg")
	playgroundRouter.Use(middleware.RouteTag("relay"))
	playgroundRouter.Use(func(c *gin.Context) {
		c.AbortWithStatus(http.StatusServiceUnavailable)
	})
	{
		playgroundRouter.POST("/videos", func(c *gin.Context) {
			c.String(http.StatusOK, "video")
		})
	}

	cacheReq := httptest.NewRequest(http.MethodPost, "/pg/media/cache", nil)
	cacheResp := httptest.NewRecorder()
	server.ServeHTTP(cacheResp, cacheReq)
	require.Equal(t, http.StatusOK, cacheResp.Code)
	require.Equal(t, "cache", cacheResp.Body.String())

	videoReq := httptest.NewRequest(http.MethodPost, "/pg/videos", nil)
	videoResp := httptest.NewRecorder()
	server.ServeHTTP(videoResp, videoReq)
	require.Equal(t, http.StatusServiceUnavailable, videoResp.Code)
}
