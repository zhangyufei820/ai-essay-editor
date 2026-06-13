package relay

import (
	"fmt"

	"github.com/QuantumNous/new-api/logger"
	"github.com/gin-gonic/gin"
)

const debugRequestBodyPreviewLimit = 512

func logDebugRequestBody(c *gin.Context, body []byte) {
	logger.LogDebug(c, "requestBody: bytes=%d preview=%s", len(body), debugBodyPreview(body))
}

func debugBodyPreview(body []byte) string {
	if len(body) <= debugRequestBodyPreviewLimit {
		return string(body)
	}
	return fmt.Sprintf("%s...<truncated %d bytes>", string(body[:debugRequestBodyPreviewLimit]), len(body)-debugRequestBodyPreviewLimit)
}
