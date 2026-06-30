package sora

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/model"
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
	if got["model"] != "seedance-nsfw" {
		t.Fatalf("model = %#v, want seedance-nsfw", got["model"])
	}
	if got["prompt"] != "@image1 follow this image" {
		t.Fatalf("prompt = %#v, want prompt with reference marker", got["prompt"])
	}
	if got["seconds"] != "4" {
		t.Fatalf("seconds = %#v, want string seconds", got["seconds"])
	}

	if got["first_frame_url"] != "https://cdn.test/first.png" {
		t.Fatalf("first_frame_url = %#v, want first reference image", got["first_frame_url"])
	}
	imageURLs, ok := got["image_urls"].([]string)
	if !ok || len(imageURLs) != 2 || imageURLs[0] != "https://cdn.test/first.png" || imageURLs[1] != "https://cdn.test/second.png" {
		t.Fatalf("image_urls = %#v, want first and second reference images", got["image_urls"])
	}
	metadata := got["metadata"].(map[string]interface{})
	if metadata["ratio"] != "9:16" {
		t.Fatalf("metadata.ratio = %#v, want 9:16", metadata["ratio"])
	}
	if metadata["resolution"] != "720p" {
		t.Fatalf("metadata.resolution = %#v, want 720p", metadata["resolution"])
	}
	content, ok := metadata["content"].([]interface{})
	if !ok || len(content) != 2 {
		t.Fatalf("metadata.content = %#v, want two official image_url entries", metadata["content"])
	}
	first := content[0].(map[string]interface{})
	if first["role"] != "first_frame" {
		t.Fatalf("metadata.content[0].role = %#v, want first_frame", first["role"])
	}
	firstImage := first["image_url"].(map[string]interface{})
	if first["type"] != "image_url" || firstImage["url"] != "https://cdn.test/first.png" {
		t.Fatalf("metadata.content[0] = %#v, want official first frame image_url", first)
	}
	second := content[1].(map[string]interface{})
	if second["role"] != "reference_image" {
		t.Fatalf("metadata.content[1].role = %#v, want reference_image", second["role"])
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
	content, ok := metadata["content"].([]interface{})
	if !ok || len(content) != 2 {
		t.Fatalf("metadata.content = %#v, want first and last frame entries", metadata["content"])
	}
	first := content[0].(map[string]interface{})
	if first["role"] != "first_frame" {
		t.Fatalf("metadata.content[0].role = %#v, want first_frame", first["role"])
	}
	last := content[1].(map[string]interface{})
	if last["role"] != "last_frame" {
		t.Fatalf("metadata.content[1].role = %#v, want last_frame", last["role"])
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

func TestNormalizeSeedanceDJFastUsesOfficialReferencesAndDuration(t *testing.T) {
	body := map[string]interface{}{
		"model":    "seedance-2.0-dj-fast",
		"prompt":   "Use @product as a short ad.",
		"duration": float64(12),
		"ratio":    "9:16",
		"metadata": map[string]interface{}{
			"resolution": "1080p",
			"content": []interface{}{
				map[string]interface{}{
					"type":      "image_url",
					"image_url": map[string]interface{}{"url": "https://cdn.test/product.png"},
					"role":      "reference_image",
				},
				map[string]interface{}{
					"type":      "video_url",
					"video_url": map[string]interface{}{"url": "https://cdn.test/skip.mp4"},
					"role":      "reference_video",
				},
				map[string]interface{}{
					"type":      "audio_url",
					"audio_url": map[string]interface{}{"url": "https://cdn.test/skip.mp3"},
					"role":      "reference_audio",
				},
			},
		},
	}

	got := normalizeSeedanceVideoRequestBody(body)
	if got["model"] != "seedance-2.0-dj-fast" {
		t.Fatalf("model = %#v, want seedance-2.0-dj-fast", got["model"])
	}
	if got["duration"] != 15 {
		t.Fatalf("duration = %#v, want nearest official enum 15", got["duration"])
	}
	if _, ok := got["seconds"]; ok {
		t.Fatalf("DJ payload should not forward seconds: %#v", got)
	}
	refs, ok := got["references"].([]map[string]interface{})
	if !ok || len(refs) != 1 {
		t.Fatalf("references = %#v, want one image reference", got["references"])
	}
	if refs[0]["media_type"] != "image" || refs[0]["role"] != "reference_image" || refs[0]["url"] != "https://cdn.test/product.png" {
		t.Fatalf("references[0] = %#v, want official image reference", refs[0])
	}
	if got["ratio"] != "9:16" {
		t.Fatalf("ratio = %#v, want 9:16", got["ratio"])
	}
	if got["resolution"] != "720P" {
		t.Fatalf("DJ resolution = %#v, want 720P", got["resolution"])
	}
	if _, ok := got["metadata"]; ok {
		t.Fatalf("DJ payload should not forward metadata: %#v", got)
	}
}

func TestNormalizeSeedanceLD17KeepsMixedOfficialReferences(t *testing.T) {
	body := map[string]interface{}{
		"model":    "seedance-2.0-ld-17",
		"prompt":   "Use @hero and @voice.",
		"duration": float64(8),
		"ratio":    "4:3",
		"references": []interface{}{
			map[string]interface{}{
				"media_type": "image",
				"role":       "first_frame",
				"url":        "https://cdn.test/hero.png",
				"alias":      "hero",
			},
			map[string]interface{}{
				"media_type": "video",
				"role":       "reference_video",
				"url":        "https://cdn.test/ref.mp4",
			},
			map[string]interface{}{
				"media_type": "audio",
				"role":       "reference_audio",
				"url":        "https://cdn.test/voice.mp3",
				"alias":      "voice",
			},
		},
	}

	got := normalizeSeedanceVideoRequestBody(body)
	if got["duration"] != 8 {
		t.Fatalf("duration = %#v, want 8", got["duration"])
	}
	if got["ratio"] != "4:3" {
		t.Fatalf("ratio = %#v, want 4:3", got["ratio"])
	}
	if _, ok := got["resolution"]; ok {
		t.Fatalf("LD-17 payload should not forward resolution: %#v", got)
	}
	refs, ok := got["references"].([]map[string]interface{})
	if !ok || len(refs) != 3 {
		t.Fatalf("references = %#v, want image/video/audio", got["references"])
	}
	if refs[0]["media_type"] != "image" || refs[0]["role"] != "first_frame" || refs[0]["alias"] != "hero" {
		t.Fatalf("image reference = %#v", refs[0])
	}
	if refs[1]["media_type"] != "video" || refs[1]["role"] != "reference_video" {
		t.Fatalf("video reference = %#v", refs[1])
	}
	if refs[2]["media_type"] != "audio" || refs[2]["role"] != "reference_audio" || refs[2]["alias"] != "voice" {
		t.Fatalf("audio reference = %#v", refs[2])
	}
	if _, ok := got["image_urls"]; ok {
		t.Fatalf("LD-17 should prefer official references over legacy image_urls: %#v", got)
	}
}

func TestNormalizeSeedanceLD17DropsAudioOnlyReferences(t *testing.T) {
	body := map[string]interface{}{
		"model":  "seedance-2.0-ld-17",
		"prompt": "audio only should be dropped",
		"references": []interface{}{
			map[string]interface{}{
				"media_type": "audio",
				"role":       "reference_audio",
				"url":        "https://cdn.test/voice.mp3",
			},
		},
	}

	got := normalizeSeedanceVideoRequestBody(body)
	if refs, ok := got["references"]; ok {
		t.Fatalf("audio-only LD-17 references should be dropped to avoid upstream rejection: %#v", refs)
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

func TestSeedanceOfficialReferencesBuildRequestURLUsesVideosEndpoint(t *testing.T) {
	adaptor := TaskAdaptor{baseURL: "https://provider.test"}
	for _, model := range []string{"seedance-2.0-dj-fast", "seedance-2.0-ld-17"} {
		url, err := adaptor.BuildRequestURL(&relaycommon.RelayInfo{
			ChannelMeta:   &relaycommon.ChannelMeta{UpstreamModelName: model},
			TaskRelayInfo: &relaycommon.TaskRelayInfo{},
		})
		if err != nil {
			t.Fatalf("BuildRequestURL(%s) error = %v", model, err)
		}
		if url != "https://provider.test/v1/videos" {
			t.Fatalf("BuildRequestURL(%s) = %q", model, url)
		}
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

func TestParseTaskResultTreatsSucceededAsSuccessWithVideoURL(t *testing.T) {
	adaptor := TaskAdaptor{}

	result, err := adaptor.ParseTaskResult([]byte(`{
		"id":"task_upstream_success",
		"task_id":"task_upstream_success",
		"model":"grok-imagine-video-1.5-preview",
		"status":"succeeded",
		"metadata":{"url":"https://media.example.com/from-metadata.mp4"},
		"output":{"url":"https://media.example.com/from-output.mp4"},
		"result_url":"https://media.example.com/from-result.mp4",
		"video_url":"https://media.example.com/from-video.mp4",
		"url":"https://media.example.com/from-url.mp4"
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != model.TaskStatusSuccess {
		t.Fatalf("Status = %q, want %q", result.Status, model.TaskStatusSuccess)
	}
	if result.Url != "https://media.example.com/from-url.mp4" {
		t.Fatalf("Url = %q, want direct url from upstream response", result.Url)
	}
}

func TestParseTaskResultFindsNestedOutputURL(t *testing.T) {
	adaptor := TaskAdaptor{}

	result, err := adaptor.ParseTaskResult([]byte(`{
		"id":"task_nested_output",
		"status":"success",
		"output":{"videos":[{"url":"https://media.example.com/nested.mp4"}]}
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != model.TaskStatusSuccess {
		t.Fatalf("Status = %q, want %q", result.Status, model.TaskStatusSuccess)
	}
	if result.Url != "https://media.example.com/nested.mp4" {
		t.Fatalf("Url = %q, want nested output url", result.Url)
	}
}
