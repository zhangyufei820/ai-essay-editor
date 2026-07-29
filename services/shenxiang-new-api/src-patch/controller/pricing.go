package controller

import (
	"context"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func filterPricingByUsableGroups(pricing []model.Pricing, usableGroup map[string]string) []model.Pricing {
	if len(pricing) == 0 {
		return pricing
	}
	if len(usableGroup) == 0 {
		return []model.Pricing{}
	}
	pricing = appendPublicImageAliasPricing(pricing)

	filtered := make([]model.Pricing, 0, len(pricing))
	for _, item := range pricing {
		if service.IsSupplierExposedModelName(item.ModelName) {
			continue
		}
		item = sanitizePublicPricingItem(item)
		item.EnableGroup = publicPricingGroups(item.EnableGroup, usableGroup)
		if len(item.EnableGroup) > 0 {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func appendPublicImageAliasPricing(pricing []model.Pricing) []model.Pricing {
	aliases := [][2]string{
		{service.PublicStableImage2ModelName, service.InternalStableImage2ModelName},
		{service.PublicDiscountImage2ModelName, service.InternalDiscountImage2ModelName},
	}
	for _, alias := range aliases {
		publicModelName, internalModelName := alias[0], alias[1]
		publicModelPresent := false
		internalModelIndex := -1
		for index := range pricing {
			switch {
			case strings.EqualFold(strings.TrimSpace(pricing[index].ModelName), publicModelName):
				publicModelPresent = true
			case strings.EqualFold(strings.TrimSpace(pricing[index].ModelName), internalModelName):
				internalModelIndex = index
			}
		}
		if publicModelPresent || internalModelIndex < 0 {
			continue
		}
		modelPrice, configured := ratio_setting.GetModelPrice(publicModelName, false)
		if !configured {
			continue
		}
		publicPricing := pricing[internalModelIndex]
		publicPricing.ModelName = publicModelName
		publicPricing.QuotaType = 1
		publicPricing.ModelPrice = modelPrice
		publicPricing.ModelRatio = 0
		publicPricing.CompletionRatio = 0
		publicPricing.CacheRatio = nil
		publicPricing.CreateCacheRatio = nil
		publicPricing.ImageRatio = nil
		publicPricing.AudioRatio = nil
		publicPricing.AudioCompletionRatio = nil
		publicPricing.BillingMode = ""
		publicPricing.BillingExpr = ""
		pricing = append(pricing, publicPricing)
	}
	return pricing
}

func pinManagedGrok45Pricing(pricing []model.Pricing) []model.Pricing {
	for index := range pricing {
		if pricing[index].ModelName != service.Grok45ModelName ||
			!common.StringsContains(pricing[index].EnableGroup, service.Grok45PricingGroupName) {
			continue
		}
		cacheRatio := service.Grok45CacheReadRatio
		pricing[index].QuotaType = 0
		pricing[index].ModelRatio = service.Grok45ModelRatioForExchangeRate(operation_setting.USDExchangeRate)
		pricing[index].ModelPrice = 0
		pricing[index].CompletionRatio = service.Grok45CompletionRatio
		pricing[index].CacheRatio = &cacheRatio
		pricing[index].CreateCacheRatio = nil
		pricing[index].BillingMode = ""
		pricing[index].BillingExpr = ""
	}
	return pricing
}

func publicPricingGroups(enableGroups []string, usableGroups map[string]string) []string {
	allGroups := common.StringsContains(enableGroups, "all")
	visibleGroups := make([]string, 0, 8)
	for _, group := range []string{
		"default",
		service.DiscountPricingGroupName,
		service.PlusPricingGroupName,
		service.ClaudeKiroPricingGroupName,
		service.ClaudeKiroStablePricingGroupName,
		service.ClaudeTerminalPricingGroupName,
		service.ClaudeExternalPricingGroupName,
		service.ClaudeWelfarePricingGroupName,
		service.ClaudeWelfare001PricingGroupName,
		service.Grok45PricingGroupName,
		service.SpecialPricingGroupName,
	} {
		if _, ok := usableGroups[group]; !ok {
			continue
		}
		if common.StringsContains(enableGroups, group) || (group == "default" && allGroups) {
			visibleGroups = append(visibleGroups, group)
		}
	}
	return visibleGroups
}

func sanitizePublicPricingItem(item model.Pricing) model.Pricing {
	item.Description = sanitizePricingText(item.Description)
	item.Icon = sanitizePricingText(item.Icon)
	item.Tags = sanitizePricingTags(item.Tags)
	item.OwnerBy = sanitizePricingText(item.OwnerBy)
	item.BillingMode = sanitizePricingText(item.BillingMode)
	item.BillingExpr = sanitizePricingText(item.BillingExpr)
	return item
}

func sanitizePricingText(value string) string {
	if service.IsSupplierExposedModelName(value) {
		return ""
	}
	return value
}

func sanitizePricingTags(tags string) string {
	if tags == "" {
		return ""
	}
	visible := make([]string, 0)
	for _, tag := range strings.Split(tags, ",") {
		tag = strings.TrimSpace(tag)
		if tag == "" || strings.EqualFold(tag, "internal-hidden") || service.IsSupplierExposedModelName(tag) {
			continue
		}
		visible = append(visible, tag)
	}
	return strings.Join(visible, ",")
}

func filterPricingVendors(pricing []model.Pricing, vendors []model.PricingVendor) []model.PricingVendor {
	if len(pricing) == 0 || len(vendors) == 0 {
		return []model.PricingVendor{}
	}
	visibleVendorIDs := make(map[int]bool)
	for _, item := range pricing {
		if item.VendorID > 0 {
			visibleVendorIDs[item.VendorID] = true
		}
	}
	if len(visibleVendorIDs) == 0 {
		return []model.PricingVendor{}
	}
	filtered := make([]model.PricingVendor, 0, len(vendors))
	for _, vendor := range vendors {
		if isHiddenPricingVendor(vendor) {
			continue
		}
		if visibleVendorIDs[vendor.ID] {
			filtered = append(filtered, vendor)
		}
	}
	return filtered
}

func isHiddenPricingVendor(vendor model.PricingVendor) bool {
	return service.IsSupplierExposedModelName(vendor.Name) ||
		service.IsSupplierExposedModelName(vendor.Description) ||
		service.IsSupplierExposedModelName(vendor.Icon)
}

func GetPricing(c *gin.Context) {
	pricing := model.GetPricing()
	userId, exists := c.Get("id")
	usableGroup := map[string]string{}
	groupRatio := map[string]float64{}
	for s, f := range ratio_setting.GetGroupRatioCopy() {
		groupRatio[s] = f
	}
	var group string
	authenticatedUserID := 0
	if exists {
		if parsedUserID, ok := userId.(int); ok {
			authenticatedUserID = parsedUserID
		}
		if authenticatedUserID > 0 {
			user, err := model.GetUserCache(authenticatedUserID)
			if err == nil {
				group = user.Group
				for g := range groupRatio {
					ratio, ok := ratio_setting.GetGroupGroupRatio(group, g)
					if ok {
						groupRatio[g] = ratio
					}
				}
			}
		}
	}
	if _, ok := groupRatio[service.DiscountPricingGroupName]; ok {
		groupRatio[service.DiscountPricingGroupName] = service.DiscountPricingGroupRatio
	}
	if _, ok := groupRatio[service.PlusPricingGroupName]; ok {
		groupRatio[service.PlusPricingGroupName] = service.PlusPricingGroupRatio
	}
	if _, ok := groupRatio[service.Grok45PricingGroupName]; ok {
		groupRatio[service.Grok45PricingGroupName] = service.Grok45PricingGroupRatio
	}
	if _, ok := groupRatio[service.SpecialPricingGroupName]; ok {
		groupRatio[service.SpecialPricingGroupName] = service.SpecialPricingGroupRatio
	}

	parent := context.Background()
	if c.Request != nil {
		parent = c.Request.Context()
	}
	managedGrok45Visible, err := managedGrok45PricingVisible(parent, authenticatedUserID)
	if err != nil {
		common.SysLog("failed to resolve managed Grok pricing visibility: " + err.Error())
	}
	usableGroup = service.GetMarketplacePricingGroups(group, managedGrok45Visible)
	pricing = filterPricingByUsableGroups(pricing, usableGroup)
	pricing = pinManagedGrok45Pricing(pricing)
	for group := range ratio_setting.GetGroupRatioCopy() {
		if _, ok := usableGroup[group]; !ok {
			delete(groupRatio, group)
		}
	}

	c.JSON(200, gin.H{
		"success":            true,
		"data":               pricing,
		"vendors":            filterPricingVendors(pricing, model.GetVendors()),
		"group_ratio":        groupRatio,
		"usable_group":       usableGroup,
		"supported_endpoint": model.GetSupportedEndpointMap(),
		"auto_groups":        service.GetPublicUserAutoGroup(group),
		"pricing_version":    "a42d372ccf0b5dd13ecf71203521f9d2",
	})
}

func ResetModelRatio(c *gin.Context) {
	defaultStr := ratio_setting.DefaultModelRatio2JSONString()
	err := model.UpdateOption("ModelRatio", defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	err = ratio_setting.UpdateModelRatioByJSONString(defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "重置模型倍率成功",
	})
}
