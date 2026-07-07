package channel

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestWithPlaygroundImageTimeout_AsyncWorkerUsesTimeoutEvenWhenStream(t *testing.T) {
	t.Setenv("PLAYGROUND_IMAGE_TASK_TIMEOUT_SECONDS", "")

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
	ctx.Set("playground_image_async_worker", true)

	upstreamReq := httptest.NewRequest(http.MethodPost, "https://example.test/v1/images/generations", nil)
	info := &relaycommon.RelayInfo{IsStream: true}

	timedReq, cancel := withPlaygroundImageTimeout(ctx, upstreamReq, info)
	require.NotNil(t, cancel)
	defer cancel()
	deadline, ok := timedReq.Context().Deadline()
	require.True(t, ok)
	remaining := time.Until(deadline)
	require.Greater(t, remaining, 590*time.Second)
	require.LessOrEqual(t, remaining, 600*time.Second)
}

func TestWithPlaygroundImageTimeout_AsyncWorkerKeepsParentDeadline(t *testing.T) {
	t.Setenv("PLAYGROUND_IMAGE_TASK_TIMEOUT_SECONDS", "600")

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	parentCtx, parentCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer parentCancel()
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil).WithContext(parentCtx)
	ctx.Set("playground_image_async_worker", true)

	upstreamReq := httptest.NewRequest(http.MethodPost, "https://example.test/v1/images/generations", nil)
	info := &relaycommon.RelayInfo{}

	timedReq, cancel := withPlaygroundImageTimeout(ctx, upstreamReq, info)
	require.NotNil(t, cancel)
	defer cancel()
	deadline, ok := timedReq.Context().Deadline()
	require.True(t, ok)
	remaining := time.Until(deadline)
	require.Greater(t, remaining, time.Second)
	require.LessOrEqual(t, remaining, 2*time.Second)
}

func TestWithPlaygroundImageTimeout_NonAsyncStreamSkipsTimeout(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)

	upstreamReq := httptest.NewRequest(http.MethodPost, "https://example.test/v1/images/generations", nil)
	info := &relaycommon.RelayInfo{IsStream: true}

	timedReq, cancel := withPlaygroundImageTimeout(ctx, upstreamReq, info)
	require.Nil(t, cancel)
	_, ok := timedReq.Context().Deadline()
	require.False(t, ok)
}
