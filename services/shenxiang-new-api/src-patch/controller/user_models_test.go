package controller

import (
	"context"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/require"
)

func TestEnsureManagedGrok45EntitlementLazilyProvisionsBeforeChecking(t *testing.T) {
	originalEnsure := ensureManagedGrok45UserToken
	originalHasToken := userHasManagedGrok45Token
	t.Cleanup(func() {
		ensureManagedGrok45UserToken = originalEnsure
		userHasManagedGrok45Token = originalHasToken
	})
	steps := make([]string, 0, 2)
	ensureManagedGrok45UserToken = func(_ context.Context, userID int) (service.ManagedGrok45TokenEnsureResult, error) {
		steps = append(steps, "ensure")
		return service.ManagedGrok45TokenEnsureResult{UserID: userID, CapabilityActive: true, Created: 1}, nil
	}
	userHasManagedGrok45Token = func(_ context.Context, userID int) (bool, error) {
		steps = append(steps, "check")
		return userID == 42, nil
	}

	entitled, err := ensureManagedGrok45EntitlementForUser(context.Background(), 42)

	require.NoError(t, err)
	require.True(t, entitled)
	require.Equal(t, []string{"ensure", "check"}, steps)
}

func TestManagedGrok45PricingVisibilityUsesCapabilityForAnonymousCatalog(t *testing.T) {
	originalCapability := managedGrok45CapabilityActive
	originalEnsure := ensureManagedGrok45UserToken
	t.Cleanup(func() {
		managedGrok45CapabilityActive = originalCapability
		ensureManagedGrok45UserToken = originalEnsure
	})
	ensureManagedGrok45UserToken = func(_ context.Context, _ int) (service.ManagedGrok45TokenEnsureResult, error) {
		t.Fatal("anonymous pricing unexpectedly provisioned a token")
		return service.ManagedGrok45TokenEnsureResult{}, nil
	}
	managedGrok45CapabilityActive = func(_ context.Context) (bool, error) {
		return true, nil
	}

	visible, err := managedGrok45PricingVisible(context.Background(), 0)

	require.NoError(t, err)
	require.True(t, visible)
}

func TestFilterUserVisibleModelNamesRequiresManagedGrokEntitlementForGrok46(t *testing.T) {
	originalEnsure := ensureManagedGrok45UserToken
	originalHasToken := userHasManagedGrok45Token
	t.Cleanup(func() {
		ensureManagedGrok45UserToken = originalEnsure
		userHasManagedGrok45Token = originalHasToken
	})
	ensureManagedGrok45UserToken = func(_ context.Context, userID int) (service.ManagedGrok45TokenEnsureResult, error) {
		return service.ManagedGrok45TokenEnsureResult{UserID: userID, CapabilityActive: true}, nil
	}
	userHasManagedGrok45Token = func(_ context.Context, userID int) (bool, error) {
		return userID == 46, nil
	}

	models := []string{service.Grok45ModelName, service.Grok46ModelName, "gpt-5.5"}
	require.Equal(t, models, filterUserVisibleModelNames(46, models))
	require.Equal(t, []string{"gpt-5.5"}, filterUserVisibleModelNames(47, models))
}

func TestPinManagedGrok45PricingUsesExactCNYRates(t *testing.T) {
	originalExchangeRate := operation_setting.USDExchangeRate
	operation_setting.USDExchangeRate = 8
	t.Cleanup(func() {
		operation_setting.USDExchangeRate = originalExchangeRate
	})
	cacheRatio := 9.0
	createCacheRatio := 7.0

	pricing := pinManagedGrok45Pricing([]model.Pricing{
		{
			ModelName:        service.Grok45ModelName,
			QuotaType:        1,
			ModelRatio:       99,
			ModelPrice:       99,
			CompletionRatio:  99,
			CacheRatio:       &cacheRatio,
			CreateCacheRatio: &createCacheRatio,
			EnableGroup:      []string{service.Grok45PricingGroupName},
			BillingMode:      "tiered_expr",
			BillingExpr:      "unsafe",
		},
		{
			ModelName:        service.Grok46ModelName,
			QuotaType:        1,
			ModelRatio:       77,
			ModelPrice:       77,
			CompletionRatio:  77,
			CacheRatio:       &cacheRatio,
			CreateCacheRatio: &createCacheRatio,
			EnableGroup:      []string{service.Grok45PricingGroupName},
			BillingMode:      "tiered_expr",
			BillingExpr:      "unsafe",
		},
	})

	require.Len(t, pricing, 2)
	for _, item := range pricing {
		require.Zero(t, item.QuotaType)
		require.InDelta(t, 0.125, item.ModelRatio, 0.000000001)
		require.Zero(t, item.ModelPrice)
		require.Equal(t, service.Grok45CompletionRatio, item.CompletionRatio)
		require.NotNil(t, item.CacheRatio)
		require.Equal(t, service.Grok45CacheReadRatio, *item.CacheRatio)
		require.Nil(t, item.CreateCacheRatio)
		require.Empty(t, item.BillingMode)
		require.Empty(t, item.BillingExpr)
	}
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
		"internal-image2-discount-v2",
		"internal-image2-stable-v1",
		"特价 image-2",
		"image 2电商商品图快速通道(1.5K)",
		"ccapi-image-leak",
		"custom-geek2api-leak",
		"dragtokens-image-leak",
		"moonapix-image-leak",
	})

	require.Equal(t, []string{"gpt-5.5", "特价 image-2", "官转image 2稳定", "image 2电商商品图快速通道(1.5K)"}, models)
	require.Contains(t, models, "特价 image-2")
	require.NotContains(t, models, "geek2api-image-2")
	require.NotContains(t, models, "internal-image2-discount-v2")
	require.NotContains(t, models, "internal-image2-stable-v1")
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

func TestFilterPricingByUsableGroupsSynthesizesStableImage2PublicPricing(t *testing.T) {
	originalModelPrice := ratio_setting.ModelPrice2JSONString()
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(originalModelPrice))
	})
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"官转image 2稳定":0.018493150685}`))

	pricing := filterPricingByUsableGroups([]model.Pricing{
		{
			ModelName:              service.InternalStableImage2ModelName,
			Description:            "官转image 2稳定：支持 1K/2K/4K 输出，人民币 ¥0.135/张。",
			Tags:                   "image,openai",
			EnableGroup:            []string{"default"},
			SupportedEndpointTypes: nil,
		},
	}, map[string]string{"default": "原价"})

	require.Equal(t, []model.Pricing{
		{
			ModelName:   service.PublicStableImage2ModelName,
			Description: "官转image 2稳定：支持 1K/2K/4K 输出，人民币 ¥0.135/张。",
			Tags:        "image,openai",
			QuotaType:   1,
			ModelPrice:  0.018493150685,
			EnableGroup: []string{"default"},
		},
	}, pricing)
}

func TestFilterPricingByUsableGroupsSynthesizesDiscountImage2PublicPricing(t *testing.T) {
	originalModelPrice := ratio_setting.ModelPrice2JSONString()
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(originalModelPrice))
	})
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"特价 image-2":0.008219178082}`))

	pricing := filterPricingByUsableGroups([]model.Pricing{
		{
			ModelName:   service.InternalDiscountImage2ModelName,
			Description: "特价 image-2：人民币 1K ¥0.06、2K ¥0.09、4K ¥0.10/张。",
			Tags:        "image,openai,internal-hidden",
			EnableGroup: []string{"default"},
		},
	}, map[string]string{"default": "原价"})

	require.Len(t, pricing, 1)
	require.Equal(t, service.PublicDiscountImage2ModelName, pricing[0].ModelName)
	require.Equal(t, 1, pricing[0].QuotaType)
	require.InDelta(t, 0.008219178082, pricing[0].ModelPrice, 0.000000000001)
	require.Equal(t, []string{"default"}, pricing[0].EnableGroup)
	require.NotContains(t, pricing[0].Description, "internal-image2")
	require.NotContains(t, pricing[0].Tags, "internal-hidden")
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
		"plus":     "Plus",
		"grok45":   "Grok 4.5 专用通道",
	})

	require.Equal(t, []string{"default"}, groups)
}

func TestPublicPricingGroupsExposesPlusOnlyWhenExplicitlyEnabled(t *testing.T) {
	groups := publicPricingGroups([]string{"default", "plus"}, map[string]string{
		"default": "原价",
		"plus":    "Plus",
	})

	require.Equal(t, []string{"default", "plus"}, groups)
}

func TestPublicPricingGroupsExposesSpecialWhenExplicitlyEnabled(t *testing.T) {
	groups := publicPricingGroups([]string{"special"}, map[string]string{
		"default":                       "原价",
		service.SpecialPricingGroupName: "特价 0.06x",
	})

	require.Equal(t, []string{service.SpecialPricingGroupName}, groups)
}

func TestPublicPricingGroupsExposesAllClaudeMarketplaceGroups(t *testing.T) {
	groups := publicPricingGroups([]string{
		service.ClaudeKiroPricingGroupName,
		service.ClaudeKiroStablePricingGroupName,
		service.ClaudeTerminalPricingGroupName,
		service.ClaudeExternalPricingGroupName,
		service.ClaudeWelfarePricingGroupName,
		service.ClaudeWelfare001PricingGroupName,
	}, map[string]string{
		service.ClaudeKiroPricingGroupName:       "Claude 经济",
		service.ClaudeKiroStablePricingGroupName: "Claude 稳定",
		service.ClaudeTerminalPricingGroupName:   "Claude 终端专用",
		service.ClaudeExternalPricingGroupName:   "Claude 外接",
		service.ClaudeWelfarePricingGroupName:    "Claude 福利",
		service.ClaudeWelfare001PricingGroupName: "Claude 福利 0.001x",
	})

	require.Equal(t, []string{
		service.ClaudeKiroPricingGroupName,
		service.ClaudeKiroStablePricingGroupName,
		service.ClaudeTerminalPricingGroupName,
		service.ClaudeExternalPricingGroupName,
		service.ClaudeWelfarePricingGroupName,
		service.ClaudeWelfare001PricingGroupName,
	}, groups)
}

func TestFilterPricingByUsableGroupsExposesDedicatedGrokPricing(t *testing.T) {
	pricing := filterPricingByUsableGroups([]model.Pricing{
		{ModelName: "grok-4.5", EnableGroup: []string{"grok45"}},
		{ModelName: "grok-4.6", EnableGroup: []string{"grok45"}},
		{ModelName: "internal-only", EnableGroup: []string{"internal"}},
	}, map[string]string{
		"default": "原价",
		"grok45":  "Grok 4.5 专用通道",
	})

	require.Equal(t, []model.Pricing{
		{ModelName: "grok-4.5", EnableGroup: []string{"grok45"}},
		{ModelName: "grok-4.6", EnableGroup: []string{"grok45"}},
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

func TestBuildInitialUserTokenUsesStablePublicGroup(t *testing.T) {
	token := buildInitialUserToken(42, "new-user", "test-key")

	require.Equal(t, 42, token.UserId)
	require.Equal(t, "default", token.Group)
	require.False(t, token.CrossGroupRetry)
}
