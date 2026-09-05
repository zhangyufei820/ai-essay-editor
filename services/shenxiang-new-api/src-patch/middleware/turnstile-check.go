package middleware

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

const turnstileTokenHeader = "X-Turnstile-Token"

type turnstileCheckResponse struct {
	Success    bool     `json:"success"`
	ErrorCodes []string `json:"error-codes"`
}

func turnstileToken(c *gin.Context) string {
	if token := strings.TrimSpace(c.GetHeader(turnstileTokenHeader)); token != "" {
		return token
	}
	return c.Query("turnstile")
}

func TurnstileCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		if common.TurnstileCheckEnabled {
			session := sessions.Default(c)
			turnstileChecked := session.Get("turnstile")
			if turnstileChecked != nil {
				c.Next()
				return
			}
			response := turnstileToken(c)
			if response == "" {
				c.JSON(http.StatusOK, gin.H{
					"success": false,
					"message": "Turnstile token 为空",
				})
				c.Abort()
				return
			}
			rawRes, err := http.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", url.Values{
				"secret":   {common.TurnstileSecretKey},
				"response": {response},
				"remoteip": {c.ClientIP()},
			})
			if err != nil {
				common.SysError(fmt.Sprintf("turnstile siteverify request failed: %v", err))
				c.JSON(http.StatusOK, gin.H{
					"success": false,
					"message": "Turnstile 校验服务暂时不可用，请稍后重试！",
				})
				c.Abort()
				return
			}
			defer rawRes.Body.Close()
			var res turnstileCheckResponse
			err = common.DecodeJson(rawRes.Body, &res)
			if err != nil {
				common.SysError(fmt.Sprintf("turnstile siteverify response decode failed: %v", err))
				c.JSON(http.StatusOK, gin.H{
					"success": false,
					"message": "Turnstile 校验服务暂时不可用，请稍后重试！",
				})
				c.Abort()
				return
			}
			if !res.Success {
				errorCodes := strings.Join(res.ErrorCodes, ",")
				if errorCodes == "" {
					errorCodes = "unknown"
				}
				common.SysLog(fmt.Sprintf("turnstile siteverify rejected request: status=%d error_codes=%s", rawRes.StatusCode, errorCodes))
				c.JSON(http.StatusOK, gin.H{
					"success": false,
					"message": "Turnstile 校验失败，请刷新重试！",
				})
				c.Abort()
				return
			}
			session.Set("turnstile", true)
			err = session.Save()
			if err != nil {
				c.JSON(http.StatusOK, gin.H{
					"message": "无法保存会话信息，请重试",
					"success": false,
				})
				return
			}
		}
		c.Next()
	}
}
