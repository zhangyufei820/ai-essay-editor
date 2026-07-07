package service

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

var monthlyCardAllowedModels = []string{
	"gpt-image-2-4K",
	"gpt-5.5",
	"gpt-5.4-mini",
	"gpt-5.3-codex-spark",
	"gpt-5.4",
	"gpt-5.5-openai-compact",
	"codex-auto-review",
}

func IsMonthlyCardTokenName(name string) bool {
	normalized := strings.ToLower(strings.TrimSpace(name))
	return strings.Contains(normalized, "月卡") ||
		strings.Contains(normalized, "monthly-card") ||
		strings.Contains(normalized, "monthly card")
}

func UserHasMonthlyCard(userId int) (bool, error) {
	if userId <= 0 {
		return false, errors.New("invalid userId")
	}
	if model.DB == nil {
		return false, errors.New("database is not initialized")
	}
	now := common.GetTimestamp()
	var count int64
	err := model.DB.Table("user_subscriptions AS us").
		Joins("JOIN subscription_plans AS sp ON sp.id = us.plan_id").
		Where("us.user_id = ? AND us.status = ? AND us.end_time > ?", userId, "active", now).
		Where("(sp.title LIKE ? OR sp.price_amount >= ?)", "%月卡%", 500).
		Count(&count).Error
	return count > 0, err
}

func MonthlyCardAllowedModels() []string {
	models := make([]string, len(monthlyCardAllowedModels))
	copy(models, monthlyCardAllowedModels)
	return models
}

func normalizeMonthlyCardModelName(modelName string) string {
	name := strings.TrimSpace(modelName)
	if name == "" {
		return ""
	}
	formatted := strings.TrimSpace(ratio_setting.FormatMatchingModelName(name))
	if formatted != "" {
		name = formatted
	}
	return strings.ToLower(name)
}

func MonthlyCardChannelSupportsModel(modelName string) bool {
	name := normalizeMonthlyCardModelName(modelName)
	if name == "" {
		return false
	}
	for _, allowed := range monthlyCardAllowedModels {
		if normalizeMonthlyCardModelName(allowed) == name {
			return true
		}
	}
	return false
}

func canUseSubscriptionFundingForModel(hasMonthlyCard bool, modelName string) bool {
	return !hasMonthlyCard || MonthlyCardChannelSupportsModel(modelName)
}
