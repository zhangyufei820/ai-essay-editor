package controller

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/relay"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/samber/lo"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func relayHandler(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	var err *types.NewAPIError
	switch info.RelayMode {
	case relayconstant.RelayModeImagesGenerations, relayconstant.RelayModeImagesEdits:
		err = relay.ImageHelper(c, info)
	case relayconstant.RelayModeAudioSpeech:
		fallthrough
	case relayconstant.RelayModeAudioTranslation:
		fallthrough
	case relayconstant.RelayModeAudioTranscription:
		err = relay.AudioHelper(c, info)
	case relayconstant.RelayModeRerank:
		err = relay.RerankHelper(c, info)
	case relayconstant.RelayModeEmbeddings:
		err = relay.EmbeddingHelper(c, info)
	case relayconstant.RelayModeResponses, relayconstant.RelayModeResponsesCompact:
		err = relay.ResponsesHelper(c, info)
	default:
		err = relay.TextHelper(c, info)
	}
	return err
}

func geminiRelayHandler(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	var err *types.NewAPIError
	if strings.Contains(c.Request.URL.Path, "embed") {
		err = relay.GeminiEmbeddingHandler(c, info)
	} else {
		err = relay.GeminiHelper(c, info)
	}
	return err
}

func playgroundImageRetryTimes(c *gin.Context) int {
	if c == nil || c.Request == nil || c.Request.URL == nil {
		return common.RetryTimes
	}
	if !strings.HasPrefix(c.Request.URL.Path, "/pg/images/") {
		return common.RetryTimes
	}
	retryTimes := common.GetEnvOrDefault("PLAYGROUND_IMAGE_RETRY_TIMES", common.RetryTimes)
	if retryTimes < 0 {
		return 0
	}
	return retryTimes
}

const (
	playgroundImage2Channel24TempCircuitChannelID = 24
	playgroundImage2Channel16TempCircuitChannelID = 16
	playgroundImage2VipMappedChannelID            = 4

	playgroundForcedChannelIDsKey           = "playground_forced_channel_ids"
	playgroundImage2TempCircuitScopeKey     = "playground_image2_temp_circuit_scope"
	playgroundImage2TempCircuitRequestKey   = "playground_image2_temp_circuit_request"
	playgroundDiscountFallbackKey           = "playground_discount_fallback"
	playgroundDiscountFallbackHeader        = "X-Aiphui-Discount-Fallback"
	playgroundDiscountFallbackRequestHeader = "X-Aiphui-Discount-Fallback-Request"
	playgroundAutoPricingFallbackHeader     = "X-Aiphui-Auto-Pricing-Fallback"
	playgroundPricingGroupHeader            = "X-Aiphui-Pricing-Group"
)

type temporaryChannelCircuit struct {
	mu             sync.Mutex
	initialized    bool
	cooling        bool
	coolingUntil   time.Time
	probeInFlight  bool
	probeSuccesses int
	now            func() time.Time
}

func (c *temporaryChannelCircuit) currentTime() time.Time {
	if c != nil && c.now != nil {
		return c.now()
	}
	return time.Now()
}

func (c *temporaryChannelCircuit) ensureInitialCooldown(duration time.Duration) {
	if c == nil || duration <= 0 {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.initialized {
		return
	}
	c.initialized = true
	c.cooling = true
	c.coolingUntil = c.currentTime().Add(duration)
}

func (c *temporaryChannelCircuit) shouldSkipOrProbe(cooldown time.Duration) (skip bool, probe bool, until time.Time) {
	if c == nil {
		return false, false, time.Time{}
	}
	c.ensureInitialCooldown(cooldown)

	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.currentTime()
	if !c.cooling {
		return false, false, time.Time{}
	}
	if now.Before(c.coolingUntil) {
		return true, false, c.coolingUntil
	}
	if c.probeInFlight {
		c.probeInFlight = false
	}
	c.probeInFlight = true
	c.coolingUntil = now.Add(cooldown)
	return false, true, time.Time{}
}

func (c *temporaryChannelCircuit) coolDown(duration time.Duration) time.Time {
	if c == nil {
		return time.Time{}
	}
	if duration <= 0 {
		duration = 5 * time.Minute
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.initialized = true
	c.cooling = true
	c.probeInFlight = false
	c.probeSuccesses = 0
	c.coolingUntil = c.currentTime().Add(duration)
	return c.coolingUntil
}

func (c *temporaryChannelCircuit) clear() {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.initialized = true
	c.cooling = false
	c.probeInFlight = false
	c.probeSuccesses = 0
	c.coolingUntil = time.Time{}
}

func (c *temporaryChannelCircuit) markProbeSuccess(requiredSuccesses int, cooldown time.Duration) (restored bool, successes int, until time.Time) {
	if c == nil {
		return false, 0, time.Time{}
	}
	if requiredSuccesses <= 0 {
		requiredSuccesses = 1
	}
	if cooldown <= 0 {
		cooldown = 5 * time.Minute
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.initialized = true
	c.probeInFlight = false
	c.probeSuccesses++
	successes = c.probeSuccesses
	if c.probeSuccesses >= requiredSuccesses {
		c.cooling = false
		c.probeSuccesses = 0
		c.coolingUntil = time.Time{}
		return true, successes, time.Time{}
	}
	c.cooling = true
	c.coolingUntil = c.currentTime().Add(cooldown)
	return false, successes, c.coolingUntil
}

var playgroundImage2TempCircuits = map[int]*temporaryChannelCircuit{
	playgroundImage2Channel24TempCircuitChannelID: {},
	playgroundImage2Channel16TempCircuitChannelID: {},
}

func playgroundImage2TempCircuitForChannel(channelID int) (*temporaryChannelCircuit, bool) {
	circuit, ok := playgroundImage2TempCircuits[channelID]
	return circuit, ok && circuit != nil
}

func playgroundImage2TempCircuitEnabled(channelID int) bool {
	if _, ok := playgroundImage2TempCircuitForChannel(channelID); !ok {
		return false
	}
	key := fmt.Sprintf("PLAYGROUND_IMAGE2_CHANNEL%d_TEMP_CIRCUIT_ENABLED", channelID)
	value := strings.ToLower(strings.TrimSpace(common.GetEnvOrDefaultString(key, "true")))
	return value != "0" && value != "false" && value != "off" && value != "no"
}

func playgroundImage2TempCircuitCooldown(channelID int) time.Duration {
	seconds := common.GetEnvOrDefault(fmt.Sprintf("PLAYGROUND_IMAGE2_CHANNEL%d_TEMP_COOLDOWN_SECONDS", channelID), 300)
	if seconds <= 0 {
		return 5 * time.Minute
	}
	return time.Duration(seconds) * time.Second
}

func playgroundImage2TempCircuitSuccessThreshold(channelID int) int {
	threshold := common.GetEnvOrDefault(fmt.Sprintf("PLAYGROUND_IMAGE2_CHANNEL%d_TEMP_SUCCESS_THRESHOLD", channelID), 3)
	if threshold <= 0 {
		return 1
	}
	return threshold
}

func Relay(c *gin.Context, relayFormat types.RelayFormat) {

	requestId := c.GetString(common.RequestIdKey)
	//group := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	//originalModel := common.GetContextKeyString(c, constant.ContextKeyOriginalModel)

	var (
		newAPIError *types.NewAPIError
		ws          *websocket.Conn
	)

	if relayFormat == types.RelayFormatOpenAIRealtime {
		var err error
		ws, err = upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			helper.WssError(c, ws, types.NewError(err, types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry()).ToPublicOpenAIError(requestId))
			return
		}
		defer ws.Close()
	}

	defer func() {
		if newAPIError != nil {
			logger.LogError(c, fmt.Sprintf("relay error: %s", common.LocalLogPreview(newAPIError.Error())))
			switch relayFormat {
			case types.RelayFormatOpenAIRealtime:
				helper.WssError(c, ws, newAPIError.ToPublicOpenAIError(requestId))
			case types.RelayFormatClaude:
				c.JSON(newAPIError.StatusCode, gin.H{
					"type":  "error",
					"error": newAPIError.ToPublicClaudeError(requestId),
				})
			default:
				c.JSON(newAPIError.StatusCode, gin.H{
					"error": newAPIError.ToPublicOpenAIError(requestId),
				})
			}
		}
	}()

	request, err := helper.GetAndValidateRequest(c, relayFormat)
	if err != nil {
		// Map "request body too large" to 413 so clients can handle it correctly
		if common.IsRequestBodyTooLargeError(err) || errors.Is(err, common.ErrRequestBodyTooLarge) {
			newAPIError = types.NewErrorWithStatusCode(err, types.ErrorCodeReadRequestBodyFailed, http.StatusRequestEntityTooLarge, types.ErrOptionWithSkipRetry())
		} else {
			newAPIError = types.NewError(err, types.ErrorCodeInvalidRequest)
		}
		return
	}
	if guardErr := rejectImageModelTextEndpointRequest(relayFormat, request); guardErr != nil {
		newAPIError = guardErr
		return
	}

	relayInfo, err := relaycommon.GenRelayInfo(c, relayFormat, request, ws)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeGenRelayInfoFailed)
		return
	}

	needSensitiveCheck := setting.ShouldCheckPromptSensitive()
	needCountToken := constant.CountToken
	// Avoid building huge CombineText (strings.Join) when token counting and sensitive check are both disabled.
	var meta *types.TokenCountMeta
	if needSensitiveCheck || needCountToken {
		meta = request.GetTokenCountMeta()
	} else {
		meta = fastTokenCountMetaForPricing(request)
	}

	if needSensitiveCheck && meta != nil {
		contains, words := service.CheckSensitiveText(meta.CombineText)
		if contains {
			logger.LogWarn(c, fmt.Sprintf("user sensitive words detected: %s", strings.Join(words, ", ")))
			newAPIError = types.NewError(err, types.ErrorCodeSensitiveWordsDetected)
			return
		}
	}

	tokens, err := service.EstimateRequestToken(c, meta, relayInfo)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeCountTokenFailed)
		return
	}

	relayInfo.SetEstimatePromptTokens(tokens)

	clientRequestedDiscountFallback := isPlaygroundDiscountFallbackRequest(c, relayInfo)
	priceData, err := helper.ModelPriceHelper(c, relayInfo, tokens, meta)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeModelPriceError, types.ErrOptionWithStatusCode(http.StatusBadRequest))
		return
	}
	if clientRequestedDiscountFallback {
		priceData, newAPIError = applyPlaygroundDiscountFallbackReserve(relayInfo, meta, priceData)
		if newAPIError != nil {
			return
		}
	}

	// common.SetContextKey(c, constant.ContextKeyTokenCountMeta, meta)

	if priceData.FreeModel {
		logger.LogInfo(c, fmt.Sprintf("模型 %s 免费，跳过预扣费", relayInfo.OriginModelName))
	} else {
		newAPIError = service.PreConsumeBilling(c, priceData.QuotaToPreConsume, relayInfo)
		if newAPIError != nil {
			return
		}
	}
	if clientRequestedDiscountFallback {
		markPlaygroundDiscountFallback(c)
	}

	defer func() {
		// Only return quota if downstream failed and quota was actually pre-consumed
		if newAPIError != nil {
			newAPIError = service.NormalizeViolationFeeError(newAPIError)
			if relayInfo.Billing != nil {
				relayInfo.Billing.Refund(c)
			}
			service.ChargeViolationFeeIfNeeded(c, relayInfo, newAPIError)
		}
	}()

	retryParam := &service.RetryParam{
		Ctx:        c,
		TokenGroup: relayInfo.TokenGroup,
		ModelName:  relayInfo.OriginModelName,
		Retry:      common.GetPointer(0),
	}
	relayInfo.RetryIndex = 0
	relayInfo.LastError = nil
	maxRetryTimes := playgroundImageRetryTimes(c)
	forcePlaygroundImageChannel(c, request, relayInfo)

	for ; retryParam.GetRetry() <= maxRetryTimes; retryParam.IncreaseRetry() {
		relayInfo.RetryIndex = retryParam.GetRetry()
		channel, channelErr := getChannel(c, relayInfo, retryParam)
		if channelErr != nil {
			logger.LogError(c, channelErr.Error())
			newAPIError = channelErr
			break
		}

		addUsedChannel(c, channel.Id)
		bodyStorage, bodyErr := common.GetBodyStorage(c)
		if bodyErr != nil {
			// Ensure consistent 413 for oversized bodies even when error occurs later (e.g., retry path)
			if common.IsRequestBodyTooLargeError(bodyErr) || errors.Is(bodyErr, common.ErrRequestBodyTooLarge) {
				newAPIError = types.NewErrorWithStatusCode(bodyErr, types.ErrorCodeReadRequestBodyFailed, http.StatusRequestEntityTooLarge, types.ErrOptionWithSkipRetry())
			} else {
				newAPIError = types.NewErrorWithStatusCode(bodyErr, types.ErrorCodeReadRequestBodyFailed, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
			}
			break
		}
		c.Request.Body = io.NopCloser(bodyStorage)

		switch relayFormat {
		case types.RelayFormatOpenAIRealtime:
			newAPIError = relay.WssHelper(c, relayInfo)
		case types.RelayFormatClaude:
			newAPIError = relay.ClaudeHelper(c, relayInfo)
		case types.RelayFormatGemini:
			newAPIError = geminiRelayHandler(c, relayInfo)
		default:
			newAPIError = relayHandler(c, relayInfo)
		}

		if newAPIError == nil {
			relayInfo.LastError = nil
			recordPlaygroundImage2TempCircuitSuccess(c, channel.Id)
			return
		}

		newAPIError = service.NormalizeViolationFeeError(newAPIError)
		relayInfo.LastError = newAPIError

		processChannelError(c, *types.NewChannelError(channel.Id, channel.Type, channel.Name, channel.ChannelInfo.IsMultiKey, common.GetContextKeyString(c, constant.ContextKeyChannelKey), channel.GetAutoBan()), newAPIError)
		if shouldFallbackPlaygroundDiscount(c, relayInfo, meta, newAPIError) {
			service.RecordRelayRetryAttempt(c, channel.Id, channel.Name, retryParam.GetRetry(), newAPIError)
			fallbackErr := preparePlaygroundDiscountFallback(c, relayInfo, retryParam, meta)
			if fallbackErr != nil {
				newAPIError = fallbackErr
				relayInfo.LastError = fallbackErr
				break
			}
			if maxRetryTimes < 1 {
				maxRetryTimes = 1
			}
			continue
		}

		if !shouldRetry(c, newAPIError, maxRetryTimes-retryParam.GetRetry()) {
			break
		}
		service.RecordRelayRetryAttempt(c, channel.Id, channel.Name, retryParam.GetRetry(), newAPIError)
	}

	useChannel := c.GetStringSlice("use_channel")
	if len(useChannel) > 1 {
		retryLogStr := fmt.Sprintf("重试：%s", strings.Trim(strings.Join(strings.Fields(fmt.Sprint(useChannel)), "->"), "[]"))
		logger.LogInfo(c, retryLogStr)
	}
	if newAPIError != nil {
		gopool.Go(func() {
			perfmetrics.RecordRelaySample(relayInfo, false, 0)
		})
	}
}

func shouldFallbackPlaygroundDiscount(c *gin.Context, info *relaycommon.RelayInfo, meta *types.TokenCountMeta, openaiErr *types.NewAPIError) bool {
	if c == nil || c.Request == nil || c.Request.URL == nil || info == nil || meta == nil || openaiErr == nil {
		return false
	}
	if c.Request.Context().Err() != nil || !constant.CountToken || meta.MaxTokens <= 0 {
		return false
	}
	if c.Request.URL.Path != "/pg/chat/completions" || info.UsingGroup != service.DiscountPricingGroupName {
		return false
	}
	// Pricing changes are user-controlled. The homepage no longer opts into
	// automatic discount -> 1x switching; keep the guarded mechanism available
	// only for explicitly marked internal compatibility requests.
	if strings.TrimSpace(c.GetHeader(playgroundAutoPricingFallbackHeader)) != "1" {
		return false
	}
	if c.GetBool(playgroundDiscountFallbackKey) || service.HasTextOutputSent(c) {
		return false
	}
	if !service.GroupInUserUsableGroups(info.UserGroup, "default") {
		return false
	}
	return isPlaygroundDiscountAvailabilityError(openaiErr)
}

func isPlaygroundDiscountAvailabilityError(openaiErr *types.NewAPIError) bool {
	if openaiErr == nil {
		return false
	}
	if types.IsChannelError(openaiErr) {
		return true
	}
	switch openaiErr.GetErrorCode() {
	case types.ErrorCodeGetChannelFailed,
		types.ErrorCodeDoRequestFailed,
		types.ErrorCodeEmptyResponse,
		types.ErrorCodeModelNotFound:
		return true
	case types.ErrorCodeReadResponseBodyFailed,
		types.ErrorCodeBadResponseStatusCode,
		types.ErrorCodeBadResponse,
		types.ErrorCodeBadResponseBody:
		return isPlaygroundDiscountRetryableStatus(openaiErr.StatusCode)
	}
	if !openaiErr.IsUpstreamRelayError() {
		return false
	}
	if isPlaygroundUpstreamQuotaLikeError(openaiErr) {
		return true
	}
	return isPlaygroundDiscountRetryableStatus(openaiErr.StatusCode)
}

func isPlaygroundDiscountRetryableStatus(statusCode int) bool {
	switch statusCode {
	case http.StatusUnauthorized,
		http.StatusNotFound,
		http.StatusRequestTimeout,
		http.StatusTooEarly,
		http.StatusTooManyRequests:
		return true
	default:
		return statusCode >= http.StatusInternalServerError
	}
}

func isPlaygroundDiscountFallbackRequest(c *gin.Context, info *relaycommon.RelayInfo) bool {
	if c == nil || c.Request == nil || c.Request.URL == nil || info == nil {
		return false
	}
	return c.Request.URL.Path == "/pg/chat/completions" &&
		info.UsingGroup == "default" &&
		strings.TrimSpace(c.GetHeader(playgroundDiscountFallbackRequestHeader)) == "1"
}

func markPlaygroundDiscountFallback(c *gin.Context) {
	if c == nil {
		return
	}
	c.Set(playgroundDiscountFallbackKey, true)
	c.Header(playgroundDiscountFallbackHeader, "1")
	c.Header(playgroundPricingGroupHeader, "default")
}

func playgroundDiscountDefaultReserveQuota(info *relaycommon.RelayInfo, meta *types.TokenCountMeta, priceData types.PriceData) int {
	targetQuota := priceData.QuotaToPreConsume
	if info == nil || meta == nil || meta.MaxTokens <= 0 || priceData.UsePrice || info.TieredBillingSnapshot != nil {
		return targetQuota
	}

	promptTokens := common.Max(info.GetEstimatePromptTokens(), common.PreConsumedQuota)
	estimatedQuota := (float64(promptTokens) + float64(meta.MaxTokens)*priceData.CompletionRatio) *
		priceData.ModelRatio * priceData.GroupRatioInfo.GroupRatio
	for _, ratio := range priceData.OtherRatios() {
		estimatedQuota *= ratio
	}
	if math.IsNaN(estimatedQuota) || estimatedQuota <= 0 {
		return targetQuota
	}
	maxInt := int(^uint(0) >> 1)
	if math.IsInf(estimatedQuota, 1) || estimatedQuota >= float64(maxInt) {
		return maxInt
	}
	return common.Max(targetQuota, int(math.Ceil(estimatedQuota)))
}

func applyPlaygroundDiscountFallbackReserve(
	info *relaycommon.RelayInfo,
	meta *types.TokenCountMeta,
	priceData types.PriceData,
) (types.PriceData, *types.NewAPIError) {
	if info == nil || meta == nil || !constant.CountToken || meta.MaxTokens <= 0 {
		return priceData, types.NewErrorWithStatusCode(
			errors.New("原价回退需要启用输入计数并设置最大输出上限"),
			types.ErrorCodeInvalidRequest,
			http.StatusBadRequest,
			types.ErrOptionWithSkipRetry(),
		)
	}
	priceData.QuotaToPreConsume = playgroundDiscountDefaultReserveQuota(info, meta, priceData)
	info.PriceData = priceData
	return priceData, nil
}

func preparePlaygroundDiscountFallback(
	c *gin.Context,
	info *relaycommon.RelayInfo,
	retryParam *service.RetryParam,
	meta *types.TokenCountMeta,
) *types.NewAPIError {
	if c == nil || info == nil || retryParam == nil || meta == nil || meta.MaxTokens <= 0 {
		return types.NewError(errors.New("playground discount fallback context is incomplete"), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}

	previousUsingGroup := info.UsingGroup
	previousPriceData := info.PriceData
	previousTieredSnapshot := info.TieredBillingSnapshot
	previousBillingRequestInput := info.BillingRequestInput
	restoreDiscountPricing := func() {
		common.SetContextKey(c, constant.ContextKeyUsingGroup, previousUsingGroup)
		common.SetContextKey(c, constant.ContextKeyAutoGroup, previousUsingGroup)
		info.UsingGroup = previousUsingGroup
		info.PriceData = previousPriceData
		info.TieredBillingSnapshot = previousTieredSnapshot
		info.BillingRequestInput = previousBillingRequestInput
	}

	common.SetContextKey(c, constant.ContextKeyUsingGroup, "default")
	common.SetContextKey(c, constant.ContextKeyAutoGroup, "default")
	info.UsingGroup = "default"

	priceData, err := helper.ModelPriceHelper(c, info, info.GetEstimatePromptTokens(), meta)
	if err != nil {
		restoreDiscountPricing()
		return types.NewError(err, types.ErrorCodeModelPriceError, types.ErrOptionWithSkipRetry(), types.ErrOptionWithStatusCode(http.StatusBadRequest))
	}
	priceData, fallbackPriceErr := applyPlaygroundDiscountFallbackReserve(info, meta, priceData)
	if fallbackPriceErr != nil {
		restoreDiscountPricing()
		return fallbackPriceErr
	}
	reserveQuota := priceData.QuotaToPreConsume
	if info.BillingSource == service.BillingSourceWallet && reserveQuota > info.UserQuota {
		restoreDiscountPricing()
		return types.NewErrorWithStatusCode(
			fmt.Errorf("原价回退预扣额度不足, 用户剩余额度: %s, 需要预扣额度: %s", logger.FormatQuota(info.UserQuota), logger.FormatQuota(reserveQuota)),
			types.ErrorCodeInsufficientUserQuota,
			http.StatusForbidden,
			types.ErrOptionWithSkipRetry(),
			types.ErrOptionWithNoRecordErrorLog(),
		)
	}
	if info.Billing == nil && !priceData.FreeModel {
		if billingErr := service.PreConsumeBilling(c, reserveQuota, info); billingErr != nil {
			restoreDiscountPricing()
			return billingErr
		}
	} else if info.Billing != nil {
		if reserveErr := info.Billing.Reserve(reserveQuota); reserveErr != nil {
			restoreDiscountPricing()
			var apiErr *types.NewAPIError
			if errors.As(reserveErr, &apiErr) {
				return apiErr
			}
			return types.NewError(reserveErr, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
		}
	}

	markPlaygroundDiscountFallback(c)
	retryParam.TokenGroup = "default"
	retryParam.SetRetry(0)
	retryParam.ResetRetryNextTry()
	info.RetryIndex = 0
	info.LastError = nil
	logger.LogWarn(c, fmt.Sprintf("主页特价文本通道不可用，已切换原价分组重试（model=%s）", info.OriginModelName))
	return nil
}

func rejectImageModelTextEndpointRequest(relayFormat types.RelayFormat, request dto.Request) *types.NewAPIError {
	if relayFormat != types.RelayFormatOpenAI &&
		relayFormat != types.RelayFormatOpenAIResponses &&
		relayFormat != types.RelayFormatOpenAIResponsesCompaction {
		return nil
	}
	modelName := ""
	switch r := request.(type) {
	case *dto.GeneralOpenAIRequest:
		modelName = r.Model
	case *dto.OpenAIResponsesRequest:
		modelName = r.Model
	case *dto.OpenAIResponsesCompactionRequest:
		modelName = r.Model
	default:
		return nil
	}
	modelName = strings.TrimSpace(modelName)
	if !isImageGenerationModelName(modelName) {
		return nil
	}
	if strings.EqualFold(modelName, service.PublicDiscountImage2ModelName) {
		return types.NewErrorWithStatusCode(
			fmt.Errorf("%s 仅支持 POST /v1/images/generations 文生图", service.PublicDiscountImage2ModelName),
			types.ErrorCodeInvalidRequest,
			http.StatusBadRequest,
			types.ErrOptionWithSkipRetry(),
		)
	}
	if service.IsSupplierExposedModelName(modelName) {
		return types.NewErrorWithStatusCode(
			fmt.Errorf("image generation models must use POST /v1/images/generations or POST /v1/images/edits instead of text endpoints"),
			types.ErrorCodeInvalidRequest,
			http.StatusBadRequest,
			types.ErrOptionWithSkipRetry(),
		)
	}
	return types.NewErrorWithStatusCode(
		fmt.Errorf("%s is an image generation model; use POST /v1/images/generations or POST /v1/images/edits instead of text endpoints", modelName),
		types.ErrorCodeInvalidRequest,
		http.StatusBadRequest,
		types.ErrOptionWithSkipRetry(),
	)
}

func isImageGenerationModelName(modelName string) bool {
	modelName = strings.ToLower(strings.TrimSpace(modelName))
	if modelName == "" {
		return false
	}
	if strings.HasPrefix(modelName, "gpt-image-") || strings.HasPrefix(modelName, "dall-e-") {
		return true
	}
	if strings.HasPrefix(modelName, "imagen-") || strings.HasPrefix(modelName, "banana-") {
		return true
	}
	if strings.HasPrefix(modelName, "geek2api-image-") || strings.HasPrefix(modelName, "grok-imagine-image") {
		return true
	}
	if strings.HasPrefix(modelName, "image 2") {
		return true
	}
	if service.IsPublicImageModelAlias(modelName) {
		return true
	}
	return strings.Contains(modelName, "image-preview")
}

var upgrader = websocket.Upgrader{
	Subprotocols: []string{"realtime"}, // WS 握手支持的协议，如果有使用 Sec-WebSocket-Protocol，则必须在此声明对应的 Protocol TODO add other protocol
	CheckOrigin: func(r *http.Request) bool {
		return true // 允许跨域
	},
}

func addUsedChannel(c *gin.Context, channelId int) {
	useChannel := c.GetStringSlice("use_channel")
	useChannel = append(useChannel, fmt.Sprintf("%d", channelId))
	c.Set("use_channel", useChannel)
}

func setPlaygroundForcedChannelIDs(c *gin.Context, channelIDs []int) {
	if c == nil {
		return
	}
	filtered := make([]int, 0, len(channelIDs))
	for _, channelID := range channelIDs {
		if channelID <= 0 {
			continue
		}
		filtered = append(filtered, channelID)
	}
	c.Set(playgroundForcedChannelIDsKey, filtered)
}

func getPlaygroundForcedChannelIDs(c *gin.Context) []int {
	if c == nil {
		return nil
	}
	value, exists := c.Get(playgroundForcedChannelIDsKey)
	if !exists {
		return nil
	}
	channelIDs, ok := value.([]int)
	if !ok || len(channelIDs) == 0 {
		return nil
	}
	return channelIDs
}

func forcePlaygroundImageChannel(c *gin.Context, request dto.Request, relayInfo *relaycommon.RelayInfo) {
	if c == nil || c.Request == nil || c.Request.URL == nil || relayInfo == nil || request == nil {
		return
	}
	path := c.Request.URL.Path
	if (!strings.HasPrefix(path, "/pg/images/") && !strings.HasPrefix(path, "/v1/images/")) || relayInfo.OriginModelName != "gpt-image-2-4K" {
		return
	}
	imageReq, ok := request.(*dto.ImageRequest)
	if !ok || imageReq == nil {
		return
	}
	resolution := playgroundImage2ForcedChannelResolution(imageReq)
	c.Set(playgroundImage2TempCircuitScopeKey, true)
	envKey, channelIDs := playgroundImage2ForcedChannelIDs(resolution)
	setPlaygroundForcedChannelIDs(c, channelIDs)
	for _, channelID := range channelIDs {
		if shouldSkipPlaygroundImage2ForcedChannel(c, channelID) {
			continue
		}
		if !model.IsChannelEnabledForGroupModel(relayInfo.TokenGroup, relayInfo.OriginModelName, channelID) {
			continue
		}
		channel, err := model.CacheGetChannel(channelID)
		if err != nil || channel == nil || channel.Status != common.ChannelStatusEnabled {
			continue
		}
		c.Set("playground_forced_channel_id", channelID)
		logger.LogInfo(c, fmt.Sprintf("image2 forced %s %s to channel #%d", relayInfo.OriginModelName, resolution, channelID))
		return
	}
	if len(channelIDs) > 0 {
		logger.LogError(c, fmt.Sprintf("image2 configured %s channels %v are unavailable for group %s", envKey, channelIDs, relayInfo.TokenGroup))
		c.Set("playground_forced_channel_unavailable", true)
	}
}

func playgroundImage2ForcedChannelResolution(imageReq *dto.ImageRequest) string {
	if resolution := playgroundImage2ForcedResolution(imageReq); resolution != "" {
		return resolution
	}
	return "1K"
}

func playgroundImage2ForcedChannelIDs(resolution string) (string, []int) {
	normalized := strings.ToUpper(strings.TrimSpace(resolution))
	envKeys := make([]string, 0, 3)
	if normalized != "" {
		envKeys = append(envKeys, "GPT_IMAGE_2_4K_"+normalized+"_CHANNEL_IDS")
	}
	envKeys = append(envKeys, "GPT_IMAGE_2_4K_CHANNEL_IDS", "GPT_IMAGE_2_CHANNEL_IDS")
	for _, key := range envKeys {
		if channelIDs := parseChannelIDList(common.GetEnvOrDefaultString(key, "")); len(channelIDs) > 0 {
			return key, channelIDs
		}
	}
	return "default", []int{24, 16, 12}
}

func playgroundImage2ForcedResolution(imageReq *dto.ImageRequest) string {
	if imageReq == nil {
		return ""
	}
	for _, value := range []string{
		imageReq.Resolution,
		playgroundImageResolutionFromBody(imageReq.ExtraBody),
		imageReq.ImageSize,
		imageReq.Size,
	} {
		if resolution := normalizePlaygroundImage2Resolution(value); resolution != "" {
			return resolution
		}
	}
	return ""
}

func normalizePlaygroundImage2Resolution(value string) string {
	normalized := strings.ToUpper(strings.TrimSpace(value))
	switch normalized {
	case "2K", "4K":
		return normalized
	case "", "AUTO", "CUSTOM", "1K":
		return ""
	}
	return playgroundImage2ResolutionFromPixelSize(normalized)
}

func playgroundImage2ResolutionFromPixelSize(value string) string {
	width, height, ok := parsePlaygroundImagePixelSize(value)
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
	return ""
}

func parsePlaygroundImagePixelSize(value string) (int, int, bool) {
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

func shouldSkipPlaygroundImage2ForcedChannel(c *gin.Context, channelID int) bool {
	if shouldSkipPlaygroundImage2TempCircuitChannel(c, channelID) {
		return true
	}
	if channelID == playgroundImage2VipMappedChannelID {
		if c != nil {
			logger.LogWarn(c, fmt.Sprintf("playground image2 forced fallback skips channel #%d because its mapped upstream model is unavailable for this pool", channelID))
		}
		return true
	}
	return false
}

func shouldSkipPlaygroundImage2TempCircuitChannel(c *gin.Context, channelID int) bool {
	circuit, ok := playgroundImage2TempCircuitForChannel(channelID)
	if !ok || !playgroundImage2TempCircuitEnabled(channelID) {
		return false
	}
	skip, probe, until := circuit.shouldSkipOrProbe(playgroundImage2TempCircuitCooldown(channelID))
	if probe && c != nil {
		c.Set(playgroundImage2TempCircuitRequestKey, true)
		logger.LogInfo(c, fmt.Sprintf("playground image2 temporary circuit half-open probing channel #%d", channelID))
	}
	if skip && c != nil {
		if until.IsZero() {
			logger.LogInfo(c, fmt.Sprintf("playground image2 temporary circuit skips channel #%d while probe is in flight", channelID))
		} else {
			logger.LogInfo(c, fmt.Sprintf("playground image2 temporary circuit skips channel #%d until %s", channelID, until.Format(time.RFC3339)))
		}
	}
	return skip
}

func playgroundImageResolutionFromBody(raw json.RawMessage) string {
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
	if err := json.Unmarshal(raw, &payload); err != nil {
		return ""
	}
	return strings.ToUpper(strings.TrimSpace(payload.Google.ImageConfig.ImageSize))
}

func parseChannelIDList(value string) []int {
	parts := strings.FieldsFunc(value, func(r rune) bool {
		return r == ',' || r == ';' || r == ' ' || r == '\n' || r == '\t'
	})
	ids := make([]int, 0, len(parts))
	seen := map[int]bool{}
	for _, part := range parts {
		id, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil || id <= 0 || seen[id] {
			continue
		}
		ids = append(ids, id)
		seen[id] = true
	}
	return ids
}

func fastTokenCountMetaForPricing(request dto.Request) *types.TokenCountMeta {
	if request == nil {
		return &types.TokenCountMeta{}
	}
	meta := &types.TokenCountMeta{
		TokenType: types.TokenTypeTokenizer,
	}
	switch r := request.(type) {
	case *dto.GeneralOpenAIRequest:
		maxCompletionTokens := lo.FromPtrOr(r.MaxCompletionTokens, uint(0))
		maxTokens := lo.FromPtrOr(r.MaxTokens, uint(0))
		if maxCompletionTokens > maxTokens {
			meta.MaxTokens = int(maxCompletionTokens)
		} else {
			meta.MaxTokens = int(maxTokens)
		}
	case *dto.OpenAIResponsesRequest:
		meta.MaxTokens = int(lo.FromPtrOr(r.MaxOutputTokens, uint(0)))
	case *dto.ClaudeRequest:
		meta.MaxTokens = int(lo.FromPtr(r.MaxTokens))
	case *dto.ImageRequest:
		// Pricing for image requests depends on ImagePriceRatio; safe to compute even when CountToken is disabled.
		return r.GetTokenCountMeta()
	default:
		// Best-effort: leave CombineText empty to avoid large allocations.
	}
	return meta
}

func getChannel(c *gin.Context, info *relaycommon.RelayInfo, retryParam *service.RetryParam) (*model.Channel, *types.NewAPIError) {
	if forcedID := c.GetInt("playground_forced_channel_id"); forcedID > 0 && retryParam.GetRetry() == 0 {
		channel, err := model.CacheGetChannel(forcedID)
		if err != nil || channel == nil || channel.Status != common.ChannelStatusEnabled {
			return nil, types.NewError(fmt.Errorf("指定媒体工坊图片渠道 #%d 不可用", forcedID), types.ErrorCodeGetChannelFailed)
		}
		newAPIError := middleware.SetupContextForSelectedChannel(c, channel, info.OriginModelName)
		if newAPIError != nil {
			return nil, newAPIError
		}
		info.InitChannelMeta(c)
		info.PriceData.GroupRatioInfo = helper.HandleGroupRatio(c, info)
		return channel, nil
	}
	if c.GetBool("playground_forced_channel_unavailable") && retryParam.GetRetry() == 0 {
		return nil, types.NewError(
			fmt.Errorf("媒体工坊图片备用渠道暂不可用"),
			types.ErrorCodeGetChannelFailed,
			types.ErrOptionWithSkipRetry(),
		)
	}
	if channel, handled, channelErr := getNextPlaygroundForcedChannel(c, info, retryParam); handled {
		if channelErr != nil {
			return nil, channelErr
		}
		return channel, nil
	}
	if info.ChannelMeta == nil {
		autoBan := c.GetBool("auto_ban")
		autoBanInt := 1
		if !autoBan {
			autoBanInt = 0
		}
		return &model.Channel{
			Id:      c.GetInt("channel_id"),
			Type:    c.GetInt("channel_type"),
			Name:    c.GetString("channel_name"),
			AutoBan: &autoBanInt,
		}, nil
	}
	selectRetryParam := retryParam
	if c.GetInt("playground_forced_channel_id") > 0 && retryParam.GetRetry() > 0 {
		adjustedRetry := retryParam.GetRetry() - 1
		selectRetryParam = &service.RetryParam{
			Ctx:        retryParam.Ctx,
			TokenGroup: retryParam.TokenGroup,
			ModelName:  retryParam.ModelName,
			Retry:      &adjustedRetry,
		}
	}
	channel, selectGroup, err := service.CacheGetRandomSatisfiedChannel(selectRetryParam)

	info.PriceData.GroupRatioInfo = helper.HandleGroupRatio(c, info)

	if err != nil {
		return nil, types.NewError(fmt.Errorf("获取分组 %s 下模型 %s 的可用渠道失败（retry）: %s", selectGroup, info.OriginModelName, err.Error()), types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry())
	}
	if channel == nil {
		return nil, types.NewError(fmt.Errorf("分组 %s 下模型 %s 的可用渠道不存在（retry）", selectGroup, info.OriginModelName), types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry())
	}

	newAPIError := middleware.SetupContextForSelectedChannel(c, channel, info.OriginModelName)
	if newAPIError != nil {
		return nil, newAPIError
	}
	return channel, nil
}

func getNextPlaygroundForcedChannel(c *gin.Context, info *relaycommon.RelayInfo, retryParam *service.RetryParam) (*model.Channel, bool, *types.NewAPIError) {
	if c == nil || info == nil || retryParam == nil || retryParam.GetRetry() <= 0 {
		return nil, false, nil
	}
	channelIDs := getPlaygroundForcedChannelIDs(c)
	if len(channelIDs) == 0 {
		return nil, false, nil
	}
	used := map[int]bool{}
	for _, raw := range c.GetStringSlice("use_channel") {
		channelID, err := strconv.Atoi(strings.TrimSpace(raw))
		if err == nil && channelID > 0 {
			used[channelID] = true
		}
	}
	for _, channelID := range channelIDs {
		if used[channelID] || shouldSkipPlaygroundImage2ForcedChannel(c, channelID) {
			continue
		}
		if !model.IsChannelEnabledForGroupModel(info.TokenGroup, info.OriginModelName, channelID) {
			continue
		}
		channel, err := model.CacheGetChannel(channelID)
		if err != nil || channel == nil || channel.Status != common.ChannelStatusEnabled {
			continue
		}
		newAPIError := middleware.SetupContextForSelectedChannel(c, channel, info.OriginModelName)
		if newAPIError != nil {
			continue
		}
		info.InitChannelMeta(c)
		info.PriceData.GroupRatioInfo = helper.HandleGroupRatio(c, info)
		return channel, true, nil
	}
	return nil, true, types.NewError(
		fmt.Errorf("媒体工坊图片备用渠道暂不可用"),
		types.ErrorCodeGetChannelFailed,
		types.ErrOptionWithSkipRetry(),
	)
}

func shouldRetry(c *gin.Context, openaiErr *types.NewAPIError, retryTimes int) bool {
	if openaiErr == nil {
		return false
	}
	if service.ShouldSkipRetryAfterChannelAffinityFailure(c) &&
		!shouldRetryPlaygroundForcedChannelError(c, openaiErr, retryTimes) &&
		!shouldBypassChannelAffinityRetryLock(openaiErr, retryTimes) {
		return false
	}
	if types.IsChannelError(openaiErr) {
		return true
	}
	if types.IsSkipRetryError(openaiErr) {
		return false
	}
	if retryTimes <= 0 {
		return false
	}
	if _, ok := c.Get("specific_channel_id"); ok {
		return false
	}
	code := openaiErr.StatusCode
	if shouldRetryPlaygroundForcedChannelError(c, openaiErr, retryTimes) {
		return true
	}
	if code >= 200 && code < 300 {
		return false
	}
	if code < 100 || code > 599 {
		return true
	}
	if operation_setting.IsAlwaysSkipRetryCode(openaiErr.GetErrorCode()) {
		return false
	}
	return operation_setting.ShouldRetryByStatusCode(code)
}

func shouldRetryPlaygroundForcedChannelError(c *gin.Context, openaiErr *types.NewAPIError, retryTimes int) bool {
	if c == nil || openaiErr == nil || retryTimes <= 0 || !hasUnusedPlaygroundForcedChannel(c) {
		return false
	}
	if isPlaygroundUpstreamQuotaLikeError(openaiErr) {
		return true
	}
	code := openaiErr.StatusCode
	if code == http.StatusGatewayTimeout || code == 524 || code >= 500 || code < 100 || code > 599 {
		return true
	}
	return false
}

func isPlaygroundUpstreamQuotaLikeError(openaiErr *types.NewAPIError) bool {
	if openaiErr == nil || types.IsSkipRetryError(openaiErr) || !openaiErr.IsUpstreamRelayError() {
		return false
	}
	message := strings.ToLower(openaiErr.Error())
	code := strings.ToLower(string(openaiErr.GetErrorCode()))
	return types.ContainsQuotaLikeError(message) ||
		types.ContainsQuotaLikeError(code) ||
		looksLikeUpstreamImageBalanceError(message)
}

func looksLikeUpstreamImageBalanceError(value string) bool {
	lower := strings.ToLower(strings.TrimSpace(value))
	if lower == "" {
		return false
	}
	if strings.Contains(lower, "required up to") && strings.Contains(lower, "available") {
		return true
	}
	return strings.Contains(lower, "发起生图请求") ||
		strings.Contains(lower, "本次及在途任务") ||
		strings.Contains(lower, "start image generation")
}

func hasUnusedPlaygroundForcedChannel(c *gin.Context) bool {
	if c == nil {
		return false
	}
	channelIDs := getPlaygroundForcedChannelIDs(c)
	if len(channelIDs) == 0 {
		return false
	}
	used := map[int]bool{}
	for _, raw := range c.GetStringSlice("use_channel") {
		channelID, err := strconv.Atoi(strings.TrimSpace(raw))
		if err == nil && channelID > 0 {
			used[channelID] = true
		}
	}
	for _, channelID := range channelIDs {
		if !used[channelID] {
			return true
		}
	}
	return false
}

func shouldBypassChannelAffinityRetryLock(openaiErr *types.NewAPIError, retryTimes int) bool {
	if openaiErr == nil || retryTimes <= 0 || types.IsSkipRetryError(openaiErr) {
		return false
	}
	code := openaiErr.StatusCode
	if code == http.StatusForbidden || code == http.StatusTooManyRequests || code/100 == 5 {
		return operation_setting.ShouldRetryByStatusCode(code)
	}
	return false
}

func processChannelError(c *gin.Context, channelError types.ChannelError, err *types.NewAPIError) {
	logger.LogError(c, fmt.Sprintf("channel error (channel #%d, status code: %d): %s", channelError.ChannelId, err.StatusCode, common.LocalLogPreview(err.Error())))
	recordPlaygroundImage2TempCircuitFailure(c, channelError.ChannelId, err)
	recordPlaygroundImageTaskChannelError(c, channelError.ChannelId, err)
	// 不要使用context获取渠道信息，异步处理时可能会出现渠道信息不一致的情况
	// do not use context to get channel info, there may be inconsistent channel info when processing asynchronously
	if service.ShouldDisableChannel(err) && channelError.AutoBan {
		gopool.Go(func() {
			service.DisableChannel(channelError, err.ErrorWithStatusCode())
		})
	}

	if constant.ErrorLogEnabled && types.IsRecordErrorLog(err) {
		// 保存错误日志到mysql中
		userId := c.GetInt("id")
		tokenName := c.GetString("token_name")
		modelName := c.GetString("original_model")
		tokenId := c.GetInt("token_id")
		userGroup := c.GetString("group")
		channelId := c.GetInt("channel_id")
		other := make(map[string]interface{})
		if c.Request != nil && c.Request.URL != nil {
			other["request_path"] = c.Request.URL.Path
		}
		other["error_type"] = err.GetErrorType()
		other["error_code"] = err.GetErrorCode()
		other["status_code"] = err.StatusCode
		other["channel_id"] = channelId
		other["channel_name"] = c.GetString("channel_name")
		other["channel_type"] = c.GetInt("channel_type")
		adminInfo := make(map[string]interface{})
		adminInfo["use_channel"] = c.GetStringSlice("use_channel")
		isMultiKey := common.GetContextKeyBool(c, constant.ContextKeyChannelIsMultiKey)
		if isMultiKey {
			adminInfo["is_multi_key"] = true
			adminInfo["multi_key_index"] = common.GetContextKeyInt(c, constant.ContextKeyChannelMultiKeyIndex)
		}
		service.AppendChannelAffinityAdminInfo(c, adminInfo)
		other["admin_info"] = adminInfo
		startTime := common.GetContextKeyTime(c, constant.ContextKeyRequestStartTime)
		if startTime.IsZero() {
			startTime = time.Now()
		}
		useTimeSeconds := int(time.Since(startTime).Seconds())
		model.RecordErrorLog(c, userId, channelId, modelName, tokenName, err.MaskSensitiveErrorWithStatusCode(), tokenId, useTimeSeconds, common.GetContextKeyBool(c, constant.ContextKeyIsStream), userGroup, other)
	}

}

func RelayMidjourney(c *gin.Context) {
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatMjProxy, nil, nil)

	if err != nil {
		publicErr := types.NewError(
			fmt.Errorf("failed to generate relay info: %s", err.Error()),
			types.ErrorCodeGenRelayInfoFailed,
			types.ErrOptionWithSkipRetry(),
		).ToPublicOpenAIError(c.GetString(common.RequestIdKey))
		c.JSON(http.StatusInternalServerError, gin.H{
			"description": publicErr.Message,
			"type":        publicErr.Type,
			"code":        publicErr.Code,
		})
		return
	}

	var mjErr *dto.MidjourneyResponse
	switch relayInfo.RelayMode {
	case relayconstant.RelayModeMidjourneyNotify:
		mjErr = relay.RelayMidjourneyNotify(c)
	case relayconstant.RelayModeMidjourneyTaskFetch, relayconstant.RelayModeMidjourneyTaskFetchByCondition:
		mjErr = relay.RelayMidjourneyTask(c, relayInfo.RelayMode)
	case relayconstant.RelayModeMidjourneyTaskImageSeed:
		mjErr = relay.RelayMidjourneyTaskImageSeed(c)
	case relayconstant.RelayModeSwapFace:
		mjErr = relay.RelaySwapFace(c, relayInfo)
	default:
		mjErr = relay.RelayMidjourneySubmit(c, relayInfo)
	}
	//err = relayMidjourneySubmit(c, relayMode)
	log.Println(mjErr)
	if mjErr != nil {
		statusCode := http.StatusBadRequest
		if mjErr.Code == 30 {
			mjErr.Result = "当前分组负载已饱和，请稍后再试，或升级账户以提升服务质量。"
			statusCode = http.StatusTooManyRequests
		}
		description := fmt.Sprintf("%s %s", mjErr.Description, mjErr.Result)
		if types.ContainsProviderDisclosure(description) {
			description = "模型服务暂时不可用，请稍后重试。"
		}
		c.JSON(statusCode, gin.H{
			"description": description,
			"type":        "new_api_error",
			"code":        mjErr.Code,
		})
		channelId := c.GetInt("channel_id")
		logger.LogError(c, fmt.Sprintf("relay error (channel #%d, status code %d): %s", channelId, statusCode, fmt.Sprintf("%s %s", mjErr.Description, mjErr.Result)))
	}
}

func recordPlaygroundImage2TempCircuitFailure(c *gin.Context, channelID int, err *types.NewAPIError) {
	circuit, ok := playgroundImage2TempCircuitForChannel(channelID)
	if c == nil || err == nil || !ok ||
		!c.GetBool(playgroundImage2TempCircuitScopeKey) || !playgroundImage2TempCircuitEnabled(channelID) {
		return
	}
	if !shouldCoolDownPlaygroundImage2TempCircuit(err) {
		return
	}
	until := circuit.coolDown(playgroundImage2TempCircuitCooldown(channelID))
	logger.LogWarn(c, fmt.Sprintf("playground image2 temporary circuit cools channel #%d until %s after status %d", channelID, until.Format(time.RFC3339), err.StatusCode))
}

func shouldCoolDownPlaygroundImage2TempCircuit(err *types.NewAPIError) bool {
	if err == nil {
		return false
	}
	if types.IsChannelError(err) {
		return true
	}
	if isPlaygroundUpstreamQuotaLikeError(err) {
		return true
	}
	statusCode := err.StatusCode
	if statusCode == http.StatusNotFound || statusCode == http.StatusRequestTimeout || statusCode == http.StatusTooManyRequests || statusCode >= 500 {
		return true
	}
	if statusCode < 100 || statusCode > 599 {
		return true
	}
	return false
}

func recordPlaygroundImage2TempCircuitSuccess(c *gin.Context, channelID int) {
	circuit, ok := playgroundImage2TempCircuitForChannel(channelID)
	if c == nil || !ok ||
		!c.GetBool(playgroundImage2TempCircuitScopeKey) || !c.GetBool(playgroundImage2TempCircuitRequestKey) ||
		!playgroundImage2TempCircuitEnabled(channelID) {
		return
	}
	threshold := playgroundImage2TempCircuitSuccessThreshold(channelID)
	restored, successes, until := circuit.markProbeSuccess(threshold, playgroundImage2TempCircuitCooldown(channelID))
	if restored {
		logger.LogInfo(c, fmt.Sprintf("playground image2 temporary circuit restores channel #%d after %d consecutive successful probes", channelID, successes))
		return
	}
	logger.LogInfo(c, fmt.Sprintf("playground image2 temporary circuit keeps channel #%d cooled until %s after successful probe (%d/%d)", channelID, until.Format(time.RFC3339), successes, threshold))
}

func RelayNotImplemented(c *gin.Context) {
	err := types.OpenAIError{
		Message: "API not implemented",
		Type:    "new_api_error",
		Param:   "",
		Code:    "api_not_implemented",
	}
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": err,
	})
}

func RelayNotFound(c *gin.Context) {
	err := types.OpenAIError{
		Message: fmt.Sprintf("Invalid URL (%s %s)", c.Request.Method, c.Request.URL.Path),
		Type:    "invalid_request_error",
		Param:   "",
		Code:    "",
	}
	c.JSON(http.StatusNotFound, gin.H{
		"error": err,
	})
}

func RelayTaskFetch(c *gin.Context) {
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatTask, nil, nil)
	if err != nil {
		taskErr := &dto.TaskError{
			Code:       "gen_relay_info_failed",
			Message:    err.Error(),
			StatusCode: http.StatusInternalServerError,
		}
		respondTaskError(c, taskErr)
		return
	}
	if taskErr := relay.RelayTaskFetch(c, relayInfo.RelayMode); taskErr != nil {
		respondTaskError(c, taskErr)
	}
}

func RelayTask(c *gin.Context) {
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatTask, nil, nil)
	if err != nil {
		taskErr := &dto.TaskError{
			Code:       "gen_relay_info_failed",
			Message:    err.Error(),
			StatusCode: http.StatusInternalServerError,
		}
		respondTaskError(c, taskErr)
		return
	}

	if taskErr := relay.ResolveOriginTask(c, relayInfo); taskErr != nil {
		respondTaskError(c, taskErr)
		return
	}
	if relayInfo.LockedChannel == nil {
		if routedChannelID := c.GetInt(middleware.DurationRoutedVideoChannelIDContextKey); routedChannelID > 0 {
			routedChannel, channelErr := model.CacheGetChannel(routedChannelID)
			if channelErr != nil || routedChannel == nil || routedChannel.Status != common.ChannelStatusEnabled {
				respondTaskError(c, service.TaskErrorWrapperLocal(errors.New("duration-specific video channel is unavailable"), "service_unavailable", http.StatusServiceUnavailable))
				return
			}
			relayInfo.LockedChannel = routedChannel
		}
	}

	var result *relay.TaskSubmitResult
	var taskErr *dto.TaskError
	defer func() {
		if taskErr != nil && relayInfo.Billing != nil {
			relayInfo.Billing.Refund(c)
		}
	}()

	retryParam := &service.RetryParam{
		Ctx:        c,
		TokenGroup: relayInfo.TokenGroup,
		ModelName:  relayInfo.OriginModelName,
		Retry:      common.GetPointer(0),
	}

	for ; retryParam.GetRetry() <= common.RetryTimes; retryParam.IncreaseRetry() {
		var channel *model.Channel

		if lockedCh, ok := relayInfo.LockedChannel.(*model.Channel); ok && lockedCh != nil {
			channel = lockedCh
			if retryParam.GetRetry() > 0 {
				if setupErr := middleware.SetupContextForSelectedChannel(c, channel, relayInfo.OriginModelName); setupErr != nil {
					taskErr = service.TaskErrorWrapperLocal(setupErr.Err, "setup_locked_channel_failed", http.StatusInternalServerError)
					break
				}
			}
		} else {
			var channelErr *types.NewAPIError
			channel, channelErr = getChannel(c, relayInfo, retryParam)
			if channelErr != nil {
				logger.LogError(c, channelErr.Error())
				taskErr = service.TaskErrorWrapperLocal(channelErr.Err, "get_channel_failed", http.StatusInternalServerError)
				break
			}
		}

		addUsedChannel(c, channel.Id)
		bodyStorage, bodyErr := common.GetBodyStorage(c)
		if bodyErr != nil {
			if common.IsRequestBodyTooLargeError(bodyErr) || errors.Is(bodyErr, common.ErrRequestBodyTooLarge) {
				taskErr = service.TaskErrorWrapperLocal(bodyErr, "read_request_body_failed", http.StatusRequestEntityTooLarge)
			} else {
				taskErr = service.TaskErrorWrapperLocal(bodyErr, "read_request_body_failed", http.StatusBadRequest)
			}
			break
		}
		c.Request.Body = io.NopCloser(bodyStorage)

		result, taskErr = relay.RelayTaskSubmit(c, relayInfo)
		if taskErr == nil {
			break
		}

		if !taskErr.LocalError {
			processChannelError(c,
				*types.NewChannelError(channel.Id, channel.Type, channel.Name, channel.ChannelInfo.IsMultiKey,
					common.GetContextKeyString(c, constant.ContextKeyChannelKey), channel.GetAutoBan()),
				types.NewOpenAIError(taskErr.Error, types.ErrorCodeBadResponseStatusCode, taskErr.StatusCode))
		}

		if !shouldRetryTaskRelay(c, channel.Id, taskErr, common.RetryTimes-retryParam.GetRetry()) {
			break
		}
	}

	useChannel := c.GetStringSlice("use_channel")
	if len(useChannel) > 1 {
		retryLogStr := fmt.Sprintf("重试：%s", strings.Trim(strings.Join(strings.Fields(fmt.Sprint(useChannel)), "->"), "[]"))
		logger.LogInfo(c, retryLogStr)
	}

	// ── 成功：结算 + 日志 + 插入任务 ──
	if taskErr == nil {
		if settleErr := service.SettleBilling(c, relayInfo, result.Quota); settleErr != nil {
			common.SysError("settle task billing error: " + settleErr.Error())
		}
		service.LogTaskConsumption(c, relayInfo)

		task := model.InitTask(result.Platform, relayInfo)
		task.PrivateData.UpstreamTaskID = result.UpstreamTaskID
		task.PrivateData.BillingSource = relayInfo.BillingSource
		task.PrivateData.SubscriptionId = relayInfo.SubscriptionId
		task.PrivateData.TokenId = relayInfo.TokenId
		persistTaskPollingKey(c, task)
		task.PrivateData.BillingContext = &model.TaskBillingContext{
			ModelPrice:      relayInfo.PriceData.ModelPrice,
			GroupRatio:      relayInfo.PriceData.GroupRatioInfo.GroupRatio,
			ModelRatio:      relayInfo.PriceData.ModelRatio,
			OtherRatios:     relayInfo.PriceData.OtherRatios(),
			OriginModelName: relayInfo.OriginModelName,
			PerCallBilling:  common.StringsContains(constant.TaskPricePatches, relayInfo.OriginModelName) || relayInfo.PriceData.UsePrice,
		}
		task.Quota = result.Quota
		task.Data = result.TaskData
		annotatePlaygroundVideoTaskData(c, task, relayInfo)
		task.Action = relayInfo.Action
		if insertErr := task.Insert(); insertErr != nil {
			common.SysError("insert task error: " + insertErr.Error())
		} else if isVideoTaskPath(c) {
			publicTaskID := task.TaskID
			gopool.Go(func() {
				service.WatchAsyncVideoTask(publicTaskID)
			})
		}
	}

	if taskErr != nil {
		respondTaskError(c, taskErr)
	}
}

func persistTaskPollingKey(c *gin.Context, task *model.Task) {
	if c == nil || task == nil {
		return
	}
	if key := strings.TrimSpace(common.GetContextKeyString(c, constant.ContextKeyChannelKey)); key != "" {
		task.PrivateData.Key = key
	}
}

func isVideoTaskPath(c *gin.Context) bool {
	if c == nil || c.Request == nil || c.Request.URL == nil {
		return false
	}
	switch strings.TrimSpace(c.Request.URL.Path) {
	case "/v1/videos", "/pg/videos", "/pg/video/generations":
		return true
	default:
		return false
	}
}

// respondTaskError 统一输出 Task 错误响应（含 429 限流提示改写）
func respondTaskError(c *gin.Context, taskErr *dto.TaskError) {
	if isVideoTaskPath(c) && !taskErr.LocalError {
		taskErr.Code = "service_unavailable"
		taskErr.Message = "视频生成服务暂时不可用，请稍后重试。"
		taskErr.Data = nil
		taskErr.StatusCode = http.StatusBadGateway
	}
	if taskErr.Code == "gen_relay_info_failed" || taskErr.Code == "get_channel_failed" || types.ContainsProviderDisclosure(taskErr.Code) {
		taskErr.Code = "service_unavailable"
	}
	if taskErr.StatusCode == http.StatusTooManyRequests {
		taskErr.Message = "当前服务负载较高，请稍后再试。"
	} else if types.ContainsProviderDisclosure(taskErr.Message) {
		taskErr.Message = "模型服务暂时不可用，请稍后重试。"
	}
	c.JSON(taskErr.StatusCode, taskErr)
}

func shouldRetryTaskRelay(c *gin.Context, channelId int, taskErr *dto.TaskError, retryTimes int) bool {
	if taskErr == nil {
		return false
	}
	if service.ShouldSkipRetryAfterChannelAffinityFailure(c) {
		return false
	}
	if retryTimes <= 0 {
		return false
	}
	if _, ok := c.Get("specific_channel_id"); ok {
		return false
	}
	if taskErr.StatusCode == http.StatusTooManyRequests {
		return true
	}
	if taskErr.StatusCode == 307 {
		return true
	}
	if taskErr.StatusCode/100 == 5 {
		// 超时不重试
		if operation_setting.IsAlwaysSkipRetryStatusCode(taskErr.StatusCode) {
			return false
		}
		return true
	}
	if taskErr.StatusCode == http.StatusBadRequest {
		return false
	}
	if taskErr.StatusCode == 408 {
		// azure处理超时不重试
		return false
	}
	if taskErr.LocalError {
		return false
	}
	if taskErr.StatusCode/100 == 2 {
		return false
	}
	return true
}
