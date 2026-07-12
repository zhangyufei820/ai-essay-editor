package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const maxTokenConfigurationBodyBytes = 1 << 20

func EnforcePublicTokenGroupSelection() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request == nil || c.Request.URL == nil ||
			(c.Request.Method != http.MethodPost && c.Request.Method != http.MethodPut) ||
			(c.Request.URL.Path != "/api/token" && c.Request.URL.Path != "/api/token/") {
			c.Next()
			return
		}
		if c.Request.Method == http.MethodPut && c.Query("status_only") != "" {
			c.Next()
			return
		}

		limitedBody := http.MaxBytesReader(c.Writer, c.Request.Body, maxTokenConfigurationBodyBytes)
		body, err := io.ReadAll(limitedBody)
		_ = limitedBody.Close()
		if err != nil {
			c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{
				"success": false,
				"message": "令牌配置请求过大",
			})
			return
		}
		request := map[string]json.RawMessage{}
		if err := json.Unmarshal(body, &request); err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "令牌配置无效",
			})
			return
		}
		if request == nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "令牌配置无效",
			})
			return
		}
		group := ""
		if rawGroup, ok := request["group"]; ok && string(rawGroup) != "null" {
			if err := json.Unmarshal(rawGroup, &group); err != nil {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
					"success": false,
					"message": "令牌配置无效",
				})
				return
			}
		}
		if group == "" {
			group = "default"
			request["group"] = json.RawMessage(`"default"`)
		}
		if group == service.Grok45PricingGroupName {
			if c.GetInt("id") <= 0 {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"success": false,
					"message": "登录状态无效",
				})
				return
			}
			userGroup := c.GetString("user_group")
			if userGroup == "" || !service.UserCanUseGrok45PricingGroup(userGroup) {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
					"success": false,
					"message": "令牌分组不可用",
				})
				return
			}
			var token model.Token
			if err := json.Unmarshal(body, &token); err != nil || !service.IsExactGrok45TokenConfiguration(&token) {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
					"success": false,
					"message": "专用令牌配置无效",
				})
				return
			}
		} else if !service.IsPublicTokenGroup(group) {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "令牌只可选择原价或特价分组",
			})
			return
		}
		normalizedBody, err := json.Marshal(request)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "令牌配置无效",
			})
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(normalizedBody))
		c.Request.ContentLength = int64(len(normalizedBody))
		c.Next()
	}
}
