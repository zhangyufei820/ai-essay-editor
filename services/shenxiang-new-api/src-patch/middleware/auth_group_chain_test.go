package middleware

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func withTokenGroupChainSettings(t *testing.T) {
	t.Helper()
	originalGroups := setting.UserUsableGroups2JSONString()
	originalRatios := ratio_setting.GroupRatio2JSONString()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
	})
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"原价","discount":"特价","plus":"Plus"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"discount":0.25,"plus":0.5}`))
}

func TestResolveTokenGroupChainValidatesEveryGroup(t *testing.T) {
	withTokenGroupChainSettings(t)

	normalized, groups, err := resolveTokenGroupChain("default", " default, discount,default,plus ")

	require.NoError(t, err)
	require.Equal(t, "default,discount,plus", normalized)
	require.Equal(t, []string{"default", service.DiscountPricingGroupName, service.PlusPricingGroupName}, groups)

	_, _, err = resolveTokenGroupChain("default", "default,internal")
	require.Error(t, err)
}

func TestSetupContextForTokenUsesPrimaryGroupAndPreservesChain(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	token := &model.Token{
		Id:          91,
		UserId:      1,
		Key:         "test-only-key",
		Name:        "test token",
		Group:       "default,discount,plus",
		Status:      common.TokenStatusEnabled,
		ExpiredTime: -1,
	}

	err := SetupContextForToken(ctx, token)

	require.NoError(t, err)
	require.Equal(t, "default", common.GetContextKeyString(ctx, constant.ContextKeyTokenGroup))
	require.Equal(t, []string{"default", "discount", "plus"}, common.GetContextKeyStringSlice(ctx, constant.ContextKeyTokenGroupChain))
	require.Zero(t, common.GetContextKeyInt(ctx, constant.ContextKeyTokenGroupChainIndex))
}
