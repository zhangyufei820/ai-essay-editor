package controller

import (
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

func isHiddenUserVisibleModel(modelName string) bool {
	name := strings.ToLower(strings.TrimSpace(modelName))
	if service.IsSupplierExposedModelName(name) {
		return true
	}
	if !strings.HasPrefix(name, "claude") {
		return false
	}

	tokens := strings.FieldsFunc(name, func(r rune) bool {
		return r == '-' || r == '_' || unicode.IsSpace(r)
	})
	if len(tokens) < 2 || !strings.HasPrefix(tokens[0], "claude") {
		return false
	}

	lastToken := tokens[len(tokens)-1]
	return lastToken == "fast" || lastToken == "full"
}

func isHiddenUserVisibleModelForUser(userID int, modelName string) bool {
	if isHiddenUserVisibleModel(modelName) {
		return true
	}
	name := strings.ToLower(strings.TrimSpace(modelName))
	return name == seedancePrivateVideoModel && userID != seedancePrivateVideoAllowedUserID
}

func filterUserVisibleModelNames(userID int, modelNames []string) []string {
	visible := make([]string, 0, len(modelNames))
	for _, modelName := range modelNames {
		trimmed := strings.TrimSpace(modelName)
		if trimmed == "" {
			continue
		}
		displayName := service.PublicImageModelDisplayName(trimmed, "")
		if isHiddenUserVisibleModelForUser(userID, displayName) {
			continue
		}
		if !common.StringsContains(visible, displayName) {
			visible = append(visible, displayName)
		}
	}
	return visible
}

func DashboardListVisibleModels(c *gin.Context) {
	userID := c.GetInt("id")
	visibleModelsByChannel := make(map[int][]string, len(channelId2Models))
	for channelID, modelNames := range channelId2Models {
		visibleModelsByChannel[channelID] = filterUserVisibleModelNames(userID, modelNames)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    visibleModelsByChannel,
	})
}

func ListVisibleModels(c *gin.Context, modelType int) {
	acceptUnsetRatioModel := operation_setting.SelfUseModeEnabled
	if !acceptUnsetRatioModel {
		userId := c.GetInt("id")
		if userId > 0 {
			userSettings, _ := model.GetUserSetting(userId, false)
			if userSettings.AcceptUnsetRatioModel {
				acceptUnsetRatioModel = true
			}
		}
	}

	userModelNames := make([]string, 0)
	groups, err := getModelListGroups(c)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "get user group failed",
		})
		return
	}
	ownerGroups := groups.ownerGroups
	modelLimitEnable := common.GetContextKeyBool(c, constant.ContextKeyTokenModelLimitEnabled)
	if modelLimitEnable {
		s, ok := common.GetContextKey(c, constant.ContextKeyTokenModelLimit)
		tokenModelLimit := map[string]bool{}
		if ok {
			tokenModelLimit = s.(map[string]bool)
		}
		for allowModel := range tokenModelLimit {
			if !acceptUnsetRatioModel && !helper.HasModelBillingConfig(allowModel) {
				continue
			}
			userModelNames = append(userModelNames, allowModel)
		}
	} else {
		var models []string
		if groups.tokenGroup == "auto" {
			for _, autoGroup := range ownerGroups {
				groupModels := model.GetGroupEnabledModels(autoGroup)
				for _, g := range groupModels {
					if !common.StringsContains(models, g) {
						models = append(models, g)
					}
				}
			}
		} else if len(ownerGroups) > 0 {
			models = model.GetGroupEnabledModels(ownerGroups[0])
		}
		for _, modelName := range models {
			if !acceptUnsetRatioModel && !helper.HasModelBillingConfig(modelName) {
				continue
			}
			userModelNames = append(userModelNames, modelName)
		}
	}

	userModelNames = filterUserVisibleModelNames(c.GetInt("id"), userModelNames)
	ownerByModel := map[string]string{}
	if len(ownerGroups) > 0 && len(userModelNames) > 0 {
		ownerByModel = getPreferredModelOwners(userModelNames, ownerGroups)
	}
	userOpenAiModels := make([]dto.OpenAIModels, 0, len(userModelNames))
	for _, modelName := range userModelNames {
		userOpenAiModels = append(userOpenAiModels, buildOpenAIModel(modelName, ownerByModel))
	}

	switch modelType {
	case constant.ChannelTypeAnthropic:
		userAnthropicModels := make([]dto.AnthropicModel, len(userOpenAiModels))
		for i, model := range userOpenAiModels {
			userAnthropicModels[i] = dto.AnthropicModel{
				ID:          model.Id,
				CreatedAt:   time.Unix(int64(model.Created), 0).UTC().Format(time.RFC3339),
				DisplayName: model.Id,
				Type:        "model",
			}
		}
		firstID := ""
		lastID := ""
		if len(userAnthropicModels) > 0 {
			firstID = userAnthropicModels[0].ID
			lastID = userAnthropicModels[len(userAnthropicModels)-1].ID
		}
		c.JSON(http.StatusOK, gin.H{
			"data":     userAnthropicModels,
			"first_id": firstID,
			"has_more": false,
			"last_id":  lastID,
		})
	case constant.ChannelTypeGemini:
		userGeminiModels := make([]dto.GeminiModel, len(userOpenAiModels))
		for i, model := range userOpenAiModels {
			userGeminiModels[i] = dto.GeminiModel{
				Name:        model.Id,
				DisplayName: model.Id,
			}
		}
		c.JSON(http.StatusOK, gin.H{
			"models":        userGeminiModels,
			"nextPageToken": nil,
		})
	default:
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    userOpenAiModels,
			"object":  "list",
		})
	}
}

func RetrieveVisibleModel(c *gin.Context, modelType int) {
	modelId := c.Param("model")
	if isHiddenUserVisibleModelForUser(c.GetInt("id"), modelId) {
		openAIError := types.OpenAIError{
			Message: fmt.Sprintf("The model '%s' does not exist", modelId),
			Type:    "invalid_request_error",
			Param:   "model",
			Code:    "model_not_found",
		}
		c.JSON(http.StatusOK, gin.H{
			"error": openAIError,
		})
		return
	}
	RetrieveModel(c, modelType)
}
