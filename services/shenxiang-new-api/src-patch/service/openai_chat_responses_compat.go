package service

import (
	"fmt"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/service/openaicompat"
	"github.com/QuantumNous/new-api/service/relayconvert"
)

func ChatCompletionsRequestToResponsesRequest(req *dto.GeneralOpenAIRequest) (*dto.OpenAIResponsesRequest, error) {
	return relayconvert.ChatCompletionsRequestToResponsesRequest(req)
}

func ResponsesRequestToChatCompletionsRequest(req *dto.OpenAIResponsesRequest) (*dto.GeneralOpenAIRequest, error) {
	return openaicompat.ResponsesRequestToChatCompletionsRequest(req)
}

func ResponsesResponseToChatCompletionsResponse(resp *dto.OpenAIResponsesResponse, id string) (*dto.OpenAITextResponse, *dto.Usage, error) {
	return openaicompat.ResponsesResponseToChatCompletionsResponse(resp, id)
}

func ChatCompletionsResponseToResponsesResponse(resp *dto.OpenAITextResponse, args ...interface{}) (*dto.OpenAIResponsesResponse, *dto.Usage, error) {
	var req *dto.OpenAIResponsesRequest
	var id string
	switch len(args) {
	case 1:
		var ok bool
		id, ok = args[0].(string)
		if !ok {
			return nil, nil, fmt.Errorf("invalid response id argument %T", args[0])
		}
	case 2:
		if args[0] != nil {
			var ok bool
			req, ok = args[0].(*dto.OpenAIResponsesRequest)
			if !ok {
				return nil, nil, fmt.Errorf("invalid responses request argument %T", args[0])
			}
		}
		var ok bool
		id, ok = args[1].(string)
		if !ok {
			return nil, nil, fmt.Errorf("invalid response id argument %T", args[1])
		}
	default:
		return nil, nil, fmt.Errorf("unexpected argument count %d", len(args))
	}
	return openaicompat.ChatCompletionsResponseToResponsesResponse(resp, req, id)
}

func ExtractOutputTextFromResponses(resp *dto.OpenAIResponsesResponse) string {
	return openaicompat.ExtractOutputTextFromResponses(resp)
}
