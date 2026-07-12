package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/require"
)

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
		"grok45":   "Grok 4.5 专用通道",
	})

	require.Equal(t, []string{"default"}, groups)
}

func TestFilterPricingByUsableGroupsExposesDedicatedGrokPricing(t *testing.T) {
	pricing := filterPricingByUsableGroups([]model.Pricing{
		{ModelName: "grok-4.5", EnableGroup: []string{"grok45"}},
		{ModelName: "internal-only", EnableGroup: []string{"internal"}},
	}, map[string]string{
		"default": "原价",
		"grok45":  "Grok 4.5 专用通道",
	})

	require.Equal(t, []model.Pricing{
		{ModelName: "grok-4.5", EnableGroup: []string{"grok45"}},
	}, pricing)
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
