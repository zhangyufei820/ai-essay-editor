package dto

import (
	"encoding/json"
	"errors"
	"net/url"
	"strconv"
	"strings"
)

const Seedream55Model = "doubao-seedream-5-5-261028"

type Seedream55LayerOptions struct {
	MaxImages       *int  `json:"max_images,omitempty"`
	TextRecognition *bool `json:"text_recognition,omitempty"`
}

// All prices below are in ten-thousandths of a yuan. The output tier is
// determined by the requested size and applies to every layer including the base.
const Seedream55InputRate = 420

type Seedream55Quote struct {
	InputCount int
	OutputCap  int
	OutputRate int
	Tier       string
}

func (q Seedream55Quote) TotalUnits(outputs int) int {
	if outputs <= 0 || outputs > q.OutputCap {
		return 0
	}
	return q.InputCount*Seedream55InputRate + outputs*q.OutputRate
}

func Seedream55QuoteForRequest(r *ImageRequest) (Seedream55Quote, error) {
	q := Seedream55Quote{OutputCap: 1, OutputRate: 1932, Tier: "high"}
	if r == nil || r.Model != Seedream55Model {
		return q, errors.New("请选择豆包绘图 5.5 模型")
	}
	if (r.Stream != nil && *r.Stream) || (r.N != nil && *r.N != 1) {
		return q, errors.New("普通生成每次出一张图，拆图数量请使用 max_images，两种模式均为非流式")
	}
	if r.Images != nil || r.Mask != nil || r.ExtraBody != nil || r.GenerationConfig != nil || r.Resolution != "" || r.ImageSize != "" || r.AspectRatio != "" {
		return q, errors.New("请使用 image 指定参考图、size 指定尺寸")
	}
	inputs, err := seedream55InputCount(r.Image)
	if err != nil {
		return q, err
	}
	q.InputCount = inputs
	if r.LayerDecomposition {
		if inputs != 1 || len(r.Background) != 0 {
			return q, errors.New("拆图时请上传一张原图，并省略背景参数")
		}
		q.OutputCap = 30
		if opts := r.LayerDecompositionOptions; opts != nil && opts.MaxImages != nil {
			q.OutputCap = *opts.MaxImages
		}
		if q.OutputCap < 2 || q.OutputCap > 100 {
			return q, errors.New("拆图上限必须为 2 到 100 张，含底图")
		}
	} else if strings.TrimSpace(r.Prompt) == "" || r.LayerDecompositionOptions != nil {
		return q, errors.New("普通生成或改图须填写提示词，拆图选项仅供拆图使用")
	}
	switch r.Size {
	case "1K", "1.5K":
		q.OutputRate, q.Tier = 1092, "low"
	case "", "2K":
	case "auto":
		if !r.LayerDecomposition {
			return q, errors.New("auto 尺寸仅适用于拆图")
		}
	default:
		width, height, ok := seedream55PixelSize(r.Size)
		if r.LayerDecomposition || !ok {
			return q, errors.New("请选择支持的尺寸；自定义宽高乘积须在 921600 到 4624220 之间，宽高比须在 1:16 到 16:1 之间")
		}
		if width*height <= 2610000 {
			q.OutputRate, q.Tier = 1092, "low"
		}
	}
	var format, background string
	if len(r.OutputFormat) != 0 && (json.Unmarshal(r.OutputFormat, &format) != nil || (format != "png" && format != "jpeg")) {
		return q, errors.New("图片文件格式请选择 png 或 jpeg")
	}
	if len(r.Background) != 0 && (json.Unmarshal(r.Background, &background) != nil || (background != "auto" && background != "opaque" && background != "transparent")) {
		return q, errors.New("请选择自动、实色或透明背景")
	}
	if background == "transparent" && format != "png" {
		return q, errors.New("透明背景须使用 png 格式")
	}
	if r.ResponseFormat != "" && r.ResponseFormat != "url" && r.ResponseFormat != "b64_json" {
		return q, errors.New("response_format 请选择 url 或 b64_json")
	}
	return q, nil
}

func seedream55PixelSize(size string) (int, int, bool) {
	w, h, ok := strings.Cut(size, "x")
	if !ok {
		return 0, 0, false
	}
	width, errW := strconv.ParseUint(w, 10, 24)
	height, errH := strconv.ParseUint(h, 10, 24)
	pixels := width * height
	ok = errW == nil && errH == nil && pixels >= 921600 && pixels <= 4624220 && width <= height*16 && height <= width*16
	return int(width), int(height), ok
}

func seedream55InputCount(raw json.RawMessage) (int, error) {
	if len(raw) == 0 {
		return 0, nil
	}
	var images []string
	if raw[0] == '"' {
		var one string
		if err := json.Unmarshal(raw, &one); err != nil {
			return 0, errors.New("参考图地址无效")
		}
		images = []string{one}
	} else if err := json.Unmarshal(raw, &images); err != nil || len(images) == 0 || len(images) > 10 {
		return 0, errors.New("image 须为图片地址或包含 1 到 10 张图片的数组")
	}
	for _, image := range images {
		if strings.HasPrefix(image, "data:image/") && strings.Contains(image, ";base64,") {
			continue
		}
		u, err := url.Parse(image)
		if err != nil || u.Hostname() == "" || (u.Scheme != "https" && u.Scheme != "http") {
			return 0, errors.New("参考图须为图片地址或图片 data URL")
		}
	}
	return len(images), nil
}
