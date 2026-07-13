package openai

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type responsesWriteErrorWriter struct {
	gin.ResponseWriter
}

func (writer *responsesWriteErrorWriter) WriteString(string) (int, error) {
	return 0, io.ErrClosedPipe
}

func TestOaiResponsesStreamHandlerCountsReasoningAndFunctionFallbackTokens(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	testCases := []struct {
		name      string
		eventType string
	}{
		{name: "reasoning text", eventType: "response.reasoning_text.delta"},
		{name: "reasoning summary", eventType: "response.reasoning_summary_text.delta"},
		{name: "function arguments", eventType: "response.function_call_arguments.delta"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
			payload := fmt.Sprintf(`{"type":%q,"delta":%q}`, testCase.eventType, strings.Repeat("fallback token content ", 16))
			response := &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
				Body:       io.NopCloser(strings.NewReader("data: " + payload + "\ndata: [DONE]\n")),
			}

			usage, apiErr := OaiResponsesStreamHandler(context, &relaycommon.RelayInfo{
				OriginModelName: "gpt-4o",
				ChannelMeta:     &relaycommon.ChannelMeta{},
			}, response)

			require.Nil(t, apiErr)
			assert.Greater(t, usage.CompletionTokens, 0)
			assert.True(t, context.GetBool("response_stream_output_sent"))
		})
	}
}

func TestOaiResponsesStreamHandlerDoesNotMarkOutputWhenClientWriteFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	context.Writer = &responsesWriteErrorWriter{ResponseWriter: context.Writer}
	response := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body: io.NopCloser(strings.NewReader(strings.Join([]string{
			`data: {"type":"response.output_text.delta","delta":"output"}`,
			`data: [DONE]`,
		}, "\n"))),
	}

	_, apiErr := OaiResponsesStreamHandler(context, &relaycommon.RelayInfo{
		OriginModelName: "gpt-4o",
		ChannelMeta:     &relaycommon.ChannelMeta{},
	}, response)

	require.Nil(t, apiErr)
	assert.False(t, context.GetBool("response_stream_output_sent"))
}

func TestOaiResponsesStreamHandlerDrainsFinalUsageAfterClientGone(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

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
	response := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body:       reader,
	}

	type streamResult struct {
		usage  int
		prompt int
		err    error
	}
	result := make(chan streamResult, 1)
	go func() {
		usage, apiErr := OaiResponsesStreamHandler(ginContext, &relaycommon.RelayInfo{
			OriginModelName: "gpt-4o",
			ChannelMeta:     &relaycommon.ChannelMeta{},
		}, response)
		if apiErr != nil {
			result <- streamResult{err: apiErr}
			return
		}
		result <- streamResult{usage: usage.CompletionTokens, prompt: usage.PromptTokens}
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

	require.NoError(t, writeEvent(`data: {"type":"response.output_text.delta","delta":"first"}`+"\n"))
	require.Eventually(t, func() bool {
		return ginContext.GetBool("response_stream_output_sent")
	}, 2*time.Second, 10*time.Millisecond)

	cancel()
	require.NoError(t, writeEvent(`data: {"type":"response.completed","response":{"object":"response","status":"completed","usage":{"input_tokens":100,"output_tokens":20,"total_tokens":120}}}`+"\n"))
	require.NoError(t, writeEvent("data: [DONE]\n"))

	select {
	case actual := <-result:
		require.NoError(t, actual.err)
		assert.Equal(t, 100, actual.prompt)
		assert.Equal(t, 20, actual.usage)
	case <-time.After(2 * time.Second):
		t.Fatal("handler did not return upstream final usage")
	}

	assert.True(t, ginContext.GetBool("response_stream_usage_drain_attempted"))
	assert.True(t, ginContext.GetBool("response_completed_seen"))
	assert.NotContains(t, recorder.Body.String(), "response.completed")
}
