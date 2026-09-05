package service

import (
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

const (
	Gpt6AstraModelName = "gpt-6-astra"
	// Kept as migration identifiers for the retired fixed-price route.
	Gpt6AstraPricingGroupName  = "astra"
	Gpt6AstraPricingGroupRatio = 1.0
)

func IsGpt6AstraModel(modelName string) bool {
	return strings.EqualFold(strings.TrimSpace(modelName), Gpt6AstraModelName)
}

// IsGpt6AstraPricingGroup is retained for source compatibility only. Astra
// now follows the caller's selected pricing group, so the legacy fixed-price
// group must never override group billing.
func IsGpt6AstraPricingGroup(relayInfo *relaycommon.RelayInfo) bool {
	return false
}
