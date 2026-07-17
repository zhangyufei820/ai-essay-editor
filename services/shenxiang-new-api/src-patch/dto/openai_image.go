package dto

import (
	"encoding/json"
	"reflect"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

// MaxImageN caps the image generation count. Without this bound a huge or
// malicious n value can multiply fixed-price image billing and stress upstreams.
const MaxImageN = 128

type ImageRequest struct {
	Model             string          `json:"model"`
	Prompt            string          `json:"prompt" binding:"required"`
	N                 *uint           `json:"n,omitempty"`
	Size              string          `json:"size,omitempty"`
	Quality           string          `json:"quality,omitempty"`
	AspectRatio       string          `json:"aspect_ratio,omitempty"`
	Resolution        string          `json:"resolution,omitempty"`
	ImageSize         string          `json:"image_size,omitempty"`
	ResponseFormat    string          `json:"response_format,omitempty"`
	ResponseFormatObj json.RawMessage `json:"responseFormat,omitempty"`
	GenerationConfig  json.RawMessage `json:"generationConfig,omitempty"`
	Style             json.RawMessage `json:"style,omitempty"`
	User              json.RawMessage `json:"user,omitempty"`
	ExtraFields       json.RawMessage `json:"extra_fields,omitempty"`
	Background        json.RawMessage `json:"background,omitempty"`
	Moderation        json.RawMessage `json:"moderation,omitempty"`
	OutputFormat      json.RawMessage `json:"output_format,omitempty"`
	OutputCompression json.RawMessage `json:"output_compression,omitempty"`
	PartialImages     json.RawMessage `json:"partial_images,omitempty"`
	ExtraBody         json.RawMessage `json:"extra_body,omitempty"`
	Stream            *bool           `json:"stream,omitempty"`
	Images            json.RawMessage `json:"images,omitempty"`
	Mask              json.RawMessage `json:"mask,omitempty"`
	InputFidelity     json.RawMessage `json:"input_fidelity,omitempty"`
	Watermark         *bool           `json:"watermark,omitempty"`
	// zhipu 4v
	WatermarkEnabled json.RawMessage `json:"watermark_enabled,omitempty"`
	UserId           json.RawMessage `json:"user_id,omitempty"`
	Image            json.RawMessage `json:"image,omitempty"`
	// 用匿名参数接收额外参数
	Extra map[string]json.RawMessage `json:"-"`
}

func (i *ImageRequest) UnmarshalJSON(data []byte) error {
	// 先解析成 map[string]interface{}
	var rawMap map[string]json.RawMessage
	if err := common.Unmarshal(data, &rawMap); err != nil {
		return err
	}

	// 用 struct tag 获取所有已定义字段名
	knownFields := GetJSONFieldNames(reflect.TypeOf(*i))

	// 再正常解析已定义字段
	type Alias ImageRequest
	var known Alias
	if err := common.Unmarshal(data, &known); err != nil {
		return err
	}
	*i = ImageRequest(known)

	// 提取多余字段
	i.Extra = make(map[string]json.RawMessage)
	for k, v := range rawMap {
		if _, ok := knownFields[k]; !ok {
			i.Extra[k] = v
		}
	}
	return nil
}

// 序列化时需要重新把字段平铺
func (r ImageRequest) MarshalJSON() ([]byte, error) {
	// 将已定义字段转为 map
	type Alias ImageRequest
	alias := Alias(r)
	base, err := common.Marshal(alias)
	if err != nil {
		return nil, err
	}

	var baseMap map[string]json.RawMessage
	if err := common.Unmarshal(base, &baseMap); err != nil {
		return nil, err
	}

	// 不能合并ExtraFields！！！！！！！！
	// 合并 ExtraFields
	//for k, v := range r.Extra {
	//	if _, exists := baseMap[k]; !exists {
	//		baseMap[k] = v
	//	}
	//}

	return common.Marshal(baseMap)
}

func GetJSONFieldNames(t reflect.Type) map[string]struct{} {
	fields := make(map[string]struct{})
	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)

		// 跳过匿名字段（例如 ExtraFields）
		if field.Anonymous {
			continue
		}

		tag := field.Tag.Get("json")
		if tag == "-" || tag == "" {
			continue
		}

		// 取逗号前字段名（排除 omitempty 等）
		name := tag
		if commaIdx := indexComma(tag); commaIdx != -1 {
			name = tag[:commaIdx]
		}
		fields[name] = struct{}{}
	}
	return fields
}

func indexComma(s string) int {
	for i := 0; i < len(s); i++ {
		if s[i] == ',' {
			return i
		}
	}
	return -1
}

func (i *ImageRequest) GetTokenCountMeta() *types.TokenCountMeta {
	var sizeRatio = 1.0
	var qualityRatio = 1.0
	var imagePriceCNY float64

	if strings.HasPrefix(i.Model, "dall-e") {
		// Size
		if i.Size == "256x256" {
			sizeRatio = 0.4
		} else if i.Size == "512x512" {
			sizeRatio = 0.45
		} else if i.Size == "1024x1024" {
			sizeRatio = 1
		} else if i.Size == "1024x1792" || i.Size == "1792x1024" {
			sizeRatio = 2
		}

		if i.Model == "dall-e-3" && i.Quality == "hd" {
			qualityRatio = 2.0
			if i.Size == "1024x1792" || i.Size == "1792x1024" {
				qualityRatio = 1.5
			}
		}
	}
	if priceCNY, ok := discountImage2PriceCNY(i); ok {
		imagePriceCNY = priceCNY
	} else if isStableImage2Model(i.Model) {
		imagePriceCNY = 0.135
	}

	// n is NOT included here; it is handled via OtherRatio("n") in
	// image_handler.go (default) or channel adaptors (actual count).
	// Including n here caused double-counting for channels that also
	// set OtherRatio("n") (e.g. Ali/Bailian).
	return &types.TokenCountMeta{
		CombineText:     i.Prompt,
		MaxTokens:       1584,
		ImagePriceRatio: sizeRatio * qualityRatio,
		ImagePriceCNY:   imagePriceCNY,
	}
}

func isStableImage2Model(model string) bool {
	trimmed := strings.TrimSpace(model)
	return strings.EqualFold(trimmed, "官转image 2稳定") ||
		strings.EqualFold(trimmed, "internal-image2-stable-v1")
}

func discountImage2PriceCNY(request *ImageRequest) (float64, bool) {
	if request == nil || !isDiscountImage2Model(request.Model) {
		return 0, false
	}
	switch discountImage2Resolution(request) {
	case "4K":
		return 0.10, true
	case "2K":
		return 0.06, true
	default:
		return 0.03, true
	}
}

func isDiscountImage2Model(model string) bool {
	trimmed := strings.TrimSpace(model)
	return strings.EqualFold(trimmed, "特价 image-2") ||
		strings.EqualFold(trimmed, "geek2api-image-2")
}

func discountImage2Resolution(request *ImageRequest) string {
	for _, value := range []string{
		request.Resolution,
		discountImage2ResolutionFromExtraBody(request.ExtraBody),
		request.ImageSize,
		request.Size,
	} {
		if resolution := normalizeDiscountImage2Resolution(value); resolution != "" {
			return resolution
		}
	}
	return "1K"
}

func discountImage2ResolutionFromExtraBody(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var payload struct {
		Google struct {
			ImageConfig struct {
				ImageSize string `json:"image_size"`
			} `json:"image_config"`
		} `json:"google"`
	}
	if err := common.Unmarshal(raw, &payload); err != nil {
		return ""
	}
	return strings.TrimSpace(payload.Google.ImageConfig.ImageSize)
}

func normalizeDiscountImage2Resolution(value string) string {
	normalized := strings.ToUpper(strings.TrimSpace(value))
	switch normalized {
	case "1K", "2K", "4K":
		return normalized
	case "", "AUTO", "CUSTOM":
		return ""
	}
	return discountImage2ResolutionFromPixelSize(normalized)
}

func discountImage2ResolutionFromPixelSize(value string) string {
	width, height, ok := parseDiscountImage2PixelSize(value)
	if !ok {
		return ""
	}
	maxSide := width
	if height > maxSide {
		maxSide = height
	}
	pixels := width * height
	if maxSide >= 2800 || pixels > 2048*2048 {
		return "4K"
	}
	if maxSide >= 1900 || pixels > 1536*1536 {
		return "2K"
	}
	return "1K"
}

func parseDiscountImage2PixelSize(value string) (int, int, bool) {
	compact := strings.ReplaceAll(strings.ToLower(strings.TrimSpace(value)), " ", "")
	parts := strings.Split(compact, "x")
	if len(parts) != 2 {
		return 0, 0, false
	}
	width, err := strconv.Atoi(parts[0])
	if err != nil || width <= 0 {
		return 0, 0, false
	}
	height, err := strconv.Atoi(parts[1])
	if err != nil || height <= 0 {
		return 0, 0, false
	}
	return width, height, true
}

func (i *ImageRequest) IsStream(c *gin.Context) bool {
	return i.Stream != nil && *i.Stream
}

func (i *ImageRequest) SetModelName(modelName string) {
	if modelName != "" {
		i.Model = modelName
	}
}

type ImageResponse struct {
	Data     []ImageData     `json:"data"`
	Created  int64           `json:"created"`
	Metadata json.RawMessage `json:"metadata,omitempty"`
}
type ImageData struct {
	Url           string `json:"url"`
	B64Json       string `json:"b64_json"`
	RevisedPrompt string `json:"revised_prompt"`
}
