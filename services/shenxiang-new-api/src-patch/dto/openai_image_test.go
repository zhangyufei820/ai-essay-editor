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
		"aspect_ratio":"16:9",
		"resolution":"2K",
		"image_size":"2K",
		"responseFormat":{"image":{"aspectRatio":"16:9","imageSize":"2K"}},
		"generationConfig":{
			"responseModalities":["TEXT","IMAGE"],
			"imageConfig":{"aspectRatio":"16:9","imageSize":"2K"},
			"responseFormat":{"image":{"aspectRatio":"16:9","imageSize":"2K"}}
		},
		"extra_body":{"google":{"image_config":{"aspect_ratio":"16:9","image_size":"2K"}}}
	}`)

	var request ImageRequest
	require.NoError(t, json.Unmarshal(raw, &request))
	require.NotEmpty(t, request.ResponseFormatObj)
	require.NotEmpty(t, request.GenerationConfig)
	require.Equal(t, "16:9", request.AspectRatio)
	require.Equal(t, "2K", request.Resolution)
	require.Equal(t, "2K", request.ImageSize)

	marshaled, err := json.Marshal(request)
	require.NoError(t, err)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(marshaled, &payload))
	require.Equal(t, "16:9", payload["aspect_ratio"])
	require.Equal(t, "2K", payload["resolution"])
	require.Equal(t, "2K", payload["image_size"])
	require.Contains(t, payload, "responseFormat")
	require.Contains(t, payload, "generationConfig")
	require.Contains(t, payload, "extra_body")
}

func TestImageRequestDiscountImage2UsesCNYTierPrice(t *testing.T) {
	tests := []struct {
		name      string
		raw       string
		wantPrice float64
	}{
		{
			name:      "public alias 1K",
			raw:       `{"model":"特价 image-2","prompt":"poster","resolution":"1K"}`,
			wantPrice: 0.03,
		},
		{
			name:      "internal model 2K",
			raw:       `{"model":"geek2api-image-2","prompt":"poster","resolution":"2K"}`,
			wantPrice: 0.06,
		},
		{
			name:      "extra body 4K",
			raw:       `{"model":"特价 image-2","prompt":"poster","extra_body":{"google":{"image_config":{"image_size":"4K"}}}}`,
			wantPrice: 0.10,
		},
		{
			name:      "pixel size infers 2K",
			raw:       `{"model":"特价 image-2","prompt":"poster","size":"2048x2048"}`,
			wantPrice: 0.06,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var request ImageRequest
			require.NoError(t, json.Unmarshal([]byte(test.raw), &request))

			meta := request.GetTokenCountMeta()
			require.InDelta(t, test.wantPrice, meta.ImagePriceCNY, 0.000001)
		})
	}
}
