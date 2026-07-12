package service

import (
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

const (
	DiscountPricingGroupName  = "discount"
	DiscountPricingGroupRatio = 0.05
)

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
