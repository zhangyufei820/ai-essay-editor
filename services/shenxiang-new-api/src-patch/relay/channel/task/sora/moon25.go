package sora

import (
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
)

const moon25PublicModel = "moon-video-2.5-480p"
const moon25UpstreamModel = "moon-2.5-ac-a-480p"

func isMoon25VideoModel(name string) bool {
	name = strings.ToLower(strings.TrimSpace(name))
	return name == moon25PublicModel || name == moon25UpstreamModel
}

func validateMoon25VideoRequest(c *gin.Context, info *relaycommon.RelayInfo) *dto.TaskError {
	if !strings.HasPrefix(strings.ToLower(c.GetHeader("Content-Type")), "application/json") {
		return localVideoValidationError("视频请求必须使用 application/json。")
	}
	var body map[string]interface{}
	if err := common.UnmarshalBodyReusable(c, &body); err != nil {
		return localVideoValidationError("视频请求格式无效。")
	}
	prompt := trimmedString(body["prompt"])
	if prompt == "" || utf8.RuneCountInString(prompt) > 15000 {
		return localVideoValidationError("提示词必须为 1-15000 字。")
	}
	duration, ok := integerFromAny(body["duration"])
	if !ok || duration < 4 || duration > 30 {
		return localVideoValidationError("视频时长必须为 4-30 秒整数。")
	}
	if seconds, exists := body["seconds"]; exists {
		value, valid := integerFromAny(seconds)
		if !valid || value != duration {
			return localVideoValidationError("duration 与 seconds 必须一致。")
		}
	}
	ratio := firstNonBlankAnyString(body["ratio"], body["aspect_ratio"])
	if ratio != "16:9" && ratio != "9:16" {
		return localVideoValidationError("画面比例仅支持 16:9 或 9:16。")
	}
	if other := trimmedString(body["aspect_ratio"]); other != "" && other != ratio {
		return localVideoValidationError("ratio 与 aspect_ratio 必须一致。")
	}
	if !strings.EqualFold(trimmedString(body["resolution"]), "480P") {
		return localVideoValidationError("该模型仅支持 480P 输出。")
	}
	// Reject alternate media fields so unsupported inputs cannot be silently dropped.
	for _, key := range []string{"image", "images", "image_url", "video", "videos", "video_url", "audio", "audios", "audio_url", "content", "input_reference", "first_frame_url", "last_frame_url"} {
		if _, exists := body[key]; exists {
			return localVideoValidationError("该模型仅接受 references 数组中的图片参考。")
		}
	}
	if raw, exists := body["references"]; exists {
		refs, valid := raw.([]interface{})
		if !valid || len(refs) > 30 {
			return localVideoValidationError("references 必须为数组，最多 30 张参考图。")
		}
		aliases := map[string]bool{}
		for _, rawRef := range refs {
			ref, valid := rawRef.(map[string]interface{})
			if !valid || trimmedString(ref["media_type"]) != "image" || trimmedString(ref["role"]) != "reference_image" {
				return localVideoValidationError("仅支持 reference_image 图片参考，音频、视频及首尾帧暂不可用。")
			}
			parsed, err := url.Parse(trimmedString(ref["url"]))
			if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Hostname() == "" || parsed.User != nil {
				return localVideoValidationError("参考图片必须使用可访问的 HTTP(S) 地址。")
			}
			alias := trimmedString(ref["alias"])
			if strings.Contains(alias, "@") || (alias != "" && aliases[alias]) {
				return localVideoValidationError("素材别名必须唯一且不包含 @。")
			}
			if alias != "" {
				aliases[alias] = true
			}
		}
	}
	size := "854x480"
	if ratio == "9:16" {
		size = "480x854"
	}
	info.Action = constant.TaskActionGenerate
	c.Set("task_request", relaycommon.TaskSubmitReq{
		Model: trimmedString(body["model"]), Prompt: prompt,
		Duration: duration, Seconds: strconv.Itoa(duration), Size: size,
		Metadata: map[string]interface{}{"resolution": "480P", "ratio": ratio},
	})
	return nil
}

func normalizeMoon25VideoRequestBody(body map[string]interface{}) map[string]interface{} {
	duration, _ := integerFromAny(body["duration"])
	result := map[string]interface{}{
		"model": moon25UpstreamModel, "prompt": trimmedString(body["prompt"]),
		"duration": duration, "resolution": "480P",
		"ratio": firstNonBlankAnyString(body["ratio"], body["aspect_ratio"]),
	}
	if refs, ok := body["references"].([]interface{}); ok && len(refs) > 0 {
		cleaned := make([]map[string]interface{}, 0, len(refs))
		for _, raw := range refs {
			ref := mapFromAny(raw)
			item := map[string]interface{}{"media_type": "image", "role": "reference_image", "url": trimmedString(ref["url"])}
			if alias := trimmedString(ref["alias"]); alias != "" {
				item["alias"] = alias
			}
			cleaned = append(cleaned, item)
		}
		result["references"] = cleaned
	}
	return result
}
