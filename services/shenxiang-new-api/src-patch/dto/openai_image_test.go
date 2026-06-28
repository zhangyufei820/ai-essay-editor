package dto

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestImageRequestPreservesMediaWorkshopImageConfig(t *testing.T) {
	raw := []byte(`{
		"model":"banana-2",
		"prompt":"test image",
		"responseFormat":{"image":{"aspectRatio":"16:9","imageSize":"2K"}},
		"generationConfig":{
			"responseModalities":["TEXT","IMAGE"],
			"responseFormat":{"image":{"aspectRatio":"16:9","imageSize":"2K"}}
		}
	}`)

	var request ImageRequest
	require.NoError(t, json.Unmarshal(raw, &request))
	require.NotEmpty(t, request.ResponseFormatObj)
	require.NotEmpty(t, request.GenerationConfig)

	marshaled, err := json.Marshal(request)
	require.NoError(t, err)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(marshaled, &payload))
	require.Contains(t, payload, "responseFormat")
	require.Contains(t, payload, "generationConfig")
}
