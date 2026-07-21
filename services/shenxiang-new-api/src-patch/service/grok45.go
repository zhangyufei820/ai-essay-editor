package service

import (
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

const (
	Grok45ModelName                = "grok-4.5"
	Grok45PricingGroupName         = "grok45"
	Grok45PricingGroupRatio        = 1.0
	Grok45UserTokenName            = "星人 Grok 4.5 专用令牌"
	Grok45AdminTokenName           = "星人 Grok 4.5 测试令牌"
	Grok45PrimaryManagedChannelTag = "xingren-grok45-primary"
	Grok45PrimaryManagedBaseURL    = "https://dragtokens.com"
	Grok45ManagedChannelTag        = "xingren-grok45"
	Grok45ManagedBaseURL           = "https://www.geek2api.com"
	Grok45InputCNYPer1M            = 2.0
	Grok45OutputCNYPer1M           = 6.0
	Grok45CacheReadCNYPer1M        = 0.5
	Grok45CompletionRatio          = Grok45OutputCNYPer1M / Grok45InputCNYPer1M
	Grok45CacheReadRatio           = Grok45CacheReadCNYPer1M / Grok45InputCNYPer1M
)

func Grok45ModelRatioForExchangeRate(exchangeRate float64) float64 {
	if exchangeRate <= 0 {
		exchangeRate = 7.3
	}
	return Grok45InputCNYPer1M / (2 * exchangeRate)
}

type Grok45UserTokenProfile struct {
	Name               string `json:"name"`
	Group              string `json:"group"`
	ModelLimitsEnabled bool   `json:"model_limits_enabled"`
	ModelLimits        string `json:"model_limits"`
	UnlimitedQuota     bool   `json:"unlimited_quota"`
	RemainQuota        int    `json:"remain_quota"`
	ExpiredTime        int64  `json:"expired_time"`
	AllowIPs           string `json:"allow_ips"`
	CrossGroupRetry    bool   `json:"cross_group_retry"`
}

func IsManagedGrok45UserTokenProfile(profile Grok45UserTokenProfile) bool {
	return profile.Name == Grok45UserTokenName &&
		profile.Group == Grok45PricingGroupName &&
		profile.ModelLimitsEnabled &&
		profile.ModelLimits == Grok45ModelName &&
		profile.UnlimitedQuota &&
		profile.RemainQuota == 0 &&
		profile.ExpiredTime == -1 &&
		profile.AllowIPs == "" &&
		!profile.CrossGroupRetry
}

func IsGrok45PricingGroup(relayInfo *relaycommon.RelayInfo) bool {
	if relayInfo == nil {
		return false
	}
	usingGroup := strings.TrimSpace(relayInfo.UsingGroup)
	tokenGroup := strings.TrimSpace(relayInfo.TokenGroup)
	return usingGroup == Grok45PricingGroupName || tokenGroup == Grok45PricingGroupName
}
