package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

func TestPlaygroundMoon25PromptLimitMatchesModelContract(t *testing.T) {
	for _, tc := range []struct {
		model    string
		length   int
		rejected bool
	}{
		{"moon-video-2.5-480p", 15000, false},
		{"moon-video-2.5-480p", 15001, true},
		{"grok-video-1.5", 10000, false},
		{"grok-video-1.5", 10001, true},
	} {
		body, _ := json.Marshal(map[string]interface{}{"model": tc.model, "prompt": strings.Repeat("字", tc.length)})
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/pg/videos", bytes.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		err := validatePlaygroundVideoPromptLimit(c)
		common.CleanupBodyStorage(c)
		if (err != nil) != tc.rejected {
			t.Fatalf("model=%s length=%d error=%v", tc.model, tc.length, err)
		}
	}
}

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
