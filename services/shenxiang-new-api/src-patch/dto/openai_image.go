package dto

import (
	"encoding/json"
	"fmt"
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
		return 0.09, true
	default:
		return 0.06, true
	}
}

func isDiscountImage2Model(model string) bool {
	trimmed := strings.TrimSpace(model)
	return strings.EqualFold(trimmed, "特价 image-2") ||
		strings.EqualFold(trimmed, "internal-image2-discount-v2")
}

var discountImage2VerifiedSizes = map[string]map[string]string{
	"1K": {
		"1:1":  "1024x1024",
		"1:3":  "512x1536",
		"3:1":  "1536x512",
		"2:3":  "1024x1536",
		"3:2":  "1536x1024",
		"3:4":  "1008x1344",
		"4:3":  "1344x1008",
		"4:5":  "1024x1280",
		"5:4":  "1280x1024",
		"9:16": "864x1536",
		"16:9": "1536x864",
		"9:21": "672x1568",
		"21:9": "1568x672",
	},
	"2K": {
		"1:1":  "2048x2048",
		"1:3":  "688x2064",
		"3:1":  "2064x688",
		"2:3":  "1376x2064",
		"3:2":  "2064x1376",
		"3:4":  "1536x2048",
		"4:3":  "2048x1536",
		"4:5":  "1664x2080",
		"5:4":  "2080x1664",
		"9:16": "1152x2048",
		"16:9": "2048x1152",
		"9:21": "912x2128",
		"21:9": "2128x912",
	},
	"4K": {
		"1:1":  "2880x2880",
		"1:3":  "1280x3840",
		"3:1":  "3840x1280",
		"2:3":  "2176x3264",
		"3:2":  "3264x2176",
		"3:4":  "2160x2880",
		"4:3":  "2880x2160",
		"4:5":  "2304x2880",
		"5:4":  "2880x2304",
		"9:16": "2160x3840",
		"16:9": "3840x2160",
		"9:21": "1632x3808",
		"21:9": "3808x1632",
	},
}

func NormalizeDiscountImage2GenerationRequest(request *ImageRequest) error {
	if request == nil || !isDiscountImage2Model(request.Model) {
		return nil
	}
	if request.N != nil && *request.N != 1 {
		return fmt.Errorf("特价 image-2 的 n 仅支持 1")
	}
	if request.N == nil {
		request.N = common.GetPointer(uint(1))
	}
	if quality := strings.TrimSpace(request.Quality); quality != "" && !strings.EqualFold(quality, "high") {
		return fmt.Errorf("特价 image-2 的 quality 仅支持 high")
	}
	request.Quality = "high"
	aspectRatio := discountImage2VerifiedAspectRatio(request.AspectRatio)
	if strings.TrimSpace(request.AspectRatio) != "" && aspectRatio == "" {
		return fmt.Errorf("特价 image-2 的 aspect_ratio 不受支持")
	}
	if request.Stream != nil && *request.Stream {
		return fmt.Errorf("特价 image-2 不支持流式输出")
	}
	if len(request.Images) > 0 || len(request.Image) > 0 || len(request.Mask) > 0 || len(request.InputFidelity) > 0 {
		return fmt.Errorf("特价 image-2 仅支持文生图")
	}
	if len(request.ResponseFormatObj) > 0 || len(request.GenerationConfig) > 0 || len(request.ExtraBody) > 0 {
		return fmt.Errorf("特价 image-2 不支持扩展图像配置")
	}
	if request.ResponseFormat != "" || len(request.Style) > 0 || len(request.User) > 0 || len(request.ExtraFields) > 0 ||
		len(request.Background) > 0 || len(request.Moderation) > 0 || len(request.OutputCompression) > 0 || len(request.PartialImages) > 0 ||
		request.Watermark != nil || len(request.WatermarkEnabled) > 0 || len(request.UserId) > 0 {
		return fmt.Errorf("特价 image-2 不支持额外输出参数")
	}
	if len(request.OutputFormat) > 0 {
		var outputFormat string
		if err := common.Unmarshal(request.OutputFormat, &outputFormat); err != nil || !strings.EqualFold(strings.TrimSpace(outputFormat), "png") {
			return fmt.Errorf("特价 image-2 的 output_format 仅支持 png")
		}
	}
	request.OutputFormat = json.RawMessage(`"png"`)

	resolution := discountImage2VerifiedResolutionLabel(request.Resolution)
	if strings.TrimSpace(request.Resolution) != "" && resolution == "" {
		return fmt.Errorf("特价 image-2 的 resolution 仅支持 1K、2K 或 4K")
	}
	sizeResolution, sizeAspectRatio, normalizedSize := discountImage2VerifiedPixelSpec(request.Size)
	if strings.TrimSpace(request.Size) != "" && sizeResolution == "" {
		return fmt.Errorf("特价 image-2 的 size 不受支持")
	}
	imageSizeResolution := discountImage2VerifiedResolutionLabel(request.ImageSize)
	if strings.TrimSpace(request.ImageSize) != "" && imageSizeResolution == "" {
		return fmt.Errorf("特价 image-2 的 image_size 不受支持")
	}
	for _, candidate := range []string{sizeResolution, imageSizeResolution} {
		if candidate == "" {
			continue
		}
		if resolution == "" {
			resolution = candidate
			continue
		}
		if candidate != resolution {
			return fmt.Errorf("特价 image-2 的尺寸参数不一致")
		}
	}
	if resolution == "" {
		resolution = "1K"
	}
	if aspectRatio == "" {
		aspectRatio = sizeAspectRatio
	}
	if aspectRatio == "" {
		aspectRatio = "1:1"
	}
	if sizeAspectRatio != "" && sizeAspectRatio != aspectRatio {
		return fmt.Errorf("特价 image-2 的尺寸比例参数不一致")
	}
	if normalizedSize == "" {
		normalizedSize = discountImage2VerifiedSizes[resolution][aspectRatio]
	}
	if normalizedSize == "" {
		return fmt.Errorf("特价 image-2 的尺寸组合不受支持")
	}
	request.Resolution = resolution
	request.AspectRatio = ""
	request.ImageSize = ""
	request.Size = normalizedSize
	return nil
}

func discountImage2VerifiedResolutionLabel(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "1K":
		return "1K"
	case "2K":
		return "2K"
	case "4K":
		return "4K"
	default:
		return ""
	}
}

func discountImage2VerifiedPixelResolution(value string) string {
	resolution, _, _ := discountImage2VerifiedPixelSpec(value)
	return resolution
}

func discountImage2VerifiedAspectRatio(value string) string {
	normalized := strings.TrimSpace(value)
	for aspectRatio := range discountImage2VerifiedSizes["1K"] {
		if normalized == aspectRatio {
			return aspectRatio
		}
	}
	return ""
}

func discountImage2VerifiedPixelSpec(value string) (string, string, string) {
	normalized := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(value), " ", ""))
	for resolution, sizes := range discountImage2VerifiedSizes {
		for aspectRatio, size := range sizes {
			if normalized == size {
				return resolution, aspectRatio, size
			}
		}
	}
	return "", "", ""
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
