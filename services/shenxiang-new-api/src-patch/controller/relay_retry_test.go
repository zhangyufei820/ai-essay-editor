package controller

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/dto"
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

func TestRejectImageModelResponsesRequest(t *testing.T) {
	err := rejectImageModelResponsesRequest(
		types.RelayFormatOpenAIResponses,
		&dto.OpenAIResponsesRequest{Model: "gpt-image-2-4K"},
	)
	if err == nil {
		t.Fatal("rejectImageModelResponsesRequest() = nil, want image model rejection")
	}
	if err.StatusCode != http.StatusBadRequest {
		t.Fatalf("StatusCode = %d, want %d", err.StatusCode, http.StatusBadRequest)
	}
	if !types.IsSkipRetryError(err) {
		t.Fatal("IsSkipRetryError() = false, want true")
	}
	if !strings.Contains(err.Error(), "/v1/images/generations") {
		t.Fatalf("error = %q, want /v1/images/generations hint", err.Error())
	}
}

func TestRejectImageModelResponsesRequestAllowsTextModels(t *testing.T) {
	err := rejectImageModelResponsesRequest(
		types.RelayFormatOpenAIResponses,
		&dto.OpenAIResponsesRequest{Model: "gpt-5.5"},
	)
	if err != nil {
		t.Fatalf("rejectImageModelResponsesRequest() = %v, want nil for text model", err)
	}
}

func TestRejectImageModelResponsesRequestSkipsImageEndpoint(t *testing.T) {
	err := rejectImageModelResponsesRequest(
		types.RelayFormatOpenAIImage,
		&dto.ImageRequest{Model: "gpt-image-2-4K"},
	)
	if err != nil {
		t.Fatalf("rejectImageModelResponsesRequest() = %v, want nil for image endpoint", err)
	}
}
