package channel

import (
	"bufio"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestResponsesKeepAliveFlushesBeforeUpstreamHeadersWithoutMarkingOutput(t *testing.T) {
	// Reproduce slow prefill: the provider has not sent even response headers.
	settings := operation_setting.GetGeneralSetting()
	oldEnabled := settings.PingIntervalEnabled
	settings.PingIntervalEnabled = false
	t.Cleanup(func() { settings.PingIntervalEnabled = oldEnabled })
	release := make(chan struct{})
	var releaseOnce sync.Once
	unblock := func() { releaseOnce.Do(func() { close(release) }) }
	t.Cleanup(unblock)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = io.WriteString(w, "data: {\"type\":\"response.completed\"}\n\n")
		case <-r.Context().Done():
		}
	}))
	defer upstream.Close()
	state := make(chan bool, 1)
	router := gin.New()
	router.POST("/v1/responses", func(c *gin.Context) {
		req, _ := http.NewRequest(http.MethodPost, upstream.URL, nil)
		resp, err := doRequest(c, req, &relaycommon.RelayInfo{IsStream: true, ChannelMeta: &relaycommon.ChannelMeta{}})
		if err != nil {
			c.Status(502)
			return
		}
		defer resp.Body.Close()
		state <- service.HasTextOutputSent(c)
		_, _ = io.Copy(c.Writer, resp.Body)
		c.Writer.Flush()
	})
	downstream := httptest.NewServer(router)
	defer downstream.Close()
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(downstream.URL+"/v1/responses", "application/json", nil)
	if err != nil {
		unblock()
		t.Fatalf("no keepalive reached the client before slow upstream headers: %v", err)
	}
	defer resp.Body.Close()
	reader := bufio.NewReader(resp.Body)
	line, err := reader.ReadString('\n')
	require.NoError(t, err)
	require.Equal(t, ": PING\n", line)
	require.Contains(t, resp.Header.Get("Content-Type"), "text/event-stream")
	unblock()
	remaining, err := io.ReadAll(reader)
	require.NoError(t, err)
	require.Contains(t, string(remaining), "response.completed")
	require.False(t, <-state, "an SSE comment must not block fallback or count as model output")
}

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

func TestWithRelayRequestContextCancelsWithClient(t *testing.T) {
	parent, cancelParent := context.WithCancel(context.Background())
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil).WithContext(parent)
	upstreamReq := httptest.NewRequest(http.MethodPost, "https://example.test/v1/responses", nil)

	timedReq, cancelRequest, headerTimer := withRelayRequestContext(ctx, upstreamReq, &relaycommon.RelayInfo{UsingGroup: "default"})
	require.NotNil(t, cancelRequest)
	require.Nil(t, headerTimer)
	t.Cleanup(cancelRequest)

	cancelParent()
	select {
	case <-timedReq.Context().Done():
	case <-time.After(time.Second):
		t.Fatal("upstream request context was not cancelled with the client")
	}
}

func TestWithRelayRequestContextBoundsDiscountHeaderWait(t *testing.T) {
	oldTimeout := discountTextResponseHeaderTimeout
	discountTextResponseHeaderTimeout = 20 * time.Millisecond
	t.Cleanup(func() { discountTextResponseHeaderTimeout = oldTimeout })

	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	upstreamReq := httptest.NewRequest(http.MethodPost, "https://example.test/v1/responses", nil)

	timedReq, cancelRequest, headerTimer := withRelayRequestContext(ctx, upstreamReq, &relaycommon.RelayInfo{UsingGroup: "discount"})
	require.NotNil(t, cancelRequest)
	require.NotNil(t, headerTimer)
	t.Cleanup(cancelRequest)

	select {
	case <-timedReq.Context().Done():
	case <-time.After(time.Second):
		t.Fatal("discount upstream header wait was not bounded")
	}
}

func TestWithRelayRequestContextDoesNotBoundDefaultHeaderWait(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	upstreamReq := httptest.NewRequest(http.MethodPost, "https://example.test/v1/responses", nil)

	_, cancelRequest, headerTimer := withRelayRequestContext(ctx, upstreamReq, &relaycommon.RelayInfo{UsingGroup: "default"})
	require.NotNil(t, cancelRequest)
	require.Nil(t, headerTimer)
	cancelRequest()
}
