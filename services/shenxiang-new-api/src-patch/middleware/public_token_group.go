package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const maxTokenConfigurationBodyBytes = 1 << 20

const claudeUserTokenName = "claude"

var claudeUserTokenModels = []string{
	"claude-fable-5",
	"claude-haiku-4-5-20251001",
	"claude-opus-4-6",
	"claude-opus-4-7",
	"claude-opus-4-8",
	"claude-sonnet-4-6",
	"claude-sonnet-5",
}

var claudeStableUserTokenModels = []string{
	"claude-fable-5",
	"claude-haiku-4-5-20251001",
	"claude-opus-4-5-20251101",
	"claude-opus-4-6",
	"claude-opus-4-7",
	"claude-opus-4-8",
	"claude-sonnet-4-5-20250929",
	"claude-sonnet-4-6",
	"claude-sonnet-5",
}

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
			c.Request.Body = io.NopCloser(bytes.NewReader(body))
			c.Request.ContentLength = int64(len(body))
			c.Next()
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
				c.Request.Body = io.NopCloser(bytes.NewReader(body))
				c.Request.ContentLength = int64(len(body))
				c.Next()
				return
			}
		}
		if group == "" {
			group = "default"
			request["group"] = json.RawMessage(`"default"`)
		}
		if group == service.Grok45PricingGroupName {
			request["cross_group_retry"] = json.RawMessage(`false`)
		}
		if rawName, ok := request["name"]; ok {
			var name string
			if json.Unmarshal(rawName, &name) == nil && strings.EqualFold(strings.TrimSpace(name), claudeUserTokenName) {
				if group == "default" {
					group = "claude-external"
				}
				request["group"] = json.RawMessage(`"` + group + `"`)
				request["model_limits_enabled"] = json.RawMessage(`true`)
				models := claudeUserTokenModels
				if group == "kiro-stable" {
					models = claudeStableUserTokenModels
				}
				request["model_limits"] = json.RawMessage(`"` + strings.Join(models, `,`) + `"`)
			}
		}
		validationBody, err := json.Marshal(request)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "令牌配置无效",
			})
			return
		}
		managedGrokProfile := service.Grok45UserTokenProfile{}
		managedGrokProfileAllowed := json.Unmarshal(validationBody, &managedGrokProfile) == nil &&
			service.IsManagedGrok45UserTokenProfile(managedGrokProfile)
		if !service.IsPublicTokenGroup(group) && !managedGrokProfileAllowed {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "令牌分组或专用令牌配置无效",
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
