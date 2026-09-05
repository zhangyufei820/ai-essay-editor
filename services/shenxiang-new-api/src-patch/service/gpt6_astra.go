package service

import (
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

const (
	Gpt6AstraModelName         = "gpt-6-astra"
	Gpt6AstraPricingGroupName  = "astra"
	Gpt6AstraPricingGroupRatio = 1.0
)

func IsGpt6AstraModel(modelName string) bool {
	return strings.EqualFold(strings.TrimSpace(modelName), Gpt6AstraModelName)
}

// IsGpt6AstraPricingGroup identifies requests pinned to the dedicated route.
// Its RMB sale price must remain independent of the caller's token group.
func IsGpt6AstraPricingGroup(relayInfo *relaycommon.RelayInfo) bool {
	if relayInfo == nil {
		return false
	}
	return strings.TrimSpace(relayInfo.UsingGroup) == Gpt6AstraPricingGroupName ||
		strings.TrimSpace(relayInfo.TokenGroup) == Gpt6AstraPricingGroupName
}
