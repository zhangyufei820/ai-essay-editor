package relay

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	appconstant "github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestResponsesChatCompatPreservesToolCallRoundTripInput(t *testing.T) {
	request := &dto.OpenAIResponsesRequest{
		Model: "gpt-5.6-sol",
		Input: json.RawMessage(`[
			{"role":"user","content":[{"type":"input_text","text":"Look up Paris"}]},
			{"type":"function_call","call_id":"call_lookup","name":"lookup","arguments":"{\"city\":\"Paris\"}"},
			{"type":"function_call_output","call_id":"call_lookup","output":"sunny"}
		]`),
	}

	chatRequest, err := service.ResponsesRequestToChatCompletionsRequest(request)
	require.NoError(t, err)
	require.Len(t, chatRequest.Messages, 3)
	require.Equal(t, "assistant", chatRequest.Messages[1].Role)
	require.Equal(t, "call_lookup", chatRequest.Messages[1].ParseToolCalls()[0].ID)
	require.Equal(t, "lookup", chatRequest.Messages[1].ParseToolCalls()[0].Function.Name)
	require.Equal(t, "tool", chatRequest.Messages[2].Role)
	require.Equal(t, "call_lookup", chatRequest.Messages[2].ToolCallId)
	require.Equal(t, "sunny", chatRequest.Messages[2].Content)
}

func TestResponsesChatCompatIsScopedToDiscountChannel42(t *testing.T) {
	base := relaycommon.RelayInfo{
		RelayMode:  relayconstant.RelayModeResponses,
		UsingGroup: service.DiscountPricingGroupName,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelId: 42,
			ApiType:   appconstant.APITypeOpenAI,
		},
	}
	require.True(t, shouldResponsesUseChatCompletionsCompat(&base))

	tests := []struct {
		name   string
		mutate func(*relaycommon.RelayInfo)
	}{
		{"other channel", func(info *relaycommon.RelayInfo) { info.ChannelId = 28 }},
		{"other group", func(info *relaycommon.RelayInfo) { info.UsingGroup = "plus" }},
		{"compact endpoint", func(info *relaycommon.RelayInfo) { info.RelayMode = relayconstant.RelayModeResponsesCompact }},
		{"other api type", func(info *relaycommon.RelayInfo) { info.ApiType = appconstant.APITypeCodex }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			info := base
			meta := *base.ChannelMeta
			info.ChannelMeta = &meta
			test.mutate(&info)
			require.False(t, shouldResponsesUseChatCompletionsCompat(&info))
		})
	}
}

func TestResponsesChatStreamHandlerEmitsFunctionCallEvents(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := appconstant.StreamingTimeout
	appconstant.StreamingTimeout = 30
	t.Cleanup(func() { appconstant.StreamingTimeout = oldTimeout })
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)

	body := strings.Join([]string{
		`data: {"id":"chatcmpl-tool","object":"chat.completion.chunk","created":1,"model":"gpt-5.6-sol","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_lookup","type":"function","function":{"name":"lookup","arguments":"{\"city\":"}}]},"finish_reason":null}]}`,
		`data: {"id":"chatcmpl-tool","object":"chat.completion.chunk","created":1,"model":"gpt-5.6-sol","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"Paris\"}"}}]},"finish_reason":null}]}`,
		`data: {"id":"chatcmpl-tool","object":"chat.completion.chunk","created":1,"model":"gpt-5.6-sol","choices":[],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}`,
		`data: [DONE]`,
		"",
	}, "\n")
	response := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
	info := &relaycommon.RelayInfo{
		OriginModelName: "gpt-5.6-sol",
		RelayMode:       relayconstant.RelayModeResponses,
		DisablePing:     true,
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "gpt-5.6-sol",
		},
	}

	usage, apiErr := responsesChatStreamHandler(ctx, info, response, &dto.OpenAIResponsesRequest{Model: "gpt-5.6-sol"})
	require.Nil(t, apiErr)
	require.Equal(t, 8, usage.TotalTokens)
	output := recorder.Body.String()
	require.Contains(t, output, "event: response.function_call_arguments.delta")
	require.Contains(t, output, "event: response.function_call_arguments.done")
	require.Contains(t, output, `"arguments":"{\"city\":\"Paris\"}"`)
	require.Contains(t, output, `"call_id":"call_lookup"`)
	require.Contains(t, output, `"name":"lookup"`)
	require.Contains(t, output, "event: response.completed")
	require.NotContains(t, output, "event: response.output_text.delta")
	require.True(t, ctx.GetBool("response_stream_output_sent"))
}
