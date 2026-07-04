package controller

import (
	"strings"
	"testing"
)

func TestSummarizePlaygroundVideoInputsCountsMetadataContentReferences(t *testing.T) {
	inputs := summarizePlaygroundVideoInputs(map[string]interface{}{
		"content": []interface{}{
			map[string]interface{}{
				"type": "image_url",
				"image_url": map[string]interface{}{
					"url": " https://api.aiphui.top/pg/media/files/u-1/reference.png ",
				},
				"role": "reference_image",
			},
			map[string]interface{}{
				"type":      "image_url",
				"image_url": "https://api.aiphui.top/pg/media/files/u-1/legacy.png",
				"role":      "reference_image",
			},
			map[string]interface{}{
				"type": "text",
				"text": "not a media reference",
			},
		},
	})

	if got := inputs["metadata_content_count"]; got != 3 {
		t.Fatalf("metadata_content_count = %v, want 3", got)
	}
	if got := inputs["reference_url_count"]; got != 2 {
		t.Fatalf("reference_url_count = %v, want 2", got)
	}
}

func TestSummarizePlaygroundVideoInputsReturnsNilWithoutContent(t *testing.T) {
	if got := summarizePlaygroundVideoInputs(map[string]interface{}{"frames": []interface{}{}}); got != nil {
		t.Fatalf("summarizePlaygroundVideoInputs() = %v, want nil", got)
	}
}

func TestPlaygroundPromptTooLongUsesTenThousandRuneLimit(t *testing.T) {
	if playgroundPromptTooLong(strings.Repeat("字", playgroundPromptMaxRunes)) {
		t.Fatalf("playgroundPromptTooLong() rejected exactly %d runes", playgroundPromptMaxRunes)
	}
	if !playgroundPromptTooLong(strings.Repeat("字", playgroundPromptMaxRunes+1)) {
		t.Fatalf("playgroundPromptTooLong() accepted more than %d runes", playgroundPromptMaxRunes)
	}
	if playgroundPromptTooLong("  " + strings.Repeat("字", playgroundPromptMaxRunes) + "  ") {
		t.Fatalf("playgroundPromptTooLong() should trim surrounding whitespace before counting")
	}
}
