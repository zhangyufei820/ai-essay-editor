package relay

import (
	"encoding/json"
	"fmt"
	"io"
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
	model := strings.ToLower(info.UpstreamModelName)
	if model == "" {
		model = strings.ToLower(info.OriginModelName)
	}
	return strings.HasPrefix(model, "claude-")
}

func responsesViaChatCompletions(c *gin.Context, info *relaycommon.RelayInfo, adaptor channel.Adaptor, request *dto.OpenAIResponsesRequest) (*dto.Usage, *types.NewAPIError) {
	if responsesRequestHasTools(request) {
		return nil, types.NewErrorWithStatusCode(
			fmt.Errorf("tools are not supported by this /v1/responses compatibility route"),
			types.ErrorCodeInvalidRequest,
			http.StatusBadRequest,
			types.ErrOptionWithSkipRetry(),
		)
	}
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

	responseBody, err := io.ReadAll(resp.Body)
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
	if !service.ValidUsage(usage) {
		text := service.ExtractOutputTextFromResponses(responsesResp)
		usage = service.ResponseText2Usage(c, text, info.UpstreamModelName, info.GetEstimatePromptTokens())
		responsesResp.Usage = usage
	}

	out, err := common.Marshal(responsesResp)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeJsonMarshalFailed, http.StatusInternalServerError)
	}
	service.IOCopyBytesGracefully(c, nil, out)
	return usage, nil
}

func responsesRequestHasTools(request *dto.OpenAIResponsesRequest) bool {
	if request == nil {
		return false
	}
	return hasNonEmptyResponsesTools(request.Tools)
}

func hasNonEmptyResponsesTools(tools any) bool {
	switch value := tools.(type) {
	case nil:
		return false
	case json.RawMessage:
		raw := strings.TrimSpace(string(value))
		return raw != "" && raw != "null" && raw != "[]"
	case []byte:
		raw := strings.TrimSpace(string(value))
		return raw != "" && raw != "null" && raw != "[]"
	case []map[string]any:
		return len(value) > 0
	case []any:
		return len(value) > 0
	default:
		return false
	}
}

func responsesChatStreamHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response, request *dto.OpenAIResponsesRequest) (*dto.Usage, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		return nil, types.NewOpenAIError(fmt.Errorf("invalid response"), types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}

	responseID := helper.GetResponseID(c)
	messageID := "msg_" + responseID
	createdAt := int(time.Now().Unix())
	model := info.UpstreamModelName
	var responseText strings.Builder
	usage := &dto.Usage{}

	helper.SetEventStreamHeaders(c)
	if err := writeResponsesCompatEvent(c, "response.created", map[string]any{
		"response": responseEnvelope(responseID, createdAt, model, "in_progress", nil, nil),
	}); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}
	_ = writeResponsesCompatEvent(c, "response.output_item.added", map[string]any{
		"output_index": 0,
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
		"output_index":  0,
		"content_index": 0,
		"part": map[string]any{
			"type":        "output_text",
			"text":        "",
			"annotations": []any{},
		},
	})

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
			delta := choice.Delta.GetContentString()
			if delta == "" {
				delta = choice.Delta.GetReasoningContent()
			}
			if delta == "" {
				continue
			}
			responseText.WriteString(delta)
			if err := writeResponsesCompatEvent(c, "response.output_text.delta", map[string]any{
				"item_id":       messageID,
				"output_index":  0,
				"content_index": 0,
				"delta":         delta,
			}); err != nil {
				sr.Error(err)
				return
			}
		}
	})

	text := responseText.String()
	if !service.ValidUsage(usage) {
		usage = service.ResponseText2Usage(c, text, info.UpstreamModelName, info.GetEstimatePromptTokens())
	}

	content := map[string]any{
		"type":        "output_text",
		"text":        text,
		"annotations": []any{},
	}
	outputItem := map[string]any{
		"id":      messageID,
		"type":    "message",
		"status":  "completed",
		"role":    "assistant",
		"content": []any{content},
	}
	_ = writeResponsesCompatEvent(c, "response.output_text.done", map[string]any{
		"item_id":       messageID,
		"output_index":  0,
		"content_index": 0,
		"text":          text,
	})
	_ = writeResponsesCompatEvent(c, "response.content_part.done", map[string]any{
		"item_id":       messageID,
		"output_index":  0,
		"content_index": 0,
		"part":          content,
	})
	_ = writeResponsesCompatEvent(c, "response.output_item.done", map[string]any{
		"output_index": 0,
		"item":         outputItem,
	})
	_ = writeResponsesCompatEvent(c, "response.completed", map[string]any{
		"response": responseEnvelope(responseID, createdAt, model, "completed", []any{outputItem}, usage),
	})

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
