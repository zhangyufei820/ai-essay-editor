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

func TestStreamScannerResponsesPreludeDoesNotCancelUsefulOutputDeadline(t *testing.T) {
	t.Setenv("RESPONSES_INITIAL_RESPONSE_TIMEOUT", "1")
	for _, effective := range []bool{false, true} {
		t.Run(map[bool]string{false: "placeholder only", true: "effective output"}[effective], func(t *testing.T) {
			reader, writer := io.Pipe()
			t.Cleanup(func() { _ = reader.Close(); _ = writer.Close() })
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
			c.Set("responses_stream_output_tracking", true)
			info := &relaycommon.RelayInfo{DisablePing: true, ChannelMeta: &relaycommon.ChannelMeta{}}
			done := make(chan struct{})
			handled := make(chan struct{})
			go func() {
				StreamScannerHandler(c, &http.Response{Body: reader}, info, func(data string, result *StreamResult) {
					if effective {
						c.Set("response_stream_output_sent", true)
					}
					close(handled)
				})
				close(done)
			}()
			_, err := io.WriteString(writer, "data: {}\n")
			require.NoError(t, err)
			select {
			case <-handled:
			case <-time.After(2 * time.Second):
				t.Fatal("event not handled")
			}
			if effective {
				select {
				case <-done:
					t.Fatal("useful output did not cancel initial deadline")
				case <-time.After(1200 * time.Millisecond):
				}
				require.NoError(t, writer.Close())
			}
			select {
			case <-done:
			case <-time.After(3 * time.Second):
				t.Fatal("initial deadline not enforced")
			}
			if effective {
				assert.Equal(t, relaycommon.StreamEndReasonEOF, info.StreamStatus.EndReason)
			} else {
				assert.Equal(t, relaycommon.StreamEndReasonTimeout, info.StreamStatus.EndReason)
			}
		})
	}
}
