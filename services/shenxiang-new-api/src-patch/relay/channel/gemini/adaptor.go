package gemini

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	appconstant "github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/relayconvert"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/QuantumNous/new-api/setting/reasoning"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

type Adaptor struct {
}

func (a *Adaptor) ConvertGeminiRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeminiChatRequest) (any, error) {
	if len(request.Contents) > 0 {
		for i, content := range request.Contents {
			if i == 0 {
				if request.Contents[0].Role == "" {
					request.Contents[0].Role = "user"
				}
			}
			for _, part := range content.Parts {
				if part.FileData != nil {
					if part.FileData.MimeType == "" && strings.Contains(part.FileData.FileUri, "www.youtube.com") {
						part.FileData.MimeType = "video/webm"
					}
				}
			}
		}
	}
	return request, nil
}

func (a *Adaptor) ConvertClaudeRequest(c *gin.Context, info *relaycommon.RelayInfo, req *dto.ClaudeRequest) (any, error) {
	adaptor := openai.Adaptor{}
	oaiReq, err := adaptor.ConvertClaudeRequest(c, info, req)
	if err != nil {
		return nil, err
	}
	return a.ConvertOpenAIRequest(c, info, oaiReq.(*dto.GeneralOpenAIRequest))
}

func (a *Adaptor) ConvertAudioRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.AudioRequest) (io.Reader, error) {
	//TODO implement me
	return nil, errors.New("not implemented")
}

func (a *Adaptor) ConvertImageRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.ImageRequest) (any, error) {
	if strings.HasPrefix(info.UpstreamModelName, "imagen") {
		return convertImagenImageRequest(request), nil
	}

	if !isGeminiNativeImageModel(info.UpstreamModelName) {
		return nil, errors.New("not supported model for image generation, only imagen and gemini image-preview models are supported")
	}

	return convertGeminiImagePreviewRequest(c, request)
}

func convertImagenImageRequest(request dto.ImageRequest) dto.GeminiImageRequest {
	// convert size to aspect ratio but allow user to specify aspect ratio
	aspectRatio := "1:1" // default aspect ratio
	size := strings.TrimSpace(request.Size)
	if size != "" {
		if strings.Contains(size, ":") {
			aspectRatio = size
		} else {
			switch size {
			case "256x256", "512x512", "1024x1024":
				aspectRatio = "1:1"
			case "1536x1024":
				aspectRatio = "3:2"
			case "1024x1536":
				aspectRatio = "2:3"
			case "1024x1792":
				aspectRatio = "9:16"
			case "1792x1024":
				aspectRatio = "16:9"
			}
		}
	}

	// build gemini imagen request
	geminiRequest := dto.GeminiImageRequest{
		Instances: []dto.GeminiImageInstance{
			{
				Prompt: request.Prompt,
			},
		},
		Parameters: dto.GeminiImageParameters{
			SampleCount:      int(lo.FromPtrOr(request.N, uint(1))),
			AspectRatio:      aspectRatio,
			PersonGeneration: "allow_adult", // default allow adult
		},
	}

	// Set imageSize when quality parameter is specified
	// Map quality parameter to imageSize (only supported by Standard and Ultra models)
	// quality values: auto, high, medium, low (for gpt-image-1), hd, standard (for dall-e-3)
	// imageSize values: 1K (default), 2K
	// https://ai.google.dev/gemini-api/docs/imagen
	// https://platform.openai.com/docs/api-reference/images/create
	if request.Quality != "" {
		imageSize := "1K" // default
		switch request.Quality {
		case "hd", "high":
			imageSize = "2K"
		case "2K":
			imageSize = "2K"
		case "standard", "medium", "low", "auto", "1K":
			imageSize = "1K"
		default:
			// unknown quality value, default to 1K
			imageSize = "1K"
		}
		geminiRequest.Parameters.ImageSize = imageSize
	}

	return geminiRequest
}

func convertGeminiImagePreviewRequest(c *gin.Context, request dto.ImageRequest) (*dto.GeminiChatRequest, error) {
	parts := make([]dto.GeminiPart, 0, 2)
	if prompt := strings.TrimSpace(request.Prompt); prompt != "" {
		parts = append(parts, dto.GeminiPart{Text: prompt})
	}

	imageParts, err := geminiImagePreviewParts(c, request)
	if err != nil {
		return nil, err
	}
	parts = append(parts, imageParts...)
	if len(parts) == 0 {
		return nil, errors.New("prompt or image is required")
	}

	geminiRequest := &dto.GeminiChatRequest{
		Contents: []dto.GeminiChatContent{
			{
				Role:  "user",
				Parts: parts,
			},
		},
		GenerationConfig: dto.GeminiChatGenerationConfig{
			ResponseModalities: []string{"TEXT", "IMAGE"},
		},
	}
	if request.N != nil && *request.N > 1 {
		count := int(*request.N)
		geminiRequest.GenerationConfig.CandidateCount = &count
	}
	if imageConfig, err := geminiImagePreviewConfig(request); err != nil {
		return nil, err
	} else if len(imageConfig) > 0 {
		geminiRequest.GenerationConfig.ImageConfig = imageConfig
	}

	safetySettings := make([]dto.GeminiChatSafetySettings, 0, len(SafetySettingList))
	for _, category := range SafetySettingList {
		safetySettings = append(safetySettings, dto.GeminiChatSafetySettings{
			Category:  category,
			Threshold: model_setting.GetGeminiSafetySetting(category),
		})
	}
	geminiRequest.SafetySettings = safetySettings

	return geminiRequest, nil
}

func geminiImagePreviewParts(c *gin.Context, request dto.ImageRequest) ([]dto.GeminiPart, error) {
	parts := make([]dto.GeminiPart, 0)

	var err error
	parts, err = appendGeminiImagePreviewRawParts(c, parts, request.Image)
	if err != nil {
		return nil, err
	}
	parts, err = appendGeminiImagePreviewRawParts(c, parts, request.Images)
	if err != nil {
		return nil, err
	}

	if c == nil || c.Request == nil || !strings.Contains(c.Request.Header.Get("Content-Type"), gin.MIMEMultipartPOSTForm) {
		return parts, nil
	}

	form, err := common.ParseMultipartFormReusable(c)
	if err != nil {
		return nil, err
	}
	defer form.RemoveAll()

	for _, key := range []string{"image", "image[]", "images", "images[]"} {
		for _, fileHeader := range form.File[key] {
			part, err := geminiImagePreviewPartFromMultipart(fileHeader)
			if err != nil {
				return nil, err
			}
			parts = append(parts, part)
		}
		for _, value := range form.Value[key] {
			if strings.TrimSpace(value) == "" {
				continue
			}
			part, err := geminiImagePreviewPartFromSource(c, value)
			if err != nil {
				return nil, err
			}
			parts = append(parts, part)
		}
	}

	return parts, nil
}

func appendGeminiImagePreviewRawParts(c *gin.Context, parts []dto.GeminiPart, raw []byte) ([]dto.GeminiPart, error) {
	if len(raw) == 0 {
		return parts, nil
	}

	var single string
	if err := common.Unmarshal(raw, &single); err == nil && strings.TrimSpace(single) != "" {
		part, err := geminiImagePreviewPartFromSource(c, single)
		if err != nil {
			return nil, err
		}
		return append(parts, part), nil
	}

	var values []string
	if err := common.Unmarshal(raw, &values); err != nil {
		return parts, nil
	}
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			continue
		}
		part, err := geminiImagePreviewPartFromSource(c, value)
		if err != nil {
			return nil, err
		}
		parts = append(parts, part)
	}
	return parts, nil
}

func geminiImagePreviewPartFromMultipart(fileHeader *multipart.FileHeader) (dto.GeminiPart, error) {
	file, err := fileHeader.Open()
	if err != nil {
		return dto.GeminiPart{}, err
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return dto.GeminiPart{}, err
	}
	if len(data) == 0 {
		return dto.GeminiPart{}, errors.New("image file is empty")
	}

	mimeType := strings.ToLower(strings.TrimSpace(fileHeader.Header.Get("Content-Type")))
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = strings.ToLower(http.DetectContentType(data))
	}
	if !geminiSupportedMimeTypes[mimeType] {
		return dto.GeminiPart{}, fmt.Errorf("mime type is not supported by Gemini: '%s'", mimeType)
	}

	return dto.GeminiPart{
		InlineData: &dto.GeminiInlineData{
			MimeType: mimeType,
			Data:     base64.StdEncoding.EncodeToString(data),
		},
	}, nil
}

func geminiImagePreviewPartFromSource(c *gin.Context, value string) (dto.GeminiPart, error) {
	base64Data, mimeType, err := service.GetBase64Data(c, types.NewFileSourceFromData(value, ""), "formatting image for Gemini image request")
	if err != nil {
		return dto.GeminiPart{}, err
	}
	mimeType = strings.ToLower(strings.TrimSpace(mimeType))
	if !geminiSupportedMimeTypes[mimeType] {
		return dto.GeminiPart{}, fmt.Errorf("mime type is not supported by Gemini: '%s'", mimeType)
	}
	return dto.GeminiPart{
		InlineData: &dto.GeminiInlineData{
			MimeType: mimeType,
			Data:     base64Data,
		},
	}, nil
}

func geminiImagePreviewConfig(request dto.ImageRequest) ([]byte, error) {
	imageConfig := make(map[string]interface{})
	if aspectRatio := geminiImagePreviewAspectRatio(request); aspectRatio != "" {
		imageConfig["aspectRatio"] = aspectRatio
	}
	if imageSize := geminiImagePreviewImageSize(request); imageSize != "" {
		imageConfig["imageSize"] = imageSize
	}
	if len(imageConfig) == 0 {
		return nil, nil
	}
	return common.Marshal(imageConfig)
}

func geminiImagePreviewAspectRatio(request dto.ImageRequest) string {
	if aspectRatio := strings.TrimSpace(request.AspectRatio); aspectRatio != "" && aspectRatio != "auto" {
		return aspectRatio
	}
	size := strings.TrimSpace(request.Size)
	if strings.Contains(size, ":") {
		return size
	}
	switch size {
	case "256x256", "512x512", "1024x1024", "2048x2048":
		return "1:1"
	case "1536x1024":
		return "3:2"
	case "1024x1536":
		return "2:3"
	case "1024x1792":
		return "9:16"
	case "1792x1024":
		return "16:9"
	}
	return ""
}

func geminiImagePreviewImageSize(request dto.ImageRequest) string {
	for _, value := range []string{
		request.ImageSize,
		request.Resolution,
		geminiImagePreviewNestedString(request.ExtraBody, []string{"google", "image_config", "image_size"}),
		geminiImagePreviewNestedString(request.GenerationConfig, []string{"imageConfig", "imageSize"}),
		geminiImagePreviewNestedString(request.GenerationConfig, []string{"responseFormat", "image", "imageSize"}),
		geminiImagePreviewNestedString(request.ResponseFormatObj, []string{"image", "imageSize"}),
	} {
		normalized := strings.ToUpper(strings.TrimSpace(value))
		if normalized != "" && normalized != "AUTO" {
			return normalized
		}
	}

	size := strings.ToLower(strings.TrimSpace(request.Size))
	switch {
	case strings.Contains(size, "4096") || strings.Contains(size, "3840") || strings.Contains(size, "3808"):
		return "4K"
	case strings.Contains(size, "2048") || strings.Contains(size, "2160"):
		return "2K"
	case strings.Contains(size, "1024"):
		return "1K"
	}
	return ""
}

func geminiImagePreviewNestedString(raw []byte, path []string) string {
	if len(raw) == 0 || len(path) == 0 {
		return ""
	}
	var payload map[string]interface{}
	if err := common.Unmarshal(raw, &payload); err != nil {
		return ""
	}
	var current interface{} = payload
	for _, key := range path {
		nested, ok := current.(map[string]interface{})
		if !ok {
			return ""
		}
		current = nested[key]
	}
	value, ok := current.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func (a *Adaptor) Init(info *relaycommon.RelayInfo) {

}

func (a *Adaptor) GetRequestURL(info *relaycommon.RelayInfo) (string, error) {

	if model_setting.GetGeminiSettings().ThinkingAdapterEnabled &&
		!model_setting.ShouldPreserveThinkingSuffix(info.OriginModelName) {
		// 新增逻辑：处理 -thinking-<budget> 格式
		if strings.Contains(info.UpstreamModelName, "-thinking-") {
			parts := strings.Split(info.UpstreamModelName, "-thinking-")
			info.UpstreamModelName = parts[0]
		} else if strings.HasSuffix(info.UpstreamModelName, "-thinking") { // 旧的适配
			info.UpstreamModelName = strings.TrimSuffix(info.UpstreamModelName, "-thinking")
		} else if strings.HasSuffix(info.UpstreamModelName, "-nothinking") {
			info.UpstreamModelName = strings.TrimSuffix(info.UpstreamModelName, "-nothinking")
		} else if baseModel, level, ok := reasoning.TrimEffortSuffix(info.UpstreamModelName); ok && level != "" {
			info.UpstreamModelName = baseModel
		}
	}

	version := model_setting.GetGeminiVersionSetting(info.UpstreamModelName)

	if strings.HasPrefix(info.UpstreamModelName, "imagen") {
		return fmt.Sprintf("%s/%s/models/%s:predict", info.ChannelBaseUrl, version, info.UpstreamModelName), nil
	}

	if strings.HasPrefix(info.UpstreamModelName, "text-embedding") ||
		strings.HasPrefix(info.UpstreamModelName, "embedding") ||
		strings.HasPrefix(info.UpstreamModelName, "gemini-embedding") {
		action := "embedContent"
		if info.IsGeminiBatchEmbedding {
			action = "batchEmbedContents"
		}
		return fmt.Sprintf("%s/%s/models/%s:%s", info.ChannelBaseUrl, version, info.UpstreamModelName, action), nil
	}

	action := "generateContent"
	if info.IsStream {
		action = "streamGenerateContent?alt=sse"
		if info.RelayMode == constant.RelayModeGemini {
			info.DisablePing = true
		}
	}
	return fmt.Sprintf("%s/%s/models/%s:%s", info.ChannelBaseUrl, version, info.UpstreamModelName, action), nil
}

func (a *Adaptor) SetupRequestHeader(c *gin.Context, req *http.Header, info *relaycommon.RelayInfo) error {
	channel.SetupApiRequestHeader(info, c, req)
	if strings.HasPrefix(info.UpstreamModelName, "imagen") ||
		(isGeminiImageRelay(info) && isGeminiNativeImageModel(info.UpstreamModelName)) {
		req.Set("Content-Type", "application/json")
	}
	if info.ChannelType == appconstant.ChannelTypeOpenAI {
		req.Set("Authorization", "Bearer "+info.ApiKey)
		return nil
	}
	req.Set("x-goog-api-key", info.ApiKey)
	return nil
}

func (a *Adaptor) ConvertOpenAIRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) (any, error) {
	if request == nil {
		return nil, errors.New("request is nil")
	}

	geminiRequest, err := CovertOpenAI2Gemini(c, *request, info)
	if err != nil {
		return nil, err
	}

	return geminiRequest, nil
}

func (a *Adaptor) ConvertRerankRequest(c *gin.Context, relayMode int, request dto.RerankRequest) (any, error) {
	return nil, nil
}

func (a *Adaptor) ConvertEmbeddingRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.EmbeddingRequest) (any, error) {
	if request.Input == nil {
		return nil, errors.New("input is required")
	}

	inputs := request.ParseInput()
	if len(inputs) == 0 {
		return nil, errors.New("input is empty")
	}
	// We always build a batch-style payload with `requests`, so ensure we call the
	// batch endpoint upstream to avoid payload/endpoint mismatches.
	info.IsGeminiBatchEmbedding = true
	// process all inputs
	geminiRequests := make([]map[string]interface{}, 0, len(inputs))
	for _, input := range inputs {
		geminiRequest := map[string]interface{}{
			"model": fmt.Sprintf("models/%s", info.UpstreamModelName),
			"content": dto.GeminiChatContent{
				Parts: []dto.GeminiPart{
					{
						Text: input,
					},
				},
			},
		}

		// set specific parameters for different models
		// https://ai.google.dev/api/embeddings?hl=zh-cn#method:-models.embedcontent
		switch info.UpstreamModelName {
		case "text-embedding-004", "gemini-embedding-exp-03-07", "gemini-embedding-001":
			// Only newer models introduced after 2024 support OutputDimensionality
			dimensions := lo.FromPtrOr(request.Dimensions, 0)
			if dimensions > 0 {
				geminiRequest["outputDimensionality"] = dimensions
			}
		}
		geminiRequests = append(geminiRequests, geminiRequest)
	}

	return map[string]interface{}{
		"requests": geminiRequests,
	}, nil
}

func (a *Adaptor) ConvertOpenAIResponsesRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.OpenAIResponsesRequest) (any, error) {
	result, err := relayconvert.ConvertRequest(c, info, types.RelayFormatGemini, &request)
	if err != nil {
		return nil, err
	}
	geminiRequest, ok := result.Value.(*dto.GeminiChatRequest)
	if !ok {
		return nil, fmt.Errorf("expected Gemini generateContent request, got %T", result.Value)
	}
	return geminiRequest, nil
}

func (a *Adaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (any, error) {
	return channel.DoApiRequest(a, c, info, requestBody)
}

func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (usage any, err *types.NewAPIError) {
	if info.RelayMode == constant.RelayModeResponses {
		if info.IsStream {
			return GeminiResponsesStreamHandler(c, info, resp)
		}
		return GeminiResponsesHandler(c, info, resp)
	}

	if info.RelayMode == constant.RelayModeGemini {
		if strings.Contains(info.RequestURLPath, ":embedContent") ||
			strings.Contains(info.RequestURLPath, ":batchEmbedContents") {
			return NativeGeminiEmbeddingHandler(c, resp, info)
		}
		if info.IsStream {
			return GeminiTextGenerationStreamHandler(c, info, resp)
		} else {
			return GeminiTextGenerationHandler(c, info, resp)
		}
	}

	if strings.HasPrefix(info.UpstreamModelName, "imagen") ||
		(isGeminiImageRelay(info) && isGeminiNativeImageModel(info.UpstreamModelName)) {
		return GeminiImageHandler(c, info, resp)
	}

	// check if the model is an embedding model
	if strings.HasPrefix(info.UpstreamModelName, "text-embedding") ||
		strings.HasPrefix(info.UpstreamModelName, "embedding") ||
		strings.HasPrefix(info.UpstreamModelName, "gemini-embedding") {
		return GeminiEmbeddingHandler(c, info, resp)
	}

	if info.IsStream {
		return GeminiChatStreamHandler(c, info, resp)
	} else {
		return GeminiChatHandler(c, info, resp)
	}

}

func (a *Adaptor) GetModelList() []string {
	return ModelList
}

func (a *Adaptor) GetChannelName() string {
	return ChannelName
}

func isGeminiImageRelay(info *relaycommon.RelayInfo) bool {
	if info == nil {
		return false
	}
	return info.RelayMode == constant.RelayModeImagesGenerations ||
		info.RelayMode == constant.RelayModeImagesEdits
}

func isGeminiNativeImageModel(modelName string) bool {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return false
	}
	if model_setting.IsGeminiModelSupportImagine(modelName) {
		return true
	}
	lowerName := strings.ToLower(modelName)
	return (strings.HasPrefix(lowerName, "gemini-") && strings.Contains(lowerName, "image-preview")) ||
		strings.HasPrefix(lowerName, "nano-banana-")
}
