package helper

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResponsesInitialResponseTimeoutOnlyAppliesToResponses(t *testing.T) {
	t.Setenv("RESPONSES_INITIAL_RESPONSE_TIMEOUT", "7")

	responsesRecorder := httptest.NewRecorder()
	responsesContext, _ := gin.CreateTestContext(responsesRecorder)
	responsesContext.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	require.Equal(t, 7*time.Second, responsesInitialResponseTimeout(responsesContext))

	chatRecorder := httptest.NewRecorder()
	chatContext, _ := gin.CreateTestContext(chatRecorder)
	chatContext.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	assert.Zero(t, responsesInitialResponseTimeout(chatContext))
}

func TestStreamScannerHandlerTimesOutSilentResponsesStreamBeforeGlobalTimeout(t *testing.T) {
	t.Setenv("RESPONSES_INITIAL_RESPONSE_TIMEOUT", "1")

	reader, writer := io.Pipe()
	t.Cleanup(func() {
		_ = reader.Close()
		_ = writer.Close()
	})

	recorder := httptest.NewRecorder()
	ginContext, _ := gin.CreateTestContext(recorder)
	ginContext.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	response := &http.Response{Body: reader}
	info := &relaycommon.RelayInfo{DisablePing: true, ChannelMeta: &relaycommon.ChannelMeta{}}

	done := make(chan struct{})
	go func() {
		StreamScannerHandler(ginContext, response, info, func(data string, streamResult *StreamResult) {})
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("silent responses stream did not reach the initial-response timeout")
	}

	require.NotNil(t, info.StreamStatus)
	assert.Equal(t, relaycommon.StreamEndReasonTimeout, info.StreamStatus.EndReason)
}
