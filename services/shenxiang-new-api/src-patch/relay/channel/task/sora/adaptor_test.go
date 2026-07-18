package sora

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
)

func TestFetchTaskContextHonorsCancellation(t *testing.T) {
	service.InitHttpClient()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := (&TaskAdaptor{}).FetchTaskContext(ctx, "https://example.invalid", "test-key", map[string]any{
		"task_id": "task-cancelled",
	}, "")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("FetchTaskContext() error = %v, want context canceled", err)
	}
}

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

func TestNormalizeSeedanceLD17UpstreamAliasKeepsOfficialPayload(t *testing.T) {
	body := map[string]interface{}{
		"model":    seedanceLD17UpstreamModel,
		"prompt":   "A paper plane crosses a blue sky.",
		"duration": float64(5),
		"ratio":    "16:9",
		"references": []interface{}{
			map[string]interface{}{
				"media_type": "image",
				"role":       "first_frame",
				"url":        "https://cdn.test/frame.png",
			},
		},
	}

	got := normalizeSeedanceVideoRequestBody(body)
	if got["model"] != seedanceLD17UpstreamModel {
		t.Fatalf("model = %#v, want mapped upstream model", got["model"])
	}
	if got["duration"] != 5 || got["ratio"] != "16:9" {
		t.Fatalf("official LD-17 fields not preserved: %#v", got)
	}
	if _, ok := got["seconds"]; ok {
		t.Fatalf("mapped LD-17 payload should not use generic seconds: %#v", got)
	}
	if _, ok := got["metadata"]; ok {
		t.Fatalf("mapped LD-17 payload should not forward generic metadata: %#v", got)
	}
	refs, ok := got["references"].([]map[string]interface{})
	if !ok || len(refs) != 1 || refs[0]["media_type"] != "image" {
		t.Fatalf("mapped LD-17 references = %#v", got["references"])
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
	for _, model := range []string{"seedance-2.0-dj-fast", seedanceLD17PublicModel, seedanceLD17UpstreamModel} {
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

func TestMoonApiXSeedanceBuildRequestURLUsesVideosEndpoint(t *testing.T) {
	adaptor := TaskAdaptor{baseURL: "https://moonapix.test"}
	for _, model := range []string{"seedance-2.0", "seedance-2.0-kz", "seedance-2.0-kz-fast", "seedance-2.0-cl-fast", "seedance-2.0-cl", "seedance-2.0-cl-mini"} {
		url, err := adaptor.BuildRequestURL(&relaycommon.RelayInfo{
			ChannelMeta:   &relaycommon.ChannelMeta{UpstreamModelName: model},
			TaskRelayInfo: &relaycommon.TaskRelayInfo{},
		})
		if err != nil {
			t.Fatalf("BuildRequestURL(%s) error = %v", model, err)
		}
		if url != "https://moonapix.test/v1/videos" {
			t.Fatalf("BuildRequestURL(%s) = %q", model, url)
		}
	}
}

func TestNormalizeGrokVideoRequestBodyUsesOfficialSingleReferenceField(t *testing.T) {
	got := normalizeGrokVideoRequestBody(map[string]interface{}{
		"model":    "grok-imagine-video-1.5-preview",
		"prompt":   "animate this image",
		"duration": float64(5),
		"ratio":    "9:16",
		"size":     "720x1280",
		"images": []interface{}{
			"https://cdn.test/first.png",
		},
	})

	if got["model"] != "grok-imagine-video-1.5-preview" {
		t.Fatalf("model = %#v", got["model"])
	}
	if got["duration"] != 15 {
		t.Fatalf("duration = %#v, want fixed 15", got["duration"])
	}
	if got["aspect_ratio"] != "9:16" {
		t.Fatalf("aspect_ratio = %#v, want 9:16", got["aspect_ratio"])
	}
	if got["size"] != "720P" {
		t.Fatalf("size = %#v, want 720P", got["size"])
	}
	if got["input_reference"] != "https://cdn.test/first.png" {
		t.Fatalf("input_reference = %#v", got["input_reference"])
	}
	for _, removed := range []string{"image", "images", "references", "reference_image_urls"} {
		if _, ok := got[removed]; ok {
			t.Fatalf("normalizeGrokVideoRequestBody kept %q: %#v", removed, got)
		}
	}
}

func TestNormalizeGrokVideoRequestBodyUsesOfficialMultiReferenceField(t *testing.T) {
	got := normalizeGrokVideoRequestBody(map[string]interface{}{
		"model":  "grok-imagine-video-1.5-preview",
		"prompt": "blend references",
		"metadata": map[string]interface{}{
			"content": []interface{}{
				map[string]interface{}{
					"type":      "image_url",
					"image_url": map[string]interface{}{"url": "https://cdn.test/a.png"},
				},
				map[string]interface{}{
					"type":      "image_url",
					"image_url": map[string]interface{}{"url": "https://cdn.test/b.png"},
				},
			},
		},
	})

	urls, ok := got["reference_image_urls"].([]string)
	if !ok || len(urls) != 2 || urls[0] != "https://cdn.test/a.png" || urls[1] != "https://cdn.test/b.png" {
		t.Fatalf("reference_image_urls = %#v", got["reference_image_urls"])
	}
	if _, ok := got["input_reference"]; ok {
		t.Fatalf("multi-reference Grok payload should not keep input_reference: %#v", got)
	}
}

func TestNormalizeMoonApiXSeedanceAliasKeepsKZMultimodalReferences(t *testing.T) {
	body := map[string]interface{}{
		"model":    "seedance-2.0",
		"prompt":   "让 @hero 按 @beat 的节奏挥手，参考 @clip 的镜头。",
		"duration": float64(15),
		"ratio":    "16:9",
		"references": []interface{}{
			map[string]interface{}{"media_type": "image", "role": "reference_image", "url": "https://cdn.test/hero.png", "alias": "hero"},
			map[string]interface{}{"media_type": "video", "role": "reference_video", "url": "https://cdn.test/clip.mp4", "alias": "clip"},
			map[string]interface{}{"media_type": "audio", "role": "reference_audio", "url": "https://cdn.test/beat.mp3", "alias": "beat"},
		},
	}

	got := normalizeMoonApiXSeedanceVideoRequestBody(body)
	if got["model"] != "seedance-2.0" {
		t.Fatalf("model = %#v, want seedance-2.0", got["model"])
	}
	if got["prompt"] != "让 @hero 按 @beat 的节奏挥手，参考 @clip 的镜头。" {
		t.Fatalf("prompt = %#v, want alias mentions preserved", got["prompt"])
	}
	refs, ok := got["references"].([]map[string]interface{})
	if !ok || len(refs) != 3 {
		t.Fatalf("references = %#v, want image/video/audio", got["references"])
	}
	if refs[0]["media_type"] != "image" || refs[0]["alias"] != "hero" {
		t.Fatalf("image reference = %#v", refs[0])
	}
	if refs[1]["media_type"] != "video" || refs[1]["alias"] != "clip" {
		t.Fatalf("video reference = %#v", refs[1])
	}
	if refs[2]["media_type"] != "audio" || refs[2]["alias"] != "beat" {
		t.Fatalf("audio reference = %#v", refs[2])
	}
	if got["video_url"] != "https://cdn.test/clip.mp4" || got["reference_video_url"] != "https://cdn.test/clip.mp4" {
		t.Fatalf("video aliases not set from video reference: %#v", got)
	}
	images, ok := got["images"].([]map[string]interface{})
	if !ok || len(images) != 1 {
		t.Fatalf("images = %#v, want one image compatibility item", got["images"])
	}
}

func TestNormalizeMoonApiXSeedanceAliasKeepsLocalReferenceMentions(t *testing.T) {
	body := map[string]interface{}{
		"model":    "seedance-2.0",
		"prompt":   "让 @图片1 跟随 @音频1 的节奏移动，并参考 @视频1 的镜头。",
		"duration": float64(10),
		"references": []interface{}{
			map[string]interface{}{"media_type": "image", "role": "reference_image", "url": "https://cdn.test/image.png", "alias": "图片1"},
			map[string]interface{}{"media_type": "video", "role": "reference_video", "url": "https://cdn.test/video.mp4", "alias": "视频1"},
			map[string]interface{}{"media_type": "audio", "role": "reference_audio", "url": "https://cdn.test/audio.mp3", "alias": "音频1"},
		},
	}

	got := normalizeMoonApiXSeedanceVideoRequestBody(body)
	if got["prompt"] != "让 @图片1 跟随 @音频1 的节奏移动，并参考 @视频1 的镜头。" {
		t.Fatalf("prompt = %#v, want local alias mentions preserved", got["prompt"])
	}
}

func TestNormalizeMoonApiXSeedanceAliasLimitsKZReferences(t *testing.T) {
	references := make([]interface{}, 0, 20)
	for i := 0; i < 12; i++ {
		references = append(references, map[string]interface{}{"media_type": "image", "url": fmt.Sprintf("https://cdn.test/image-%02d.png", i)})
	}
	for i := 0; i < 4; i++ {
		references = append(references, map[string]interface{}{"media_type": "video", "url": fmt.Sprintf("https://cdn.test/video-%02d.mp4", i)})
	}
	for i := 0; i < 4; i++ {
		references = append(references, map[string]interface{}{"media_type": "audio", "url": fmt.Sprintf("https://cdn.test/audio-%02d.mp3", i)})
	}
	got := normalizeMoonApiXSeedanceVideoRequestBody(map[string]interface{}{
		"model":      "seedance-2.0",
		"prompt":     "limit references",
		"references": references,
	})
	refs, ok := got["references"].([]map[string]interface{})
	if !ok {
		t.Fatalf("references = %#v", got["references"])
	}
	counts := map[string]int{}
	for _, ref := range refs {
		counts[ref["media_type"].(string)]++
	}
	if counts["image"] != 9 || counts["video"] != 3 || counts["audio"] != 3 {
		t.Fatalf("counts = %#v, want 9 images / 3 videos / 3 audios", counts)
	}
}

func TestNormalizeMoonApiXSeedanceAliasDropsAudioOnlyKZReferences(t *testing.T) {
	got := normalizeMoonApiXSeedanceVideoRequestBody(map[string]interface{}{
		"model":  "seedance-2.0",
		"prompt": "audio only",
		"references": []interface{}{
			map[string]interface{}{"media_type": "audio", "role": "reference_audio", "url": "https://cdn.test/beat.mp3"},
		},
	})
	if refs, ok := got["references"]; ok {
		t.Fatalf("audio-only seedance-2.0 references should be dropped: %#v", refs)
	}
}

func TestNormalizeMoonApiXCLMiniKeepsOfficialMediaFields(t *testing.T) {
	body := map[string]interface{}{
		"model":      "seedance-2.0-cl-mini",
		"prompt":     "@图片1 Use @image1 and @video1. 请参考@视频1生成，@尾帧2",
		"duration":   float64(2),
		"ratio":      "9:16",
		"resolution": "1080p",
		"references": []interface{}{
			map[string]interface{}{
				"media_type": "image",
				"role":       "first_frame",
				"url":        "https://cdn.test/first.png",
				"alias":      "image1",
			},
			map[string]interface{}{
				"media_type": "image",
				"role":       "last_frame",
				"url":        "https://cdn.test/last.png",
			},
			map[string]interface{}{
				"media_type": "video",
				"role":       "reference_video",
				"url":        "https://cdn.test/ref.mp4",
				"alias":      "video1",
			},
			map[string]interface{}{
				"media_type": "audio",
				"role":       "reference_audio",
				"url":        "https://cdn.test/skip.mp3",
			},
		},
	}

	got := normalizeMoonApiXSeedanceVideoRequestBody(body)
	if got["model"] != "seedance-2.0-cl-mini" {
		t.Fatalf("model = %#v, want seedance-2.0-cl-mini", got["model"])
	}
	if got["prompt"] != "Use @image1 and @video1. 请参考生成，" {
		t.Fatalf("prompt = %#v, want local Chinese reference mention stripped", got["prompt"])
	}
	if got["duration"] != 4 {
		t.Fatalf("duration = %#v, want lower clamp 4", got["duration"])
	}
	if got["resolution"] != "720p" {
		t.Fatalf("resolution = %#v, want CL Mini fallback 720p", got["resolution"])
	}
	if got["ratio"] != "9:16" || got["aspect_ratio"] != "9:16" {
		t.Fatalf("ratio/aspect_ratio = %#v/%#v, want 9:16", got["ratio"], got["aspect_ratio"])
	}
	if got["image"] != "https://cdn.test/first.png" || got["image_url"] != "https://cdn.test/first.png" || got["first_frame_url"] != "https://cdn.test/first.png" {
		t.Fatalf("first image aliases not set from first frame: %#v", got)
	}
	if got["last_frame_url"] != "https://cdn.test/last.png" {
		t.Fatalf("last_frame_url = %#v, want last frame", got["last_frame_url"])
	}
	if got["video_url"] != "https://cdn.test/ref.mp4" || got["reference_video_url"] != "https://cdn.test/ref.mp4" {
		t.Fatalf("video aliases not set from video reference: %#v", got)
	}
	refs, ok := got["references"].([]map[string]interface{})
	if !ok || len(refs) != 3 {
		t.Fatalf("references = %#v, want two images plus one video", got["references"])
	}
	for index, ref := range refs {
		if _, ok := ref["alias"]; ok {
			t.Fatalf("reference %d forwarded alias to MoonApiX: %#v", index, ref)
		}
	}
	if refs[2]["media_type"] != "video" {
		t.Fatalf("video reference = %#v, want video reference", refs[2])
	}
	images, ok := got["images"].([]map[string]interface{})
	if !ok || len(images) != 2 {
		t.Fatalf("images = %#v, want two image compatibility items", got["images"])
	}
	if _, ok := got["metadata"]; ok {
		t.Fatalf("MoonApiX payload should not forward metadata: %#v", got)
	}
}

func TestNormalizeMoonApiXNonMiniDropsVideoReferencesAndClampsDuration(t *testing.T) {
	body := map[string]interface{}{
		"model":      "seedance-2.0-cl-fast",
		"prompt":     "Use image only.",
		"duration":   float64(30),
		"resolution": "480p",
		"references": []interface{}{
			map[string]interface{}{"media_type": "image", "role": "reference_image", "url": "https://cdn.test/image.png"},
			map[string]interface{}{"media_type": "video", "role": "reference_video", "url": "https://cdn.test/skip.mp4"},
		},
	}

	got := normalizeMoonApiXSeedanceVideoRequestBody(body)
	if got["duration"] != 15 {
		t.Fatalf("duration = %#v, want upper clamp 15", got["duration"])
	}
	if got["resolution"] != "480p" {
		t.Fatalf("resolution = %#v, want 480p", got["resolution"])
	}
	refs, ok := got["references"].([]map[string]interface{})
	if !ok || len(refs) != 1 || refs[0]["media_type"] != "image" {
		t.Fatalf("references = %#v, want only image reference", got["references"])
	}
	if _, ok := got["video_url"]; ok {
		t.Fatalf("non-mini MoonApiX payload should not keep video_url: %#v", got)
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
		Error: map[string]any{
			"message": "服务暂时不可用，请稍后重试。",
			"code":    "service_error",
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

func TestSeedanceHTTPErrorWithErrorStringReturnsProviderStatus(t *testing.T) {
	taskErr := seedanceGatewayTaskError(responseTask{
		Error: "上游任务失败",
	}, http.StatusBadRequest)

	if taskErr == nil {
		t.Fatal("taskErr is nil")
	}
	if taskErr.StatusCode != http.StatusBadRequest {
		t.Fatalf("StatusCode = %d, want %d", taskErr.StatusCode, http.StatusBadRequest)
	}
	if taskErr.Message != "上游任务失败" {
		t.Fatalf("Message = %q, want upstream error string", taskErr.Message)
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

func TestParseTaskResultFindsMoonApiXDataStatusAndVideoURL(t *testing.T) {
	adaptor := TaskAdaptor{}

	result, err := adaptor.ParseTaskResult([]byte(`{
		"id":"task_moonapix",
		"model":"seedance-2.0-cl-mini",
		"data":{
			"status":"succeeded",
			"video_url":"https://media.example.com/moonapix.mp4"
		}
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != model.TaskStatusSuccess {
		t.Fatalf("Status = %q, want %q", result.Status, model.TaskStatusSuccess)
	}
	if result.Url != "https://media.example.com/moonapix.mp4" {
		t.Fatalf("Url = %q, want nested data.video_url", result.Url)
	}
}

func TestParseTaskResultAcceptsStringProgress(t *testing.T) {
	adaptor := TaskAdaptor{}

	result, err := adaptor.ParseTaskResult([]byte(`{
		"id":"task_string_progress",
		"status":"processing",
		"progress":"42%"
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != model.TaskStatusInProgress {
		t.Fatalf("Status = %q, want %q", result.Status, model.TaskStatusInProgress)
	}
	if result.Progress != "42%" {
		t.Fatalf("Progress = %q, want 42%%", result.Progress)
	}
}

func TestParseTaskResultTreatsRunningAsInProgress(t *testing.T) {
	adaptor := TaskAdaptor{}

	result, err := adaptor.ParseTaskResult([]byte(`{
		"id":"task_running_progress",
		"status":"running",
		"progress":"50%"
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != model.TaskStatusInProgress {
		t.Fatalf("Status = %q, want %q", result.Status, model.TaskStatusInProgress)
	}
	if result.Progress != "50%" {
		t.Fatalf("Progress = %q, want 50%%", result.Progress)
	}
}

func TestParseTaskResultAcceptsStringError(t *testing.T) {
	adaptor := TaskAdaptor{}

	result, err := adaptor.ParseTaskResult([]byte(`{
		"id":"task_string_error",
		"status":"failed",
		"error":"上游任务失败"
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != model.TaskStatusFailure {
		t.Fatalf("Status = %q, want %q", result.Status, model.TaskStatusFailure)
	}
	if result.Reason != "上游任务失败" {
		t.Fatalf("Reason = %q, want upstream error string", result.Reason)
	}
}
