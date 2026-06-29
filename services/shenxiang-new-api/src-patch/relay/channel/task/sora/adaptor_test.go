package sora

import (
	"net/http"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

func TestNormalizeSeedanceVideoRequestBodyUsesOfficialFirstFramePayload(t *testing.T) {
	body := map[string]interface{}{
		"model":           "seedance-nsfw",
		"group":           "internal",
		"prompt":          "@image1 follow this image",
		"seconds":         "4",
		"duration":        float64(4),
		"size":            "720x1280",
		"width":           float64(720),
		"height":          float64(1280),
		"fps":             float64(24),
		"response_format": "url",
		"enhance_prompt":  false,
		"generate_audio":  true,
		"image":           "https://cdn.test/first.png",
		"images": []interface{}{
			"https://cdn.test/first.png",
			"https://cdn.test/second.png",
		},
		"metadata": map[string]interface{}{
			"negative_prompt": " low quality ",
			"content": []interface{}{
				map[string]interface{}{
					"type":      "image_url",
					"image_url": map[string]interface{}{"url": "https://cdn.test/first.png"},
					"role":      "reference_image",
				},
			},
			"frames": []interface{}{
				map[string]interface{}{"role": "first_frame", "image": "https://cdn.test/first.png"},
			},
			"image_reference_count": float64(2),
		},
	}

	got := normalizeSeedanceVideoRequestBody(body)
	for _, removed := range []string{"group", "duration", "size", "width", "height", "fps", "response_format", "enhance_prompt", "image", "images"} {
		if _, ok := got[removed]; ok {
			t.Fatalf("normalizeSeedanceVideoRequestBody kept %q: %#v", removed, got)
		}
	}
	if got["model"] != "dreamina-seedance-2-0-260128" {
		t.Fatalf("model = %#v, want dreamina-seedance-2-0-260128", got["model"])
	}
	if got["prompt"] != "follow this image" {
		t.Fatalf("prompt = %#v, want prompt without reference markers", got["prompt"])
	}
	if got["seconds"] != "4" {
		t.Fatalf("seconds = %#v, want string seconds", got["seconds"])
	}

	if got["first_frame_url"] != "https://cdn.test/first.png" {
		t.Fatalf("first_frame_url = %#v, want first reference image", got["first_frame_url"])
	}
	metadata := got["metadata"].(map[string]interface{})
	if metadata["ratio"] != "9:16" {
		t.Fatalf("metadata.ratio = %#v, want 9:16", metadata["ratio"])
	}
	if metadata["resolution"] != "720p" {
		t.Fatalf("metadata.resolution = %#v, want 720p", metadata["resolution"])
	}
	if _, ok := metadata["content"]; ok {
		t.Fatalf("metadata should not forward content array for private seedance model: %#v", metadata)
	}
	if _, ok := metadata["negative_prompt"]; ok {
		t.Fatalf("metadata should not forward unsupported negative_prompt: %#v", metadata)
	}
	if _, ok := metadata["generate_audio"]; ok {
		t.Fatalf("metadata should not forward generate_audio for private seedance model: %#v", metadata)
	}
}

func TestNormalizeSeedanceVideoRequestBodyExtractsFirstFrameFromContent(t *testing.T) {
	body := map[string]interface{}{
		"model":    "seedance-nsfw",
		"prompt":   "use these references",
		"seconds":  "4",
		"duration": float64(4),
		"size":     "720x1280",
		"metadata": map[string]interface{}{
			"content": []interface{}{
				map[string]interface{}{
					"type":      "image_url",
					"image_url": map[string]interface{}{"url": "https://cdn.test/first.png"},
					"role":      "first_frame",
				},
				map[string]interface{}{
					"type":      "image_url",
					"image_url": map[string]interface{}{"url": "https://cdn.test/last.png"},
					"role":      "last_frame",
				},
			},
			"last_frame_image": "https://cdn.test/last.png",
		},
	}

	got := normalizeSeedanceVideoRequestBody(body)
	if got["prompt"] != "use these references" {
		t.Fatalf("prompt = %#v, want prompt without reference markers", got["prompt"])
	}
	if got["first_frame_url"] != "https://cdn.test/first.png" {
		t.Fatalf("first_frame_url = %#v, want first reference image", got["first_frame_url"])
	}
	metadata := got["metadata"].(map[string]interface{})
	if _, ok := metadata["content"]; ok {
		t.Fatalf("metadata should not forward content array: %#v", metadata)
	}
}

func TestNormalizeSeedanceVideoRequestBodyForwardsGenerateAudioForSeedance2(t *testing.T) {
	body := map[string]interface{}{
		"model":          "doubao-seedance-2-0-720p",
		"prompt":         "text to video",
		"seconds":        "5",
		"generate_audio": true,
		"metadata": map[string]interface{}{
			"ratio":      "16:9",
			"resolution": "720p",
		},
	}

	got := normalizeSeedanceVideoRequestBody(body)
	metadata := got["metadata"].(map[string]interface{})
	if metadata["generate_audio"] != true {
		t.Fatalf("metadata.generate_audio = %#v, want true for Seedance 2.0", metadata["generate_audio"])
	}
}

func TestSeedanceBuildRequestURLUsesGenerationEndpoint(t *testing.T) {
	adaptor := TaskAdaptor{baseURL: "https://provider.test"}
	url, err := adaptor.BuildRequestURL(&relaycommon.RelayInfo{
		ChannelMeta:   &relaycommon.ChannelMeta{UpstreamModelName: "seedance-nsfw"},
		TaskRelayInfo: &relaycommon.TaskRelayInfo{},
	})
	if err != nil {
		t.Fatal(err)
	}
	if url != "https://provider.test/api/v1/video/generations" {
		t.Fatalf("BuildRequestURL() = %q", url)
	}
}

func TestSeedanceGatewayFailureReturnsProviderStatus(t *testing.T) {
	success := false
	taskErr := seedanceGatewayTaskError(responseTask{
		Success:      &success,
		StatusCode:   400,
		ProviderCode: "service_error",
		Message:      "服务暂时不可用，请稍后重试。",
	}, 200)

	if taskErr == nil {
		t.Fatal("taskErr is nil")
	}
	if taskErr.StatusCode != 400 {
		t.Fatalf("StatusCode = %d, want 400", taskErr.StatusCode)
	}
	if taskErr.Code != "service_error" {
		t.Fatalf("Code = %q, want service_error", taskErr.Code)
	}
}

func TestSeedanceHTTPErrorWithErrorObjectReturnsProviderStatus(t *testing.T) {
	taskErr := seedanceGatewayTaskError(responseTask{
		Error: &struct {
			Message string `json:"message"`
			Code    string `json:"code"`
		}{
			Message: "服务暂时不可用，请稍后重试。",
			Code:    "service_error",
		},
	}, http.StatusBadRequest)

	if taskErr == nil {
		t.Fatal("taskErr is nil")
	}
	if taskErr.StatusCode != http.StatusBadRequest {
		t.Fatalf("StatusCode = %d, want %d", taskErr.StatusCode, http.StatusBadRequest)
	}
	if taskErr.Code != "service_error" {
		t.Fatalf("Code = %q, want service_error", taskErr.Code)
	}
}
