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
			wantPrice: 0.06,
		},
		{
			name:      "internal model 2K",
			raw:       `{"model":"internal-image2-discount-v2","prompt":"poster","resolution":"2K"}`,
			wantPrice: 0.09,
		},
		{
			name:      "extra body 4K",
			raw:       `{"model":"特价 image-2","prompt":"poster","extra_body":{"google":{"image_config":{"image_size":"4K"}}}}`,
			wantPrice: 0.10,
		},
		{
			name:      "pixel size infers 2K",
			raw:       `{"model":"特价 image-2","prompt":"poster","size":"2048x2048"}`,
			wantPrice: 0.09,
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

func TestNormalizeDiscountImage2GenerationRequestPinsVerifiedContract(t *testing.T) {
	for _, test := range []struct {
		name       string
		request    ImageRequest
		resolution string
		size       string
	}{
		{name: "defaults to 1K", request: ImageRequest{Model: "特价 image-2"}, resolution: "1K", size: "1024x1024"},
		{name: "keeps 2K", request: ImageRequest{Model: "internal-image2-discount-v2", Resolution: "2K", Size: "2048x2048"}, resolution: "2K", size: "2048x2048"},
		{name: "keeps 4K", request: ImageRequest{Model: "特价 image-2", Resolution: "4K", Size: "2880x2880"}, resolution: "4K", size: "2880x2880"},
	} {
		t.Run(test.name, func(t *testing.T) {
			require.NoError(t, NormalizeDiscountImage2GenerationRequest(&test.request))
			require.NotNil(t, test.request.N)
			require.Equal(t, uint(1), *test.request.N)
			require.Equal(t, "high", test.request.Quality)
			require.Equal(t, test.resolution, test.request.Resolution)
			require.Equal(t, test.size, test.request.Size)
			require.JSONEq(t, `"png"`, string(test.request.OutputFormat))
		})
	}
}

func TestNormalizeDiscountImage2GenerationRequestAcceptsMediaPlaygroundAspectRatios(t *testing.T) {
	for _, test := range []struct {
		name       string
		request    ImageRequest
		resolution string
		size       string
	}{
		{
			name:       "keeps 2K 2:3 production request",
			request:    ImageRequest{Model: "特价 image-2", Resolution: "2K", Size: "1376x2064"},
			resolution: "2K",
			size:       "1376x2064",
		},
		{
			name:       "keeps 4K 3:4 production request",
			request:    ImageRequest{Model: "特价 image-2", Resolution: "4K", Size: "2160x2880"},
			resolution: "4K",
			size:       "2160x2880",
		},
		{
			name:       "keeps 4K 2:3 production request",
			request:    ImageRequest{Model: "特价 image-2", Resolution: "4K", Size: "2176x3264"},
			resolution: "4K",
			size:       "2176x3264",
		},
		{
			name:       "keeps 1K 16:9 production request",
			request:    ImageRequest{Model: "特价 image-2", Resolution: "1K", Size: "1536x864"},
			resolution: "1K",
			size:       "1536x864",
		},
		{
			name:       "maps 2K 9:16 aspect ratio",
			request:    ImageRequest{Model: "特价 image-2", Resolution: "2K", AspectRatio: "9:16"},
			resolution: "2K",
			size:       "1152x2048",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			require.NoError(t, NormalizeDiscountImage2GenerationRequest(&test.request))
			require.Equal(t, test.resolution, test.request.Resolution)
			require.Equal(t, test.size, test.request.Size)
			require.Empty(t, test.request.AspectRatio)
		})
	}
}

func TestNormalizeDiscountImage2GenerationRequestSupportsAllMediaPlaygroundRatios(t *testing.T) {
	aspectRatios := []string{"1:1", "1:3", "3:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "9:21", "21:9"}
	for _, resolution := range []string{"1K", "2K", "4K"} {
		sizes := discountImage2VerifiedSizes[resolution]
		require.Len(t, sizes, len(aspectRatios))
		for _, aspectRatio := range aspectRatios {
			expectedSize, ok := sizes[aspectRatio]
			require.True(t, ok, "%s must support %s", resolution, aspectRatio)

			request := ImageRequest{Model: "特价 image-2", Resolution: resolution, AspectRatio: aspectRatio}
			require.NoError(t, NormalizeDiscountImage2GenerationRequest(&request))
			require.Equal(t, expectedSize, request.Size)
		}
	}
}

func TestNormalizeDiscountImage2GenerationRequestRejectsUnverifiedInputs(t *testing.T) {
	two := uint(2)
	stream := true
	for _, request := range []ImageRequest{
		{Model: "特价 image-2", N: &two},
		{Model: "特价 image-2", Quality: "auto"},
		{Model: "特价 image-2", AspectRatio: "7:8"},
		{Model: "特价 image-2", Resolution: "custom", Size: "1536x1024"},
		{Model: "特价 image-2", Size: "1504x1008"},
		{Model: "特价 image-2", Resolution: "2K", Size: "1024x1024"},
		{Model: "特价 image-2", Resolution: "2K", Size: "1152x2048", AspectRatio: "16:9"},
		{Model: "特价 image-2", OutputFormat: json.RawMessage(`"jpeg"`)},
		{Model: "特价 image-2", Images: json.RawMessage(`["https://example.com/input.png"]`)},
		{Model: "特价 image-2", Stream: &stream},
	} {
		require.Error(t, NormalizeDiscountImage2GenerationRequest(&request))
	}
}

func TestImageRequestStableImage2UsesFixedCNYPrice(t *testing.T) {
	for _, raw := range []string{
		`{"model":"官转image 2稳定","prompt":"poster","resolution":"1K"}`,
		`{"model":"internal-image2-stable-v1","prompt":"poster","resolution":"2K"}`,
		`{"model":"官转image 2稳定","prompt":"poster","resolution":"4K"}`,
	} {
		var request ImageRequest
		require.NoError(t, json.Unmarshal([]byte(raw), &request))
		require.InDelta(t, 0.135, request.GetTokenCountMeta().ImagePriceCNY, 0.000001)
	}
}
