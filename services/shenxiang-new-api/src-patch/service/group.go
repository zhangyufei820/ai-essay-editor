package service

import (
	"strings"

	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

var publicTokenGroups = []string{"default", DiscountPricingGroupName}

func IsPublicTokenGroup(group string) bool {
	for _, publicGroup := range publicTokenGroups {
		if group == publicGroup {
			return true
		}
	}
	return false
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

func GroupInUserUsableGroups(userGroup, groupName string) bool {
	_, ok := GetPublicUserUsableGroups(userGroup)[groupName]
	return ok
}

func UserCanUseGrok45PricingGroup(userGroup string) bool {
	_, ok := GetUserUsableGroups(userGroup)[Grok45PricingGroupName]
	return ok
}

func GetUserAutoGroup(userGroup string) []string {
	groups := GetUserUsableGroups(userGroup)
	autoGroups := make([]string, 0)
	for _, group := range setting.GetAutoGroups() {
		if group == DiscountPricingGroupName || group == Grok45PricingGroupName {
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
	switch group {
	case DiscountPricingGroupName:
		return DiscountPricingGroupRatio
	case Grok45PricingGroupName:
		return Grok45PricingGroupRatio
	}
	ratio, ok := ratio_setting.GetGroupGroupRatio(userGroup, group)
	if ok {
		return ratio
	}
	return ratio_setting.GetGroupRatio(group)
}
