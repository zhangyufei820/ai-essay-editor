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

func TestIsVideoTaskPathIncludesPublicSubmitEndpoint(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		name string
		path string
		want bool
	}{
		{name: "public video submit", path: "/v1/videos", want: true},
		{name: "playground videos", path: "/pg/videos", want: true},
		{name: "playground video generations", path: "/pg/video/generations", want: true},
		{name: "public video fetch", path: "/v1/videos/task_123", want: false},
		{name: "image submit", path: "/v1/images/generations", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, tt.path, nil)
			if got := isVideoTaskPath(c); got != tt.want {
				t.Fatalf("isVideoTaskPath(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}
