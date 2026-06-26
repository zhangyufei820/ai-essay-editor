package router

import (
	"embed"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

const defaultCodexWorkspaceUpstream = "http://shenxiang-codex-workspace:8000"

// ThemeAssets holds the embedded frontend assets for both themes.
type ThemeAssets struct {
	DefaultBuildFS   embed.FS
	DefaultIndexPage []byte
	ClassicBuildFS   embed.FS
	ClassicIndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets ThemeAssets) {
	defaultFS := common.EmbedFolder(assets.DefaultBuildFS, "web/default/dist")
	classicFS := common.EmbedFolder(assets.ClassicBuildFS, "web/classic/dist")
	themeFS := common.NewThemeAwareFS(defaultFS, classicFS)

	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.Cache())
	router.Use(middleware.GlobalWebRateLimit())
	setCodexWorkspaceProxy(router)
	router.Use(static.Serve("/", themeFS))
	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		if common.GetTheme() == "classic" {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.ClassicIndexPage)
		} else {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.DefaultIndexPage)
		}
	})
}

func setCodexWorkspaceProxy(router *gin.Engine) {
	upstream := strings.TrimSpace(os.Getenv("CODEX_WORKSPACE_UPSTREAM"))
	if upstream == "" {
		upstream = defaultCodexWorkspaceUpstream
	}
	target, err := url.Parse(upstream)
	if err != nil || target.Scheme == "" || target.Host == "" {
		common.SysError("invalid CODEX_WORKSPACE_UPSTREAM: " + upstream)
		handler := func(c *gin.Context) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Codex workspace upstream is not configured"})
		}
		router.GET("/codex", handler)
		router.Any("/codex/*path", handler)
		return
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalHost := req.Host
		originalProto := req.Header.Get("X-Forwarded-Proto")
		if originalProto == "" {
			originalProto = "http"
			if req.TLS != nil {
				originalProto = "https"
			}
		}
		originalDirector(req)
		req.Host = target.Host
		req.Header.Set("X-Forwarded-Host", originalHost)
		req.Header.Set("X-Forwarded-Proto", originalProto)
		req.Header.Set("X-Forwarded-Prefix", "/codex")
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, req *http.Request, err error) {
		common.SysError("codex workspace proxy failed: " + err.Error())
		http.Error(w, "Codex workspace is temporarily unavailable", http.StatusBadGateway)
	}

	handler := func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "codex")
		proxy.ServeHTTP(c.Writer, c.Request)
	}
	router.GET("/codex", handler)
	router.Any("/codex/*path", handler)
}
