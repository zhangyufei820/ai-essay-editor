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
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
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

func TestOaiResponsesStreamHandlerCountsFinalOnlyFallbackTokens(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	finalOnlyContent := strings.Repeat("final-only fallback token content ", 16)
	testCases := []struct {
		name    string
		payload string
	}{
		{
			name: "output text",
			payload: fmt.Sprintf(`{"type":"response.output_text.done","item_id":"msg_1","output_index":0,"content_index":0,"text":%q}`,
				finalOnlyContent),
		},
		{
			name: "reasoning text",
			payload: fmt.Sprintf(`{"type":"response.reasoning_text.done","item_id":"reasoning_1","output_index":0,"content_index":0,"text":%q}`,
				finalOnlyContent),
		},
		{
			name: "reasoning summary",
			payload: fmt.Sprintf(`{"type":"response.reasoning_summary_text.done","item_id":"reasoning_1","output_index":0,"summary_index":0,"text":%q}`,
				finalOnlyContent),
		},
		{
			name: "function arguments",
			payload: fmt.Sprintf(`{"type":"response.function_call_arguments.done","item_id":"call_1","output_index":0,"arguments":%q}`,
				`{"topic":"`+finalOnlyContent+`"}`),
		},
		{
			name: "raw function arguments",
			payload: fmt.Sprintf(`{"type":"response.function_call_arguments.done","item_id":"call_1","output_index":0,"arguments":{"topic":%q}}`,
				finalOnlyContent),
		},
		{
			name:    "function name without arguments",
			payload: `{"type":"response.function_call_arguments.done","item_id":"call_1","output_index":0,"name":"lookup"}`,
		},
		{
			name: "content part",
			payload: fmt.Sprintf(`{"type":"response.content_part.done","item_id":"msg_1","output_index":0,"content_index":0,"part":{"type":"output_text","text":%q}}`,
				finalOnlyContent),
		},
		{
			name: "reasoning summary part",
			payload: fmt.Sprintf(`{"type":"response.reasoning_summary_part.done","item_id":"reasoning_1","output_index":0,"summary_index":0,"part":{"type":"summary_text","text":%q}}`,
				finalOnlyContent),
		},
		{
			name: "output item",
			payload: fmt.Sprintf(`{"type":"response.output_item.done","output_index":0,"item":{"id":"msg_1","type":"message","content":[{"type":"output_text","text":%q}]}}`,
				finalOnlyContent),
		},
		{
			name: "reasoning output item",
			payload: fmt.Sprintf(`{"type":"response.output_item.done","output_index":0,"item":{"id":"reasoning_1","type":"reasoning","summary":[{"type":"summary_text","text":%q}]}}`,
				finalOnlyContent),
		},
		{
			name: "reasoning content output item",
			payload: fmt.Sprintf(`{"type":"response.output_item.done","output_index":0,"item":{"id":"reasoning_1","type":"reasoning","content":[{"type":"reasoning_text","text":%q}]}}`,
				finalOnlyContent),
		},
		{
			name: "function output item",
			payload: fmt.Sprintf(`{"type":"response.output_item.done","output_index":0,"item":{"id":"call_1","type":"function_call","name":"lookup","arguments":%q}}`,
				`{"topic":"`+finalOnlyContent+`"}`),
		},
		{
			name: "completed response output",
			payload: fmt.Sprintf(`{"type":"response.completed","response":{"output":[{"id":"msg_1","type":"message","content":[{"type":"output_text","text":%q}]}]}}`,
				finalOnlyContent),
		},
		{
			name: "done response output",
			payload: fmt.Sprintf(`{"type":"response.done","response":{"output":[{"id":"msg_1","type":"message","content":[{"type":"output_text","text":%q}]}]}}`,
				finalOnlyContent),
		},
		{
			name: "incomplete response output",
			payload: fmt.Sprintf(`{"type":"response.incomplete","response":{"status":"incomplete","output":[{"id":"msg_1","type":"message","content":[{"type":"output_text","text":%q}]}]}}`,
				finalOnlyContent),
		},
		{
			name: "completed reasoning content output",
			payload: fmt.Sprintf(`{"type":"response.completed","response":{"output":[{"id":"reasoning_1","type":"reasoning","content":[{"type":"reasoning_text","text":%q}]}]}}`,
				finalOnlyContent),
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
			response := &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
				Body:       io.NopCloser(strings.NewReader("data: " + testCase.payload + "\ndata: [DONE]\n")),
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

func TestOaiResponsesStreamHandlerCountsRefusalFallbackTokens(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	refusal := strings.Repeat("refusal fallback token content ", 16)
	testCases := []struct {
		name    string
		payload string
	}{
		{
			name: "refusal delta",
			payload: fmt.Sprintf(`{"type":"response.refusal.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":%q}`,
				refusal),
		},
		{
			name: "refusal done",
			payload: fmt.Sprintf(`{"type":"response.refusal.done","item_id":"msg_1","output_index":0,"content_index":0,"refusal":%q}`,
				refusal),
		},
		{
			name: "refusal content part",
			payload: fmt.Sprintf(`{"type":"response.content_part.done","item_id":"msg_1","output_index":0,"content_index":0,"part":{"type":"refusal","refusal":%q}}`,
				refusal),
		},
		{
			name: "refusal output item",
			payload: fmt.Sprintf(`{"type":"response.output_item.done","output_index":0,"item":{"id":"msg_1","type":"message","content":[{"type":"refusal","refusal":%q}]}}`,
				refusal),
		},
		{
			name: "completed refusal output",
			payload: fmt.Sprintf(`{"type":"response.completed","response":{"output":[{"id":"msg_1","type":"message","content":[{"type":"refusal","refusal":%q}]}]}}`,
				refusal),
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
			response := &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
				Body:       io.NopCloser(strings.NewReader("data: " + testCase.payload + "\ndata: [DONE]\n")),
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

func TestOaiResponsesStreamHandlerCountsExtendedToolFallbackTokens(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	content := strings.Repeat("extended tool fallback token content ", 16)
	testCases := []struct {
		name    string
		payload string
	}{
		{
			name: "custom tool input delta",
			payload: fmt.Sprintf(`{"type":"response.custom_tool_call_input.delta","item_id":"ctc_1","output_index":0,"delta":%q}`,
				content),
		},
		{
			name: "custom tool input done",
			payload: fmt.Sprintf(`{"type":"response.custom_tool_call_input.done","item_id":"ctc_1","output_index":0,"input":%q}`,
				content),
		},
		{
			name: "custom tool output item",
			payload: fmt.Sprintf(`{"type":"response.output_item.done","output_index":0,"item":{"id":"ctc_1","type":"custom_tool_call","name":"patch","input":%q}}`,
				content),
		},
		{
			name: "completed custom tool output",
			payload: fmt.Sprintf(`{"type":"response.done","response":{"output":[{"id":"ctc_1","type":"custom_tool_call","name":"patch","input":%q}]}}`,
				content),
		},
		{
			name: "mcp arguments done",
			payload: fmt.Sprintf(`{"type":"response.mcp_call_arguments.done","item_id":"mcp_1","output_index":0,"arguments":%q}`,
				content),
		},
		{
			name: "mcp output item",
			payload: fmt.Sprintf(`{"type":"response.output_item.done","output_index":0,"item":{"id":"mcp_1","type":"mcp_call","name":"lookup","arguments":%q}}`,
				content),
		},
		{
			name: "code interpreter code done",
			payload: fmt.Sprintf(`{"type":"response.code_interpreter_call_code.done","item_id":"ci_1","output_index":0,"code":%q}`,
				content),
		},
		{
			name: "code interpreter output item",
			payload: fmt.Sprintf(`{"type":"response.output_item.done","output_index":0,"item":{"id":"ci_1","type":"code_interpreter_call","code":%q}}`,
				content),
		},
		{
			name: "audio transcript delta",
			payload: fmt.Sprintf(`{"type":"response.audio.transcript.delta","delta":%q}`,
				content),
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
			response := &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
				Body:       io.NopCloser(strings.NewReader("data: " + testCase.payload + "\ndata: [DONE]\n")),
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

func TestOaiResponsesStreamHandlerDoesNotDoubleCountCustomToolFallbackTokens(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	content := strings.Repeat("custom tool deduplicated fallback token content ", 16)
	deltaPayload := fmt.Sprintf(`{"type":"response.custom_tool_call_input.delta","item_id":"ctc_1","output_index":0,"delta":%q}`, content)
	donePayload := fmt.Sprintf(`{"type":"response.custom_tool_call_input.done","item_id":"ctc_1","output_index":0,"input":%q}`, content)
	runStream := func(payloads ...string) int {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
		events := make([]string, 0, len(payloads)+1)
		for _, payload := range payloads {
			events = append(events, "data: "+payload)
		}
		events = append(events, "data: [DONE]")
		response := &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
			Body:       io.NopCloser(strings.NewReader(strings.Join(events, "\n"))),
		}

		usage, apiErr := OaiResponsesStreamHandler(context, &relaycommon.RelayInfo{
			OriginModelName: "gpt-4o",
			ChannelMeta:     &relaycommon.ChannelMeta{},
		}, response)
		require.Nil(t, apiErr)
		return usage.CompletionTokens
	}

	doneOnlyTokens := runStream(donePayload)
	deltaThenDoneTokens := runStream(deltaPayload, donePayload)

	assert.Greater(t, doneOnlyTokens, 0)
	assert.Equal(t, doneOnlyTokens, deltaThenDoneTokens)
}

func TestOaiResponsesStreamHandlerMarksNonTextOutputForMissingUsageSettlement(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	testCases := []struct {
		name    string
		payload string
	}{
		{
			name:    "audio delta",
			payload: `{"type":"response.audio.delta","item_id":"audio_1","output_index":0,"delta":"base64-audio"}`,
		},
		{
			name:    "partial image",
			payload: `{"type":"response.image_generation_call.partial_image","item_id":"image_1","output_index":0,"partial_image_b64":"base64-image"}`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
			response := &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
				Body:       io.NopCloser(strings.NewReader("data: " + testCase.payload + "\ndata: [DONE]\n")),
			}

			usage, apiErr := OaiResponsesStreamHandler(context, &relaycommon.RelayInfo{
				OriginModelName: "gpt-4o",
				ChannelMeta:     &relaycommon.ChannelMeta{},
			}, response)

			require.Nil(t, apiErr)
			assert.Zero(t, usage.CompletionTokens)
			assert.True(t, context.GetBool("response_stream_output_sent"))
		})
	}
}

func TestOaiResponsesStreamHandlerCopiesUpstreamCostWithoutTokenUsage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	testCases := []struct {
		name       string
		payload    string
		headers    http.Header
		assertCost func(*testing.T, *dto.Usage)
	}{
		{
			name:    "response cost",
			payload: `{"type":"response.done","response":{"cost_cny":0.0123}}`,
			assertCost: func(t *testing.T, usage *dto.Usage) {
				assert.Equal(t, 0.0123, usage.CostCNY)
			},
		},
		{
			name:    "response header cost",
			payload: `{"type":"response.done","response":{}}`,
			headers: http.Header{"X-Upstream-Cost-Usd": []string{"0.000123"}},
			assertCost: func(t *testing.T, usage *dto.Usage) {
				assert.Equal(t, "0.000123", usage.CostUSD)
				assert.Equal(t, "USD", usage.CostCurrency)
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
			response := &http.Response{
				StatusCode: http.StatusOK,
				Header:     testCase.headers,
				Body:       io.NopCloser(strings.NewReader("data: " + testCase.payload + "\ndata: [DONE]\n")),
			}

			usage, apiErr := OaiResponsesStreamHandler(context, &relaycommon.RelayInfo{
				OriginModelName: "gpt-4o",
				ChannelMeta:     &relaycommon.ChannelMeta{},
			}, response)

			require.NotNil(t, apiErr)
			assert.Equal(t, types.ErrorCodeEmptyResponse, apiErr.GetErrorCode())
			testCase.assertCost(t, usage)
			assert.NotContains(t, recorder.Body.String(), "event: response.done")
		})
	}
}

func TestOaiResponsesStreamHandlerDoesNotDoubleCountDeltaAndDone(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	content := strings.Repeat("deduplicated fallback token content ", 16)
	replacementContent := strings.Repeat("replacement final fallback token content ", 16)
	deltaPayload := fmt.Sprintf(`{"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":%q}`, content)
	partialDeltaPayload := fmt.Sprintf(`{"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":%q}`, content[:len(content)/2])
	donePayload := fmt.Sprintf(`{"type":"response.output_text.done","item_id":"msg_1","output_index":0,"content_index":0,"text":%q}`, content)
	shortDonePayload := fmt.Sprintf(`{"type":"response.output_text.done","item_id":"msg_1","output_index":0,"content_index":0,"text":%q}`, content[:len(content)/2])
	replacementDonePayload := fmt.Sprintf(`{"type":"response.output_text.done","item_id":"msg_1","output_index":0,"content_index":0,"text":%q}`, replacementContent)
	itemDonePayload := fmt.Sprintf(`{"type":"response.output_item.done","output_index":0,"item":{"id":"msg_1","type":"message","content":[{"type":"output_text","text":%q}]}}`, content)
	completedPayload := fmt.Sprintf(`{"type":"response.completed","response":{"output":[{"id":"msg_1","type":"message","content":[{"type":"output_text","text":%q}]}]}}`, content)
	runStream := func(payloads ...string) int {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
		events := make([]string, 0, len(payloads)+1)
		for _, payload := range payloads {
			events = append(events, "data: "+payload)
		}
		events = append(events, "data: [DONE]")
		response := &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
			Body:       io.NopCloser(strings.NewReader(strings.Join(events, "\n"))),
		}

		usage, apiErr := OaiResponsesStreamHandler(context, &relaycommon.RelayInfo{
			OriginModelName: "gpt-4o",
			ChannelMeta:     &relaycommon.ChannelMeta{},
		}, response)
		require.Nil(t, apiErr)
		return usage.CompletionTokens
	}

	deltaOnlyTokens := runStream(deltaPayload)
	deltaAndDoneTokens := runStream(deltaPayload, donePayload, itemDonePayload, completedPayload)
	finalThenDeltaTokens := runStream(donePayload, deltaPayload)
	partialDeltaThenDoneTokens := runStream(partialDeltaPayload, donePayload)
	partialDeltaThenCompletedTokens := runStream(partialDeltaPayload, completedPayload)
	shortFinalOnlyTokens := runStream(shortDonePayload)
	deltaThenShortFinalTokens := runStream(deltaPayload, shortDonePayload)
	replacementFinalOnlyTokens := runStream(replacementDonePayload)
	deltaThenReplacementFinalTokens := runStream(deltaPayload, replacementDonePayload)

	assert.Greater(t, deltaOnlyTokens, 0)
	assert.Equal(t, deltaOnlyTokens, deltaAndDoneTokens)
	assert.Equal(t, deltaOnlyTokens, finalThenDeltaTokens)
	assert.Equal(t, deltaOnlyTokens, partialDeltaThenDoneTokens)
	assert.Equal(t, deltaOnlyTokens, partialDeltaThenCompletedTokens)
	assert.Equal(t, shortFinalOnlyTokens, deltaThenShortFinalTokens)
	assert.Equal(t, replacementFinalOnlyTokens, deltaThenReplacementFinalTokens)
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

	usage, apiErr := OaiResponsesStreamHandler(context, &relaycommon.RelayInfo{
		OriginModelName: "gpt-4o",
		ChannelMeta:     &relaycommon.ChannelMeta{},
	}, response)

	require.Nil(t, apiErr)
	assert.False(t, context.GetBool("response_stream_output_sent"))
	assert.Zero(t, usage.CompletionTokens)
}

func TestOaiResponsesStreamHandlerReadsUsageFromResponseDone(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	response := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body: io.NopCloser(strings.NewReader(strings.Join([]string{
			`data: {"type":"response.done","response":{"object":"response","status":"completed","usage":{"input_tokens":100,"output_tokens":20,"total_tokens":120}}}`,
			`data: [DONE]`,
		}, "\n"))),
	}

	usage, apiErr := OaiResponsesStreamHandler(context, &relaycommon.RelayInfo{
		OriginModelName: "gpt-4o",
		ChannelMeta:     &relaycommon.ChannelMeta{},
	}, response)

	require.NotNil(t, apiErr)
	assert.Equal(t, types.ErrorCodeEmptyResponse, apiErr.GetErrorCode())
	assert.True(t, context.GetBool("response_completed_seen"))
	assert.True(t, context.GetBool(responsesStreamEmptyTerminalSuppressedContextKey))
	assert.NotContains(t, recorder.Body.String(), "response.done")
	assert.Equal(t, 100, usage.PromptTokens)
	assert.Equal(t, 20, usage.CompletionTokens)
	assert.Equal(t, 120, usage.TotalTokens)
}

func TestOaiResponsesStreamHandlerSuppressesEmptyTerminalUntilFallbackSucceeds(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	info := &relaycommon.RelayInfo{
		OriginModelName: "gpt-4o",
		ChannelMeta:     &relaycommon.ChannelMeta{},
	}

	primary := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body: io.NopCloser(strings.NewReader(strings.Join([]string{
			`data: {"type":"response.created","response":{"id":"resp_primary","status":"in_progress"}}`,
			`data: {"type":"response.completed","response":{"id":"resp_primary","status":"completed","output":[],"usage":{"input_tokens":0,"output_tokens":0,"total_tokens":0}}}`,
			`data: [DONE]`,
		}, "\n"))),
	}

	primaryUsage, primaryErr := OaiResponsesStreamHandler(context, info, primary)
	require.NotNil(t, primaryErr)
	assert.Equal(t, types.ErrorCodeEmptyResponse, primaryErr.GetErrorCode())
	assert.Zero(t, primaryUsage.TotalTokens)
	assert.True(t, context.GetBool(responsesStreamEmptyTerminalSuppressedContextKey))
	assert.NotContains(t, recorder.Body.String(), "event: response.completed")

	fallback := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body: io.NopCloser(strings.NewReader(strings.Join([]string{
			`data: {"type":"response.created","response":{"id":"resp_fallback","status":"in_progress"}}`,
			`data: {"type":"response.output_text.delta","item_id":"msg_fallback","output_index":0,"content_index":0,"delta":"fallback output"}`,
			`data: {"type":"response.completed","response":{"id":"resp_fallback","status":"completed","output":[]}}`,
			`data: [DONE]`,
		}, "\n"))),
	}

	fallbackUsage, fallbackErr := OaiResponsesStreamHandler(context, info, fallback)
	require.Nil(t, fallbackErr)
	assert.Greater(t, fallbackUsage.CompletionTokens, 0)
	assert.False(t, context.GetBool(responsesStreamEmptyTerminalSuppressedContextKey))
	assert.Contains(t, recorder.Body.String(), "fallback output")
	assert.Equal(t, 1, strings.Count(recorder.Body.String(), "event: response.completed\n"))
}

func TestOaiResponsesStreamHandlerKeepsOneEffectiveTerminalWhenAliasesRepeat(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	response := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body: io.NopCloser(strings.NewReader(strings.Join([]string{
			`data: {"type":"response.completed","response":{"id":"resp_1","status":"completed","output":[{"id":"call_1","type":"function_call","name":"lookup","arguments":"{}"}]}}`,
			`data: {"type":"response.done","response":{"id":"resp_1","status":"completed","output":[]}}`,
			`data: [DONE]`,
		}, "\n"))),
	}

	usage, apiErr := OaiResponsesStreamHandler(context, &relaycommon.RelayInfo{
		OriginModelName: "gpt-4o",
		ChannelMeta:     &relaycommon.ChannelMeta{},
	}, response)

	require.Nil(t, apiErr)
	assert.Greater(t, usage.CompletionTokens, 0)
	assert.Equal(t, 1, strings.Count(recorder.Body.String(), "event: response.completed\n"))
	assert.NotContains(t, recorder.Body.String(), "event: response.done\n")
}

func TestOaiResponsesStreamHandlerReadsFinalOutputAndUsageFromResponseIncomplete(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	response := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body: io.NopCloser(strings.NewReader(strings.Join([]string{
			`data: {"type":"response.incomplete","response":{"object":"response","status":"incomplete","output":[{"id":"msg_1","type":"message","content":[{"type":"output_text","text":"partial output returned before the upstream stopped"}]}],"usage":{"input_tokens":100,"output_tokens":20,"total_tokens":120}}}`,
			`data: [DONE]`,
		}, "\n"))),
	}

	usage, apiErr := OaiResponsesStreamHandler(context, &relaycommon.RelayInfo{
		OriginModelName: "gpt-4o",
		ChannelMeta:     &relaycommon.ChannelMeta{},
	}, response)

	require.Nil(t, apiErr)
	assert.True(t, context.GetBool("response_stream_output_sent"))
	assert.False(t, context.GetBool("response_completed_seen"))
	assert.Equal(t, 100, usage.PromptTokens)
	assert.Equal(t, 20, usage.CompletionTokens)
	assert.Equal(t, 120, usage.TotalTokens)
}

func TestOaiResponsesStreamHandlerDoesNotMarkFinalOutputWhenClientWriteFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	testCases := []struct {
		name    string
		payload string
	}{
		{
			name:    "done event",
			payload: `{"type":"response.output_text.done","item_id":"msg_1","output_index":0,"content_index":0,"text":"output"}`,
		},
		{
			name:    "completed event",
			payload: `{"type":"response.completed","response":{"output":[{"id":"msg_1","type":"message","content":[{"type":"output_text","text":"output"}]}]}}`,
		},
		{
			name:    "custom tool input done event",
			payload: `{"type":"response.custom_tool_call_input.done","item_id":"ctc_1","output_index":0,"input":"output"}`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
			context.Writer = &responsesWriteErrorWriter{ResponseWriter: context.Writer}
			response := &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
				Body:       io.NopCloser(strings.NewReader("data: " + testCase.payload + "\ndata: [DONE]\n")),
			}

			usage, apiErr := OaiResponsesStreamHandler(context, &relaycommon.RelayInfo{
				OriginModelName: "gpt-4o",
				ChannelMeta:     &relaycommon.ChannelMeta{},
			}, response)

			require.Nil(t, apiErr)
			assert.False(t, context.GetBool("response_stream_output_sent"))
			assert.Zero(t, usage.CompletionTokens)
		})
	}
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
