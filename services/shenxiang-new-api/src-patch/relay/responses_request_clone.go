package relay

import (
	"slices"

	"github.com/QuantumNous/new-api/dto"
)

func cloneOpenAIResponsesRequest(request *dto.OpenAIResponsesRequest) *dto.OpenAIResponsesRequest {
	if request == nil {
		return nil
	}

	cloned := *request
	cloned.Input = slices.Clone(request.Input)
	cloned.Include = slices.Clone(request.Include)
	cloned.Conversation = slices.Clone(request.Conversation)
	cloned.ContextManagement = slices.Clone(request.ContextManagement)
	cloned.Instructions = slices.Clone(request.Instructions)
	cloned.Metadata = slices.Clone(request.Metadata)
	cloned.Moderation = slices.Clone(request.Moderation)
	cloned.ParallelToolCalls = slices.Clone(request.ParallelToolCalls)
	cloned.Store = slices.Clone(request.Store)
	cloned.PromptCacheKey = slices.Clone(request.PromptCacheKey)
	cloned.PromptCacheOptions = slices.Clone(request.PromptCacheOptions)
	cloned.PromptCacheRetention = slices.Clone(request.PromptCacheRetention)
	cloned.SafetyIdentifier = slices.Clone(request.SafetyIdentifier)
	cloned.Text = slices.Clone(request.Text)
	cloned.ToolChoice = slices.Clone(request.ToolChoice)
	cloned.Tools = slices.Clone(request.Tools)
	cloned.Truncation = slices.Clone(request.Truncation)
	cloned.User = slices.Clone(request.User)
	cloned.Prompt = slices.Clone(request.Prompt)
	cloned.ClientMetadata = slices.Clone(request.ClientMetadata)
	cloned.EnableThinking = slices.Clone(request.EnableThinking)
	cloned.Preset = slices.Clone(request.Preset)
	cloned.MaxOutputTokens = clonePointer(request.MaxOutputTokens)
	cloned.TopLogProbs = clonePointer(request.TopLogProbs)
	cloned.Stream = clonePointer(request.Stream)
	cloned.StreamOptions = clonePointer(request.StreamOptions)
	cloned.Temperature = clonePointer(request.Temperature)
	cloned.TopP = clonePointer(request.TopP)
	cloned.MaxToolCalls = clonePointer(request.MaxToolCalls)

	if request.Reasoning != nil {
		cloned.Reasoning = clonePointer(request.Reasoning)
		cloned.Reasoning.Mode = slices.Clone(request.Reasoning.Mode)
		cloned.Reasoning.Context = slices.Clone(request.Reasoning.Context)
	}

	return &cloned
}

func clonePointer[T any](value *T) *T {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
