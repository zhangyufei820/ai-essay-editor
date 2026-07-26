package relay

import (
	"fmt"
	"regexp"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/gin-gonic/gin"
)

const debugRequestBodyPreviewLimit = 512

var (
	// 形如 "Bearer xxx" / "sk-xxx" 的凭证 token
	debugTokenPattern = regexp.MustCompile(`(?i)(bearer\s+|sk-)[A-Za-z0-9._\-]{8,}`)
	// JSON 中的敏感字段值，如 api_key / authorization / password / secret / token
	debugSensitiveFieldPattern = regexp.MustCompile(`(?i)"(api[_-]?key|authorization|password|secret|access[_-]?key|token)"\s*:\s*"[^"]*"`)
)

func logDebugRequestBody(c *gin.Context, body []byte) {
	if !common.DebugEnabled {
		return
	}
	logger.LogDebug(c, "requestBody: bytes=%d preview=%s", len(body), debugBodyPreview(body))
}

func debugBodyPreview(body []byte) string {
	// 先脱敏再截断：避免凭证被截断点切断导致漏脱敏
	sanitized := sanitizeDebugBody(string(body))
	if len(sanitized) <= debugRequestBodyPreviewLimit {
		return sanitized
	}
	return fmt.Sprintf("%s...<truncated %d bytes>", sanitized[:debugRequestBodyPreviewLimit], len(sanitized)-debugRequestBodyPreviewLimit)
}

func sanitizeDebugBody(s string) string {
	s = debugSensitiveFieldPattern.ReplaceAllString(s, `"$1":"[REDACTED]"`)
	s = debugTokenPattern.ReplaceAllString(s, "[REDACTED]")
	return s
}
