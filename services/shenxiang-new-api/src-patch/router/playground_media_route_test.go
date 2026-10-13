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

func TestSetWebRouterServesLegacyServiceWorkerCleanupBeforeSpaFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	server := gin.New()
	SetWebRouter(server, ThemeAssets{
		DefaultBuildFS:   webDefaultFS,
		DefaultIndexPage: []byte("<html>default</html>"),
		ClassicBuildFS:   webClassicFS,
		ClassicIndexPage: []byte("<html>classic</html>"),
	})

	for _, target := range []string{"/service-worker.js", "/sw.js"} {
		req := httptest.NewRequest(http.MethodGet, target, nil)
		resp := httptest.NewRecorder()
		server.ServeHTTP(resp, req)

		require.Equal(t, http.StatusOK, resp.Code)
		require.Equal(t, "application/javascript; charset=utf-8", resp.Header().Get("Content-Type"))
		require.Equal(t, "no-store, max-age=0", resp.Header().Get("Cache-Control"))
		require.Equal(t, "/", resp.Header().Get("Service-Worker-Allowed"))
		require.Contains(t, resp.Body.String(), "skipWaiting")
		require.Contains(t, resp.Body.String(), "registration.unregister")
		require.NotContains(t, resp.Body.String(), "<html>")
	}
}

func TestSetWebRouterCacheVersionChangesWithEmbeddedFrontend(t *testing.T) {
	gin.SetMode(gin.TestMode)
	versionFor := func(index string) string {
		server := gin.New()
		SetWebRouter(server, ThemeAssets{
			DefaultBuildFS:   webDefaultFS,
			DefaultIndexPage: []byte(index),
			ClassicBuildFS:   webClassicFS,
			ClassicIndexPage: []byte("<html>classic</html>"),
		})
		resp := httptest.NewRecorder()
		server.ServeHTTP(resp, httptest.NewRequest(http.MethodGet, "/console/media-playground", nil))
		require.Equal(t, http.StatusOK, resp.Code)
		return resp.Header().Get("Cache-Version")
	}
	first := versionFor("<html>first</html>")
	require.Len(t, first, 64)
	require.NotEqual(t, first, versionFor("<html>second</html>"))
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
		playgroundMediaAPIRouter.POST("/upload", func(c *gin.Context) {
			require.Equal(t, "web", c.GetString(middleware.RouteTagKey))
			c.String(http.StatusOK, "upload")
		})
		playgroundMediaAPIRouter.GET("/policy", func(c *gin.Context) {
			require.Equal(t, "web", c.GetString(middleware.RouteTagKey))
			c.String(http.StatusOK, "policy")
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

	uploadReq := httptest.NewRequest(http.MethodPost, "/pg/media/upload", nil)
	uploadResp := httptest.NewRecorder()
	server.ServeHTTP(uploadResp, uploadReq)
	require.Equal(t, http.StatusOK, uploadResp.Code)
	require.Equal(t, "upload", uploadResp.Body.String())

	policyReq := httptest.NewRequest(http.MethodGet, "/pg/media/policy", nil)
	policyResp := httptest.NewRecorder()
	server.ServeHTTP(policyResp, policyReq)
	require.Equal(t, http.StatusOK, policyResp.Code)
	require.Equal(t, "policy", policyResp.Body.String())

	videoReq := httptest.NewRequest(http.MethodPost, "/pg/videos", nil)
	videoResp := httptest.NewRecorder()
	server.ServeHTTP(videoResp, videoReq)
	require.Equal(t, http.StatusServiceUnavailable, videoResp.Code)
}
