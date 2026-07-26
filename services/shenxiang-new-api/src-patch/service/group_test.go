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

func TestGetPublicUserUsableGroupsOnlyReturnsStableDiscountAndPlusGroups(t *testing.T) {
	originalGroups := setting.UserUsableGroups2JSONString()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalGroups))
	})
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{
		"default":"原价稳定通道",
		"discount":"特价临时通道",
		"plus":"Plus 通道",
		"kiro":"Claude 经济通道",
		"kiro-stable":"Claude 稳定通道",
		"claude-external":"Claude 标准通道",
		"welfare":"Claude 福利通道",
		"ccmax-terminal":"Claude 终端专用",
		"code":"历史兼容",
		"internal":"内部兼容",
		"pro":"历史兼容",
		"standard":"历史兼容"
	}`))

	groups := GetPublicUserUsableGroups("internal")

	require.Equal(t, map[string]string{
		"default":         "原价稳定通道",
		"discount":        "特价临时通道",
		"plus":            "Plus 通道",
		"kiro":            "Claude 经济通道",
		"kiro-stable":     "Claude 稳定通道",
		"claude-external": "Claude 标准通道",
		"welfare":         "Claude 福利通道",
	}, groups)
	require.NotContains(t, groups, ClaudeTerminalPricingGroupName)
}

func TestIsPublicTokenGroupRejectsLegacyAndAutoGroups(t *testing.T) {
	require.False(t, IsPublicTokenGroup(""))
	require.True(t, IsPublicTokenGroup("default"))
	require.True(t, IsPublicTokenGroup(DiscountPricingGroupName))
	require.True(t, IsPublicTokenGroup(PlusPricingGroupName))
	require.True(t, IsPublicTokenGroup(ClaudeKiroPricingGroupName))
	require.True(t, IsPublicTokenGroup(ClaudeKiroStablePricingGroupName))
	require.True(t, IsPublicTokenGroup(ClaudeExternalPricingGroupName))
	require.True(t, IsPublicTokenGroup(ClaudeWelfarePricingGroupName))
	require.False(t, IsPublicTokenGroup(ClaudeTerminalPricingGroupName))
	require.True(t, IsPublicClaudeTokenGroup(ClaudeKiroPricingGroupName))
	require.True(t, IsPublicClaudeTokenGroup(ClaudeKiroStablePricingGroupName))
	require.True(t, IsPublicClaudeTokenGroup(ClaudeTerminalPricingGroupName))
	require.True(t, IsPublicClaudeTokenGroup(ClaudeExternalPricingGroupName))
	require.True(t, IsPublicClaudeTokenGroup(ClaudeWelfarePricingGroupName))
	require.False(t, IsPublicClaudeTokenGroup("default"))
	require.False(t, IsPublicTokenGroup("internal"))
	require.False(t, IsPublicTokenGroup("auto"))
}

func TestIsTextPricingPreferenceModel(t *testing.T) {
	require.True(t, IsTextPricingPreferenceModel("gpt-5.5"))
	require.True(t, IsTextPricingPreferenceModel(" GPT-5.6-LUNA "))
	require.False(t, IsTextPricingPreferenceModel("grok-4.5"))
	require.False(t, IsTextPricingPreferenceModel("claude-sonnet-4-6"))
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

func TestMarketplacePricingGroupsAddsTerminalWithChineseLabelsWithoutMakingItPublic(t *testing.T) {
	originalGroups := setting.UserUsableGroups2JSONString()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalGroups))
	})
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{
		"kiro":"legacy kiro",
		"kiro-stable":"legacy stable",
		"ccmax-terminal":"legacy terminal",
		"claude-external":"legacy external",
		"welfare":"legacy welfare"
	}`))

	groups := GetMarketplacePricingGroups("default", false)

	require.Equal(t, "Kiro", groups[ClaudeKiroPricingGroupName])
	require.Equal(t, "Kiro 稳定版", groups[ClaudeKiroStablePricingGroupName])
	require.Equal(t, "ccmax 终端专用", groups[ClaudeTerminalPricingGroupName])
	require.Equal(t, "Claude 外接", groups[ClaudeExternalPricingGroupName])
	require.Equal(t, "福利", groups[ClaudeWelfarePricingGroupName])
	require.NotContains(t, GetPublicPricingGroups("default", false), ClaudeTerminalPricingGroupName)
	require.False(t, IsPublicTokenGroup(ClaudeTerminalPricingGroupName))
}

func TestNormalizePublicTokenGroupDefaultsLegacyAndAutoGroups(t *testing.T) {
	require.Equal(t, "default", NormalizePublicTokenGroup("internal"))
	require.Equal(t, "default", NormalizePublicTokenGroup("auto"))
	require.Equal(t, "default", NormalizePublicTokenGroup(""))
	require.Equal(t, DiscountPricingGroupName, NormalizePublicTokenGroup(" discount "))
	require.Equal(t, PlusPricingGroupName, NormalizePublicTokenGroup(" plus "))
}

func TestManagedPricingGroupGlobalSwitchOverridesSpecialGroupRules(t *testing.T) {
	originalGroups := setting.UserUsableGroups2JSONString()
	specialGroups := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
	originalSpecialGroups := specialGroups.ReadAll()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalGroups))
		specialGroups.Clear()
		specialGroups.AddAll(originalSpecialGroups)
	})

	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"原价","discount":"特价","plus":"Plus"}`))
	specialGroups.Clear()
	specialGroups.Set("vip", map[string]string{"-:default": "隐藏", "-:discount": "隐藏", "-:plus": "隐藏"})
	require.Contains(t, GetUserUsableGroups("vip"), "default")
	require.Contains(t, GetUserUsableGroups("vip"), DiscountPricingGroupName)
	require.Contains(t, GetUserUsableGroups("vip"), PlusPricingGroupName)

	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"原价"}`))
	specialGroups.Set("vip", map[string]string{"+:discount": "显示", "+:plus": "显示"})
	require.NotContains(t, GetUserUsableGroups("vip"), DiscountPricingGroupName)
	require.NotContains(t, GetUserUsableGroups("vip"), PlusPricingGroupName)
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
		"plus":"Plus",
		"kiro":"Claude 经济",
		"kiro-stable":"Claude 稳定",
		"claude-external":"Claude 标准",
		"welfare":"Claude 福利",
		"ccmax-terminal":"Claude 终端专用",
		"internal":"历史兼容"
	}`))
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["default","internal","discount","plus","kiro","kiro-stable","claude-external","ccmax-terminal","welfare"]`))

	require.Equal(t, []string{"default", "internal"}, GetUserAutoGroup("internal"))
	require.Equal(t, []string{"default"}, GetPublicUserAutoGroup("internal"))
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

	require.Equal(t, 0.25, DiscountPricingGroupRatio)
	require.Equal(t, DiscountPricingGroupName, relayInfo.UsingGroup)
	require.Equal(t, DiscountPricingGroupRatio, groupRatio)
}

func TestGetUserGroupRatioPinsPlusMarketplaceRatio(t *testing.T) {
	originalGroupRatio := ratio_setting.GroupRatio2JSONString()
	originalSpecialRatio := ratio_setting.GroupGroupRatio2JSONString()
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalGroupRatio))
		require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(originalSpecialRatio))
	})
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"plus":0.8}`))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"vip":{"plus":0.4}}`))

	require.Equal(t, 0.5, PlusPricingGroupRatio)
	require.Equal(t, PlusPricingGroupRatio, GetUserGroupRatio("vip", PlusPricingGroupName))
}

func TestNormalizeTokenGroupChainTrimsDeduplicatesAndPreservesOrder(t *testing.T) {
	normalized, groups, err := NormalizeTokenGroupChain(" default, discount,default , plus ")

	require.NoError(t, err)
	require.Equal(t, "default,discount,plus", normalized)
	require.Equal(t, []string{"default", DiscountPricingGroupName, PlusPricingGroupName}, groups)
}

func TestNormalizeTokenGroupChainRejectsInvalidShapes(t *testing.T) {
	tests := []string{
		"default,,discount",
		"auto,default",
		"default,discount,plus,kiro",
	}
	for _, rawGroup := range tests {
		t.Run(rawGroup, func(t *testing.T) {
			_, _, err := NormalizeTokenGroupChain(rawGroup)
			require.Error(t, err)
		})
	}
}

func TestIsPublicClaudeTokenGroupChainRequiresOnlyPublicClaudeGroups(t *testing.T) {
	require.True(t, IsPublicClaudeTokenGroupChain("kiro,claude-external"))
	require.True(t, IsPublicClaudeTokenGroupChain("kiro,ccmax-terminal"))
	require.True(t, IsPublicClaudeTokenGroupChain("welfare"))
	require.False(t, IsPublicClaudeTokenGroupChain("welfare,claude-external"))
	require.False(t, IsPublicClaudeTokenGroupChain("kiro,default"))
}
