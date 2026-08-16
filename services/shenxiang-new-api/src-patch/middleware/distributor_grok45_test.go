package middleware

import (
	"testing"

	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/require"
)

func TestCanUsePlaygroundGroupAllowsOnlyExactGrok45Pair(t *testing.T) {
	originalGroups := setting.UserUsableGroups2JSONString()
	specialGroups := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
	originalSpecialGroups := specialGroups.ReadAll()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalGroups))
		specialGroups.Clear()
		specialGroups.AddAll(originalSpecialGroups)
	})
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"原价","grok45":"Grok 4.5 专用通道"}`))
	specialGroups.Clear()

	require.True(t, canUsePlaygroundGroup("default", service.Grok45PricingGroupName, service.Grok45ModelName, true))
	require.True(t, canUsePlaygroundGroup("default", service.Grok45PricingGroupName, service.Grok46ModelName, true))
	require.False(t, canUsePlaygroundGroup("default", service.Grok45PricingGroupName, service.Grok45ModelName, false))
	require.False(t, canUsePlaygroundGroup("default", service.Grok45PricingGroupName, "gpt-5.5", true))
	require.False(t, canUsePlaygroundGroup("default", "internal", service.Grok45ModelName, true))
	require.True(t, canUsePlaygroundGroup(service.Grok45PricingGroupName, service.Grok45PricingGroupName, service.Grok45ModelName, true))
	require.False(t, canUsePlaygroundGroup(service.Grok45PricingGroupName, "default", service.Grok45ModelName, true))
	require.False(t, canUsePlaygroundGroup(service.Grok45PricingGroupName, service.DiscountPricingGroupName, service.Grok45ModelName, true))

	specialGroups.Set("blocked", map[string]string{"-:grok45": "撤销"})
	require.False(t, canUsePlaygroundGroup("blocked", service.Grok45PricingGroupName, service.Grok45ModelName, false))
}
