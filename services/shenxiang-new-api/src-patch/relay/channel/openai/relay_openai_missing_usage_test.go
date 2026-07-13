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
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type chatWriteErrorWriter struct {
	gin.ResponseWriter
}

func (writer *chatWriteErrorWriter) WriteString(string) (int, error) {
	return 0, io.ErrClosedPipe
}

func newChatStreamRelayInfo() *relaycommon.RelayInfo {
	return &relaycommon.RelayInfo{
		OriginModelName:    "gpt-4o",
		RelayMode:          relayconstant.RelayModeChatCompletions,
		RelayFormat:        types.RelayFormatOpenAI,
		ShouldIncludeUsage: true,
		DisablePing:        true,
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "gpt-4o",
		},
	}
}

func TestOaiStreamHandlerMarksSuccessfulFallbackOutput(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	testCases := []struct {
		name    string
		payload string
	}{
		{
			name:    "content",
			payload: `{"id":"chatcmpl-content","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"delivered content for local fallback"},"finish_reason":null}]}`,
		},
		{
			name:    "reasoning",
			payload: `{"id":"chatcmpl-reasoning","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{"reasoning_content":"delivered reasoning for local fallback"},"finish_reason":null}]}`,
		},
		{
			name:    "tool call",
			payload: `{"id":"chatcmpl-tool","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"lookup","arguments":"{\"topic\":\"usage\"}"}}]},"finish_reason":null}]}`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ginContext, _ := gin.CreateTestContext(recorder)
			ginContext.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
			response := &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
				Body:       io.NopCloser(strings.NewReader("data: " + testCase.payload + "\ndata: [DONE]\n")),
			}

			usage, apiErr := OaiStreamHandler(ginContext, newChatStreamRelayInfo(), response)

			require.Nil(t, apiErr)
			assert.Greater(t, usage.CompletionTokens, 0)
			assert.True(t, ginContext.GetBool("responses_stream_output_tracking"))
			assert.True(t, ginContext.GetBool("response_stream_output_sent"))
			assert.True(t, service.HasTextOutputSent(ginContext))
		})
	}
}

func TestOaiStreamHandlerDoesNotMarkOutputWhenClientWriteFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	recorder := httptest.NewRecorder()
	ginContext, _ := gin.CreateTestContext(recorder)
	ginContext.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	ginContext.Writer = &chatWriteErrorWriter{ResponseWriter: ginContext.Writer}
	payload := `{"id":"chatcmpl-write-error","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"not delivered"},"finish_reason":null}]}`
	response := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body:       io.NopCloser(strings.NewReader("data: " + payload + "\ndata: [DONE]\n")),
	}

	_, apiErr := OaiStreamHandler(ginContext, newChatStreamRelayInfo(), response)

	require.Nil(t, apiErr)
	assert.True(t, ginContext.GetBool("responses_stream_output_tracking"))
	assert.False(t, ginContext.GetBool("response_stream_output_sent"))
	assert.False(t, service.HasTextOutputSent(ginContext))
}

func TestOaiStreamHandlerDoesNotTreatRoleOnlyChunkAsOutput(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	recorder := httptest.NewRecorder()
	ginContext, _ := gin.CreateTestContext(recorder)
	ginContext.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	payload := `{"id":"chatcmpl-role","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}`
	response := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body:       io.NopCloser(strings.NewReader("data: " + payload + "\ndata: [DONE]\n")),
	}

	_, apiErr := OaiStreamHandler(ginContext, newChatStreamRelayInfo(), response)

	require.Nil(t, apiErr)
	assert.True(t, ginContext.GetBool("responses_stream_output_tracking"))
	assert.False(t, ginContext.GetBool("response_stream_output_sent"))
	assert.False(t, service.HasTextOutputSent(ginContext))
}

func TestOaiStreamHandlerDoesNotEnableTextOutputTrackingForAudio(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	recorder := httptest.NewRecorder()
	ginContext, _ := gin.CreateTestContext(recorder)
	ginContext.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	payload := `{"id":"chatcmpl-audio","object":"chat.completion.chunk","created":1,"model":"gpt-4o-audio-preview","choices":[{"index":0,"delta":{"audio":{"data":"encoded-audio"}},"finish_reason":null}]}`
	response := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body:       io.NopCloser(strings.NewReader("data: " + payload + "\ndata: [DONE]\n")),
	}
	info := newChatStreamRelayInfo()
	info.OriginModelName = "gpt-4o-audio-preview"
	info.UpstreamModelName = "gpt-4o-audio-preview"

	_, apiErr := OaiStreamHandler(ginContext, info, response)

	require.Nil(t, apiErr)
	assert.False(t, ginContext.GetBool("responses_stream_output_tracking"))
}

func TestOaiStreamHandlerDrainsFinalUsageAfterClientGone(t *testing.T) {
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
	ginContext.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil).WithContext(requestContext)
	response := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body:       reader,
	}
	info := newChatStreamRelayInfo()

	type streamResult struct {
		usagePrompt     int
		usageCompletion int
		usageTotal      int
		cachedTokens    int
		apiErr          error
	}
	result := make(chan streamResult, 1)
	go func() {
		usage, apiErr := OaiStreamHandler(ginContext, info, response)
		if apiErr != nil {
			result <- streamResult{apiErr: apiErr}
			return
		}
		result <- streamResult{
			usagePrompt:     usage.PromptTokens,
			usageCompletion: usage.CompletionTokens,
			usageTotal:      usage.TotalTokens,
			cachedTokens:    usage.PromptTokensDetails.CachedTokens,
		}
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

	firstPayload := `{"id":"chatcmpl-drain","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"first delivered chunk"},"finish_reason":null}]}`
	secondPayload := `{"id":"chatcmpl-drain","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"second chunk"},"finish_reason":null}]}`
	require.NoError(t, writeEvent("data: "+firstPayload+"\n"))
	require.NoError(t, writeEvent("data: "+secondPayload+"\n"))
	require.Eventually(t, func() bool {
		return ginContext.GetBool("response_stream_output_sent")
	}, 2*time.Second, 10*time.Millisecond)

	cancel()
	require.Eventually(t, func() bool {
		return ginContext.GetBool(helper.ResponseStreamUsageDrainAttemptedContextKey)
	}, 2*time.Second, 10*time.Millisecond)

	postCancelPayload := `{"id":"chatcmpl-drain","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"post-cancel chunk"},"finish_reason":null}]}`
	require.NoError(t, writeEvent("data: "+postCancelPayload+"\n"))
	finalUsagePayload := `{"id":"chatcmpl-drain","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,"total_tokens":120,"prompt_tokens_details":{"cached_tokens":60}}}`
	require.NoError(t, writeEvent("data: "+finalUsagePayload+"\n"))
	require.NoError(t, writeEvent("data: [DONE]\n"))

	select {
	case actual := <-result:
		require.NoError(t, actual.apiErr)
		assert.Equal(t, 100, actual.usagePrompt)
		assert.Equal(t, 20, actual.usageCompletion)
		assert.Equal(t, 120, actual.usageTotal)
		assert.Equal(t, 60, actual.cachedTokens)
	case <-time.After(2 * time.Second):
		t.Fatal("handler did not return drained upstream usage")
	}

	require.NotNil(t, info.StreamStatus)
	assert.Equal(t, relaycommon.StreamEndReasonClientGone, info.StreamStatus.EndReason)
	assert.True(t, ginContext.GetBool(helper.ResponseStreamUsageDrainAttemptedContextKey))
	assert.False(t, ginContext.GetBool(helper.ResponseStreamUsageDrainTimedOutContextKey))
	assert.NotContains(t, recorder.Body.String(), "post-cancel chunk")
	assert.NotContains(t, recorder.Body.String(), `"prompt_tokens":100`)
}
