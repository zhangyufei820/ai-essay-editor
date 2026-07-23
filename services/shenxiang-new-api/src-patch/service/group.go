package service

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

const (
	MaxTokenGroupChainLength         = 3
	ClaudeKiroPricingGroupName       = "kiro"
	ClaudeKiroStablePricingGroupName = "kiro-stable"
	ClaudeTerminalPricingGroupName   = "ccmax-terminal"
	ClaudeExternalPricingGroupName   = "claude-external"
)

func ParseTokenGroupChain(rawGroup string) ([]string, error) {
	rawGroup = strings.TrimSpace(rawGroup)
	if rawGroup == "" {
		return nil, nil
	}

	groups := make([]string, 0, MaxTokenGroupChainLength)
	seen := make(map[string]struct{}, MaxTokenGroupChainLength)
	for _, rawPart := range strings.Split(rawGroup, ",") {
		group := strings.TrimSpace(rawPart)
		if group == "" {
			return nil, fmt.Errorf("token group chain contains an empty group")
		}
		if _, exists := seen[group]; exists {
			continue
		}
		seen[group] = struct{}{}
		groups = append(groups, group)
		if len(groups) > MaxTokenGroupChainLength {
			return nil, fmt.Errorf("token group chain exceeds %d groups", MaxTokenGroupChainLength)
		}
	}

	if len(groups) > 1 {
		for _, group := range groups {
			if group == "auto" {
				return nil, fmt.Errorf("auto group cannot be combined with explicit groups")
			}
		}
	}
	return groups, nil
}

func NormalizeTokenGroupChain(rawGroup string) (string, []string, error) {
	groups, err := ParseTokenGroupChain(rawGroup)
	if err != nil {
		return "", nil, err
	}
	return strings.Join(groups, ","), groups, nil
}

func ValidateTokenGroupChain(groups []string, allowed func(string) bool) error {
	if len(groups) == 0 {
		return fmt.Errorf("token group chain is empty")
	}
	for _, group := range groups {
		if allowed == nil || !allowed(group) {
			return fmt.Errorf("token group is unavailable")
		}
	}
	return nil
}

var publicClaudeTokenGroups = []string{
	ClaudeKiroPricingGroupName,
	ClaudeKiroStablePricingGroupName,
	ClaudeTerminalPricingGroupName,
	ClaudeExternalPricingGroupName,
}

var marketplaceClaudeGroupLabels = map[string]string{
	ClaudeKiroPricingGroupName:       "Kiro",
	ClaudeKiroStablePricingGroupName: "Kiro 稳定版",
	ClaudeTerminalPricingGroupName:   "ccmax 终端专用",
	ClaudeExternalPricingGroupName:   "Claude 外接",
}

var publicTokenGroups = []string{
	"default",
	DiscountPricingGroupName,
	PlusPricingGroupName,
	ClaudeKiroPricingGroupName,
	ClaudeKiroStablePricingGroupName,
	ClaudeExternalPricingGroupName,
}

func IsPublicTokenGroup(group string) bool {
	for _, publicGroup := range publicTokenGroups {
		if group == publicGroup {
			return true
		}
	}
	return false
}

func IsPublicClaudeTokenGroup(group string) bool {
	for _, publicGroup := range publicClaudeTokenGroups {
		if group == publicGroup {
			return true
		}
	}
	return false
}

func IsPublicClaudeTokenGroupChain(rawGroup string) bool {
	_, groups, err := NormalizeTokenGroupChain(rawGroup)
	if err != nil || len(groups) == 0 {
		return false
	}
	return ValidateTokenGroupChain(groups, IsPublicClaudeTokenGroup) == nil
}

func NormalizePublicTokenGroup(group string) string {
	group = strings.TrimSpace(group)
	if IsPublicTokenGroup(group) {
		return group
	}
	return "default"
}

func GetUserUsableGroups(userGroup string) map[string]string {
	groupsCopy := setting.GetUserUsableGroupsCopy()
	defaultDescription, defaultEnabled := groupsCopy["default"]
	discountDescription, discountEnabled := groupsCopy[DiscountPricingGroupName]
	plusDescription, plusEnabled := groupsCopy[PlusPricingGroupName]
	if userGroup != "" {
		specialSettings, ok := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Get(userGroup)
		if ok {
			for specialGroup, desc := range specialSettings {
				if strings.HasPrefix(specialGroup, "-:") {
					delete(groupsCopy, strings.TrimPrefix(specialGroup, "-:"))
				} else if strings.HasPrefix(specialGroup, "+:") {
					groupsCopy[strings.TrimPrefix(specialGroup, "+:")] = desc
				} else {
					groupsCopy[specialGroup] = desc
				}
			}
		}
		if _, ok := groupsCopy[userGroup]; !ok {
			groupsCopy[userGroup] = "用户分组"
		}
	}
	if defaultEnabled {
		groupsCopy["default"] = defaultDescription
	} else {
		delete(groupsCopy, "default")
	}
	if discountEnabled {
		groupsCopy[DiscountPricingGroupName] = discountDescription
	} else {
		delete(groupsCopy, DiscountPricingGroupName)
	}
	if plusEnabled {
		groupsCopy[PlusPricingGroupName] = plusDescription
	} else {
		delete(groupsCopy, PlusPricingGroupName)
	}
	return groupsCopy
}

func GetPublicUserUsableGroups(userGroup string) map[string]string {
	usableGroups := GetUserUsableGroups(userGroup)
	publicGroups := make(map[string]string, len(publicTokenGroups))
	for _, group := range publicTokenGroups {
		if desc, ok := usableGroups[group]; ok {
			publicGroups[group] = desc
		}
	}
	return publicGroups
}

func GetPublicPricingGroups(userGroup string, includeManagedGrok45 bool) map[string]string {
	usableGroups := GetUserUsableGroups(userGroup)
	pricingGroups := GetPublicUserUsableGroups(userGroup)
	if description, ok := usableGroups[Grok45PricingGroupName]; includeManagedGrok45 && ok {
		pricingGroups[Grok45PricingGroupName] = description
	}
	return pricingGroups
}

func GetMarketplacePricingGroups(userGroup string, includeManagedGrok45 bool) map[string]string {
	usableGroups := GetUserUsableGroups(userGroup)
	pricingGroups := GetPublicPricingGroups(userGroup, includeManagedGrok45)
	if description, ok := usableGroups[ClaudeTerminalPricingGroupName]; ok {
		pricingGroups[ClaudeTerminalPricingGroupName] = description
	}
	for group, label := range marketplaceClaudeGroupLabels {
		if _, ok := pricingGroups[group]; ok {
			pricingGroups[group] = label
		}
	}
	return pricingGroups
}

func GroupInUserUsableGroups(userGroup, groupName string) bool {
	_, ok := GetPublicUserUsableGroups(userGroup)[groupName]
	return ok
}

func GetUserAutoGroup(userGroup string) []string {
	groups := GetUserUsableGroups(userGroup)
	autoGroups := make([]string, 0)
	for _, group := range setting.GetAutoGroups() {
		if group == DiscountPricingGroupName || group == PlusPricingGroupName ||
			group == ClaudeKiroPricingGroupName || group == ClaudeKiroStablePricingGroupName ||
			group == ClaudeTerminalPricingGroupName || group == ClaudeExternalPricingGroupName {
			continue
		}
		if _, ok := groups[group]; ok {
			autoGroups = append(autoGroups, group)
		}
	}
	return autoGroups
}

func GetPublicUserAutoGroup(userGroup string) []string {
	publicGroups := GetPublicUserUsableGroups(userGroup)
	autoGroups := make([]string, 0)
	for _, group := range GetUserAutoGroup(userGroup) {
		if _, ok := publicGroups[group]; ok {
			autoGroups = append(autoGroups, group)
		}
	}
	return autoGroups
}

func GetUserGroupRatio(userGroup, group string) float64 {
	if group == DiscountPricingGroupName {
		return DiscountPricingGroupRatio
	}
	if group == PlusPricingGroupName {
		return PlusPricingGroupRatio
	}
	ratio, ok := ratio_setting.GetGroupGroupRatio(userGroup, group)
	if ok {
		return ratio
	}
	return ratio_setting.GetGroupRatio(group)
}
