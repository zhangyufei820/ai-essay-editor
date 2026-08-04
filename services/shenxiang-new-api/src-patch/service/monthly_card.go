package service

import (
	"context"
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm"
)

type monthlyCardTextTier struct {
	Numerator   int64
	Denominator int64
	Multiplier  float64
}

var defaultMonthlyCardTextTier = monthlyCardTextTier{
	Numerator:   9,
	Denominator: 5,
	Multiplier:  1.8,
}

var monthlyCardTextTiersByPlanId = map[int]monthlyCardTextTier{
	2: {Numerator: 9, Denominator: 5, Multiplier: 1.8},
	3: {Numerator: 19, Denominator: 10, Multiplier: 1.9},
	4: {Numerator: 2, Denominator: 1, Multiplier: 2.0},
	5: {Numerator: 41, Denominator: 20, Multiplier: 2.05},
	6: {Numerator: 52, Denominator: 25, Multiplier: 2.08},
}

var monthlyCardAllowedModels = []string{
	model.ImageBenefitModelName,
	"gpt-5.5",
	"gpt-5.4-mini",
	"gpt-5.4",
	"gpt-5.6-luna",
	"gpt-5.6-terra",
	"gpt-5.6-sol",
	"gpt-5.5-openai-compact",
	"codex-auto-review",
}

var monthlyCardTextDiscountModels = []string{
	"gpt-5.5",
	"gpt-5.4-mini",
	"gpt-5.4",
	"gpt-5.6-luna",
	"gpt-5.6-terra",
	"gpt-5.6-sol",
	"gpt-5.5-openai-compact",
	"codex-auto-review",
}

type monthlyCardTextPlanSelection struct {
	PlanId      int
	PlanTitle   string
	BilledQuota int
	Multiplier  float64
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
	return userHasMonthlyCard(context.Background(), model.DB, userId)
}

func userHasMonthlyCard(ctx context.Context, db *gorm.DB, userId int) (bool, error) {
	if userId <= 0 {
		return false, errors.New("invalid userId")
	}
	if db == nil {
		return false, errors.New("database is not initialized")
	}
	now := common.GetTimestamp()
	var rows []struct {
		PlanID    int
		PlanTitle string
		Currency  string
	}
	err := db.WithContext(ctx).Table("user_subscriptions AS us").
		Select("sp.id AS plan_id, sp.title AS plan_title, sp.currency").
		Joins("JOIN subscription_plans AS sp ON sp.id = us.plan_id").
		Where("us.user_id = ? AND us.status = ? AND us.end_time > ?", userId, "active", now).
		Find(&rows).Error
	if err != nil {
		return false, err
	}
	for _, row := range rows {
		if !model.IsCurrentMonthlyCardTextDiscountPlanInfo(row.PlanID, row.PlanTitle) {
			continue
		}
		if !strings.EqualFold(strings.TrimSpace(row.Currency), "CNY") {
			continue
		}
		return true, nil
	}
	return false, nil
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

func MonthlyCardTextSupportsModel(modelName string) bool {
	name := normalizeMonthlyCardModelName(modelName)
	if name == "" {
		return false
	}
	for _, allowed := range monthlyCardTextDiscountModels {
		if normalizeMonthlyCardModelName(allowed) == name {
			return true
		}
	}
	return false
}

func monthlyCardTextTierForPlan(planId int, planTitle string) monthlyCardTextTier {
	if !model.IsCurrentMonthlyCardTextDiscountPlanInfo(planId, planTitle) {
		return defaultMonthlyCardTextTier
	}
	if tier, ok := monthlyCardTextTiersByPlanId[planId]; ok {
		return tier
	}
	title := strings.TrimSpace(planTitle)
	switch {
	case strings.Contains(title, "1000"):
		return monthlyCardTextTiersByPlanId[6]
	case strings.Contains(title, "500"):
		return monthlyCardTextTiersByPlanId[5]
	case strings.Contains(title, "300"):
		return monthlyCardTextTiersByPlanId[4]
	case strings.Contains(title, "200"):
		return monthlyCardTextTiersByPlanId[3]
	case strings.Contains(title, "100"):
		return monthlyCardTextTiersByPlanId[2]
	default:
		return defaultMonthlyCardTextTier
	}
}

func MonthlyCardTextValueMultiplierForPlan(planId int, planTitle string) float64 {
	return monthlyCardTextTierForPlan(planId, planTitle).Multiplier
}

func MonthlyCardTextValueMultiplierForRelayInfo(relayInfo *relaycommon.RelayInfo) float64 {
	if relayInfo == nil {
		return defaultMonthlyCardTextTier.Multiplier
	}
	return MonthlyCardTextValueMultiplierForPlan(relayInfo.SubscriptionPlanId, relayInfo.SubscriptionPlanTitle)
}

func MonthlyCardTextBillingQuota(retailQuota int) int {
	return MonthlyCardTextBillingQuotaForPlan(retailQuota, 0, "")
}

func MonthlyCardTextBillingQuotaForPlan(retailQuota int, planId int, planTitle string) int {
	if retailQuota <= 0 {
		return 0
	}
	tier := monthlyCardTextTierForPlan(planId, planTitle)
	quota := (int64(retailQuota)*tier.Denominator + tier.Numerator - 1) / tier.Numerator
	if quota <= 0 {
		return 1
	}
	return int(quota)
}

func selectCurrentMonthlyCardTextPlan(userId int, retailQuota int, applyValueMultiplier bool) (*monthlyCardTextPlanSelection, error) {
	if userId <= 0 {
		return nil, errors.New("invalid userId")
	}
	if model.DB == nil {
		return nil, errors.New("database is not initialized")
	}
	now := common.GetTimestamp()
	var rows []struct {
		SubscriptionId     int
		PlanId             int
		PlanTitle          string
		Currency           string
		AmountTotal        int64
		AmountUsed         int64
		MonthlyAmountTotal int64
		MonthlyAmountUsed  int64
	}
	if err := model.DB.Table("user_subscriptions AS us").
		Select("us.id AS subscription_id, sp.id AS plan_id, sp.title AS plan_title, sp.currency, us.amount_total, us.amount_used, us.monthly_amount_total, us.monthly_amount_used").
		Joins("JOIN subscription_plans AS sp ON sp.id = us.plan_id").
		Where("us.user_id = ? AND us.status = ? AND us.end_time > ?", userId, "active", now).
		Order("us.end_time asc, us.id asc").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	var fallback *monthlyCardTextPlanSelection
	for _, row := range rows {
		if !model.IsCurrentMonthlyCardTextDiscountPlanInfo(row.PlanId, row.PlanTitle) {
			continue
		}
		if row.Currency != "" && !strings.EqualFold(row.Currency, "CNY") {
			continue
		}
		billedQuota := monthlyCardTextPlanBilledQuota(retailQuota, row.PlanId, row.PlanTitle, applyValueMultiplier)
		multiplier := 1.0
		if applyValueMultiplier {
			multiplier = MonthlyCardTextValueMultiplierForPlan(row.PlanId, row.PlanTitle)
		}
		selection := &monthlyCardTextPlanSelection{
			PlanId:      row.PlanId,
			PlanTitle:   row.PlanTitle,
			BilledQuota: billedQuota,
			Multiplier:  multiplier,
		}
		if fallback == nil {
			fallback = selection
		}
		if row.AmountTotal > 0 && row.AmountTotal-row.AmountUsed < int64(billedQuota) {
			continue
		}
		if row.MonthlyAmountTotal > 0 && row.MonthlyAmountTotal-row.MonthlyAmountUsed < int64(billedQuota) {
			continue
		}
		return selection, nil
	}
	return fallback, nil
}

func monthlyCardTextPlanBilledQuota(retailQuota int, planId int, planTitle string, applyValueMultiplier bool) int {
	if !applyValueMultiplier {
		return retailQuota
	}
	return MonthlyCardTextBillingQuotaForPlan(retailQuota, planId, planTitle)
}

func monthlyCardTextDiscountApplies(relayInfo *relaycommon.RelayInfo) bool {
	if relayInfo == nil || relayInfo.BillingSource != BillingSourceSubscription {
		return false
	}
	if !monthlyCardTextValueAppliesToModel(relayInfo) {
		return false
	}
	return model.IsCurrentMonthlyCardTextDiscountPlanInfo(relayInfo.SubscriptionPlanId, relayInfo.SubscriptionPlanTitle)
}

func monthlyCardTextValueAppliesToModel(relayInfo *relaycommon.RelayInfo) bool {
	return relayInfo != nil &&
		!IsDiscountPricingGroup(relayInfo) &&
		MonthlyCardTextSupportsModel(relayInfo.OriginModelName)
}

func EffectiveMonthlyCardTextBillingQuota(relayInfo *relaycommon.RelayInfo, retailQuota int) int {
	if !monthlyCardTextDiscountApplies(relayInfo) {
		return retailQuota
	}
	return MonthlyCardTextBillingQuotaForPlan(retailQuota, relayInfo.SubscriptionPlanId, relayInfo.SubscriptionPlanTitle)
}

func InjectMonthlyCardTextBillingInfo(other map[string]interface{}, relayInfo *relaycommon.RelayInfo, retailQuota int, billedQuota int) {
	if other == nil || !monthlyCardTextDiscountApplies(relayInfo) {
		return
	}
	other["monthly_card_text_discount"] = true
	other["monthly_card_text_value_multiplier"] = MonthlyCardTextValueMultiplierForRelayInfo(relayInfo)
	other["monthly_card_retail_quota"] = retailQuota
	other["monthly_card_billed_quota"] = billedQuota
	if retailQuota > billedQuota {
		other["monthly_card_saved_quota"] = retailQuota - billedQuota
	}
}

func canUseSubscriptionFundingForModel(hasMonthlyCard bool, modelName string) bool {
	return !hasMonthlyCard || MonthlyCardChannelSupportsModel(modelName)
}
