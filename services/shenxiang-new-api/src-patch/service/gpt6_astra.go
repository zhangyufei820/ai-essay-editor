package service

import (
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

const (
	Gpt6AstraModelName = "gpt-6-astra"
	// Gpt6AstraPricingGroupName is retained for legacy-channel migration only.
	// Astra still routes through the caller's selected public group.
	Gpt6AstraPricingGroupName = "astra"
	// Astra is always billed at its Model Plaza price. Routing through the
	// discount or plus chain must never apply that chain's group multiplier.
	Gpt6AstraPricingGroupRatio = 1.0
)

func IsGpt6AstraModel(modelName string) bool {
	return strings.EqualFold(strings.TrimSpace(modelName), Gpt6AstraModelName)
}

// IsGpt6AstraPricingGroup is retained for source compatibility only. Astra
// routes by the caller's selected group, while its billing multiplier is
// pinned independently in helper.HandleGroupRatio.
func IsGpt6AstraPricingGroup(relayInfo *relaycommon.RelayInfo) bool {
	return false
}
