package service

import (
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

const (
	SpecialPricingGroupName  = "special"
	SpecialPricingGroupRatio = 0.06
)

var specialPricingModels = map[string]struct{}{
	"gpt-5.4-mini":  {},
	"gpt-5.5":       {},
	"gpt-5.6":       {},
	"gpt-5.6-sol":   {},
	"gpt-5.6-terra": {},
}

func IsSpecialPricingModel(modelName string) bool {
	_, ok := specialPricingModels[strings.ToLower(strings.TrimSpace(modelName))]
	return ok
}

func SpecialPricingModels() []string {
	return []string{
		"gpt-5.4-mini",
		"gpt-5.5",
		"gpt-5.6",
		"gpt-5.6-sol",
		"gpt-5.6-terra",
	}
}

func IsSpecialPricingGroup(relayInfo *relaycommon.RelayInfo) bool {
	if relayInfo == nil {
		return false
	}
	group := strings.TrimSpace(relayInfo.UsingGroup)
	if group == "" {
		group = strings.TrimSpace(relayInfo.TokenGroup)
	}
	return group == SpecialPricingGroupName
}
