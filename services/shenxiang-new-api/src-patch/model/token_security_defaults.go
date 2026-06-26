package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

const (
	TokenQuotaPeriodDaily   = "daily"
	TokenQuotaPeriodMonthly = "monthly"
)

var defaultImageModelLimits = []string{
	"gpt-image-2-4K",
	"image 2电商商品图快速通道(1.5K)",
	"gpt-image-1",
	"banana-2",
	"ecommerce-banana-2",
	"gemini-3-pro-image-preview",
	"grok-imagine-image",
}

func DefaultTokenTotalQuota() int {
	return common.GetEnvOrDefault("DEFAULT_TOKEN_TOTAL_QUOTA", int(10*common.QuotaPerUnit))
}

func DefaultTokenDailyQuota() int {
	return common.GetEnvOrDefault("DEFAULT_TOKEN_DAILY_QUOTA", int(2*common.QuotaPerUnit))
}

func DefaultTokenMonthlyQuota() int {
	return common.GetEnvOrDefault("DEFAULT_TOKEN_MONTHLY_QUOTA", int(10*common.QuotaPerUnit))
}

func DefaultImageModelLimits() []string {
	models := make([]string, len(defaultImageModelLimits))
	copy(models, defaultImageModelLimits)
	return models
}

func DefaultImageModelLimitString() string {
	return strings.Join(defaultImageModelLimits, ",")
}

func IsDefaultImageModel(modelName string) bool {
	normalized := strings.ToLower(strings.TrimSpace(modelName))
	for _, candidate := range defaultImageModelLimits {
		if normalized == strings.ToLower(candidate) {
			return true
		}
	}
	return false
}

func LooksLikeImageTokenName(name string) bool {
	normalized := strings.ToLower(strings.TrimSpace(name))
	if normalized == "" {
		return false
	}
	indicators := []string{"image", "img", "photo", "picture", "draw", "绘图", "图片", "图像", "生成图", "banana", "gpt-image"}
	for _, indicator := range indicators {
		if strings.Contains(normalized, indicator) {
			return true
		}
	}
	return false
}

func ModelLimitStringContainsImageModel(modelLimits string) bool {
	for _, modelName := range strings.Split(modelLimits, ",") {
		if IsDefaultImageModel(modelName) {
			return true
		}
	}
	return false
}

// ApplyTokenCreationSecurityDefaults centralizes the safe defaults for newly
// created API keys so old clients cannot bypass the browser form defaults.
func ApplyTokenCreationSecurityDefaults(token *Token) {
	if token == nil {
		return
	}
	token.UnlimitedQuota = false
	if token.RemainQuota <= 0 {
		token.RemainQuota = DefaultTokenTotalQuota()
	}
	if token.DailyQuota <= 0 {
		token.DailyQuota = DefaultTokenDailyQuota()
	}
	if token.MonthlyQuota <= 0 {
		token.MonthlyQuota = DefaultTokenMonthlyQuota()
	}

	hasModelLimits := strings.TrimSpace(token.ModelLimits) != ""
	if hasModelLimits {
		token.ModelLimitsEnabled = true
		return
	}
	if LooksLikeImageTokenName(token.Name) {
		token.ModelLimitsEnabled = true
		token.ModelLimits = DefaultImageModelLimitString()
	}
}
