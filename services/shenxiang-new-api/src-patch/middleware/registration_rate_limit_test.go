package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRegistrationRateLimitIgnoresSharedCriticalSwitch(t *testing.T) {
	oldEnabled := common.CriticalRateLimitEnable
	oldRequests := common.CriticalRateLimitNum
	oldDuration := common.CriticalRateLimitDuration
	oldRedisEnabled := common.RedisEnabled
	t.Cleanup(func() {
		common.CriticalRateLimitEnable = oldEnabled
		common.CriticalRateLimitNum = oldRequests
		common.CriticalRateLimitDuration = oldDuration
		common.RedisEnabled = oldRedisEnabled
	})
	common.CriticalRateLimitEnable = false
	common.CriticalRateLimitNum = 1
	common.CriticalRateLimitDuration = 60
	common.RedisEnabled = false

	handler := RegistrationRateLimit()
	first, _ := gin.CreateTestContext(httptest.NewRecorder())
	first.Request = httptest.NewRequest(http.MethodPost, "/api/user/register", nil)
	first.Request.RemoteAddr = "203.0.113.7:1234"
	handler(first)
	require.False(t, first.IsAborted())

	second, _ := gin.CreateTestContext(httptest.NewRecorder())
	second.Request = httptest.NewRequest(http.MethodPost, "/api/user/register", nil)
	second.Request.RemoteAddr = "203.0.113.7:5678"
	handler(second)
	require.True(t, second.IsAborted())
	require.Equal(t, http.StatusTooManyRequests, second.Writer.Status())
}
