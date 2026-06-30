package controller

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func StartCodexOAuth(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"success": false,
		"message": "Codex OAuth authorization flow is not configured on this deployment",
	})
}

func CompleteCodexOAuth(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"success": false,
		"message": "Codex OAuth authorization flow is not configured on this deployment",
	})
}

func StartCodexOAuthForChannel(c *gin.Context) {
	if _, err := strconv.Atoi(c.Param("id")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid channel id"})
		return
	}
	StartCodexOAuth(c)
}

func CompleteCodexOAuthForChannel(c *gin.Context) {
	if _, err := strconv.Atoi(c.Param("id")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid channel id"})
		return
	}
	CompleteCodexOAuth(c)
}
