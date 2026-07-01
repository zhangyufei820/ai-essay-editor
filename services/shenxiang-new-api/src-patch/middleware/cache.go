package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

func Cache() func(c *gin.Context) {
	return func(c *gin.Context) {
		uri := c.Request.RequestURI
		if strings.HasPrefix(uri, "/assets/") {
			c.Header("Cache-Control", "max-age=604800, immutable")
		} else {
			c.Header("Cache-Control", "no-cache")
		}
		c.Header("Cache-Version", "b688f2fb5be447c25e5aa3bd063087a83db32a288bf6a4f35f2d8db310e40b14")
		c.Next()
	}
}
