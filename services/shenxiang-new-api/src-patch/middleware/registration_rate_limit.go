package middleware

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// RegistrationRateLimit keeps signup throttling enabled even if the shared
// critical-endpoint limiter is disabled for another operational reason.
func RegistrationRateLimit() func(c *gin.Context) {
	maxRequests := common.CriticalRateLimitNum
	if maxRequests <= 0 {
		maxRequests = 20
	}
	duration := common.CriticalRateLimitDuration
	if duration <= 0 {
		duration = 20 * 60
	}
	return rateLimitFactory(maxRequests, duration, "REG")
}
