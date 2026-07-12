package service

import (
	"strings"

	"github.com/QuantumNous/new-api/model"
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

func IsExactGrok45TokenConfiguration(token *model.Token) bool {
	if token == nil || strings.TrimSpace(token.Group) != Grok45PricingGroupName {
		return false
	}
	models := strings.Split(token.ModelLimits, ",")
	return len(models) == 1 &&
		strings.TrimSpace(models[0]) == Grok45ModelName &&
		token.ModelLimitsEnabled &&
		token.UnlimitedQuota &&
		token.RemainQuota == 0 &&
		token.ExpiredTime == -1 &&
		len(token.GetIpLimits()) == 0 &&
		!token.CrossGroupRetry
}
