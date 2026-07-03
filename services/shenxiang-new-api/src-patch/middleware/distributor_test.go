package middleware

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestNormalizeImageEndpointModelRequestMapsPlaygroundRawGPTImage2(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", bytes.NewBufferString(`{"model":"gpt-image-2"}`))
	modelRequest := &ModelRequest{Model: "gpt-image-2"}

	normalizeImageEndpointModelRequest(ctx, modelRequest)

	if modelRequest.Model != "gpt-image-2-4K" {
		t.Fatalf("model = %q, want gpt-image-2-4K", modelRequest.Model)
	}
}

func TestNormalizeImageEndpointModelRequestMapsV1GenerationRawGPTImage2(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewBufferString(`{"model":"gpt-image-2"}`))
	modelRequest := &ModelRequest{Model: "gpt-image-2"}

	normalizeImageEndpointModelRequest(ctx, modelRequest)

	if modelRequest.Model != "gpt-image-2-4K" {
		t.Fatalf("model = %q, want gpt-image-2-4K", modelRequest.Model)
	}
}

func TestNormalizeImageEndpointModelRequestMapsV1EditRawGPTImage2(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", bytes.NewBufferString(`{"model":"gpt-image-2"}`))
	modelRequest := &ModelRequest{Model: "gpt-image-2"}

	normalizeImageEndpointModelRequest(ctx, modelRequest)

	if modelRequest.Model != "gpt-image-2-4K" {
		t.Fatalf("model = %q, want gpt-image-2-4K", modelRequest.Model)
	}
}

func TestGetModelRequestRejectsChatImageModelBeforeChannelSelection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewBufferString(`{"model":"gpt-image-2","messages":[]}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	_, _, err := getModelRequest(ctx)

	if err == nil {
		t.Fatal("getModelRequest() err = nil, want image model text endpoint rejection")
	}
	if !strings.Contains(err.Error(), "/v1/images/generations") || !strings.Contains(err.Error(), "/v1/images/edits") {
		t.Fatalf("error = %q, want image endpoint hints", err.Error())
	}
}
