package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/require"
)

func configurePricingGrok45Entitlements(t *testing.T) {
	t.Helper()
	originalGroups := setting.UserUsableGroups2JSONString()
	specialGroups := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
	originalSpecialGroups := specialGroups.ReadAll()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalGroups))
		specialGroups.Clear()
		specialGroups.AddAll(originalSpecialGroups)
	})
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{
		"default":"原价",
		"discount":"特价",
		"grok45":"Grok 4.5 专用通道"
	}`))
	specialGroups.Clear()
	specialGroups.Set("restricted", map[string]string{"-:grok45": "不可用"})
}

func TestNormalizeUserVisibleModelsAddsSeedancePrivateVideoForRootUser(t *testing.T) {
	models := normalizeUserVisibleModels(1, []string{"grok-video-super-720p", "seedance-2.0"})

	require.Contains(t, models, "seedance-nsfw")
	require.Equal(t, []string{"grok-video-super-720p", "seedance-2.0", "seedance-nsfw"}, models)
}

func TestNormalizeUserVisibleModelsRemovesSeedancePrivateVideoForOtherUsers(t *testing.T) {
	models := normalizeUserVisibleModels(2, []string{"seedance-nsfw", "seedance-2.0", "seedance-nsfw"})

	require.NotContains(t, models, "seedance-nsfw")
	require.Equal(t, []string{"seedance-2.0"}, models)
}

func TestNormalizeUserVisibleModelsHidesClaudeFastAndFullGroups(t *testing.T) {
	models := normalizeUserVisibleModels(2, []string{
		"claude-sonnet-4-5-20250929-fast",
		"claude-sonnet-4-5-20250929-full",
		"claude sonnet 4 5 20250929 fast",
		"claude_sonnet_4_5_20250929_full",
		"claude-sonnet-4-5-20250929",
		"seedance-2.0-dj-fast",
	})

	require.Equal(t, []string{"claude-sonnet-4-5-20250929", "seedance-2.0-dj-fast"}, models)
}

func TestNormalizeUserVisibleModelsHidesSupplierExposedImageModels(t *testing.T) {
	models := normalizeUserVisibleModels(2, []string{
		"gpt-5.5",
		"geek2api-image-2",
		"特价 image-2",
		"image 2电商商品图快速通道(1.5K)",
		"ccapi-image-leak",
		"custom-geek2api-leak",
		"dragtokens-image-leak",
		"moonapix-image-leak",
	})

	require.Equal(t, []string{"gpt-5.5", "特价 image-2", "image 2电商商品图快速通道(1.5K)"}, models)
	require.NotContains(t, models, "geek2api-image-2")
}

func TestFilterUserVisibleModelNamesHidesSeedancePrivateVideoForNonRootUsers(t *testing.T) {
	models := filterUserVisibleModelNames(2, []string{
		"seedance-nsfw",
		"seedance-2.0-dj-fast",
		"seedance-2.0-ld-17",
	})

	require.Equal(t, []string{"seedance-2.0-dj-fast", "seedance-2.0-ld-17"}, models)
}

func TestFilterPricingByUsableGroupsHidesSupplierExposedModels(t *testing.T) {
	pricing := filterPricingByUsableGroups([]model.Pricing{
		{ModelName: "gpt-5.5", EnableGroup: []string{"default"}},
		{ModelName: "geek2api-image-2", EnableGroup: []string{"default"}},
		{
			ModelName:   "image 2电商商品图快速通道(1.5K)",
			Description: "dragtokens route",
			Icon:        "geek2api",
			Tags:        "image,dragtokens,1.5k",
			OwnerBy:     "moonapix",
			EnableGroup: []string{"default"},
		},
	}, map[string]string{"default": "default"})

	require.Equal(t, []model.Pricing{
		{ModelName: "gpt-5.5", EnableGroup: []string{"default"}},
		{ModelName: "image 2电商商品图快速通道(1.5K)", Tags: "image,1.5k", EnableGroup: []string{"default"}},
	}, pricing)
}

func TestFilterPricingByUsableGroupsRemovesLegacyGroupMetadata(t *testing.T) {
	pricing := filterPricingByUsableGroups([]model.Pricing{
		{ModelName: "gpt-5.5", EnableGroup: []string{"default", "internal", "discount"}},
		{ModelName: "gpt-5.4", EnableGroup: []string{"all"}},
	}, map[string]string{
		"default":  "原价",
		"discount": "特价",
	})

	require.Equal(t, []model.Pricing{
		{ModelName: "gpt-5.5", EnableGroup: []string{"default", "discount"}},
		{ModelName: "gpt-5.4", EnableGroup: []string{"default"}},
	}, pricing)
}

func TestPublicPricingGroupsDoesNotPromoteAllToDiscount(t *testing.T) {
	groups := publicPricingGroups([]string{"all"}, map[string]string{
		"default":  "原价",
		"discount": "特价",
	})

	require.Equal(t, []string{"default"}, groups)
}

func TestPricingUsableGroupsExposeGrok45OnlyToEntitledUsers(t *testing.T) {
	configurePricingGrok45Entitlements(t)

	entitled := getPricingUsableGroups("entitled", true)
	restricted := getPricingUsableGroups("restricted", true)
	anonymous := getPricingUsableGroups("", false)

	require.Contains(t, entitled, service.Grok45PricingGroupName)
	require.NotContains(t, restricted, service.Grok45PricingGroupName)
	require.NotContains(t, anonymous, service.Grok45PricingGroupName)
	require.NotContains(t, service.GetPublicUserUsableGroups("entitled"), service.Grok45PricingGroupName)
}

func TestFilterPricingByUsableGroupsDoesNotLeakGrok45Pricing(t *testing.T) {
	configurePricingGrok45Entitlements(t)
	pricing := []model.Pricing{
		{ModelName: "gpt-5.5", EnableGroup: []string{"default"}},
		{ModelName: service.Grok45ModelName, EnableGroup: []string{service.Grok45PricingGroupName}},
	}

	entitled := filterPricingByUsableGroups(pricing, getPricingUsableGroups("entitled", true))
	restricted := filterPricingByUsableGroups(pricing, getPricingUsableGroups("restricted", true))
	anonymous := filterPricingByUsableGroups(pricing, getPricingUsableGroups("", false))

	require.Equal(t, pricing, entitled)
	require.Equal(t, []model.Pricing{{ModelName: "gpt-5.5", EnableGroup: []string{"default"}}}, restricted)
	require.Equal(t, restricted, anonymous)
}

func TestPricingGroupRatiosPinGrok45OnlyWhenVisible(t *testing.T) {
	originalGroupRatio := ratio_setting.GroupRatio2JSONString()
	originalSpecialRatio := ratio_setting.GroupGroupRatio2JSONString()
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalGroupRatio))
		require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(originalSpecialRatio))
	})
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"discount":0.7,"grok45":0.6}`))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"entitled":{"grok45":0.2}}`))

	entitled := getPricingGroupRatios("entitled", map[string]string{
		"default": "原价",
		"grok45":  "Grok 4.5 专用通道",
	})
	restricted := getPricingGroupRatios("restricted", map[string]string{"default": "原价"})

	require.Equal(t, service.Grok45PricingGroupRatio, entitled[service.Grok45PricingGroupName])
	require.NotContains(t, restricted, service.Grok45PricingGroupName)
}

func TestFilterPricingVendorsHidesSupplierExposedVendors(t *testing.T) {
	pricing := []model.Pricing{
		{ModelName: "image 2电商商品图快速通道(1.5K)", VendorID: 1},
		{ModelName: "gpt-5.5", VendorID: 2},
	}
	vendors := filterPricingVendors(pricing, []model.PricingVendor{
		{ID: 1, Name: "dragtokens"},
		{ID: 2, Name: "星人模型"},
	})

	require.Equal(t, []model.PricingVendor{{ID: 2, Name: "星人模型"}}, vendors)
}

func TestRegistrationBonusQuotaForCNYConvertsFiveYuan(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	oldExchangeRate := operation_setting.USDExchangeRate
	common.QuotaPerUnit = 500_000
	operation_setting.USDExchangeRate = 7.3
	defer func() {
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.USDExchangeRate = oldExchangeRate
	}()

	require.Equal(t, 342466, registrationBonusQuotaForCNY(5))
}

func TestRegistrationBonusQuotaForCNYDoesNotGrantWhenExchangeRateInvalid(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	oldExchangeRate := operation_setting.USDExchangeRate
	common.QuotaPerUnit = 500_000
	operation_setting.USDExchangeRate = 0
	defer func() {
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.USDExchangeRate = oldExchangeRate
	}()

	require.Equal(t, 0, registrationBonusQuotaForCNY(5))
}

func TestBuildInitialUserTokenUsesStablePublicGroup(t *testing.T) {
	token := buildInitialUserToken(42, "new-user", "test-key")

	require.Equal(t, 42, token.UserId)
	require.Equal(t, "default", token.Group)
	require.False(t, token.CrossGroupRetry)
}
