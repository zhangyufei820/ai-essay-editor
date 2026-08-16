package controller

import (
	"context"
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
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

const managedGrok45EntitlementLookupTimeout = 2 * time.Second

var (
	ensureManagedGrok45UserToken  = service.EnsureManagedGrok45UserTokenForUserID
	userHasManagedGrok45Token     = service.UserHasManagedGrok45Entitlement
	managedGrok45CapabilityActive = service.ManagedGrok45CapabilityActive
)

func ensureManagedGrok45EntitlementForUser(parent context.Context, userID int) (bool, error) {
	if userID <= 0 {
		return false, nil
	}
	ctx, cancel := context.WithTimeout(parent, managedGrok45EntitlementLookupTimeout)
	defer cancel()
	if _, err := ensureManagedGrok45UserToken(ctx, userID); err != nil {
		return false, err
	}
	return userHasManagedGrok45Token(ctx, userID)
}

func managedGrok45PricingVisible(parent context.Context, userID int) (bool, error) {
	if userID > 0 {
		return ensureManagedGrok45EntitlementForUser(parent, userID)
	}
	ctx, cancel := context.WithTimeout(parent, managedGrok45EntitlementLookupTimeout)
	defer cancel()
	return managedGrok45CapabilityActive(ctx)
}

func isHiddenUserVisibleModel(modelName string) bool {
	name := strings.ToLower(strings.TrimSpace(modelName))
	if service.IsRetiredImageModelName(name) {
		return true
	}
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
	managedGrok45Entitled := false
	for _, modelName := range modelNames {
		if service.IsManagedGrokTextModelName(modelName) {
			entitled, err := ensureManagedGrok45EntitlementForUser(context.Background(), userID)
			if err != nil {
				common.SysLog("failed to resolve managed Grok model entitlement: " + err.Error())
			} else {
				managedGrok45Entitled = entitled
			}
			break
		}
	}
	visible := make([]string, 0, len(modelNames))
	for _, modelName := range modelNames {
		trimmed := strings.TrimSpace(modelName)
		if trimmed == "" {
			continue
		}
		displayName := service.PublicImageModelDisplayName(trimmed, "")
		if service.IsManagedGrokTextModelName(displayName) && !managedGrok45Entitled {
			continue
		}
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

type visibleModelSet struct {
	modelNames []string
}

func acceptsUnsetRatioModel(c *gin.Context) bool {
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
	return acceptUnsetRatioModel
}

func enabledModelNamesForGroups(ownerGroups []string) []string {
	modelNames := make([]string, 0)
	for _, group := range ownerGroups {
		for _, modelName := range model.GetGroupEnabledModels(group) {
			if !common.StringsContains(modelNames, modelName) {
				modelNames = append(modelNames, modelName)
			}
		}
	}
	return modelNames
}

func tokenAllowsVisibleModel(tokenModelLimit map[string]bool, modelName string) bool {
	publicModelName := service.PublicImageModelDisplayName(modelName, "")
	if tokenModelLimit[ratio_setting.FormatMatchingModelName(publicModelName)] {
		return true
	}
	if !service.IsInternalImageModelAllowedByPublicAlias(modelName, publicModelName) {
		return false
	}
	return tokenModelLimit[ratio_setting.FormatMatchingModelName(modelName)]
}

func visibleModelsForToken(c *gin.Context) (visibleModelSet, error) {
	groups, err := getModelListGroups(c)
	if err != nil {
		return visibleModelSet{}, err
	}

	ownerGroups := groups.ownerGroups
	if service.HasExplicitTokenGroupChain(c) {
		ownerGroups = service.GetTokenGroupChain(c)
	}
	modelNames := enabledModelNamesForGroups(ownerGroups)
	rawOwnerByModel := getPreferredModelOwners(modelNames, ownerGroups)
	routableModelNames := make([]string, 0, len(modelNames))
	for _, modelName := range modelNames {
		if _, routable := rawOwnerByModel[modelName]; routable {
			routableModelNames = append(routableModelNames, modelName)
		}
	}

	if common.GetContextKeyBool(c, constant.ContextKeyTokenModelLimitEnabled) {
		tokenModelLimit := map[string]bool{}
		if value, ok := common.GetContextKey(c, constant.ContextKeyTokenModelLimit); ok {
			if limits, ok := value.(map[string]bool); ok {
				tokenModelLimit = limits
			}
		}
		limitedModelNames := make([]string, 0, len(routableModelNames))
		for _, modelName := range routableModelNames {
			if tokenAllowsVisibleModel(tokenModelLimit, modelName) {
				limitedModelNames = append(limitedModelNames, modelName)
			}
		}
		routableModelNames = limitedModelNames
	}

	acceptUnsetRatioModel := acceptsUnsetRatioModel(c)
	visibleRawModelNames := make([]string, 0, len(routableModelNames))
	for _, modelName := range routableModelNames {
		if !acceptUnsetRatioModel && !helper.HasModelBillingConfig(modelName) {
			continue
		}
		visibleRawModelNames = append(visibleRawModelNames, modelName)
	}

	return visibleModelSet{
		modelNames: filterUserVisibleModelNames(c.GetInt("id"), visibleRawModelNames),
	}, nil
}

func ListVisibleModels(c *gin.Context, modelType int) {
	visibleModels, err := visibleModelsForToken(c)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "get user group failed",
		})
		return
	}

	userOpenAiModels := make([]dto.OpenAIModels, 0, len(visibleModels.modelNames))
	for _, modelName := range visibleModels.modelNames {
		userOpenAiModels = append(userOpenAiModels, buildOpenAIModel(modelName, nil))
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

func writeModelNotFound(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"error": types.OpenAIError{
			Message: "The requested model does not exist",
			Type:    "invalid_request_error",
			Param:   "model",
			Code:    "model_not_found",
		},
	})
}

func RetrieveVisibleModel(c *gin.Context, modelType int) {
	modelId := c.Param("model")
	visibleModels, err := visibleModelsForToken(c)
	if err != nil || !common.StringsContains(visibleModels.modelNames, modelId) {
		writeModelNotFound(c)
		return
	}

	visibleModel := buildOpenAIModel(modelId, nil)
	switch modelType {
	case constant.ChannelTypeAnthropic:
		c.JSON(http.StatusOK, dto.AnthropicModel{
			ID:          visibleModel.Id,
			CreatedAt:   time.Unix(int64(visibleModel.Created), 0).UTC().Format(time.RFC3339),
			DisplayName: visibleModel.Id,
			Type:        "model",
		})
	case constant.ChannelTypeGemini:
		c.JSON(http.StatusOK, dto.GeminiModel{
			Name:        visibleModel.Id,
			DisplayName: visibleModel.Id,
		})
	default:
		c.JSON(http.StatusOK, visibleModel)
	}
}
