package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/stretchr/testify/require"
)

func TestSelectUserGroupsForPurposeIncludesTerminalOnlyForTokenConfig(t *testing.T) {
	originalGroups := setting.UserUsableGroups2JSONString()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalGroups))
	})
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{
		"default":"原价",
		"kiro":"Kiro",
		"kiro-stable":"Kiro 稳定版",
		"ccmax-terminal":"ccmax 终端专用",
		"claude-external":"Claude 外接",
		"welfare":"福利",
		"welfare-001":"福利 0.001x"
	}`))

	regularGroups := selectUserGroupsForPurpose("default", "")
	tokenGroups := selectUserGroupsForPurpose("default", tokenConfigurationGroupsPurpose)

	require.NotContains(t, regularGroups, service.ClaudeTerminalPricingGroupName)
	require.Equal(t, "福利", regularGroups[service.ClaudeWelfarePricingGroupName])
	require.Equal(t, "福利 0.001x", regularGroups[service.ClaudeWelfare001PricingGroupName])
	require.Equal(t, "ccmax 终端专用", tokenGroups[service.ClaudeTerminalPricingGroupName])
	require.Equal(t, "福利", tokenGroups[service.ClaudeWelfarePricingGroupName])
	require.Equal(t, "福利 0.001x", tokenGroups[service.ClaudeWelfare001PricingGroupName])
}
