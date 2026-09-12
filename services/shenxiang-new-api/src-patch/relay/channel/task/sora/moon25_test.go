package sora

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
)

func moon25Body() map[string]interface{} {
	return map[string]interface{}{
		"model": moon25PublicModel, "prompt": "让 @产品 缓慢旋转。", "duration": 30,
		"resolution": "480P", "ratio": "16:9",
		"references": []interface{}{map[string]interface{}{"media_type": "image", "role": "reference_image", "url": "https://media.example.com/product.png", "alias": "产品"}},
	}
}

func moon25Context(t *testing.T, body map[string]interface{}) (*gin.Context, *relaycommon.RelayInfo) {
	t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(string(data)))
	c.Request.Header.Set("Content-Type", "application/json")
	t.Cleanup(func() { common.CleanupBodyStorage(c) })
	return c, &relaycommon.RelayInfo{OriginModelName: moon25PublicModel, ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: moon25UpstreamModel}, TaskRelayInfo: &relaycommon.TaskRelayInfo{}}
}

func TestMoon25PreservesThirtyReferencesAliasesAndPerSecondBilling(t *testing.T) {
	body := moon25Body()
	refs := []interface{}{}
	for i := 0; i < 30; i++ {
		refs = append(refs, map[string]interface{}{"media_type": "image", "role": "reference_image", "url": fmt.Sprintf("https://media.example.com/%d.png", i), "alias": fmt.Sprintf("图片%d", i+1)})
	}
	body["references"] = refs
	body["prompt"] = "让 @图片1 的产品缓慢旋转。"
	body["metadata"] = map[string]interface{}{"reference_aliases": []string{"图片1"}}
	for _, duration := range []int{4, 15, 16, 30} {
		body["duration"] = duration
		c, info := moon25Context(t, body)
		adaptor := &TaskAdaptor{baseURL: "https://upstream.example.com"}
		if err := adaptor.ValidateRequestAndSetAction(c, info); err != nil {
			t.Fatal(err)
		}
		if ratios := adaptor.EstimateBilling(c, info); ratios["seconds"] != float64(duration) || ratios["size"] != 1 {
			t.Fatalf("wrong billing ratios: %#v", ratios)
		}
		reader, err := adaptor.BuildRequestBody(c, info)
		if err != nil {
			t.Fatal(err)
		}
		data, _ := io.ReadAll(reader)
		var got map[string]interface{}
		if err := json.Unmarshal(data, &got); err != nil {
			t.Fatal(err)
		}
		if got["model"] != moon25UpstreamModel || got["duration"] != float64(duration) || got["prompt"] != body["prompt"] || !reflect.DeepEqual(got["references"], refs) {
			t.Fatalf("outbound contract changed: %s", data)
		}
		if len(got) != 6 {
			t.Fatalf("unexpected outbound fields: %s", data)
		}
		url, _ := adaptor.BuildRequestURL(info)
		if url != "https://upstream.example.com/v1/videos" {
			t.Fatal(url)
		}
	}
}

func TestMoon25RejectsInvalidInputsBeforeBilling(t *testing.T) {
	cases := map[string]func(map[string]interface{}){
		"short":          func(b map[string]interface{}) { b["duration"] = 3 },
		"long":           func(b map[string]interface{}) { b["duration"] = 31 },
		"fraction":       func(b map[string]interface{}) { b["duration"] = 4.5 },
		"conflict":       func(b map[string]interface{}) { b["seconds"] = "4" },
		"resolution":     func(b map[string]interface{}) { b["resolution"] = "720P" },
		"ratio":          func(b map[string]interface{}) { b["ratio"] = "1:1" },
		"ratio conflict": func(b map[string]interface{}) { b["aspect_ratio"] = "9:16" },
		"prompt":         func(b map[string]interface{}) { b["prompt"] = strings.Repeat("字", 15001) },
		"audio": func(b map[string]interface{}) {
			b["references"].([]interface{})[0].(map[string]interface{})["media_type"] = "audio"
		},
		"frame": func(b map[string]interface{}) {
			b["references"].([]interface{})[0].(map[string]interface{})["role"] = "first_frame"
		},
		"bad url": func(b map[string]interface{}) {
			b["references"].([]interface{})[0].(map[string]interface{})["url"] = "file:///tmp/test"
		},
		"overflow":        func(b map[string]interface{}) { b["references"] = make([]interface{}, 31) },
		"alternate audio": func(b map[string]interface{}) { b["audio"] = "https://media.example.com/test.mp3" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			body := moon25Body()
			mutate(body)
			c, info := moon25Context(t, body)
			if err := (&TaskAdaptor{}).ValidateRequestAndSetAction(c, info); err == nil || err.Code != "invalid_request" {
				t.Fatalf("expected local rejection, got %#v", err)
			}
			if _, exists := c.Get("task_request"); exists {
				t.Fatal("invalid request reached billing")
			}
		})
	}
}
