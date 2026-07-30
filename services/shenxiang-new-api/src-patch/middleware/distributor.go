package middleware

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

type ModelRequest struct {
	Model   string `json:"model" form:"model"`
	Group   string `json:"group,omitempty" form:"group"`
	Seconds string `json:"seconds,omitempty" form:"seconds"`
}

const (
	PublicImageModelAliasContextKey        = "public_image_model_alias"
	DurationRoutedVideoChannelIDContextKey = "duration_routed_video_channel_id"
	SelectedChannelTagContextKey           = "selected_channel_tag"
	grokVideo15PublicModel                 = "grok-video-1.5"
	grokVideo15SixSecondChannelTag         = "xingren-grok-video-15-6s"
	grokVideo15TenSecondChannelTag         = "xingren-grok-video-15-10s"
)

var errInvalidGrokVideo15Duration = errors.New("Grok Video 1.5 的 seconds 仅支持 6 或 10。")

func Distribute() func(c *gin.Context) {
	return func(c *gin.Context) {
		var channel *model.Channel
		channelId, ok := common.GetContextKey(c, constant.ContextKeyTokenSpecificChannelId)
		modelRequest, shouldSelectChannel, err := getModelRequest(c)
		if err != nil {
			abortWithOpenAiMessage(c, http.StatusBadRequest, i18n.T(c, i18n.MsgDistributorInvalidRequest, map[string]any{"Error": err.Error()}))
			return
		}
		if shouldSelectChannel && service.IsRetiredImageModelName(modelRequest.Model) {
			abortWithOpenAiMessage(c, http.StatusNotFound, "该模型已下架，请选择其他模型。", types.ErrorCodeModelNotFound)
			return
		}
		publicModelAlias := publicImageModelAliasForRequest(c)
		if service.IsSupplierExposedModelName(modelRequest.Model) &&
			!service.IsInternalImageModelAllowedByPublicAlias(modelRequest.Model, publicModelAlias) {
			abortWithOpenAiMessage(c, http.StatusForbidden, "当前账号暂未开通该模型，请联系管理员或切换模型。", types.ErrorCodeAccessDenied)
			return
		}
		if ok {
			id, err := strconv.Atoi(channelId.(string))
			if err != nil {
				abortWithOpenAiMessage(c, http.StatusBadRequest, i18n.T(c, i18n.MsgDistributorInvalidChannelId))
				return
			}
			channel, err = model.GetChannelById(id, true)
			if err != nil {
				abortWithOpenAiMessage(c, http.StatusBadRequest, i18n.T(c, i18n.MsgDistributorInvalidChannelId))
				return
			}
			if channel.Status != common.ChannelStatusEnabled {
				abortWithOpenAiMessage(c, http.StatusForbidden, i18n.T(c, i18n.MsgDistributorChannelDisabled))
				return
			}
		} else {
			// Select a channel for the user
			// check token model mapping
			modelLimitEnable := common.GetContextKeyBool(c, constant.ContextKeyTokenModelLimitEnabled)
			if modelLimitEnable {
				s, ok := common.GetContextKey(c, constant.ContextKeyTokenModelLimit)
				if !ok {
					// token model limit is empty, all models are not allowed
					abortWithOpenAiMessage(c, http.StatusForbidden, i18n.T(c, i18n.MsgDistributorTokenNoModelAccess))
					return
				}
				var tokenModelLimit map[string]bool
				tokenModelLimit, ok = s.(map[string]bool)
				if !ok {
					tokenModelLimit = map[string]bool{}
				}
				accessModelName := publicModelAlias
				if strings.TrimSpace(accessModelName) == "" {
					accessModelName = modelRequest.Model
				}
				matchName := ratio_setting.FormatMatchingModelName(accessModelName) // match gpts & thinking-*
				_, allowed := tokenModelLimit[matchName]
				if !allowed && service.IsInternalImageModelAllowedByPublicAlias(modelRequest.Model, publicModelAlias) {
					legacyMatchName := ratio_setting.FormatMatchingModelName(modelRequest.Model)
					_, allowed = tokenModelLimit[legacyMatchName]
				}
				if !allowed {
					abortWithOpenAiMessage(c, http.StatusForbidden, i18n.T(c, i18n.MsgDistributorTokenModelForbidden, map[string]any{"Model": accessModelName}))
					return
				}
			}

			if shouldSelectChannel {
				if modelRequest.Model == "" {
					abortWithOpenAiMessage(c, http.StatusBadRequest, i18n.T(c, i18n.MsgDistributorModelNameRequired))
					return
				}
				var selectGroup string
				usingGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
				// check path is /pg/chat/completions
				if strings.HasPrefix(c.Request.URL.Path, "/pg/chat/completions") {
					playgroundRequest := &dto.PlayGroundRequest{}
					err = common.UnmarshalBodyReusable(c, playgroundRequest)
					if err != nil {
						abortWithOpenAiMessage(c, http.StatusBadRequest, i18n.T(c, i18n.MsgDistributorInvalidPlayground, map[string]any{"Error": err.Error()}))
						return
					}
					if service.IsTextPricingPreferenceModel(modelRequest.Model) {
						preferredGroup, preferenceErr := applyPlaygroundTextPricingPreference(c, modelRequest)
						if preferenceErr != nil {
							common.SysLog(fmt.Sprintf("text pricing preference lookup failed: user_id=%d error=%v", c.GetInt("id"), preferenceErr))
							abortWithOpenAiMessage(c, http.StatusInternalServerError, "读取当前倍率失败，请稍后重试")
							return
						}
						usingGroup = preferredGroup
					} else if playgroundRequest.Group != "" {
						managedGrok45Entitled := false
						if strings.TrimSpace(usingGroup) == service.Grok45PricingGroupName ||
							strings.TrimSpace(playgroundRequest.Group) == service.Grok45PricingGroupName {
							entitled, entitlementErr := service.UserHasManagedGrok45Entitlement(c.Request.Context(), c.GetInt("id"))
							if entitlementErr != nil {
								common.SysLog(fmt.Sprintf("managed Grok playground entitlement lookup failed: user_id=%d error=%v", c.GetInt("id"), entitlementErr))
							} else {
								managedGrok45Entitled = entitled
							}
						}
						if !canUsePlaygroundGroup(usingGroup, playgroundRequest.Group, modelRequest.Model, managedGrok45Entitled) {
							abortWithOpenAiMessage(c, http.StatusForbidden, i18n.T(c, i18n.MsgDistributorGroupAccessDenied))
							return
						}
						usingGroup = playgroundRequest.Group
						service.SetTokenGroupChain(c, []string{usingGroup})
					}
				}

				if kimiGroup := applyKimiK3PricingRoute(c, modelRequest); kimiGroup != "" {
					usingGroup = kimiGroup
				}

				if routedChannel, routedGroup, handled, routeErr := selectGrokVideo15DurationChannel(c, modelRequest, usingGroup); handled {
					if routeErr != nil {
						if errors.Is(routeErr, errInvalidGrokVideo15Duration) {
							abortWithOpenAiMessage(c, http.StatusBadRequest, routeErr.Error())
						} else {
							logDistributorNoAvailableChannel(c, modelRequest.Model, usingGroup, "duration-specific channel unavailable")
							abortWithOpenAiMessage(c, http.StatusServiceUnavailable, "视频生成服务暂时不可用，请稍后重试。", types.ErrorCodeModelNotFound)
						}
						return
					}
					channel = routedChannel
					selectGroup = routedGroup
					c.Set(DurationRoutedVideoChannelIDContextKey, routedChannel.Id)
					service.MarkTokenGroupChainSelected(c, routedGroup)
					if usingGroup == "auto" {
						common.SetContextKey(c, constant.ContextKeyAutoGroup, routedGroup)
					}
				}

				if channel == nil {
					if preferredChannelID, found := service.GetPreferredChannelByAffinity(c, modelRequest.Model, usingGroup); found {
						affinityUsable := false
						preferred, err := model.CacheGetChannel(preferredChannelID)
						if err == nil && preferred != nil && preferred.Status == common.ChannelStatusEnabled {
							if usingGroup == "auto" {
								userGroup := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
								autoGroups := service.GetUserAutoGroup(userGroup)
								for _, g := range autoGroups {
									if model.IsChannelCurrentPriorityForGroupModel(g, modelRequest.Model, preferred.Id) {
										selectGroup = g
										common.SetContextKey(c, constant.ContextKeyAutoGroup, g)
										channel = preferred
										affinityUsable = true
										service.MarkChannelAffinityUsed(c, g, preferred.Id)
										service.MarkTokenGroupChainSelected(c, g)
										break
									}
								}
							} else if model.IsChannelCurrentPriorityForGroupModel(usingGroup, modelRequest.Model, preferred.Id) {
								channel = preferred
								selectGroup = usingGroup
								affinityUsable = true
								service.MarkChannelAffinityUsed(c, usingGroup, preferred.Id)
								service.MarkTokenGroupChainSelected(c, usingGroup)
							}
						}
						if !affinityUsable && !service.ShouldKeepChannelAffinityOnChannelDisabled() {
							service.ClearCurrentChannelAffinityCache(c)
						}
					}
				}

				if channel == nil {
					channel, selectGroup, err = service.CacheGetRandomSatisfiedChannel(&service.RetryParam{
						Ctx:        c,
						ModelName:  modelRequest.Model,
						TokenGroup: usingGroup,
						Retry:      common.GetPointer(0),
					})
					if err != nil {
						showGroup := usingGroup
						if usingGroup == "auto" {
							showGroup = fmt.Sprintf("auto(%s)", selectGroup)
						}
						logDistributorNoAvailableChannel(c, modelRequest.Model, showGroup, err.Error())
						message := i18n.T(c, i18n.MsgDistributorGetChannelFailed, map[string]any{"Group": showGroup, "Model": modelRequest.Model, "Error": err.Error()})
						// 如果错误，但是渠道不为空，说明是数据库一致性问题
						//if channel != nil {
						//	common.SysError(fmt.Sprintf("渠道不存在：%d", channel.Id))
						//	message = "数据库一致性已被破坏，请联系管理员"
						//}
						abortWithOpenAiMessage(c, http.StatusServiceUnavailable, message, types.ErrorCodeModelNotFound)
						return
					}
					if channel == nil {
						logDistributorNoAvailableChannel(c, modelRequest.Model, usingGroup, "nil channel")
						abortWithOpenAiMessage(c, http.StatusServiceUnavailable, i18n.T(c, i18n.MsgDistributorNoAvailableChannel, map[string]any{"Group": usingGroup, "Model": modelRequest.Model}), types.ErrorCodeModelNotFound)
						return
					}
				}
			}
		}
		common.SetContextKey(c, constant.ContextKeyRequestStartTime, time.Now())
		selectedGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
		if strings.HasPrefix(c.Request.URL.Path, "/pg/chat/completions") &&
			service.IsTextPricingPreferenceModel(modelRequest.Model) && selectedGroup != "" {
			c.Header("X-Aiphui-Pricing-Group", selectedGroup)
		}
		if setupErr := SetupContextForSelectedChannel(c, channel, modelRequest.Model); setupErr != nil {
			abortWithOpenAiMessage(c, setupErr.StatusCode, setupErr.Error(), setupErr.GetErrorCode())
			return
		}
		c.Next()
		if channel != nil && c.Writer != nil && c.Writer.Status() < http.StatusBadRequest {
			service.RecordChannelAffinity(c, channel.Id)
		}
	}
}

func selectGrokVideo15DurationChannel(c *gin.Context, modelRequest *ModelRequest, usingGroup string) (*model.Channel, string, bool, error) {
	if c == nil || c.Request == nil || c.Request.URL == nil || modelRequest == nil || modelRequest.Model != grokVideo15PublicModel || c.Request.Method != http.MethodPost {
		return nil, "", false, nil
	}
	switch strings.TrimSpace(c.Request.URL.Path) {
	case "/pg/videos", "/pg/video/generations", "/v1/videos", "/v1/video/generations":
	default:
		return nil, "", false, nil
	}

	var routingTag string
	switch strings.TrimSpace(modelRequest.Seconds) {
	case "6":
		routingTag = grokVideo15SixSecondChannelTag
	case "10":
		routingTag = grokVideo15TenSecondChannelTag
	default:
		return nil, "", true, errInvalidGrokVideo15Duration
	}

	groups := service.GetTokenGroupChain(c)
	if len(groups) <= 1 {
		groups = []string{strings.TrimSpace(usingGroup)}
	}
	if strings.TrimSpace(usingGroup) == "auto" {
		groups = service.GetUserAutoGroup(common.GetContextKeyString(c, constant.ContextKeyUserGroup))
	}
	for _, group := range groups {
		channel, err := model.GetEnabledTaggedChannelForGroupModel(group, modelRequest.Model, routingTag)
		if err != nil {
			return nil, "", true, err
		}
		if channel != nil {
			return channel, group, true, nil
		}
	}
	return nil, "", true, errors.New("duration-specific video channel is unavailable")
}

func applyPlaygroundTextPricingPreference(c *gin.Context, modelRequest *ModelRequest) (string, error) {
	if c == nil || modelRequest == nil || !service.IsTextPricingPreferenceModel(modelRequest.Model) {
		return "", errors.New("text pricing preference context is invalid")
	}
	preferredGroup, groups, err := model.ResolveUserTextPricingGroupChain(c.GetInt("id"))
	if err != nil {
		return "", err
	}
	modelRequest.Group = preferredGroup
	service.SetTokenGroupChain(c, groups)
	c.Header("X-Aiphui-Pricing-Group", preferredGroup)
	return preferredGroup, nil
}

func applyKimiK3PricingRoute(c *gin.Context, modelRequest *ModelRequest) string {
	if c == nil || modelRequest == nil || !service.IsKimiK3Model(modelRequest.Model) {
		return ""
	}
	group := service.KimiK3PricingGroupName
	modelRequest.Group = group
	service.SetTokenGroupChain(c, []string{group})
	c.Header("X-Aiphui-Pricing-Group", group)
	return group
}

func canUsePlaygroundGroup(usingGroup, requestedGroup, modelName string, managedGrok45Entitled bool) bool {
	usingGroup = strings.TrimSpace(usingGroup)
	requestedGroup = strings.TrimSpace(requestedGroup)
	modelName = strings.TrimSpace(modelName)
	if usingGroup == service.Grok45PricingGroupName || requestedGroup == service.Grok45PricingGroupName {
		return managedGrok45Entitled &&
			modelName == service.Grok45ModelName &&
			requestedGroup == service.Grok45PricingGroupName
	}
	return service.GroupInUserUsableGroups(usingGroup, requestedGroup) || requestedGroup == usingGroup
}

func logDistributorNoAvailableChannel(c *gin.Context, modelName, groupName, reason string) {
	if c == nil || c.Request == nil || c.Request.URL == nil {
		return
	}
	common.SysLog(fmt.Sprintf(
		"distributor no available channel: request_id=%s user_id=%d path=%s model=%s group=%s reason=%s",
		c.GetString(common.RequestIdKey),
		c.GetInt("id"),
		c.Request.URL.Path,
		modelName,
		groupName,
		reason,
	))
}

// getModelFromRequest 从请求中读取模型信息
// 根据 Content-Type 自动处理：
// - application/json
// - application/x-www-form-urlencoded
// - multipart/form-data
func getModelFromRequest(c *gin.Context) (*ModelRequest, error) {
	if strings.HasPrefix(c.Request.Header.Get("Content-Type"), "application/json") {
		modelRequest, err := getModelFromJSONBody(c)
		if err != nil {
			return nil, errors.New(i18n.T(c, i18n.MsgDistributorInvalidRequest, map[string]any{"Error": err.Error()}))
		}
		return modelRequest, nil
	}

	var modelRequest ModelRequest
	err := common.UnmarshalBodyReusable(c, &modelRequest)
	if err != nil {
		return nil, errors.New(i18n.T(c, i18n.MsgDistributorInvalidRequest, map[string]any{"Error": err.Error()}))
	}
	return &modelRequest, nil
}

func getModelFromJSONBody(c *gin.Context) (*ModelRequest, error) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, err
	}
	requestBody, err := storage.Bytes()
	if err != nil {
		return nil, err
	}
	if !gjson.ValidBytes(requestBody) {
		return nil, errors.New("invalid JSON request body")
	}

	values := gjson.GetManyBytes(requestBody, "model", "group", "seconds")
	model, err := getJSONStringValue(values[0], "model")
	if err != nil {
		return nil, err
	}
	group, err := getJSONStringValue(values[1], "group")
	if err != nil {
		return nil, err
	}
	seconds := ""
	if values[2].Exists() && values[2].Type != gjson.Null {
		switch values[2].Type {
		case gjson.String:
			seconds = values[2].String()
		case gjson.Number:
			seconds = values[2].Raw
		default:
			return nil, errors.New("field seconds must be a string or number")
		}
	}

	if _, seekErr := storage.Seek(0, io.SeekStart); seekErr != nil {
		return nil, seekErr
	}
	c.Request.Body = io.NopCloser(storage)

	return &ModelRequest{
		Model:   model,
		Group:   group,
		Seconds: seconds,
	}, nil
}

func getJSONStringValue(result gjson.Result, field string) (string, error) {
	if !result.Exists() || result.Type == gjson.Null {
		return "", nil
	}
	if result.Type != gjson.String {
		return "", fmt.Errorf("field %s must be a string", field)
	}
	return result.String(), nil
}

func getModelRequest(c *gin.Context) (*ModelRequest, bool, error) {
	var modelRequest ModelRequest
	shouldSelectChannel := true
	var err error
	if strings.Contains(c.Request.URL.Path, "/mj/") {
		relayMode := relayconstant.Path2RelayModeMidjourney(c.Request.URL.Path)
		if relayMode == relayconstant.RelayModeMidjourneyTaskFetch ||
			relayMode == relayconstant.RelayModeMidjourneyTaskFetchByCondition ||
			relayMode == relayconstant.RelayModeMidjourneyNotify ||
			relayMode == relayconstant.RelayModeMidjourneyTaskImageSeed {
			shouldSelectChannel = false
		} else {
			midjourneyRequest := dto.MidjourneyRequest{}
			err = common.UnmarshalBodyReusable(c, &midjourneyRequest)
			if err != nil {
				return nil, false, errors.New(i18n.T(c, i18n.MsgDistributorInvalidMidjourney, map[string]any{"Error": err.Error()}))
			}
			midjourneyModel, mjErr, success := service.GetMjRequestModel(relayMode, &midjourneyRequest)
			if mjErr != nil {
				return nil, false, fmt.Errorf("%s", mjErr.Description)
			}
			if midjourneyModel == "" {
				if !success {
					return nil, false, fmt.Errorf("%s", i18n.T(c, i18n.MsgDistributorInvalidParseModel))
				} else {
					// task fetch, task fetch by condition, notify
					shouldSelectChannel = false
				}
			}
			modelRequest.Model = midjourneyModel
		}
		c.Set("relay_mode", relayMode)
	} else if strings.Contains(c.Request.URL.Path, "/suno/") {
		relayMode := relayconstant.Path2RelaySuno(c.Request.Method, c.Request.URL.Path)
		if relayMode == relayconstant.RelayModeSunoFetch ||
			relayMode == relayconstant.RelayModeSunoFetchByID {
			shouldSelectChannel = false
		} else {
			modelName := service.CoverTaskActionToModelName(constant.TaskPlatformSuno, c.Param("action"))
			modelRequest.Model = modelName
		}
		c.Set("platform", string(constant.TaskPlatformSuno))
		c.Set("relay_mode", relayMode)
	} else if (strings.Contains(c.Request.URL.Path, "/v1/videos/") || strings.Contains(c.Request.URL.Path, "/pg/videos/")) && strings.HasSuffix(c.Request.URL.Path, "/remix") {
		relayMode := relayconstant.RelayModeVideoSubmit
		c.Set("relay_mode", relayMode)
		shouldSelectChannel = false
	} else if strings.Contains(c.Request.URL.Path, "/v1/videos") || strings.Contains(c.Request.URL.Path, "/pg/videos") {
		//curl https://api.openai.com/v1/videos \
		//  -H "Authorization: Bearer $OPENAI_API_KEY" \
		//  -F "model=sora-2" \
		//  -F "prompt=A calico cat playing a piano on stage"
		//	-F input_reference="@image.jpg"
		relayMode := relayconstant.RelayModeUnknown
		if c.Request.Method == http.MethodPost {
			relayMode = relayconstant.RelayModeVideoSubmit
			req, err := getModelFromRequest(c)
			if err != nil {
				return nil, false, err
			}
			if req != nil {
				modelRequest.Model = req.Model
				modelRequest.Seconds = req.Seconds
			}
		} else if c.Request.Method == http.MethodGet {
			relayMode = relayconstant.RelayModeVideoFetchByID
			shouldSelectChannel = false
			modelRequest.Model = getTaskOriginModelName(c)
		}
		c.Set("relay_mode", relayMode)
	} else if strings.Contains(c.Request.URL.Path, "/v1/video/generations") || strings.Contains(c.Request.URL.Path, "/pg/video/generations") {
		relayMode := relayconstant.RelayModeUnknown
		if c.Request.Method == http.MethodPost {
			req, err := getModelFromRequest(c)
			if err != nil {
				return nil, false, err
			}
			modelRequest.Model = req.Model
			modelRequest.Seconds = req.Seconds
			relayMode = relayconstant.RelayModeVideoSubmit
		} else if c.Request.Method == http.MethodGet {
			relayMode = relayconstant.RelayModeVideoFetchByID
			shouldSelectChannel = false
			modelRequest.Model = getTaskOriginModelName(c)
		}
		if _, ok := c.Get("relay_mode"); !ok {
			c.Set("relay_mode", relayMode)
		}
	} else if strings.HasPrefix(c.Request.URL.Path, "/v1/images/tasks") {
		shouldSelectChannel = false
		modelRequest.Model = getTaskOriginModelName(c)
	} else if strings.HasPrefix(c.Request.URL.Path, "/v1beta/models/") || strings.HasPrefix(c.Request.URL.Path, "/v1/models/") {
		// Gemini API 路径处理: /v1beta/models/gemini-2.0-flash:generateContent
		relayMode := relayconstant.RelayModeGemini
		modelName := extractModelNameFromGeminiPath(c.Request.URL.Path)
		if modelName != "" {
			modelRequest.Model = modelName
		}
		c.Set("relay_mode", relayMode)
	} else if !strings.HasPrefix(c.Request.URL.Path, "/v1/audio/transcriptions") && !strings.Contains(c.Request.Header.Get("Content-Type"), "multipart/form-data") {
		req, err := getModelFromRequest(c)
		if err != nil {
			return nil, false, err
		}
		modelRequest.Model = req.Model
	}
	if strings.HasPrefix(c.Request.URL.Path, "/v1/realtime") {
		//wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01
		modelRequest.Model = c.Query("model")
	}
	if strings.HasPrefix(c.Request.URL.Path, "/v1/moderations") {
		if modelRequest.Model == "" {
			modelRequest.Model = "text-moderation-stable"
		}
	}
	if strings.HasSuffix(c.Request.URL.Path, "embeddings") {
		if modelRequest.Model == "" {
			modelRequest.Model = c.Param("model")
		}
	}
	if strings.HasPrefix(c.Request.URL.Path, "/v1/images/generations") || strings.HasPrefix(c.Request.URL.Path, "/pg/images/generations") {
		modelRequest.Model = common.GetStringIfEmpty(modelRequest.Model, "dall-e")
	} else if strings.HasPrefix(c.Request.URL.Path, "/v1/images/edits") || strings.HasPrefix(c.Request.URL.Path, "/pg/images/edits") {
		//modelRequest.Model = common.GetStringIfEmpty(c.PostForm("model"), "gpt-image-1")
		contentType := c.ContentType()
		if slices.Contains([]string{gin.MIMEPOSTForm, gin.MIMEMultipartPOSTForm}, contentType) {
			req, err := getModelFromRequest(c)
			if err == nil && req.Model != "" {
				modelRequest.Model = req.Model
			}
		}
	}
	if strings.HasPrefix(c.Request.URL.Path, "/v1/audio") {
		relayMode := relayconstant.RelayModeAudioSpeech
		if strings.HasPrefix(c.Request.URL.Path, "/v1/audio/speech") {

			modelRequest.Model = common.GetStringIfEmpty(modelRequest.Model, "tts-1")
		} else if strings.HasPrefix(c.Request.URL.Path, "/v1/audio/translations") {
			// 先尝试从请求读取
			if req, err := getModelFromRequest(c); err == nil && req.Model != "" {
				modelRequest.Model = req.Model
			}
			modelRequest.Model = common.GetStringIfEmpty(modelRequest.Model, "whisper-1")
			relayMode = relayconstant.RelayModeAudioTranslation
		} else if strings.HasPrefix(c.Request.URL.Path, "/v1/audio/transcriptions") {
			// 先尝试从请求读取
			if req, err := getModelFromRequest(c); err == nil && req.Model != "" {
				modelRequest.Model = req.Model
			}
			modelRequest.Model = common.GetStringIfEmpty(modelRequest.Model, "whisper-1")
			relayMode = relayconstant.RelayModeAudioTranscription
		}
		c.Set("relay_mode", relayMode)
	}
	if c.Request.Method != http.MethodGet && (strings.HasPrefix(c.Request.URL.Path, "/pg/chat/completions") || strings.HasPrefix(c.Request.URL.Path, "/pg/images/") || strings.HasPrefix(c.Request.URL.Path, "/pg/videos") || strings.HasPrefix(c.Request.URL.Path, "/pg/video/generations")) {
		// playground chat completions
		req, err := getModelFromRequest(c)
		if err != nil {
			return nil, false, err
		}
		modelRequest.Model = req.Model
		modelRequest.Group = req.Group
		modelRequest.Seconds = req.Seconds
		common.SetContextKey(c, constant.ContextKeyTokenGroup, modelRequest.Group)
	}

	if strings.HasPrefix(c.Request.URL.Path, "/v1/responses/compact") && modelRequest.Model != "" {
		modelRequest.Model = ratio_setting.WithCompactModelSuffix(modelRequest.Model)
	}
	normalizeImageEndpointModelRequest(c, &modelRequest)
	if isImageEditEndpointPath(c.Request.URL.Path) && strings.EqualFold(
		PublicImageModelAliasForRequest(c),
		service.PublicDiscountImage2ModelName,
	) {
		return nil, false, fmt.Errorf("%s 仅支持 POST /v1/images/generations 文生图", service.PublicDiscountImage2ModelName)
	}
	if isOpenAITextEndpointPath(c.Request.URL.Path) && strings.EqualFold(
		strings.TrimSpace(modelRequest.Model),
		service.PublicDiscountImage2ModelName,
	) {
		return nil, false, fmt.Errorf("%s 仅支持 POST /v1/images/generations 文生图", service.PublicDiscountImage2ModelName)
	}
	if isOpenAITextEndpointPath(c.Request.URL.Path) && isImageGenerationModelName(modelRequest.Model) {
		if service.IsSupplierExposedModelName(modelRequest.Model) {
			return nil, false, fmt.Errorf("image generation models must use POST /v1/images/generations or POST /v1/images/edits instead of text endpoints")
		}
		return nil, false, fmt.Errorf("%s is an image generation model; use POST /v1/images/generations or POST /v1/images/edits instead of text endpoints", strings.TrimSpace(modelRequest.Model))
	}
	return &modelRequest, shouldSelectChannel, nil
}

func isImageEditEndpointPath(path string) bool {
	return strings.HasPrefix(path, "/v1/images/edits") || strings.HasPrefix(path, "/pg/images/edits")
}

func normalizeImageEndpointModelRequest(c *gin.Context, modelRequest *ModelRequest) {
	if c == nil || c.Request == nil || c.Request.URL == nil || modelRequest == nil {
		return
	}
	path := c.Request.URL.Path
	if !strings.HasPrefix(path, "/pg/images/") && !strings.HasPrefix(path, "/v1/images/") {
		return
	}
	modelName, publicAlias, _ := service.NormalizeImageGenerationModelName(modelRequest.Model)
	modelRequest.Model = modelName
	if publicAlias != "" {
		SetPublicImageModelAlias(c, publicAlias)
	}
}

func publicImageModelAliasForRequest(c *gin.Context) string {
	return PublicImageModelAliasForRequest(c)
}

func SetPublicImageModelAlias(c *gin.Context, publicAlias string) {
	if c == nil {
		return
	}
	if alias := strings.TrimSpace(publicAlias); alias != "" {
		c.Set(PublicImageModelAliasContextKey, alias)
	}
}

func PublicImageModelAliasForRequest(c *gin.Context) string {
	if c == nil {
		return ""
	}
	return strings.TrimSpace(c.GetString(PublicImageModelAliasContextKey))
}

func isOpenAITextEndpointPath(path string) bool {
	return strings.HasPrefix(path, "/v1/completions") ||
		strings.HasPrefix(path, "/v1/chat/completions") ||
		strings.HasPrefix(path, "/v1/responses") ||
		strings.HasPrefix(path, "/pg/chat/completions")
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

// 修复 #4834: GET /v1/video/generations/:task_id && /v1/video/:task_id 此前不解析 model，
// 当 token 启用「可用模型限制」时，下游 modelLimitEnable 校验会因
// modelRequest.Model 为空而误报 "This token has no access to model"。
// 从已存储的任务记录中回填 OriginModelName 即可让校验走在正确的模型上。
func getTaskOriginModelName(c *gin.Context) string {
	if !common.GetContextKeyBool(c, constant.ContextKeyTokenModelLimitEnabled) {
		return ""
	}

	taskId := c.Param("task_id")
	if taskId == "" {
		// jimeng adapter
		taskId = c.GetString("task_id")
	}
	if taskId == "" {
		return ""
	}

	userId := c.GetInt("id")
	if task, exist, err := model.GetByTaskId(userId, taskId); err == nil && exist && task != nil {
		return service.PublicImageModelDisplayName(task.Properties.OriginModelName, "")
	}
	return ""
}

func SetupContextForSelectedChannel(c *gin.Context, channel *model.Channel, modelName string) *types.NewAPIError {
	c.Set("original_model", modelName) // for retry
	if channel == nil {
		return types.NewError(errors.New("channel is nil"), types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry())
	}
	common.SetContextKey(c, constant.ContextKeyChannelId, channel.Id)
	common.SetContextKey(c, constant.ContextKeyChannelName, channel.Name)
	common.SetContextKey(c, constant.ContextKeyChannelType, channel.Type)
	selectedChannelTag := ""
	if channel.Tag != nil {
		selectedChannelTag = strings.TrimSpace(*channel.Tag)
	}
	c.Set(SelectedChannelTagContextKey, selectedChannelTag)
	if selectedChannelTag == claudeTerminalChannelTag && !isClaudeMessagesRequest(c) {
		return types.NewErrorWithStatusCode(
			errors.New(claudeTerminalOnlyMessage),
			types.ErrorCodeAccessDenied,
			http.StatusForbidden,
			types.ErrOptionWithSkipRetry(),
		)
	}
	common.SetContextKey(c, constant.ContextKeyChannelCreateTime, channel.CreatedTime)
	common.SetContextKey(c, constant.ContextKeyChannelSetting, channel.GetSetting())
	common.SetContextKey(c, constant.ContextKeyChannelOtherSetting, channel.GetOtherSettings())
	paramOverride := channel.GetParamOverride()
	headerOverride := channel.GetHeaderOverride()
	if mergedParam, applied := service.ApplyChannelAffinityOverrideTemplate(c, paramOverride); applied {
		paramOverride = mergedParam
	}
	common.SetContextKey(c, constant.ContextKeyChannelParamOverride, paramOverride)
	common.SetContextKey(c, constant.ContextKeyChannelHeaderOverride, headerOverride)
	if nil != channel.OpenAIOrganization && *channel.OpenAIOrganization != "" {
		common.SetContextKey(c, constant.ContextKeyChannelOrganization, *channel.OpenAIOrganization)
	}
	common.SetContextKey(c, constant.ContextKeyChannelAutoBan, channel.GetAutoBan())
	common.SetContextKey(c, constant.ContextKeyChannelModelMapping, channel.GetModelMapping())
	common.SetContextKey(c, constant.ContextKeyChannelStatusCodeMapping, channel.GetStatusCodeMapping())

	key, index, newAPIError := channel.GetNextEnabledKey()
	if newAPIError != nil {
		return newAPIError
	}
	if channel.ChannelInfo.IsMultiKey {
		common.SetContextKey(c, constant.ContextKeyChannelIsMultiKey, true)
		common.SetContextKey(c, constant.ContextKeyChannelMultiKeyIndex, index)
	} else {
		// 必须设置为 false，否则在重试到单个 key 的时候会导致日志显示错误
		common.SetContextKey(c, constant.ContextKeyChannelIsMultiKey, false)
	}
	// c.Request.Header.Set("Authorization", fmt.Sprintf("Bearer %s", key))
	common.SetContextKey(c, constant.ContextKeyChannelKey, key)
	common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, channel.GetBaseURL())

	common.SetContextKey(c, constant.ContextKeySystemPromptOverride, false)

	// TODO: api_version统一
	switch channel.Type {
	case constant.ChannelTypeAzure:
		c.Set("api_version", channel.Other)
	case constant.ChannelTypeVertexAi:
		c.Set("region", channel.Other)
	case constant.ChannelTypeXunfei:
		c.Set("api_version", channel.Other)
	case constant.ChannelTypeGemini:
		c.Set("api_version", channel.Other)
	case constant.ChannelTypeAli:
		c.Set("plugin", channel.Other)
	case constant.ChannelCloudflare:
		c.Set("api_version", channel.Other)
	case constant.ChannelTypeMokaAI:
		c.Set("api_version", channel.Other)
	case constant.ChannelTypeCoze:
		c.Set("bot_id", channel.Other)
	}
	return nil
}

// extractModelNameFromGeminiPath 从 Gemini API URL 路径中提取模型名
// 输入格式: /v1beta/models/gemini-2.0-flash:generateContent
// 输出: gemini-2.0-flash
func extractModelNameFromGeminiPath(path string) string {
	// 查找 "/models/" 的位置
	modelsPrefix := "/models/"
	modelsIndex := strings.Index(path, modelsPrefix)
	if modelsIndex == -1 {
		return ""
	}

	// 从 "/models/" 之后开始提取
	startIndex := modelsIndex + len(modelsPrefix)
	if startIndex >= len(path) {
		return ""
	}

	// 查找 ":" 的位置，模型名在 ":" 之前
	colonIndex := strings.Index(path[startIndex:], ":")
	if colonIndex == -1 {
		// 如果没有找到 ":"，返回从 "/models/" 到路径结尾的部分
		return path[startIndex:]
	}

	// 返回模型名部分
	return path[startIndex : startIndex+colonIndex]
}
