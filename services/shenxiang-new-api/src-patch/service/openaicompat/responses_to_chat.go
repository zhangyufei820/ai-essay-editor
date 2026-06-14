package openaicompat

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/dto"
)

func ResponsesRequestToChatCompletionsRequest(req *dto.OpenAIResponsesRequest) (*dto.GeneralOpenAIRequest, error) {
	if req == nil {
		return nil, errors.New("request is nil")
	}
	messages, err := responsesInputToChatMessages(req.Input)
	if err != nil {
		return nil, err
	}
	if len(req.Instructions) > 0 {
		if instruction := rawMessageToString(req.Instructions); instruction != "" {
			messages = append([]dto.Message{{
				Role:    "system",
				Content: instruction,
			}}, messages...)
		}
	}
	if len(messages) == 0 {
		messages = []dto.Message{{
			Role:    "user",
			Content: "",
		}}
	}

	chatReq := &dto.GeneralOpenAIRequest{
		Model:       req.Model,
		Messages:    messages,
		Stream:      req.Stream,
		Temperature: req.Temperature,
		TopP:        req.TopP,
		ToolChoice:  rawMessageToAny(req.ToolChoice),
		User:        req.User,
		Metadata:    req.Metadata,
	}
	if req.MaxOutputTokens != nil {
		chatReq.MaxTokens = req.MaxOutputTokens
	}
	if req.Reasoning != nil && req.Reasoning.Effort != "" {
		chatReq.ReasoningEffort = req.Reasoning.Effort
	}
	if tools := responsesToolsToChatTools(req.Tools); len(tools) > 0 {
		chatReq.Tools = tools
	}
	return chatReq, nil
}

func ChatCompletionsResponseToResponsesResponse(resp *dto.OpenAITextResponse, req *dto.OpenAIResponsesRequest, id string) (*dto.OpenAIResponsesResponse, *dto.Usage, error) {
	if resp == nil {
		return nil, nil, errors.New("chat response is nil")
	}
	if id == "" {
		id = resp.Id
	}
	if id == "" {
		id = fmt.Sprintf("resp_%d", time.Now().UnixNano())
	}

	usage := normalizeChatUsage(resp.Usage)
	model := resp.Model
	if model == "" && req != nil {
		model = req.Model
	}

	outputs := make([]dto.ResponsesOutput, 0, len(resp.Choices))
	for i, choice := range resp.Choices {
		messageID := fmt.Sprintf("msg_%s_%d", id, i)
		for _, toolCall := range choice.Message.ParseToolCalls() {
			name := strings.TrimSpace(toolCall.Function.Name)
			if name == "" {
				continue
			}
			callID := strings.TrimSpace(toolCall.ID)
			if callID == "" {
				callID = fmt.Sprintf("call_%s_%d", id, len(outputs))
			}
			outputs = append(outputs, dto.ResponsesOutput{
				Type:      "function_call",
				ID:        callID,
				Status:    "completed",
				CallId:    callID,
				Name:      name,
				Arguments: stringToRawJSON(toolCall.Function.Arguments),
			})
		}
		text := choice.Message.StringContent()
		if text == "" && len(outputs) > 0 {
			continue
		}
		outputs = append(outputs, dto.ResponsesOutput{
			Type:   "message",
			ID:     messageID,
			Status: "completed",
			Role:   "assistant",
			Content: []dto.ResponsesOutputContent{{
				Type:        "output_text",
				Text:        text,
				Annotations: []interface{}{},
			}},
		})
	}
	if len(outputs) == 0 {
		outputs = append(outputs, dto.ResponsesOutput{
			Type:   "message",
			ID:     "msg_" + id,
			Status: "completed",
			Role:   "assistant",
			Content: []dto.ResponsesOutputContent{{
				Type:        "output_text",
				Text:        "",
				Annotations: []interface{}{},
			}},
		})
	}

	createdAt := chatCreatedAt(resp.Created)
	if createdAt == 0 {
		createdAt = int(time.Now().Unix())
	}

	out := &dto.OpenAIResponsesResponse{
		ID:                id,
		Object:            "response",
		CreatedAt:         createdAt,
		Status:            json.RawMessage(`"completed"`),
		Model:             model,
		Output:            outputs,
		ParallelToolCalls: true,
		Usage:             usage,
	}
	if req != nil {
		out.Instructions = req.Instructions
		out.PreviousResponseID = stringOrNull(req.PreviousResponseID)
		out.Reasoning = req.Reasoning
		out.ToolChoice = req.ToolChoice
		out.Tools = req.GetToolsMap()
		out.User = req.User
		out.Metadata = req.Metadata
		if req.MaxOutputTokens != nil {
			out.MaxOutputTokens = int(*req.MaxOutputTokens)
		}
		if req.Temperature != nil {
			out.Temperature = *req.Temperature
		}
		if req.TopP != nil {
			out.TopP = *req.TopP
		}
	}
	return out, usage, nil
}

func ResponsesResponseToChatCompletionsResponse(resp *dto.OpenAIResponsesResponse, id string) (*dto.OpenAITextResponse, *dto.Usage, error) {
	if resp == nil {
		return nil, nil, errors.New("response is nil")
	}

	text := ExtractOutputTextFromResponses(resp)

	usage := &dto.Usage{}
	if resp.Usage != nil {
		if resp.Usage.InputTokens != 0 {
			usage.PromptTokens = resp.Usage.InputTokens
			usage.InputTokens = resp.Usage.InputTokens
		}
		if resp.Usage.OutputTokens != 0 {
			usage.CompletionTokens = resp.Usage.OutputTokens
			usage.OutputTokens = resp.Usage.OutputTokens
		}
		if resp.Usage.TotalTokens != 0 {
			usage.TotalTokens = resp.Usage.TotalTokens
		} else {
			usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens
		}
		if resp.Usage.InputTokensDetails != nil {
			usage.PromptTokensDetails.CachedTokens = resp.Usage.InputTokensDetails.CachedTokens
			usage.PromptTokensDetails.ImageTokens = resp.Usage.InputTokensDetails.ImageTokens
			usage.PromptTokensDetails.AudioTokens = resp.Usage.InputTokensDetails.AudioTokens
		}
		if resp.Usage.CompletionTokenDetails.ReasoningTokens != 0 {
			usage.CompletionTokenDetails.ReasoningTokens = resp.Usage.CompletionTokenDetails.ReasoningTokens
		}
	}

	created := resp.CreatedAt

	var toolCalls []dto.ToolCallResponse
	// 正文与 tool_calls 可同时存在，不能因为有正文就丢弃 tool_calls
	if len(resp.Output) > 0 {
		for _, out := range resp.Output {
			if out.Type != "function_call" {
				continue
			}
			name := strings.TrimSpace(out.Name)
			if name == "" {
				continue
			}
			callId := strings.TrimSpace(out.CallId)
			if callId == "" {
				callId = strings.TrimSpace(out.ID)
			}
			toolCalls = append(toolCalls, dto.ToolCallResponse{
				ID:   callId,
				Type: "function",
				Function: dto.FunctionResponse{
					Name:      name,
					Arguments: out.ArgumentsString(),
				},
			})
		}
	}

	finishReason := "stop"
	if len(toolCalls) > 0 {
		finishReason = "tool_calls"
	}

	msg := dto.Message{
		Role:    "assistant",
		Content: text,
	}
	if len(toolCalls) > 0 {
		// 保留正文：正文与 tool_calls 可同时存在，清空会丢失模型的可见回答
		msg.SetToolCalls(toolCalls)
	}

	out := &dto.OpenAITextResponse{
		Id:      id,
		Object:  "chat.completion",
		Created: created,
		Model:   resp.Model,
		Choices: []dto.OpenAITextResponseChoice{
			{
				Index:        0,
				Message:      msg,
				FinishReason: finishReason,
			},
		},
		Usage: *usage,
	}

	return out, usage, nil
}

func ExtractOutputTextFromResponses(resp *dto.OpenAIResponsesResponse) string {
	if resp == nil || len(resp.Output) == 0 {
		return ""
	}

	var sb strings.Builder

	// Prefer assistant message outputs.
	for _, out := range resp.Output {
		if out.Type != "message" {
			continue
		}
		if out.Role != "" && out.Role != "assistant" {
			continue
		}
		for _, c := range out.Content {
			if c.Type == "output_text" && c.Text != "" {
				sb.WriteString(c.Text)
			}
		}
	}
	if sb.Len() > 0 {
		return sb.String()
	}
	for _, out := range resp.Output {
		for _, c := range out.Content {
			if c.Text != "" {
				sb.WriteString(c.Text)
			}
		}
	}
	return sb.String()
}

func responsesInputToChatMessages(input json.RawMessage) ([]dto.Message, error) {
	if len(input) == 0 {
		return nil, nil
	}
	switch firstJSONByte(input) {
	case '"':
		return []dto.Message{{
			Role:    "user",
			Content: rawMessageToString(input),
		}}, nil
	case '[':
		var items []json.RawMessage
		if err := json.Unmarshal(input, &items); err != nil {
			return nil, fmt.Errorf("invalid responses input array: %w", err)
		}
		messages := make([]dto.Message, 0, len(items))
		for _, item := range items {
			message, ok, err := responseInputItemToChatMessage(item)
			if err != nil {
				return nil, err
			}
			if ok {
				messages = append(messages, message)
			}
		}
		return messages, nil
	case '{':
		message, ok, err := responseInputItemToChatMessage(input)
		if err != nil || !ok {
			return nil, err
		}
		return []dto.Message{message}, nil
	default:
		return nil, fmt.Errorf("unsupported responses input JSON type")
	}
}

func responseInputItemToChatMessage(raw json.RawMessage) (dto.Message, bool, error) {
	var item map[string]json.RawMessage
	if err := json.Unmarshal(raw, &item); err != nil {
		return dto.Message{}, false, fmt.Errorf("invalid responses input item: %w", err)
	}

	itemType := rawObjectString(item, "type")
	if itemType == "input_text" || itemType == "output_text" {
		return dto.Message{Role: "user", Content: rawObjectString(item, "text")}, true, nil
	}
	if itemType == "input_image" {
		content := []dto.MediaContent{responsesContentPartToChatContent(item)}
		return dto.Message{Role: "user", Content: content}, true, nil
	}
	if itemType != "" && itemType != "message" && item["role"] == nil && item["content"] == nil {
		return dto.Message{}, false, nil
	}

	role := rawObjectString(item, "role")
	if role == "" {
		role = "user"
	}
	content, err := responsesContentToChatContent(item["content"])
	if err != nil {
		return dto.Message{}, false, err
	}
	return dto.Message{Role: role, Content: content}, true, nil
}

func responsesContentToChatContent(raw json.RawMessage) (any, error) {
	if len(raw) == 0 {
		return "", nil
	}
	switch firstJSONByte(raw) {
	case '"':
		return rawMessageToString(raw), nil
	case '[':
		var parts []map[string]json.RawMessage
		if err := json.Unmarshal(raw, &parts); err != nil {
			return nil, fmt.Errorf("invalid responses content array: %w", err)
		}
		contents := make([]dto.MediaContent, 0, len(parts))
		for _, part := range parts {
			contents = append(contents, responsesContentPartToChatContent(part))
		}
		return contents, nil
	case '{':
		var part map[string]json.RawMessage
		if err := json.Unmarshal(raw, &part); err != nil {
			return nil, fmt.Errorf("invalid responses content object: %w", err)
		}
		return []dto.MediaContent{responsesContentPartToChatContent(part)}, nil
	default:
		return "", nil
	}
}

func responsesContentPartToChatContent(part map[string]json.RawMessage) dto.MediaContent {
	partType := rawObjectString(part, "type")
	switch partType {
	case "input_image", "image_url":
		imageURL := rawObjectAny(part, "image_url")
		if imageURL == nil {
			imageURL = map[string]any{"url": rawObjectString(part, "url")}
		}
		return dto.MediaContent{Type: dto.ContentTypeImageURL, ImageUrl: imageURL}
	case "input_file", "file":
		file := rawObjectAny(part, "file")
		if file == nil {
			file = map[string]any{
				"file_data": rawObjectString(part, "file_data"),
				"file_id":   rawObjectString(part, "file_id"),
				"filename":  rawObjectString(part, "filename"),
			}
		}
		return dto.MediaContent{Type: dto.ContentTypeFile, File: file}
	default:
		return dto.MediaContent{Type: dto.ContentTypeText, Text: rawObjectString(part, "text")}
	}
}

func responsesToolsToChatTools(raw json.RawMessage) []dto.ToolCallRequest {
	if len(raw) == 0 || firstJSONByte(raw) != '[' {
		return nil
	}
	var tools []map[string]json.RawMessage
	if err := json.Unmarshal(raw, &tools); err != nil {
		return nil
	}
	out := make([]dto.ToolCallRequest, 0, len(tools))
	for _, tool := range tools {
		if rawObjectString(tool, "type") != "function" {
			continue
		}
		var function map[string]json.RawMessage
		if tool["function"] != nil {
			_ = json.Unmarshal(tool["function"], &function)
		}
		if function == nil {
			function = tool
		}
		name := rawObjectString(function, "name")
		if name == "" {
			continue
		}
		out = append(out, dto.ToolCallRequest{
			Type: "function",
			Function: dto.FunctionRequest{
				Name:        name,
				Description: rawObjectString(function, "description"),
				Parameters:  rawObjectAny(function, "parameters"),
			},
		})
	}
	return out
}

func normalizeChatUsage(usage dto.Usage) *dto.Usage {
	if usage.InputTokens == 0 {
		usage.InputTokens = usage.PromptTokens
	}
	if usage.OutputTokens == 0 {
		usage.OutputTokens = usage.CompletionTokens
	}
	if usage.TotalTokens == 0 {
		usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens
	}
	return &usage
}

func chatCreatedAt(created any) int {
	switch value := created.(type) {
	case int:
		return value
	case int64:
		return int(value)
	case float64:
		return int(value)
	case json.Number:
		i, _ := value.Int64()
		return int(i)
	default:
		return 0
	}
}

func firstJSONByte(raw json.RawMessage) byte {
	for _, b := range raw {
		if b == ' ' || b == '\n' || b == '\r' || b == '\t' {
			continue
		}
		return b
	}
	return 0
}

func rawMessageToString(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return text
	}
	return strings.TrimSpace(string(raw))
}

func rawMessageToAny(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	var out any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}

func rawObjectString(obj map[string]json.RawMessage, key string) string {
	if obj == nil {
		return ""
	}
	return rawMessageToString(obj[key])
}

func rawObjectAny(obj map[string]json.RawMessage, key string) any {
	if obj == nil {
		return nil
	}
	return rawMessageToAny(obj[key])
}

func stringOrNull(value string) json.RawMessage {
	if value == "" {
		return json.RawMessage("null")
	}
	encoded, _ := json.Marshal(value)
	return encoded
}

func stringToRawJSON(value string) json.RawMessage {
	value = strings.TrimSpace(value)
	if value == "" {
		return json.RawMessage("{}")
	}
	if json.Valid([]byte(value)) {
		return json.RawMessage(value)
	}
	encoded, _ := json.Marshal(value)
	return encoded
}
