package relay

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

const (
	playgroundImageRequestLogKey      = "playground_image_request_log_recorded"
	PlaygroundImageResponseCaptureKey = "playground_image_response_capture"
)

func recordPlaygroundImageRequestLog(c *gin.Context, info *relaycommon.RelayInfo, request *dto.ImageRequest) {
	if c == nil || c.Request == nil || c.Request.URL == nil || info == nil || request == nil {
		return
	}
	path := c.Request.URL.Path
	if !strings.HasPrefix(path, "/pg/images/") {
		return
	}
	if _, exists := c.Get(playgroundImageRequestLogKey); exists {
		return
	}
	c.Set(playgroundImageRequestLogKey, true)

	workflow := "文生图"
	if strings.HasPrefix(path, "/pg/images/edits") {
		workflow = "图像修改"
	}

	imageN := uint(1)
	if request.N != nil && *request.N > 0 {
		imageN = *request.N
	}
	size := strings.TrimSpace(request.Size)
	if size == "" {
		size = "auto"
	}
	quality := strings.TrimSpace(request.Quality)
	if quality == "" {
		quality = "auto"
	}

	contentParts := []string{
		"媒体工坊图片请求已提交",
		fmt.Sprintf("模式 %s", workflow),
		fmt.Sprintf("大小 %s", size),
		fmt.Sprintf("清晰度 %s", quality),
		fmt.Sprintf("生成数量 %d", imageN),
	}
	if resolution := strings.TrimSpace(request.Resolution); resolution != "" {
		contentParts = append(contentParts, fmt.Sprintf("分辨率 %s", resolution))
	}
	if imageSize := strings.TrimSpace(request.ImageSize); imageSize != "" && imageSize != strings.TrimSpace(request.Resolution) {
		contentParts = append(contentParts, fmt.Sprintf("图像尺寸 %s", imageSize))
	}

	other := map[string]interface{}{
		"request_path":  path,
		"request_phase": "submitted",
		"workflow":      workflow,
		"size":          size,
		"quality":       quality,
		"n":             imageN,
	}
	if resolution := strings.TrimSpace(request.Resolution); resolution != "" {
		other["resolution"] = resolution
	}
	if imageSize := strings.TrimSpace(request.ImageSize); imageSize != "" {
		other["image_size"] = imageSize
	}
	if aspectRatio := strings.TrimSpace(request.AspectRatio); aspectRatio != "" {
		other["aspect_ratio"] = aspectRatio
	}
	if info.FinalPreConsumedQuota > 0 {
		other["reserved_quota"] = info.FinalPreConsumedQuota
	}
	if info.IsModelMapped {
		other["is_model_mapped"] = true
		other["upstream_model_name"] = info.UpstreamModelName
	}

	if model.LOG_DB == nil {
		return
	}
	other = model.BuildRequestAuditOther(c, other)
	username := c.GetString("username")
	if username == "" {
		username, _ = model.GetUsernameById(info.UserId, false)
	}
	log := &model.Log{
		UserId:    info.UserId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      model.LogTypeSystem,
		Content:   strings.Join(contentParts, "，"),
		TokenName: c.GetString("token_name"),
		ModelName: info.OriginModelName,
		Quota:     0,
		ChannelId: info.ChannelId,
		TokenId:   info.TokenId,
		UseTime:   0,
		IsStream:  false,
		Group:     info.UsingGroup,
		Ip:        model.ResolveAuditClientIP(c),
		RequestId: c.GetString(common.RequestIdKey),
		Other:     common.MapToJsonStr(other),
	}
	if err := model.LOG_DB.Create(log).Error; err != nil {
		logger.LogError(c, "failed to record playground image request log: "+err.Error())
	}
}

func ImageHelper(c *gin.Context, info *relaycommon.RelayInfo) (newAPIError *types.NewAPIError) {
	info.InitChannelMeta(c)

	imageReq, ok := info.Request.(*dto.ImageRequest)
	if !ok {
		return types.NewErrorWithStatusCode(fmt.Errorf("invalid request type, expected dto.ImageRequest, got %T", info.Request), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}

	request, err := common.DeepCopy(imageReq)
	if err != nil {
		return types.NewError(fmt.Errorf("failed to copy request to ImageRequest: %w", err), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}

	err = helper.ModelMappedHelper(c, info, request)
	if err != nil {
		return types.NewError(err, types.ErrorCodeChannelModelMappedError, types.ErrOptionWithSkipRetry())
	}
	useGeminiAdaptorForNativeImageModel(info)

	adaptor := GetAdaptor(info.ApiType)
	if adaptor == nil {
		return types.NewError(fmt.Errorf("invalid api type: %d", info.ApiType), types.ErrorCodeInvalidApiType, types.ErrOptionWithSkipRetry())
	}
	adaptor.Init(info)

	var requestBody io.Reader

	if model_setting.GetGlobalSettings().PassThroughRequestEnabled || info.ChannelSetting.PassThroughBodyEnabled {
		storage, err := common.GetBodyStorage(c)
		if err != nil {
			return types.NewErrorWithStatusCode(err, types.ErrorCodeReadRequestBodyFailed, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
		}
		requestBody = common.ReaderOnly(storage)
	} else {
		convertedRequest, err := adaptor.ConvertImageRequest(c, info, *request)
		if err != nil {
			return types.NewError(err, types.ErrorCodeConvertRequestFailed)
		}
		relaycommon.AppendRequestConversionFromRequest(info, convertedRequest)

		switch convertedRequest.(type) {
		case *bytes.Buffer:
			requestBody = convertedRequest.(io.Reader)
		default:
			jsonData, err := common.Marshal(convertedRequest)
			if err != nil {
				return types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
			}

			// apply param override
			if len(info.ParamOverride) > 0 {
				jsonData, err = relaycommon.ApplyParamOverrideWithRelayInfo(jsonData, info)
				if err != nil {
					return newAPIErrorFromParamOverride(err)
				}
			}
			jsonData, err = sanitizeGeek2APIImage2OutboundBody(info, jsonData)
			if err != nil {
				return types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
			}

			logger.LogDebug(c, "image request body: %s", jsonData)
			body, size, closer, err := relaycommon.NewOutboundJSONBody(jsonData)
			if err != nil {
				return types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
			}
			defer closer.Close()
			jsonData = nil
			info.UpstreamRequestBodySize = size
			requestBody = body
		}
	}

	recordPlaygroundImageRequestLog(c, info, request)

	statusCodeMappingStr := c.GetString("status_code_mapping")

	resp, err := adaptor.DoRequest(c, info, requestBody)
	if err != nil {
		return types.NewOpenAIError(err, types.ErrorCodeDoRequestFailed, http.StatusInternalServerError)
	}
	var httpResp *http.Response
	if resp != nil {
		httpResp = resp.(*http.Response)
		info.IsStream = info.IsStream || strings.HasPrefix(httpResp.Header.Get("Content-Type"), "text/event-stream")
		if httpResp.StatusCode != http.StatusOK {
			if httpResp.StatusCode == http.StatusCreated && info.ApiType == constant.APITypeReplicate {
				// replicate channel returns 201 Created when using Prefer: wait, treat it as success.
				httpResp.StatusCode = http.StatusOK
			} else {
				newAPIError = service.RelayErrorHandler(c.Request.Context(), httpResp, false)
				// reset status code 重置状态码
				service.ResetStatusCode(newAPIError, statusCodeMappingStr)
				return newAPIError
			}
		}
	}

	usage, newAPIError := adaptor.DoResponse(c, httpResp, info)
	if newAPIError != nil {
		// reset status code 重置状态码
		service.ResetStatusCode(newAPIError, statusCodeMappingStr)
		return newAPIError
	}

	imageN := uint(1)
	if request.N != nil {
		imageN = *request.N
	}

	// n is handled via OtherRatio so it is applied exactly once in quota
	// calculation (both price-based and ratio-based paths).
	// Adaptors may have already set a more accurate count from the
	// upstream response; only set the default when they haven't.
	if info.PriceData.UsePrice { // only price model use N ratio
		if _, hasN := info.PriceData.OtherRatios["n"]; !hasN {
			info.PriceData.AddOtherRatio("n", float64(imageN))
		}
	}

	if usage.(*dto.Usage).TotalTokens == 0 {
		usage.(*dto.Usage).TotalTokens = 1
	}
	if usage.(*dto.Usage).PromptTokens == 0 {
		usage.(*dto.Usage).PromptTokens = 1
	}

	if callback, ok := c.Get(PlaygroundImageResponseCaptureKey); ok {
		if capture, ok := callback.(func(*dto.ImageRequest, *dto.Usage)); ok {
			capture(request, usage.(*dto.Usage))
		}
	}

	quality := request.Quality
	if quality == "" {
		quality = "standard"
	}

	var logContent []string

	if len(request.Size) > 0 {
		logContent = append(logContent, fmt.Sprintf("大小 %s", request.Size))
	}
	if len(quality) > 0 {
		logContent = append(logContent, fmt.Sprintf("品质 %s", quality))
	}
	if imageN > 0 {
		logContent = append(logContent, fmt.Sprintf("生成数量 %d", imageN))
	}

	service.PostTextConsumeQuota(c, info, usage.(*dto.Usage), logContent)
	return nil
}

func useGeminiAdaptorForNativeImageModel(info *relaycommon.RelayInfo) {
	if info == nil || info.ChannelMeta == nil {
		return
	}
	if info.RelayMode != relayconstant.RelayModeImagesGenerations &&
		info.RelayMode != relayconstant.RelayModeImagesEdits {
		return
	}
	if !isNativeGeminiImageModel(info.UpstreamModelName) {
		return
	}
	info.ApiType = constant.APITypeGemini
	info.ChannelBaseUrl = normalizeGeminiImageBaseURL(info.ChannelBaseUrl)
}

func isNativeGeminiImageModel(modelName string) bool {
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

func normalizeGeminiImageBaseURL(baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(baseURL, "/v1") {
		baseURL = strings.TrimSuffix(baseURL, "/v1")
	}
	return baseURL
}
