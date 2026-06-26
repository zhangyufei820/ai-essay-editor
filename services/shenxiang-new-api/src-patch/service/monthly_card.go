package service

import (
	"errors"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

const (
	MonthlyCardPlanTitle  = "¥500 月卡"
	MonthlyCardTokenName  = "¥500 月卡专用"
	MonthlyCardChannelTag = "dragtokens-gpt55-responses"
)

func IsMonthlyCardTokenName(name string) bool {
	return strings.TrimSpace(name) == MonthlyCardTokenName
}

func UserHasMonthlyCard(userId int) (bool, error) {
	return model.HasActiveUserSubscriptionPlanTitle(userId, MonthlyCardPlanTitle)
}

func MonthlyCardChannelModelsForUser(userId int) ([]string, error) {
	if userId <= 0 {
		return nil, errors.New("invalid userId")
	}
	return MonthlyCardChannelModels()
}

func MonthlyCardChannelModelsForGroup(userGroup string) ([]string, error) {
	return MonthlyCardChannelModels()
}

func MonthlyCardChannelModels() ([]string, error) {
	channel, err := model.GetEnabledChannelByTag(MonthlyCardChannelTag)
	if err != nil {
		return nil, err
	}
	if channel == nil {
		return nil, errors.New("monthly card channel not found")
	}
	candidateModels := channel.GetModels()
	if len(candidateModels) == 0 {
		return nil, errors.New("monthly card channel has no models")
	}

	seen := map[string]bool{}
	models := make([]string, 0, len(candidateModels))
	for _, raw := range candidateModels {
		modelName := strings.TrimSpace(raw)
		if modelName == "" {
			continue
		}
		normalized := ratio_setting.FormatMatchingModelName(modelName)
		if normalized == "" {
			normalized = modelName
		}
		if seen[normalized] {
			continue
		}
		seen[normalized] = true
		models = append(models, normalized)
	}
	sort.Strings(models)
	return models, nil
}

func MonthlyCardChannelSupportsModel(modelName string) bool {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return false
	}
	matchName := ratio_setting.FormatMatchingModelName(modelName)
	if matchName == "" {
		matchName = modelName
	}
	models, err := MonthlyCardChannelModels()
	if err != nil {
		return false
	}
	for _, allowed := range models {
		if ratio_setting.FormatMatchingModelName(allowed) == matchName {
			return true
		}
		if allowed == matchName || allowed == modelName {
			return true
		}
	}
	return false
}

func MonthlyCardModelLimitsString(models []string) string {
	cleaned := make([]string, 0, len(models))
	seen := map[string]bool{}
	for _, raw := range models {
		modelName := strings.TrimSpace(raw)
		if modelName == "" || seen[modelName] {
			continue
		}
		seen[modelName] = true
		cleaned = append(cleaned, modelName)
	}
	sort.Strings(cleaned)
	return strings.Join(cleaned, ",")
}

func MonthlyCardBearerKey(key string) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return ""
	}
	if strings.HasPrefix(key, "sk-") {
		return key
	}
	return "sk-" + key
}
