package openai

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

type responsesStreamFallbackPart struct {
	key     string
	content string
	delta   bool
}

type responsesStreamFallbackPartState struct {
	deltaContent strings.Builder
	finalContent string
	hasFinal     bool
}

type responsesStreamFallbackCollector struct {
	parts map[string]*responsesStreamFallbackPartState
	order []string
}

type responsesStreamPendingTerminal struct {
	response dto.ResponsesStreamResponse
	data     string
}

const responsesStreamEmptyTerminalSuppressedContextKey = "responses_stream_empty_terminal_suppressed"

func newResponsesStreamFallbackCollector() *responsesStreamFallbackCollector {
	return &responsesStreamFallbackCollector{
		parts: make(map[string]*responsesStreamFallbackPartState),
	}
}

func responsesStreamPartIndex(index *int) int {
	if index == nil {
		return -1
	}
	return *index
}

func responsesStreamPartKey(partType string, itemID string, outputIndex *int, partIndex *int) string {
	return fmt.Sprintf("%s|%s|%d|%d", partType, strings.TrimSpace(itemID), responsesStreamPartIndex(outputIndex), responsesStreamPartIndex(partIndex))
}

func responsesStreamFallbackParts(streamResponse dto.ResponsesStreamResponse) []responsesStreamFallbackPart {
	parts := make([]responsesStreamFallbackPart, 0, 1)
	addPart := func(partType string, itemID string, outputIndex *int, partIndex *int, content string, delta bool) {
		if content == "" {
			return
		}
		parts = append(parts, responsesStreamFallbackPart{
			key:     responsesStreamPartKey(partType, itemID, outputIndex, partIndex),
			content: content,
			delta:   delta,
		})
	}
	addOutputItem := func(outputItem dto.ResponsesOutput, outputIndex *int, fallbackItemID string) {
		itemID := outputItem.ID
		if itemID == "" {
			itemID = fallbackItemID
		}
		switch outputItem.Type {
		case "message":
			for contentIndex, contentPart := range outputItem.Content {
				partIndex := contentIndex
				switch contentPart.Type {
				case "output_text":
					addPart("output_text", itemID, outputIndex, &partIndex, contentPart.Text, false)
				case "refusal":
					addPart("refusal", itemID, outputIndex, &partIndex, contentPart.Refusal, false)
				}
			}
		case "reasoning":
			for contentIndex, contentPart := range outputItem.Content {
				if contentPart.Type != "reasoning_text" {
					continue
				}
				partIndex := contentIndex
				addPart("reasoning_text", itemID, outputIndex, &partIndex, contentPart.Text, false)
			}
			for summaryIndex, summaryPart := range outputItem.Summary {
				if summaryPart.Type != "" && summaryPart.Type != "summary_text" {
					continue
				}
				partIndex := summaryIndex
				addPart("reasoning_summary_text", itemID, outputIndex, &partIndex, summaryPart.Text, false)
			}
		case "function_call":
			addPart("function_call_name", itemID, outputIndex, nil, outputItem.Name, false)
			addPart("function_call_arguments", itemID, outputIndex, nil, outputItem.ArgumentsString(), false)
		case "custom_tool_call":
			addPart("custom_tool_call_name", itemID, outputIndex, nil, outputItem.Name, false)
			addPart("custom_tool_call_input", itemID, outputIndex, nil, outputItem.Input, false)
		case "mcp_call":
			addPart("mcp_call_name", itemID, outputIndex, nil, outputItem.Name, false)
			addPart("mcp_call_arguments", itemID, outputIndex, nil, outputItem.ArgumentsString(), false)
		case "code_interpreter_call":
			addPart("code_interpreter_call_code", itemID, outputIndex, nil, outputItem.Code, false)
		}
	}

	switch streamResponse.Type {
	case "response.output_text.delta":
		addPart("output_text", streamResponse.ItemID, streamResponse.OutputIndex, streamResponse.ContentIndex, streamResponse.Delta, true)
	case "response.output_text.done":
		addPart("output_text", streamResponse.ItemID, streamResponse.OutputIndex, streamResponse.ContentIndex, streamResponse.Text, false)
	case "response.refusal.delta":
		addPart("refusal", streamResponse.ItemID, streamResponse.OutputIndex, streamResponse.ContentIndex, streamResponse.Delta, true)
	case "response.refusal.done":
		addPart("refusal", streamResponse.ItemID, streamResponse.OutputIndex, streamResponse.ContentIndex, streamResponse.Refusal, false)
	case "response.reasoning_text.delta":
		addPart("reasoning_text", streamResponse.ItemID, streamResponse.OutputIndex, streamResponse.ContentIndex, streamResponse.Delta, true)
	case "response.reasoning_text.done":
		addPart("reasoning_text", streamResponse.ItemID, streamResponse.OutputIndex, streamResponse.ContentIndex, streamResponse.Text, false)
	case "response.reasoning_summary_text.delta":
		addPart("reasoning_summary_text", streamResponse.ItemID, streamResponse.OutputIndex, streamResponse.SummaryIndex, streamResponse.Delta, true)
	case "response.reasoning_summary_text.done":
		addPart("reasoning_summary_text", streamResponse.ItemID, streamResponse.OutputIndex, streamResponse.SummaryIndex, streamResponse.Text, false)
	case "response.function_call_arguments.delta":
		addPart("function_call_arguments", streamResponse.ItemID, streamResponse.OutputIndex, nil, streamResponse.Delta, true)
	case "response.function_call_arguments.done":
		addPart("function_call_name", streamResponse.ItemID, streamResponse.OutputIndex, nil, streamResponse.Name, false)
		addPart("function_call_arguments", streamResponse.ItemID, streamResponse.OutputIndex, nil, streamResponse.ArgumentsString(), false)
	case "response.custom_tool_call_input.delta":
		addPart("custom_tool_call_input", streamResponse.ItemID, streamResponse.OutputIndex, nil, streamResponse.Delta, true)
	case "response.custom_tool_call_input.done":
		addPart("custom_tool_call_input", streamResponse.ItemID, streamResponse.OutputIndex, nil, streamResponse.Input, false)
	case "response.mcp_call_arguments.delta":
		addPart("mcp_call_arguments", streamResponse.ItemID, streamResponse.OutputIndex, nil, streamResponse.Delta, true)
	case "response.mcp_call_arguments.done":
		addPart("mcp_call_arguments", streamResponse.ItemID, streamResponse.OutputIndex, nil, streamResponse.ArgumentsString(), false)
	case "response.code_interpreter_call_code.delta":
		addPart("code_interpreter_call_code", streamResponse.ItemID, streamResponse.OutputIndex, nil, streamResponse.Delta, true)
	case "response.code_interpreter_call_code.done":
		addPart("code_interpreter_call_code", streamResponse.ItemID, streamResponse.OutputIndex, nil, streamResponse.Code, false)
	case "response.audio.transcript.delta":
		addPart("audio_transcript", streamResponse.ItemID, streamResponse.OutputIndex, streamResponse.ContentIndex, streamResponse.Delta, true)
	case "response.content_part.done":
		if streamResponse.Part != nil {
			switch streamResponse.Part.Type {
			case "", "output_text":
				addPart("output_text", streamResponse.ItemID, streamResponse.OutputIndex, streamResponse.ContentIndex, streamResponse.Part.Text, false)
			case "refusal":
				addPart("refusal", streamResponse.ItemID, streamResponse.OutputIndex, streamResponse.ContentIndex, streamResponse.Part.Refusal, false)
			}
		}
	case "response.reasoning_summary_part.done":
		if streamResponse.Part != nil && (streamResponse.Part.Type == "" || streamResponse.Part.Type == "summary_text") {
			addPart("reasoning_summary_text", streamResponse.ItemID, streamResponse.OutputIndex, streamResponse.SummaryIndex, streamResponse.Part.Text, false)
		}
	case dto.ResponsesOutputTypeItemDone:
		if streamResponse.Item != nil {
			addOutputItem(*streamResponse.Item, streamResponse.OutputIndex, streamResponse.ItemID)
		}
	case "response.completed", "response.done", "response.incomplete":
		if streamResponse.Response != nil {
			for outputIndex, outputItem := range streamResponse.Response.Output {
				itemIndex := outputIndex
				addOutputItem(outputItem, &itemIndex, "")
			}
		}
	}

	return parts
}

func (collector *responsesStreamFallbackCollector) Collect(streamResponse dto.ResponsesStreamResponse) {
	if collector == nil {
		return
	}
	for _, part := range responsesStreamFallbackParts(streamResponse) {
		state := collector.parts[part.key]
		if state == nil {
			state = &responsesStreamFallbackPartState{}
			collector.parts[part.key] = state
			collector.order = append(collector.order, part.key)
		}
		if part.delta {
			if state.hasFinal {
				continue
			}
			state.deltaContent.WriteString(part.content)
			continue
		}
		state.hasFinal = true
		state.finalContent = part.content
	}
}

func (collector *responsesStreamFallbackCollector) String() string {
	if collector == nil {
		return ""
	}
	var contentBuilder strings.Builder
	for _, key := range collector.order {
		state := collector.parts[key]
		if state == nil {
			continue
		}
		if state.hasFinal {
			contentBuilder.WriteString(state.finalContent)
			continue
		}
		contentBuilder.WriteString(state.deltaContent.String())
	}
	return contentBuilder.String()
}

func isResponsesStreamCompletionEvent(eventType string) bool {
	return eventType == "response.completed" || eventType == "response.done"
}

func hasResponsesStreamEffectiveOutput(c *gin.Context, collector *responsesStreamFallbackCollector, streamResponse dto.ResponsesStreamResponse) bool {
	if c != nil && c.GetBool("response_stream_output_sent") {
		return true
	}
	if collector != nil && collector.String() != "" {
		return true
	}
	return len(responsesStreamFallbackParts(streamResponse)) > 0
}

func shouldReplaceResponsesStreamPendingTerminal(pending *responsesStreamPendingTerminal, candidate dto.ResponsesStreamResponse) bool {
	if pending == nil {
		return true
	}
	return len(responsesStreamFallbackParts(pending.response)) == 0 && len(responsesStreamFallbackParts(candidate)) > 0
}

func markResponsesStreamOutputSent(c *gin.Context, streamResponse dto.ResponsesStreamResponse) {
	if c == nil {
		return
	}
	if isResponsesStreamCompletionEvent(streamResponse.Type) {
		c.Set("response_completed_seen", true)
	}
	if len(responsesStreamFallbackParts(streamResponse)) > 0 ||
		(streamResponse.Type == "response.audio.delta" && streamResponse.Delta != "") ||
		streamResponse.Type == "response.image_generation_call.partial_image" {
		c.Set("response_stream_output_sent", true)
	}
}

func OaiResponsesHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)

	// read response body
	var responsesResponse dto.OpenAIResponsesResponse
	responseBody, err := common.ReadAllCapped(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}
	err = common.Unmarshal(responseBody, &responsesResponse)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	if oaiError := responsesResponse.GetOpenAIError(); oaiError != nil && oaiError.Type != "" {
		return nil, types.WithOpenAIError(*oaiError, resp.StatusCode)
	}

	if responsesResponse.HasImageGenerationCall() {
		c.Set("image_generation_call", true)
		c.Set("image_generation_call_quality", responsesResponse.GetQuality())
		c.Set("image_generation_call_size", responsesResponse.GetSize())
	}

	// 写入新的 response body
	service.IOCopyBytesGracefully(c, resp, responseBody)

	// compute usage
	usage := dto.Usage{}
	if responsesResponse.Usage != nil {
		usage.PromptTokens = responsesResponse.Usage.InputTokens
		usage.CompletionTokens = responsesResponse.Usage.OutputTokens
		usage.TotalTokens = responsesResponse.Usage.TotalTokens
		if responsesResponse.Usage.InputTokensDetails != nil {
			usage.PromptTokensDetails.CachedTokens = responsesResponse.Usage.InputTokensDetails.CachedTokens
			usage.PromptTokensDetails.CachedCreationTokens = responsesResponse.Usage.InputTokensDetails.GetCacheWriteTokens()
		}
	}
	service.CopyResponsesCostFields(&usage, &responsesResponse)
	service.CopyResponseHeaderCostFields(&usage, resp.Header)
	if info == nil || info.ResponsesUsageInfo == nil || info.ResponsesUsageInfo.BuiltInTools == nil {
		return &usage, nil
	}
	// 解析 Tools 用量
	for _, tool := range responsesResponse.Tools {
		buildToolinfo, ok := info.ResponsesUsageInfo.BuiltInTools[common.Interface2String(tool["type"])]
		if !ok || buildToolinfo == nil {
			logger.LogError(c, fmt.Sprintf("BuiltInTools not found for tool type: %v", tool["type"]))
			continue
		}
		buildToolinfo.CallCount++
	}
	return &usage, nil
}

func OaiResponsesStreamHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		logger.LogError(c, "invalid response or response body")
		return nil, types.NewError(fmt.Errorf("invalid response"), types.ErrorCodeBadResponse)
	}

	defer service.CloseResponseBodyGracefully(resp)

	var usage = &dto.Usage{}
	fallbackCollector := newResponsesStreamFallbackCollector()
	var pendingTerminal *responsesStreamPendingTerminal
	c.Set("responses_stream_output_tracking", true)
	c.Set(responsesStreamEmptyTerminalSuppressedContextKey, false)
	c.Set(helper.ResponsesStreamDrainUsageAfterClientGoneContextKey, true)

	helper.StreamScannerHandler(c, resp, info, func(data string, sr *helper.StreamResult) {

		// 检查当前数据是否包含 completed 状态和 usage 信息
		var streamResponse dto.ResponsesStreamResponse
		if err := common.UnmarshalJsonStr(data, &streamResponse); err != nil {
			logger.LogError(c, "failed to unmarshal stream response: "+err.Error())
			sr.Error(err)
			return
		}
		if isResponsesStreamCompletionEvent(streamResponse.Type) {
			if shouldReplaceResponsesStreamPendingTerminal(pendingTerminal, streamResponse) {
				pendingTerminal = &responsesStreamPendingTerminal{response: streamResponse, data: data}
			}
		} else if err := helper.ResponseChunkData(c, streamResponse, data); err == nil {
			markResponsesStreamOutputSent(c, streamResponse)
			fallbackCollector.Collect(streamResponse)
		}
		switch streamResponse.Type {
		case "response.completed", "response.done", "response.incomplete":
			if isResponsesStreamCompletionEvent(streamResponse.Type) {
				c.Set("response_completed_seen", true)
			}
			if streamResponse.Response != nil {
				if streamResponse.Response.Usage != nil {
					if streamResponse.Response.Usage.InputTokens != 0 {
						usage.PromptTokens = streamResponse.Response.Usage.InputTokens
					}
					if streamResponse.Response.Usage.OutputTokens != 0 {
						usage.CompletionTokens = streamResponse.Response.Usage.OutputTokens
					}
					if streamResponse.Response.Usage.TotalTokens != 0 {
						usage.TotalTokens = streamResponse.Response.Usage.TotalTokens
					}
					if streamResponse.Response.Usage.InputTokensDetails != nil {
						usage.PromptTokensDetails.CachedTokens = streamResponse.Response.Usage.InputTokensDetails.CachedTokens
						usage.PromptTokensDetails.CachedCreationTokens = streamResponse.Response.Usage.InputTokensDetails.GetCacheWriteTokens()
					}
				}
				service.CopyResponsesCostFields(usage, streamResponse.Response)
				if streamResponse.Response.HasImageGenerationCall() {
					c.Set("image_generation_call", true)
					c.Set("image_generation_call_quality", streamResponse.Response.GetQuality())
					c.Set("image_generation_call_size", streamResponse.Response.GetSize())
				}
			}
		case dto.ResponsesOutputTypeItemDone:
			// 函数调用处理
			if streamResponse.Item != nil {
				switch streamResponse.Item.Type {
				case dto.BuildInCallWebSearchCall:
					if info != nil && info.ResponsesUsageInfo != nil && info.ResponsesUsageInfo.BuiltInTools != nil {
						if webSearchTool, exists := info.ResponsesUsageInfo.BuiltInTools[dto.BuildInToolWebSearchPreview]; exists && webSearchTool != nil {
							webSearchTool.CallCount++
						}
					}
				}
			}
		}
	})
	if pendingTerminal != nil {
		if hasResponsesStreamEffectiveOutput(c, fallbackCollector, pendingTerminal.response) {
			if err := helper.ResponseChunkData(c, pendingTerminal.response, pendingTerminal.data); err == nil {
				markResponsesStreamOutputSent(c, pendingTerminal.response)
				fallbackCollector.Collect(pendingTerminal.response)
			}
		} else {
			c.Set(responsesStreamEmptyTerminalSuppressedContextKey, true)
		}
	}
	service.CopyResponseHeaderCostFields(usage, resp.Header)

	if usage.CompletionTokens == 0 {
		// 计算输出文本的 token 数量
		tempStr := fallbackCollector.String()
		if len(tempStr) > 0 {
			// 非正常结束，使用输出文本的 token 数量
			modelName := info.UpstreamModelName
			if modelName == "" {
				modelName = info.OriginModelName
			}
			completionTokens := service.CountTextToken(tempStr, modelName)
			usage.CompletionTokens = completionTokens
		}
	}

	if usage.PromptTokens == 0 && usage.CompletionTokens != 0 {
		usage.PromptTokens = info.GetEstimatePromptTokens()
	}

	usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens
	if c.GetBool(responsesStreamEmptyTerminalSuppressedContextKey) {
		return usage, service.TextEmptyOutputRetryError()
	}

	return usage, nil
}
