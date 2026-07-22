package middleware

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

const (
	claudeTerminalChannelTag  = "xingren-claude-pdhlzy-ccmax-terminal"
	claudeTerminalOnlyMessage = "该专用令牌仅支持 Claude Messages API。"
)

func isClaudeMessagesRequest(c *gin.Context) bool {
	return c != nil && c.Request != nil && c.Request.URL != nil && c.Request.URL.Path == "/v1/messages"
}

func EnforceClaudeTerminalGroup() gin.HandlerFunc {
	return func(c *gin.Context) {
		usingGroup := strings.TrimSpace(common.GetContextKeyString(c, constant.ContextKeyUsingGroup))
		selectedChannelTag := strings.TrimSpace(c.GetString(SelectedChannelTagContextKey))
		if usingGroup != service.ClaudeTerminalPricingGroupName && selectedChannelTag != claudeTerminalChannelTag {
			c.Next()
			return
		}
		if isClaudeMessagesRequest(c) {
			c.Next()
			return
		}
		abortWithOpenAiMessage(
			c,
			http.StatusForbidden,
			claudeTerminalOnlyMessage,
			types.ErrorCodeAccessDenied,
		)
	}
}
