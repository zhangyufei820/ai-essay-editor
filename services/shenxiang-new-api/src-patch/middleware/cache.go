package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

const webCacheVersion = "b688f2fb5be447c25e5aa3bd063087a83db32a288bf6a4f35f2d8db310e40b14"

func Cache() func(c *gin.Context) {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if isLongLivedWebAsset(path) {
			c.Header("Cache-Control", "public, max-age=604800, immutable")
		} else {
			c.Header("Cache-Control", "no-cache")
		}
		c.Header("Cache-Version", webCacheVersion)
		c.Next()
	}
}

func isLongLivedWebAsset(path string) bool {
	if strings.HasPrefix(path, "/static/") || strings.HasPrefix(path, "/compat/") {
		return true
	}
	switch path {
	case "/favicon.ico", "/logo.png", "/manifest.json", "/asset-manifest.json":
		return true
	default:
		return false
	}
}
