package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func withTokenGroupChainChannelSelector(t *testing.T, selector func(string, string, int, string) (*model.Channel, error)) {
	t.Helper()
	original := getRandomSatisfiedChannelForTokenGroupChain
	getRandomSatisfiedChannelForTokenGroupChain = selector
	t.Cleanup(func() {
		getRandomSatisfiedChannelForTokenGroupChain = original
	})
}

func TestCacheGetRandomSatisfiedChannelFallsThroughMissingPrimaryGroup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)
	SetTokenGroupChain(ctx, []string{"default", DiscountPricingGroupName, PlusPricingGroupName})
	selectedGroups := make([]string, 0, 2)
	withTokenGroupChainChannelSelector(t, func(group, _ string, retry int, _ string) (*model.Channel, error) {
		selectedGroups = append(selectedGroups, group)
		require.Zero(t, retry)
		if group == DiscountPricingGroupName {
			return &model.Channel{Id: 22}, nil
		}
		return nil, nil
	})

	channel, selectedGroup, err := CacheGetRandomSatisfiedChannel(&RetryParam{
		Ctx:        ctx,
		TokenGroup: "default",
		ModelName:  "gpt-5.6-sol",
		Retry:      common.GetPointer(0),
	})

	require.NoError(t, err)
	require.Equal(t, 22, channel.Id)
	require.Equal(t, DiscountPricingGroupName, selectedGroup)
	require.Equal(t, []string{"default", DiscountPricingGroupName}, selectedGroups)
	require.Equal(t, DiscountPricingGroupName, common.GetContextKeyString(ctx, constant.ContextKeyUsingGroup))
	require.Equal(t, 2, common.GetContextKeyInt(ctx, constant.ContextKeyTokenGroupChainIndex))
}

func TestCacheGetRandomSatisfiedChannelMovesToNextGroupAfterRetryableFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)
	SetTokenGroupChain(ctx, []string{"default", DiscountPricingGroupName})
	MarkTokenGroupChainSelected(ctx, "default")
	withTokenGroupChainChannelSelector(t, func(group, _ string, retry int, _ string) (*model.Channel, error) {
		require.Equal(t, DiscountPricingGroupName, group)
		require.Zero(t, retry)
		return &model.Channel{Id: 23}, nil
	})

	channel, selectedGroup, err := CacheGetRandomSatisfiedChannel(&RetryParam{
		Ctx:        ctx,
		TokenGroup: "default",
		ModelName:  "gpt-5.6-sol",
		Retry:      common.GetPointer(1),
	})

	require.NoError(t, err)
	require.Equal(t, 23, channel.Id)
	require.Equal(t, DiscountPricingGroupName, selectedGroup)
}
