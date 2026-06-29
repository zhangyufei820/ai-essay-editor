package controller

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

func TestShouldRetryBypassesChannelAffinityForUpstreamForbidden(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("channel_affinity_skip_retry_on_failure", true)

	err := types.WithOpenAIError(types.OpenAIError{
		Message: "insufficient upstream quota",
		Type:    "insufficient_user_quota",
		Code:    string(types.ErrorCodeInsufficientUserQuota),
	}, http.StatusForbidden)

	if !shouldRetry(c, err, 1) {
		t.Fatal("shouldRetry() = false, want true for upstream 403 despite channel affinity")
	}
}

func TestShouldRetryKeepsChannelAffinityLockForLocalQuota(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("channel_affinity_skip_retry_on_failure", true)

	err := types.NewErrorWithStatusCode(
		errors.New("订阅额度不足"),
		types.ErrorCodeInsufficientUserQuota,
		http.StatusForbidden,
		types.ErrOptionWithSkipRetry(),
	)

	if shouldRetry(c, err, 1) {
		t.Fatal("shouldRetry() = true, want false for local quota failure")
	}
}
