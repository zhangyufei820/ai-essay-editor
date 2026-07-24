package service

import (
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

const (
	KimiK3ModelName         = "kimi-k3"
	KimiK3PricingGroupName  = "kimi"
	KimiK3PricingGroupRatio = 1.0
)

func IsKimiK3Model(modelName string) bool {
	return strings.EqualFold(strings.TrimSpace(modelName), KimiK3ModelName)
}

// IsKimiK3PricingGroup identifies requests already pinned to the dedicated
// Kimi route. Its price is intentionally independent of user token groups.
func IsKimiK3PricingGroup(relayInfo *relaycommon.RelayInfo) bool {
	if relayInfo == nil {
		return false
	}
	return strings.TrimSpace(relayInfo.UsingGroup) == KimiK3PricingGroupName ||
		strings.TrimSpace(relayInfo.TokenGroup) == KimiK3PricingGroupName
}
