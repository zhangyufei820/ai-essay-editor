package relay

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	appconstant "github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

func shouldResponsesUseChatCompletionsCompat(info *relaycommon.RelayInfo) bool {
	if info == nil || info.RelayMode != relayconstant.RelayModeResponses || info.ApiType != appconstant.APITypeOpenAI {
		return false
	}
	return info.ChannelId == 42 && strings.TrimSpace(info.UsingGroup) == service.DiscountPricingGroupName
}

func responsesViaChatCompletions(c *gin.Context, info *relaycommon.RelayInfo, adaptor channel.Adaptor, request *dto.OpenAIResponsesRequest) (*dto.Usage, *types.NewAPIError) {
	chatReq, err := service.ResponsesRequestToChatCompletionsRequest(request)
	if err != nil {
		return nil, types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
	}
	if chatReq.Stream != nil && *chatReq.Stream && chatReq.StreamOptions == nil {
		chatReq.StreamOptions = &dto.StreamOptions{IncludeUsage: true}
	}
	applySystemPromptIfNeeded(c, info, chatReq)

	convertedRequest, err := adaptor.ConvertOpenAIRequest(c, info, chatReq)
	if err != nil {
		return nil, types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
	}
	relaycommon.AppendRequestConversionFromRequest(info, convertedRequest)

	jsonData, err := common.Marshal(convertedRequest)
	if err != nil {
		return nil, types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
	}
	jsonData, err = relaycommon.RemoveDisabledFields(jsonData, info.ChannelOtherSettings, info.ChannelSetting.PassThroughBodyEnabled)
	if err != nil {
		return nil, types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
	}
	if len(info.ParamOverride) > 0 {
		jsonData, err = relaycommon.ApplyParamOverrideWithRelayInfo(jsonData, info)
		if err != nil {
			return nil, newAPIErrorFromParamOverride(err)
		}
	}

	body, size, closer, err := relaycommon.NewOutboundJSONBody(jsonData)
	if err != nil {
		return nil, types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
	}
	defer closer.Close()
	info.UpstreamRequestBodySize = size

	savedRelayMode := info.RelayMode
	savedRequestURLPath := info.RequestURLPath
	savedIsStream := info.IsStream
	defer func() {
		info.RelayMode = savedRelayMode
		info.RequestURLPath = savedRequestURLPath
		info.IsStream = savedIsStream
	}()

	info.RelayMode = relayconstant.RelayModeChatCompletions
	info.RequestURLPath = "/v1/chat/completions"
	info.IsStream = chatReq.IsStream(c)

	resp, err := adaptor.DoRequest(c, info, body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeDoRequestFailed, http.StatusInternalServerError)
	}
	if resp == nil {
		return nil, types.NewOpenAIError(fmt.Errorf("empty upstream response"), types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}

	httpResp := resp.(*http.Response)
	statusCodeMappingStr := c.GetString("status_code_mapping")
	if httpResp.StatusCode != http.StatusOK {
		newAPIError := service.RelayErrorHandler(c.Request.Context(), httpResp, false)
		service.ResetStatusCode(newAPIError, statusCodeMappingStr)
		return nil, newAPIError
	}

	if info.IsStream {
		return responsesChatStreamHandler(c, info, httpResp, request)
	}
	return responsesChatHandler(c, info, httpResp, request)
}

func responsesChatHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response, request *dto.OpenAIResponsesRequest) (*dto.Usage, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)

	responseBody, err := common.ReadAllCapped(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}
	var chatResp dto.OpenAITextResponse
	if err := common.Unmarshal(responseBody, &chatResp); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	if oaiError := chatResp.GetOpenAIError(); oaiError != nil && oaiError.Type != "" {
		return nil, types.WithOpenAIError(*oaiError, resp.StatusCode)
	}

	responseID := helper.GetResponseID(c)
	responsesResp, usage, err := service.ChatCompletionsResponseToResponsesResponse(&chatResp, request, responseID)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	service.CopyResponseHeaderCostFields(usage, resp.Header)
	if !service.ValidUsage(usage) {
		text := service.ExtractOutputTextFromResponses(responsesResp)
		usage = service.ResponseText2Usage(c, text, info.UpstreamModelName, info.GetEstimatePromptTokens())
		service.CopyResponseHeaderCostFields(usage, resp.Header)
		responsesResp.Usage = usage
	}

	out, err := common.Marshal(responsesResp)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeJsonMarshalFailed, http.StatusInternalServerError)
	}
	service.IOCopyBytesGracefully(c, nil, out)
	return usage, nil
}

func responsesChatStreamHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response, request *dto.OpenAIResponsesRequest) (*dto.Usage, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		return nil, types.NewOpenAIError(fmt.Errorf("invalid response"), types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}

	responseID := helper.GetResponseID(c)
	messageID := "msg_" + responseID
	reasoningID := "rs_" + responseID
	createdAt := int(time.Now().Unix())
	model := info.UpstreamModelName
	var responseText strings.Builder
	var reasoningText strings.Builder
	usage := &dto.Usage{}

	// 推理与可见正文是两个独立的 output item，按出现顺序动态分配 output_index：
	// reasoning(type=reasoning) 走 summary_index 维度，message(type=message) 走 content_index 维度。
	// 不能把推理混入可见输出，否则会污染最终回答与计费文本。
	reasoningStarted := false
	messageStarted := false
	reasoningOutputIndex := -1
	messageOutputIndex := -1
	nextOutputIndex := 0
	type compatToolCall struct {
		itemID      string
		callID      string
		name        string
		arguments   strings.Builder
		outputIndex int
	}
	toolCalls := make(map[string]*compatToolCall)
	toolCallOrder := make([]*compatToolCall, 0)

	startReasoningItem := func() {
		reasoningStarted = true
		reasoningOutputIndex = nextOutputIndex
		nextOutputIndex++
		_ = writeResponsesCompatEvent(c, "response.output_item.added", map[string]any{
			"output_index": reasoningOutputIndex,
			"item": map[string]any{
				"id":      reasoningID,
				"type":    "reasoning",
				"status":  "in_progress",
				"summary": []any{},
			},
		})
		_ = writeResponsesCompatEvent(c, "response.reasoning_summary_part.added", map[string]any{
			"item_id":       reasoningID,
			"output_index":  reasoningOutputIndex,
			"summary_index": 0,
			"part": map[string]any{
				"type": "summary_text",
				"text": "",
			},
		})
	}

	startMessageItem := func() {
		messageStarted = true
		messageOutputIndex = nextOutputIndex
		nextOutputIndex++
		_ = writeResponsesCompatEvent(c, "response.output_item.added", map[string]any{
			"output_index": messageOutputIndex,
			"item": map[string]any{
				"id":      messageID,
				"type":    "message",
				"status":  "in_progress",
				"role":    "assistant",
				"content": []any{},
			},
		})
		_ = writeResponsesCompatEvent(c, "response.content_part.added", map[string]any{
			"item_id":       messageID,
			"output_index":  messageOutputIndex,
			"content_index": 0,
			"part": map[string]any{
				"type":        "output_text",
				"text":        "",
				"annotations": []any{},
			},
		})
	}

	helper.SetEventStreamHeaders(c)
	if err := writeResponsesCompatEvent(c, "response.created", map[string]any{
		"response": responseEnvelope(responseID, createdAt, model, "in_progress", nil, nil),
	}); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}

	helper.StreamScannerHandler(c, resp, info, func(data string, sr *helper.StreamResult) {
		if strings.TrimSpace(data) == "[DONE]" {
			sr.Done()
			return
		}
		var chunk dto.ChatCompletionsStreamResponse
		if err := common.UnmarshalJsonStr(data, &chunk); err != nil {
			logger.LogError(c, "failed to unmarshal chat stream response: "+err.Error())
			sr.Error(err)
			return
		}
		if chunk.Model != "" {
			model = chunk.Model
		}
		if chunk.Created != 0 {
			createdAt = int(chunk.Created)
		}
		if chunk.Usage != nil && service.ValidUsage(chunk.Usage) {
			usage = chunk.Usage
		}
		for _, choice := range chunk.Choices {
			if content := choice.Delta.GetContentString(); content != "" {
				if !messageStarted {
					startMessageItem()
				}
				responseText.WriteString(content)
				if err := writeResponsesCompatEvent(c, "response.output_text.delta", map[string]any{
					"item_id":       messageID,
					"output_index":  messageOutputIndex,
					"content_index": 0,
					"delta":         content,
				}); err != nil {
					sr.Error(err)
					return
				}
				c.Set("response_stream_output_sent", true)
			}
			if reasoningDelta := choice.Delta.GetReasoningContent(); reasoningDelta != "" {
				if !reasoningStarted {
					startReasoningItem()
				}
				reasoningText.WriteString(reasoningDelta)
				if err := writeResponsesCompatEvent(c, "response.reasoning_summary_text.delta", map[string]any{
					"item_id":       reasoningID,
					"output_index":  reasoningOutputIndex,
					"summary_index": 0,
					"delta":         reasoningDelta,
				}); err != nil {
					sr.Error(err)
					return
				}
			}
			for position, delta := range choice.Delta.ToolCalls {
				toolIndex := position
				if delta.Index != nil {
					toolIndex = *delta.Index
				}
				key := fmt.Sprintf("%d:%d", choice.Index, toolIndex)
				toolCall := toolCalls[key]
				if toolCall == nil {
					toolCall = &compatToolCall{
						itemID:      fmt.Sprintf("fc_%s_%d", responseID, len(toolCallOrder)),
						callID:      strings.TrimSpace(delta.ID),
						name:        strings.TrimSpace(delta.Function.Name),
						outputIndex: nextOutputIndex,
					}
					if toolCall.callID == "" {
						toolCall.callID = fmt.Sprintf("call_%s_%d", responseID, len(toolCallOrder))
					}
					nextOutputIndex++
					toolCalls[key] = toolCall
					toolCallOrder = append(toolCallOrder, toolCall)
					if err := writeResponsesCompatEvent(c, "response.output_item.added", map[string]any{
						"output_index": toolCall.outputIndex,
						"item": map[string]any{
							"id":        toolCall.itemID,
							"type":      "function_call",
							"status":    "in_progress",
							"arguments": "",
							"call_id":   toolCall.callID,
							"name":      toolCall.name,
						},
					}); err != nil {
						sr.Error(err)
						return
					}
				}
				if id := strings.TrimSpace(delta.ID); id != "" {
					toolCall.callID = id
				}
				if name := strings.TrimSpace(delta.Function.Name); name != "" {
					toolCall.name = name
				}
				if argumentsDelta := delta.Function.Arguments; argumentsDelta != "" {
					toolCall.arguments.WriteString(argumentsDelta)
					if err := writeResponsesCompatEvent(c, "response.function_call_arguments.delta", map[string]any{
						"item_id":      toolCall.itemID,
						"output_index": toolCall.outputIndex,
						"delta":        argumentsDelta,
					}); err != nil {
						sr.Error(err)
						return
					}
				}
				c.Set("response_stream_output_sent", true)
			}
		}
	})

	text := responseText.String()
	reasoning := reasoningText.String()
	if !service.ValidUsage(usage) {
		// 计费回退需把推理内容计入补全 token：推理流即使无可见正文也消耗了输出，
		// 仅按可见 text 估算会漏计 reasoning，造成欠计费。
		usage = service.ResponseText2Usage(c, text+reasoning, info.UpstreamModelName, info.GetEstimatePromptTokens())
	}
	service.CopyResponseHeaderCostFields(usage, resp.Header)

	// Pure tool-call responses must not gain a synthetic empty assistant message.
	if !messageStarted && len(toolCallOrder) == 0 {
		startMessageItem()
	}

	// 最终 output 数组必须按 output_index 顺序排列，槽位与事件中的 index 一致。
	ordered := make([]any, nextOutputIndex)

	if reasoningStarted {
		_ = writeResponsesCompatEvent(c, "response.reasoning_summary_text.done", map[string]any{
			"item_id":       reasoningID,
			"output_index":  reasoningOutputIndex,
			"summary_index": 0,
			"text":          reasoning,
		})
		summaryPart := map[string]any{
			"type": "summary_text",
			"text": reasoning,
		}
		_ = writeResponsesCompatEvent(c, "response.reasoning_summary_part.done", map[string]any{
			"item_id":       reasoningID,
			"output_index":  reasoningOutputIndex,
			"summary_index": 0,
			"part":          summaryPart,
		})
		reasoningItem := map[string]any{
			"id":      reasoningID,
			"type":    "reasoning",
			"status":  "completed",
			"summary": []any{summaryPart},
		}
		_ = writeResponsesCompatEvent(c, "response.output_item.done", map[string]any{
			"output_index": reasoningOutputIndex,
			"item":         reasoningItem,
		})
		ordered[reasoningOutputIndex] = reasoningItem
	}

	for _, toolCall := range toolCallOrder {
		arguments := toolCall.arguments.String()
		_ = writeResponsesCompatEvent(c, "response.function_call_arguments.done", map[string]any{
			"item_id":      toolCall.itemID,
			"output_index": toolCall.outputIndex,
			"arguments":    arguments,
		})
		item := map[string]any{
			"id":        toolCall.itemID,
			"type":      "function_call",
			"status":    "completed",
			"arguments": arguments,
			"call_id":   toolCall.callID,
			"name":      toolCall.name,
		}
		_ = writeResponsesCompatEvent(c, "response.output_item.done", map[string]any{
			"output_index": toolCall.outputIndex,
			"item":         item,
		})
		ordered[toolCall.outputIndex] = item
	}

	if messageStarted {
		content := map[string]any{
			"type":        "output_text",
			"text":        text,
			"annotations": []any{},
		}
		messageItem := map[string]any{
			"id":      messageID,
			"type":    "message",
			"status":  "completed",
			"role":    "assistant",
			"content": []any{content},
		}
		_ = writeResponsesCompatEvent(c, "response.output_text.done", map[string]any{
			"item_id":       messageID,
			"output_index":  messageOutputIndex,
			"content_index": 0,
			"text":          text,
		})
		_ = writeResponsesCompatEvent(c, "response.content_part.done", map[string]any{
			"item_id":       messageID,
			"output_index":  messageOutputIndex,
			"content_index": 0,
			"part":          content,
		})
		_ = writeResponsesCompatEvent(c, "response.output_item.done", map[string]any{
			"output_index": messageOutputIndex,
			"item":         messageItem,
		})
		ordered[messageOutputIndex] = messageItem
	}

	_ = writeResponsesCompatEvent(c, "response.completed", map[string]any{
		"response": responseEnvelope(responseID, createdAt, model, "completed", ordered, usage),
	})
	c.Set("response_completed_seen", true)

	return usage, nil
}

func responseEnvelope(id string, createdAt int, model string, status string, output []any, usage *dto.Usage) map[string]any {
	return map[string]any{
		"id":                   id,
		"object":               "response",
		"created_at":           createdAt,
		"status":               status,
		"error":                nil,
		"incomplete_details":   nil,
		"instructions":         nil,
		"max_output_tokens":    nil,
		"model":                model,
		"output":               output,
		"parallel_tool_calls":  true,
		"previous_response_id": nil,
		"reasoning":            nil,
		"store":                false,
		"temperature":          nil,
		"text":                 nil,
		"tool_choice":          "auto",
		"tools":                []any{},
		"top_p":                nil,
		"truncation":           "disabled",
		"usage":                usage,
		"user":                 nil,
		"metadata":             nil,
	}
}

func writeResponsesCompatEvent(c *gin.Context, eventType string, payload map[string]any) error {
	if payload == nil {
		payload = map[string]any{}
	}
	payload["type"] = eventType
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	c.Render(-1, common.CustomEvent{Data: fmt.Sprintf("event: %s\n", eventType)})
	c.Render(-1, common.CustomEvent{Data: "data: " + string(jsonData)})
	return helper.FlushWriter(c)
}
