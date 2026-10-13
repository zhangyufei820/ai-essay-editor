package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

func Cache(version string) func(c *gin.Context) {
	return func(c *gin.Context) {
		uri := c.Request.RequestURI
		if strings.HasPrefix(uri, "/assets/") {
			c.Header("Cache-Control", "max-age=604800, immutable")
		} else {
			c.Header("Cache-Control", "no-cache")
		}
		c.Header("Cache-Version", version)
		c.Next()
	}
}
