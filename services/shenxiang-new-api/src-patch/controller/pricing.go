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
	visibleGroups := make([]string, 0, 3)
	for _, group := range []string{"default", service.DiscountPricingGroupName, service.Grok45PricingGroupName} {
		if _, ok := usableGroups[group]; !ok {
			continue
		}
		if common.StringsContains(enableGroups, group) || (group == "default" && allGroups) {
			visibleGroups = append(visibleGroups, group)
		}
	}
	return visibleGroups
}

func getPricingGroupRatios(userGroup string, usableGroups map[string]string) map[string]float64 {
	groupRatios := ratio_setting.GetGroupRatioCopy()
	for group := range groupRatios {
		if ratio, ok := ratio_setting.GetGroupGroupRatio(userGroup, group); ok {
			groupRatios[group] = ratio
		}
		if _, ok := usableGroups[group]; !ok {
			delete(groupRatios, group)
		}
	}
	if _, ok := usableGroups[service.DiscountPricingGroupName]; ok {
		groupRatios[service.DiscountPricingGroupName] = service.DiscountPricingGroupRatio
	}
	if _, ok := usableGroups[service.Grok45PricingGroupName]; ok {
		groupRatios[service.Grok45PricingGroupName] = service.Grok45PricingGroupRatio
	}
	return groupRatios
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
		if tag == "" || service.IsSupplierExposedModelName(tag) {
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
			}
		}
	}

	parent := context.Background()
	if c.Request != nil {
		parent = c.Request.Context()
	}
	managedGrok45Visible, err := managedGrok45PricingVisible(parent, authenticatedUserID)
	if err != nil {
		common.SysLog("failed to resolve managed Grok pricing visibility: " + err.Error())
	}
	usableGroup := service.GetPublicPricingGroups(group, managedGrok45Visible)
	pricing = filterPricingByUsableGroups(pricing, usableGroup)
	pricing = pinManagedGrok45Pricing(pricing)
	groupRatio := getPricingGroupRatios(group, usableGroup)

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
