package controller

import (
	_ "embed"
	"net/http"

	"github.com/gin-gonic/gin"
)

//go:embed upscale_help.html
var upscaleHelpHTML []byte

func UpscaleHelp(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, "text/html; charset=utf-8", upscaleHelpHTML)
}
