package service

import (
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

const (
	Grok45ModelName         = "grok-4.5"
	Grok45PricingGroupName  = "grok45"
	Grok45PricingGroupRatio = 1.0
)

func IsGrok45PricingGroup(relayInfo *relaycommon.RelayInfo) bool {
	if relayInfo == nil {
		return false
	}
	usingGroup := strings.TrimSpace(relayInfo.UsingGroup)
	tokenGroup := strings.TrimSpace(relayInfo.TokenGroup)
	return usingGroup == Grok45PricingGroupName || tokenGroup == Grok45PricingGroupName
}
