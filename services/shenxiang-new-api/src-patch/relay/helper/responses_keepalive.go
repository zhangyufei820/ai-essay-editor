package helper

import (
	"net/http"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
)

// Responses clients can wait a long time for upstream prefill/reasoning.
// SSE comments keep intermediaries alive without counting as model output.
func ResponsesKeepAliveEnabled(c *gin.Context, info *relaycommon.RelayInfo) bool {
	return c != nil && c.Request != nil && c.Request.URL != nil &&
		c.Request.Method == http.MethodPost && c.Request.URL.Path == "/v1/responses" &&
		info != nil && info.IsStream && !info.DisablePing
}
