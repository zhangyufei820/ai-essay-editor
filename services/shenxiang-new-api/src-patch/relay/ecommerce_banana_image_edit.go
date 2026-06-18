package relay

import (
	"encoding/base64"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

const ecommerceBanana2EditInstruction = "Edit the uploaded reference image(s) according to the prompt. Return the final edited image as a data:image/png;base64 data URL only."

var imageDataURLPattern = regexp.MustCompile(`data:image/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\r\n]+`)

func ShouldHandleEcommerceBanana2ImageEdit(c *gin.Context, info *relaycommon.RelayInfo) bool {
	if info == nil || info.RelayMode != relayconstant.RelayModeImagesEdits || !service.IsEcommerceBanana2Model(info.OriginModelName) {
		return false
	}
	if c == nil || c.Request == nil {
		return false
	}
	return strings.Contains(c.Request.Header.Get("Content-Type"), "multipart/form-data")
}

func EcommerceBanana2ImageEditViaChat(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	info.InitChannelMeta(c)

	imageReq, ok := info.Request.(*dto.ImageRequest)
	if !ok {
		return types.NewErrorWithStatusCode(fmt.Errorf("invalid request type, expected dto.ImageRequest, got %T", info.Request), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	request, err := common.DeepCopy(imageReq)
	if err != nil {
		return types.NewError(fmt.Errorf("failed to copy request to ImageRequest: %w", err), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}
	if err := helper.ModelMappedHelper(c, info, request); err != nil {
		return types.NewError(err, types.ErrorCodeChannelModelMappedError, types.ErrOptionWithSkipRetry())
	}
	if request.Prompt == "" {
		return types.NewErrorWithStatusCode(fmt.Errorf("prompt is required"), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}

	imageURLs, err := ecommerceBanana2MultipartImages(c, 10)
	if err != nil {
		return types.NewErrorWithStatusCode(err, types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	chatReq := ecommerceBanana2ChatEditRequest(info.UpstreamModelName, request.Prompt, imageURLs)
	jsonData, err := common.Marshal(chatReq)
	if err != nil {
		return types.NewError(err, types.ErrorCodeJsonMarshalFailed, types.ErrOptionWithSkipRetry())
	}
	body, size, closer, err := relaycommon.NewOutboundJSONBody(jsonData)
	if err != nil {
		return types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
	}
	defer closer.Close()

	savedRelayMode := info.RelayMode
	savedRequestURLPath := info.RequestURLPath
	savedIsStream := info.IsStream
	savedContentType := c.Request.Header.Get("Content-Type")
	savedAccept := c.Request.Header.Get("Accept")
	defer func() {
		info.RelayMode = savedRelayMode
		info.RequestURLPath = savedRequestURLPath
		info.IsStream = savedIsStream
		c.Request.Header.Set("Content-Type", savedContentType)
		c.Request.Header.Set("Accept", savedAccept)
	}()
	info.RelayMode = relayconstant.RelayModeChatCompletions
	info.RequestURLPath = "/v1/chat/completions"
	info.IsStream = false
	info.UpstreamRequestBodySize = size
	c.Request.Header.Set("Content-Type", "application/json")
	if c.Request.Header.Get("Accept") == "" {
		c.Request.Header.Set("Accept", "application/json")
	}

	adaptor := GetAdaptor(info.ApiType)
	if adaptor == nil {
		return types.NewError(fmt.Errorf("invalid api type: %d", info.ApiType), types.ErrorCodeInvalidApiType, types.ErrOptionWithSkipRetry())
	}
	adaptor.Init(info)
	resp, reqErr := adaptor.DoRequest(c, info, body)
	if reqErr != nil {
		return types.NewOpenAIError(reqErr, types.ErrorCodeDoRequestFailed, http.StatusInternalServerError)
	}
	if resp == nil {
		return types.NewOpenAIError(fmt.Errorf("empty upstream response"), types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}
	httpResp := resp.(*http.Response)
	if httpResp.StatusCode != http.StatusOK {
		newAPIError := service.RelayErrorHandler(c.Request.Context(), httpResp, false)
		service.ResetStatusCode(newAPIError, c.GetString("status_code_mapping"))
		return newAPIError
	}

	usage, newAPIError := ecommerceBanana2WriteImageResponse(c, httpResp, info)
	if newAPIError != nil {
		service.ResetStatusCode(newAPIError, c.GetString("status_code_mapping"))
		return newAPIError
	}
	if info.PriceData.UsePrice {
		info.PriceData.AddOtherRatio("n", 1)
	}
	if usage.TotalTokens == 0 {
		usage.TotalTokens = 1
	}
	if usage.PromptTokens == 0 {
		usage.PromptTokens = 1
	}
	service.PostTextConsumeQuota(c, info, usage, []string{"生成数量 1", "图像编辑"})
	return nil
}

func ecommerceBanana2ChatEditRequest(modelName string, prompt string, imageURLs []string) *dto.GeneralOpenAIRequest {
	if modelName == "" || service.IsEcommerceBanana2Model(modelName) {
		modelName = "nano-banana-2"
	}
	content := []dto.MediaContent{{
		Type: dto.ContentTypeText,
		Text: strings.TrimSpace(prompt) + "\n\n" + ecommerceBanana2EditInstruction,
	}}
	for _, imageURL := range imageURLs {
		content = append(content, dto.MediaContent{
			Type:     dto.ContentTypeImageURL,
			ImageUrl: &dto.MessageImageUrl{Url: imageURL},
		})
	}
	return &dto.GeneralOpenAIRequest{
		Model: modelName,
		Messages: []dto.Message{{
			Role:    "user",
			Content: content,
		}},
		Stream: common.GetPointer(false),
	}
}

func ecommerceBanana2MultipartImages(c *gin.Context, maxImages int) ([]string, error) {
	mf := c.Request.MultipartForm
	if mf == nil {
		var err error
		mf, err = common.ParseMultipartFormReusable(c)
		if err != nil {
			return nil, fmt.Errorf("failed to parse multipart form: %w", err)
		}
	}
	fileHeaders := multipartImageFileHeaders(mf)
	if len(fileHeaders) == 0 {
		return nil, fmt.Errorf("image is required")
	}
	if len(fileHeaders) > maxImages {
		fileHeaders = fileHeaders[:maxImages]
	}
	imageURLs := make([]string, 0, len(fileHeaders))
	for _, fileHeader := range fileHeaders {
		dataURL, err := fileHeaderToDataURL(fileHeader)
		if err != nil {
			return nil, err
		}
		imageURLs = append(imageURLs, dataURL)
	}
	return imageURLs, nil
}

func multipartImageFileHeaders(mf *multipart.Form) []*multipart.FileHeader {
	if mf == nil || mf.File == nil {
		return nil
	}
	var imageFiles []*multipart.FileHeader
	if files := mf.File["image"]; len(files) > 0 {
		imageFiles = append(imageFiles, files...)
	}
	if files := mf.File["image[]"]; len(files) > 0 {
		imageFiles = append(imageFiles, files...)
	}
	for fieldName, files := range mf.File {
		if strings.HasPrefix(fieldName, "image[") && len(files) > 0 {
			imageFiles = append(imageFiles, files...)
		}
	}
	return imageFiles
}

func fileHeaderToDataURL(fileHeader *multipart.FileHeader) (string, error) {
	file, err := fileHeader.Open()
	if err != nil {
		return "", fmt.Errorf("failed to open image file: %w", err)
	}
	defer file.Close()

	imageBytes, err := io.ReadAll(file)
	if err != nil {
		return "", fmt.Errorf("failed to read image file: %w", err)
	}
	if len(imageBytes) == 0 {
		return "", fmt.Errorf("image file is empty")
	}
	mimeType := fileHeader.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = http.DetectContentType(imageBytes)
	}
	if !strings.HasPrefix(mimeType, "image/") {
		return "", fmt.Errorf("unsupported image content type")
	}
	return fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(imageBytes)), nil
}

func ecommerceBanana2WriteImageResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (*dto.Usage, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)

	responseBody, err := common.ReadAllCapped(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}
	var chatResp dto.OpenAITextResponse
	if err := common.Unmarshal(responseBody, &chatResp); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	if oaiError := chatResp.GetOpenAIError(); oaiError != nil && oaiError.Type != "" {
		return nil, types.WithOpenAIError(*oaiError, resp.StatusCode)
	}
	imageDataURL := extractImageDataURLFromChatResponse(&chatResp, responseBody)
	if imageDataURL == "" {
		logger.LogWarn(c, fmt.Sprintf("ecommerce banana image edit returned no data url: request_id=%s model=%s", c.GetString(common.RequestIdKey), info.OriginModelName))
		return nil, types.NewOpenAIError(fmt.Errorf("upstream did not return an edited image"), types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	imageResp := dto.ImageResponse{
		Created: time.Now().Unix(),
		Data: []dto.ImageData{{
			Url: imageDataURL,
		}},
	}
	out, err := common.Marshal(imageResp)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeJsonMarshalFailed, http.StatusInternalServerError)
	}
	service.IOCopyBytesGracefully(c, resp, out)

	usage := &chatResp.Usage
	service.CopyResponseHeaderCostFields(usage, resp.Header)
	if !service.ValidUsage(usage) {
		usageText := imageDataURL
		if len(usageText) > 2048 {
			usageText = usageText[:2048]
		}
		usage = service.ResponseText2Usage(c, usageText, info.UpstreamModelName, info.GetEstimatePromptTokens())
		service.CopyResponseHeaderCostFields(usage, resp.Header)
	}
	return usage, nil
}

func extractImageDataURLFromChatResponse(resp *dto.OpenAITextResponse, raw []byte) string {
	if resp != nil {
		for _, choice := range resp.Choices {
			if dataURL := cleanImageDataURL(imageDataURLPattern.FindString(choice.Message.StringContent())); dataURL != "" {
				return dataURL
			}
		}
	}
	return cleanImageDataURL(imageDataURLPattern.FindString(string(raw)))
}

func cleanImageDataURL(value string) string {
	if value == "" {
		return ""
	}
	return strings.ReplaceAll(strings.ReplaceAll(value, "\n", ""), "\r", "")
}
