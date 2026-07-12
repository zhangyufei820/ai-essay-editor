package helper

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStreamScannerHandlerDrainsResponsesUsageAfterClientGone(t *testing.T) {
	gin.SetMode(gin.TestMode)
	requestContext, cancel := context.WithCancel(context.Background())
	defer cancel()

	reader, writer := io.Pipe()
	t.Cleanup(func() {
		_ = reader.Close()
		_ = writer.Close()
	})

	recorder := httptest.NewRecorder()
	ginContext, _ := gin.CreateTestContext(recorder)
	ginContext.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil).WithContext(requestContext)
	ginContext.Set("responses_stream_drain_usage_after_client_gone", true)

	response := &http.Response{Body: reader}
	info := &relaycommon.RelayInfo{
		DisablePing: true,
		ChannelMeta: &relaycommon.ChannelMeta{},
	}

	var handledCount atomic.Int64
	handled := make(chan string, 2)
	done := make(chan struct{})
	go func() {
		StreamScannerHandler(ginContext, response, info, func(data string, streamResult *StreamResult) {
			if data == "first" {
				ginContext.Set("response_stream_output_sent", true)
			}
			handledCount.Add(1)
			handled <- data
		})
		close(done)
	}()

	writeEvent := func(event string) error {
		writeResult := make(chan error, 1)
		go func() {
			_, err := fmt.Fprint(writer, event)
			writeResult <- err
		}()
		select {
		case err := <-writeResult:
			return err
		case <-time.After(2 * time.Second):
			return context.DeadlineExceeded
		}
	}

	require.NoError(t, writeEvent("data: first\n"))
	select {
	case data := <-handled:
		require.Equal(t, "first", data)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first response event")
	}

	cancel()

	require.NoError(t, writeEvent("data: response.completed\n"))
	require.NoError(t, writeEvent("data: [DONE]\n"))
	select {
	case data := <-handled:
		require.Equal(t, "response.completed", data)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for drained response.completed event")
	}

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("handler did not finish after draining final usage event")
	}

	assert.Equal(t, int64(2), handledCount.Load())
	require.NotNil(t, info.StreamStatus)
	assert.Equal(t, relaycommon.StreamEndReasonClientGone, info.StreamStatus.EndReason)
}

func TestStreamScannerHandlerBoundsResponsesUsageDrainAfterClientGone(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldDrainTimeout := responsesUsageDrainTimeout
	responsesUsageDrainTimeout = 25 * time.Millisecond
	t.Cleanup(func() { responsesUsageDrainTimeout = oldDrainTimeout })

	requestContext, cancel := context.WithCancel(context.Background())
	defer cancel()
	reader, writer := io.Pipe()
	t.Cleanup(func() {
		_ = reader.Close()
		_ = writer.Close()
	})

	recorder := httptest.NewRecorder()
	ginContext, _ := gin.CreateTestContext(recorder)
	ginContext.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil).WithContext(requestContext)
	ginContext.Set("responses_stream_drain_usage_after_client_gone", true)
	response := &http.Response{Body: reader}
	info := &relaycommon.RelayInfo{
		DisablePing: true,
		ChannelMeta: &relaycommon.ChannelMeta{},
	}

	firstHandled := make(chan struct{})
	done := make(chan struct{})
	go func() {
		StreamScannerHandler(ginContext, response, info, func(data string, streamResult *StreamResult) {
			if data == "first" {
				ginContext.Set("response_stream_output_sent", true)
				close(firstHandled)
			}
		})
		close(done)
	}()

	writeResult := make(chan error, 1)
	go func() {
		_, err := fmt.Fprint(writer, "data: first\n")
		writeResult <- err
	}()
	select {
	case err := <-writeResult:
		require.NoError(t, err)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out writing first response event")
	}
	select {
	case <-firstHandled:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first response event")
	}

	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("handler did not stop after bounded usage drain")
	}

	assert.True(t, ginContext.GetBool(ResponseStreamUsageDrainAttemptedContextKey))
	assert.True(t, ginContext.GetBool(ResponseStreamUsageDrainTimedOutContextKey))
	require.NotNil(t, info.StreamStatus)
	assert.Equal(t, relaycommon.StreamEndReasonClientGone, info.StreamStatus.EndReason)
}
