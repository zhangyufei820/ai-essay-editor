package service

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGetPublicUserUsableGroupsOnlyReturnsStableAndDiscountGroups(t *testing.T) {
	originalGroups := setting.UserUsableGroups2JSONString()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalGroups))
	})
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{
		"default":"原价稳定通道",
		"discount":"特价临时通道",
		"grok45":"Grok 4.5 专用通道",
		"code":"历史兼容",
		"internal":"内部兼容",
		"pro":"历史兼容",
		"standard":"历史兼容"
	}`))

	groups := GetPublicUserUsableGroups("internal")

	require.Equal(t, map[string]string{
		"default":  "原价稳定通道",
		"discount": "特价临时通道",
	}, groups)
	require.NotContains(t, groups, Grok45PricingGroupName)
}

func TestGrok45EntitlementDoesNotBroadenPublicGroupSelection(t *testing.T) {
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

	require.True(t, UserCanUseGrok45PricingGroup("entitled"))
	require.False(t, UserCanUseGrok45PricingGroup("restricted"))
	require.False(t, GroupInUserUsableGroups("entitled", Grok45PricingGroupName))
	require.NotContains(t, GetPublicUserUsableGroups("entitled"), Grok45PricingGroupName)
}

func TestIsPublicTokenGroupRejectsLegacyAndAutoGroups(t *testing.T) {
	require.False(t, IsPublicTokenGroup(""))
	require.True(t, IsPublicTokenGroup("default"))
	require.True(t, IsPublicTokenGroup(DiscountPricingGroupName))
	require.False(t, IsPublicTokenGroup("internal"))
	require.False(t, IsPublicTokenGroup("auto"))
}

func TestPublicPricingGroupsRequireManagedGrokEntitlement(t *testing.T) {
	originalGroups := setting.UserUsableGroups2JSONString()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalGroups))
	})
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{
		"default":"原价稳定通道",
		"discount":"特价临时通道",
		"grok45":"Grok 4.5 专用通道"
	}`))

	require.NotContains(t, GetPublicPricingGroups("default", false), Grok45PricingGroupName)
	require.Contains(t, GetPublicPricingGroups("default", true), Grok45PricingGroupName)
	require.NotContains(t, GetPublicUserUsableGroups("default"), Grok45PricingGroupName)
	require.False(t, IsPublicTokenGroup(Grok45PricingGroupName))
	require.False(t, GroupInUserUsableGroups("default", Grok45PricingGroupName))
}

func TestNormalizePublicTokenGroupDefaultsLegacyAndAutoGroups(t *testing.T) {
	require.Equal(t, "default", NormalizePublicTokenGroup("internal"))
	require.Equal(t, "default", NormalizePublicTokenGroup("auto"))
	require.Equal(t, "default", NormalizePublicTokenGroup(""))
	require.Equal(t, DiscountPricingGroupName, NormalizePublicTokenGroup(" discount "))
}

func TestDiscountGroupGlobalSwitchOverridesSpecialGroupRules(t *testing.T) {
	originalGroups := setting.UserUsableGroups2JSONString()
	specialGroups := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
	originalSpecialGroups := specialGroups.ReadAll()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalGroups))
		specialGroups.Clear()
		specialGroups.AddAll(originalSpecialGroups)
	})

	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"原价","discount":"特价"}`))
	specialGroups.Clear()
	specialGroups.Set("vip", map[string]string{"-:default": "隐藏", "-:discount": "隐藏"})
	require.Contains(t, GetUserUsableGroups("vip"), "default")
	require.Contains(t, GetUserUsableGroups("vip"), DiscountPricingGroupName)

	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"原价"}`))
	specialGroups.Set("vip", map[string]string{"+:discount": "显示"})
	require.NotContains(t, GetUserUsableGroups("vip"), DiscountPricingGroupName)
}

func TestGetPublicUserAutoGroupHidesLegacyGroups(t *testing.T) {
	originalGroups := setting.UserUsableGroups2JSONString()
	originalAutoGroups := setting.AutoGroups2JsonString()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalGroups))
		require.NoError(t, setting.UpdateAutoGroupsByJsonString(originalAutoGroups))
	})
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{
		"default":"原价",
		"discount":"特价",
		"grok45":"Grok 4.5 专用通道",
		"internal":"历史兼容"
	}`))
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["default","internal","discount","grok45"]`))

	require.Equal(t, []string{"default", "internal"}, GetUserAutoGroup("internal"))
	require.Equal(t, []string{"default"}, GetPublicUserAutoGroup("internal"))
}

func TestGetUserGroupRatioPinsGrok45Ratio(t *testing.T) {
	originalGroupRatio := ratio_setting.GroupRatio2JSONString()
	originalSpecialRatio := ratio_setting.GroupGroupRatio2JSONString()
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalGroupRatio))
		require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(originalSpecialRatio))
	})
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"grok45":0.7}`))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"vip":{"grok45":0.3}}`))

	require.Equal(t, Grok45PricingGroupRatio, GetUserGroupRatio("vip", Grok45PricingGroupName))
}

func TestResolveRealtimeGroupRatioPinsDiscountMarketplaceRatio(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalGroupRatio := ratio_setting.GroupRatio2JSONString()
	originalSpecialRatio := ratio_setting.GroupGroupRatio2JSONString()
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalGroupRatio))
		require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(originalSpecialRatio))
	})
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"discount":0.7}`))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"vip":{"discount":0.3}}`))
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Set(string(constant.ContextKeyAutoGroup), DiscountPricingGroupName)
	relayInfo := &relaycommon.RelayInfo{
		UserGroup:  "vip",
		UsingGroup: "auto",
	}

	groupRatio := resolveRealtimeGroupRatio(ctx, relayInfo)

	require.Equal(t, DiscountPricingGroupName, relayInfo.UsingGroup)
	require.Equal(t, DiscountPricingGroupRatio, groupRatio)
}

func TestResolveRealtimeGroupRatioPinsGrok45MarketplaceRatio(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalGroupRatio := ratio_setting.GroupRatio2JSONString()
	originalSpecialRatio := ratio_setting.GroupGroupRatio2JSONString()
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalGroupRatio))
		require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(originalSpecialRatio))
	})
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"grok45":0.7}`))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"vip":{"grok45":0.3}}`))
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	relayInfo := &relaycommon.RelayInfo{
		UserGroup:  "vip",
		UsingGroup: Grok45PricingGroupName,
	}

	groupRatio := resolveRealtimeGroupRatio(ctx, relayInfo)

	require.Equal(t, Grok45PricingGroupName, relayInfo.UsingGroup)
	require.Equal(t, Grok45PricingGroupRatio, groupRatio)
}
