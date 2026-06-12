package openaicompat

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/dto"
)

func TestResponsesRequestToChatCompletionsRequestConvertsTextAndTools(t *testing.T) {
	maxTokens := uint(32)
	stream := true
	req := &dto.OpenAIResponsesRequest{
		Model:           "claude-sonnet-4-6",
		Input:           json.RawMessage(`[{"role":"user","content":[{"type":"input_text","text":"hello"}]}]`),
		Instructions:    json.RawMessage(`"be brief"`),
		MaxOutputTokens: &maxTokens,
		Stream:          &stream,
		Tools:           json.RawMessage(`[{"type":"function","name":"lookup","description":"look up data","parameters":{"type":"object"}}]`),
	}

	got, err := ResponsesRequestToChatCompletionsRequest(req)
	if err != nil {
		t.Fatalf("ResponsesRequestToChatCompletionsRequest returned error: %v", err)
	}
	if got.Model != req.Model {
		t.Fatalf("model = %q, want %q", got.Model, req.Model)
	}
	if got.MaxTokens == nil || *got.MaxTokens != maxTokens {
		t.Fatalf("max_tokens = %v, want %d", got.MaxTokens, maxTokens)
	}
	if got.Stream == nil || !*got.Stream {
		t.Fatalf("stream = %v, want true", got.Stream)
	}
	if len(got.Messages) != 2 {
		t.Fatalf("messages len = %d, want 2", len(got.Messages))
	}
	if got.Messages[0].Role != "system" || got.Messages[0].Content != "be brief" {
		t.Fatalf("system message = %#v", got.Messages[0])
	}
	if got.Messages[1].Role != "user" {
		t.Fatalf("user role = %q", got.Messages[1].Role)
	}
	if len(got.Tools) != 1 || got.Tools[0].Function.Name != "lookup" {
		t.Fatalf("tools = %#v", got.Tools)
	}
}

func TestChatCompletionsResponseToResponsesResponseWrapsText(t *testing.T) {
	resp := &dto.OpenAITextResponse{
		Id:      "chatcmpl_test",
		Object:  "chat.completion",
		Created: 123,
		Model:   "claude-sonnet-4-6",
		Choices: []dto.OpenAITextResponseChoice{{
			Index: 0,
			Message: dto.Message{
				Role:    "assistant",
				Content: "OK",
			},
			FinishReason: "stop",
		}},
		Usage: dto.Usage{
			PromptTokens:     2,
			CompletionTokens: 1,
			TotalTokens:      3,
		},
	}

	got, usage, err := ChatCompletionsResponseToResponsesResponse(resp, &dto.OpenAIResponsesRequest{Model: "claude-sonnet-4-6"}, "resp_test")
	if err != nil {
		t.Fatalf("ChatCompletionsResponseToResponsesResponse returned error: %v", err)
	}
	if got.ID != "resp_test" || got.Object != "response" {
		t.Fatalf("response identity = %s/%s", got.ID, got.Object)
	}
	if usage.InputTokens != 2 || usage.OutputTokens != 1 || usage.TotalTokens != 3 {
		t.Fatalf("usage = %#v", usage)
	}
	if len(got.Output) != 1 || got.Output[0].Type != "message" {
		t.Fatalf("output = %#v", got.Output)
	}
	if got.Output[0].Content[0].Type != "output_text" || got.Output[0].Content[0].Text != "OK" {
		t.Fatalf("content = %#v", got.Output[0].Content)
	}
}
