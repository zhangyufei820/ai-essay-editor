package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
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
		if err := common.Unmarshal(body, &request); err != nil {
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
			if err := common.Unmarshal(rawGroup, &group); err != nil {
				c.Request.Body = io.NopCloser(bytes.NewReader(body))
				c.Request.ContentLength = int64(len(body))
				c.Next()
				return
			}
		}
		if group == "" {
			group = "default"
		}
		normalizedGroup, groupChain, groupErr := service.NormalizeTokenGroupChain(group)
		if groupErr != nil || len(groupChain) == 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "令牌分组链路无效",
			})
			return
		}
		group = normalizedGroup
		groupJSON, err := common.Marshal(group)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "令牌配置无效",
			})
			return
		}
		request["group"] = json.RawMessage(groupJSON)
		request["cross_group_retry"] = json.RawMessage(`false`)
		if rawName, ok := request["name"]; ok {
			var name string
			if common.Unmarshal(rawName, &name) == nil {
				if model.IsManagedTextPricingTokenName(name) {
					textGroupChain, _, valid := model.NormalizeTextPricingGroupChain(group)
					if !valid {
						c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
							"success": false,
							"message": "Codex 文本令牌分组链路无效",
						})
						return
					}
					group = textGroupChain
					_, groupChain, _ = service.NormalizeTokenGroupChain(group)
					groupJSON, err = common.Marshal(group)
					if err != nil {
						c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"success": false, "message": "令牌配置无效"})
						return
					}
					request["group"] = json.RawMessage(groupJSON)
				}
			}
			if common.Unmarshal(rawName, &name) == nil && service.IsPublicClaudeTokenName(name) {
				if group == "default" {
					group = service.ClaudeExternalPricingGroupName
					groupChain = []string{group}
				}
				if err := service.ValidateTokenGroupChain(groupChain, service.IsPublicClaudeTokenGroup); err != nil {
					c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
						"success": false,
						"message": "Claude 令牌分组链路无效",
					})
					return
				}
				groupJSON, err = common.Marshal(group)
				if err != nil {
					c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"success": false, "message": "令牌配置无效"})
					return
				}
				request["group"] = json.RawMessage(groupJSON)
				request["model_limits_enabled"] = json.RawMessage(`true`)
				models, ok := service.PublicClaudeTokenModelsForGroupChain(group)
				if !ok {
					c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
						"success": false,
						"message": "Claude 令牌分组链路无效",
					})
					return
				}
				modelLimitsJSON, marshalErr := common.Marshal(strings.Join(models, ","))
				if marshalErr != nil {
					c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"success": false, "message": "令牌配置无效"})
					return
				}
				request["model_limits"] = json.RawMessage(modelLimitsJSON)
				request["cross_group_retry"] = json.RawMessage(`false`)
			}
		}
		validationBody, err := common.Marshal(request)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "令牌配置无效",
			})
			return
		}
		managedGrokProfile := service.Grok45UserTokenProfile{}
		managedGrokProfileAllowed := common.Unmarshal(validationBody, &managedGrokProfile) == nil &&
			service.IsManagedGrok45UserTokenProfile(managedGrokProfile)
		publicGroupChainAllowed := service.ValidateTokenGroupChain(groupChain, service.IsPublicTokenGroup) == nil
		if !publicGroupChainAllowed && !managedGrokProfileAllowed {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "令牌分组或专用令牌配置无效",
			})
			return
		}
		normalizedBody, err := common.Marshal(request)
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
