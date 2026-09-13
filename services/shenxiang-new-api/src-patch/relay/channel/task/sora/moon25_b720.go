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

const moon25B720PublicModel = "moon-video-2.5-720p"
const moon25B720UpstreamModel = "moon-2.5-ac-b-720p"

func isMoon25B720VideoModel(name string) bool {
	name = strings.ToLower(strings.TrimSpace(name))
	return name == moon25B720PublicModel || name == moon25B720UpstreamModel
}

func validateMoon25B720VideoRequest(c *gin.Context, info *relaycommon.RelayInfo) *dto.TaskError {
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
	if !strings.EqualFold(trimmedString(body["resolution"]), "720P") {
		return localVideoValidationError("该模型仅支持 720P 输出。")
	}
	for _, key := range []string{
		"image", "images", "image_url", "video", "videos", "video_url", "audio", "audios", "audio_url",
		"content", "input_reference", "first_frame_url", "last_frame_url",
	} {
		if _, exists := body[key]; exists {
			return localVideoValidationError("该模型仅接受 references 数组中的图片、视频或音频参考。")
		}
	}
	if raw, exists := body["references"]; exists {
		refs, valid := raw.([]interface{})
		if !valid || len(refs) > 50 {
			return localVideoValidationError("references 必须为数组，最多 30 张图片、10 个视频和 10 个音频。")
		}
		aliases := map[string]bool{}
		counts := map[string]int{"image": 0, "video": 0, "audio": 0}
		limits := map[string]int{"image": 30, "video": 10, "audio": 10}
		for _, rawRef := range refs {
			ref, valid := rawRef.(map[string]interface{})
			if !valid {
				return localVideoValidationError("references 中的素材格式无效。")
			}
			mediaType := trimmedString(ref["media_type"])
			role := trimmedString(ref["role"])
			if limits[mediaType] == 0 || role != "reference_"+mediaType {
				return localVideoValidationError("参考素材必须使用 reference_image、reference_video 或 reference_audio。")
			}
			counts[mediaType]++
			if counts[mediaType] > limits[mediaType] {
				return localVideoValidationError("参考素材数量超过该模型限制：图片 30、视频 10、音频 10。")
			}
			parsed, err := url.Parse(trimmedString(ref["url"]))
			if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Hostname() == "" || parsed.User != nil {
				return localVideoValidationError("参考素材必须使用可访问的 HTTP(S) 地址。")
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
	size := "1280x720"
	if ratio == "9:16" {
		size = "720x1280"
	}
	info.Action = constant.TaskActionGenerate
	c.Set("task_request", relaycommon.TaskSubmitReq{
		Model: trimmedString(body["model"]), Prompt: prompt,
		Duration: duration, Seconds: strconv.Itoa(duration), Size: size,
		Metadata: map[string]interface{}{"resolution": "720P", "ratio": ratio},
	})
	return nil
}

func normalizeMoon25B720VideoRequestBody(body map[string]interface{}) map[string]interface{} {
	duration, _ := integerFromAny(body["duration"])
	result := map[string]interface{}{
		"model": moon25B720UpstreamModel, "prompt": trimmedString(body["prompt"]),
		"duration": duration, "resolution": "720P",
		"ratio": firstNonBlankAnyString(body["ratio"], body["aspect_ratio"]),
	}
	if refs, ok := body["references"].([]interface{}); ok && len(refs) > 0 {
		cleaned := make([]map[string]interface{}, 0, len(refs))
		for _, raw := range refs {
			ref := mapFromAny(raw)
			item := map[string]interface{}{
				"media_type": trimmedString(ref["media_type"]),
				"role":       trimmedString(ref["role"]),
				"url":        trimmedString(ref["url"]),
			}
			if alias := trimmedString(ref["alias"]); alias != "" {
				item["alias"] = alias
			}
			cleaned = append(cleaned, item)
		}
		result["references"] = cleaned
	}
	return result
}
