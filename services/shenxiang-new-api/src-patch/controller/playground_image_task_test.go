package controller

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
)

func TestNormalizePlaygroundImageTaskPayloadAddsGeminiImageConfig(t *testing.T) {
	raw := []byte(`{
		"model":"banana-2",
		"prompt":"test image",
		"responseFormat":{"image":{"aspectRatio":"9:16","imageSize":"2K"}},
		"generationConfig":{"responseFormat":{"image":{"aspectRatio":"9:16","imageSize":"2K"}}}
	}`)
	var request dto.ImageRequest
	require.NoError(t, json.Unmarshal(raw, &request))

	normalized, changed := normalizePlaygroundImageTaskPayload(raw, &request)
	require.True(t, changed)
	require.Equal(t, "9:16", request.AspectRatio)
	require.Equal(t, "2K", request.Resolution)
	require.Equal(t, "2K", request.ImageSize)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(normalized, &payload))
	require.Equal(t, "9:16", payload["aspect_ratio"])
	require.Equal(t, "2K", payload["resolution"])
	require.Equal(t, "2K", payload["image_size"])
	extraBody := payload["extra_body"].(map[string]any)
	google := extraBody["google"].(map[string]any)
	imageConfig := google["image_config"].(map[string]any)
	require.Equal(t, "9:16", imageConfig["aspect_ratio"])
	require.Equal(t, "2K", imageConfig["image_size"])
}
