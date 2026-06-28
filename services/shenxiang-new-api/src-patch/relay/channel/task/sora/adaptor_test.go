package sora

import (
	"reflect"
	"testing"
)

func TestNormalizeSeedanceVideoRequestBodyKeepsFirstFrameOnly(t *testing.T) {
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
	for _, removed := range []string{"group", "width", "height", "fps", "response_format", "enhance_prompt", "image", "images"} {
		if _, ok := got[removed]; ok {
			t.Fatalf("normalizeSeedanceVideoRequestBody kept %q: %#v", removed, got)
		}
	}

	wantContent := []interface{}{
		map[string]interface{}{
			"type":      "image_url",
			"image_url": map[string]interface{}{"url": "https://cdn.test/first.png"},
			"role":      "first_frame",
		},
	}
	metadata := got["metadata"].(map[string]interface{})
	if !reflect.DeepEqual(metadata["content"], wantContent) {
		t.Fatalf("metadata.content = %#v, want %#v", metadata["content"], wantContent)
	}
	if metadata["negative_prompt"] != "low quality" {
		t.Fatalf("negative_prompt = %#v, want trimmed value", metadata["negative_prompt"])
	}
}

func TestNormalizeSeedanceVideoRequestBodyKeepsLastFrame(t *testing.T) {
	body := map[string]interface{}{
		"model":    "seedance-nsfw",
		"prompt":   "first and last frame",
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
	wantContent := []interface{}{
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
	}
	metadata := got["metadata"].(map[string]interface{})
	if !reflect.DeepEqual(metadata["content"], wantContent) {
		t.Fatalf("metadata.content = %#v, want %#v", metadata["content"], wantContent)
	}
}
