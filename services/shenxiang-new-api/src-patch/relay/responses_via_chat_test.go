package relay

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
)

func TestResponsesRequestHasTools(t *testing.T) {
	require.False(t, responsesRequestHasTools(&dto.OpenAIResponsesRequest{}))
	require.True(t, responsesRequestHasTools(&dto.OpenAIResponsesRequest{Tools: json.RawMessage(`[{"type":"function","name":"lookup"}]`)}))
	require.False(t, hasNonEmptyResponsesTools(json.RawMessage(`[]`)))
	require.False(t, hasNonEmptyResponsesTools(json.RawMessage(`null`)))
	require.True(t, hasNonEmptyResponsesTools(json.RawMessage(`[{"type":"function","name":"lookup"}]`)))
	require.True(t, hasNonEmptyResponsesTools([]map[string]any{{"type": "function", "name": "lookup"}}))
}
