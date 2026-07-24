package service

import (
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

const (
	DiscountPricingGroupName  = "discount"
	DiscountPricingGroupRatio = 0.25
)

var textPricingPreferenceModels = map[string]struct{}{
	"gpt-5.4":                {},
	"gpt-5.4-mini":           {},
	"gpt-5.5":                {},
	"gpt-5.5-openai-compact": {},
	"gpt-5.6-luna":           {},
	"gpt-5.6-sol":            {},
	"gpt-5.6-terra":          {},
	"codex-auto-review":      {},
}

func IsTextPricingPreferenceModel(modelName string) bool {
	_, ok := textPricingPreferenceModels[strings.ToLower(strings.TrimSpace(modelName))]
	return ok
}

func IsDiscountPricingGroup(relayInfo *relaycommon.RelayInfo) bool {
	if relayInfo == nil {
		return false
	}
	group := strings.TrimSpace(relayInfo.UsingGroup)
	if group == "" {
		group = strings.TrimSpace(relayInfo.TokenGroup)
	}
	return group == DiscountPricingGroupName
}
