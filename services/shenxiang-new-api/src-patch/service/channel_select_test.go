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

func withCircuitAbilityChecker(t *testing.T, checker func(string, string, int) (bool, error)) {
	t.Helper()
	original := isChannelAbilityEnabledForCircuit
	isChannelAbilityEnabledForCircuit = checker
	t.Cleanup(func() {
		isChannelAbilityEnabledForCircuit = original
	})
}

func TestModelAbilityCircuitSkipsDisabledPrimary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)
	seenRetries := make([]int, 0, 2)
	selector := func(_ string, _ string, retry int, _ string) (*model.Channel, error) {
		seenRetries = append(seenRetries, retry)
		if retry == 0 {
			return &model.Channel{Id: 43}, nil
		}
		return &model.Channel{Id: 44}, nil
	}
	withCircuitAbilityChecker(t, func(_ string, _ string, channelID int) (bool, error) {
		return channelID == 44, nil
	})

	channel, err := getRandomSatisfiedChannelWithCircuit(
		ctx,
		selector,
		PlusPricingGroupName,
		"gpt-5.6-sol",
		0,
		"/v1/responses",
	)

	require.NoError(t, err)
	require.NotNil(t, channel)
	require.Equal(t, 44, channel.Id)
	require.Equal(t, []int{0, 1}, seenRetries)
}

func TestModelAbilityCircuitReturnsNoChannelWhenEveryRouteIsDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)
	selector := func(_ string, _ string, retry int, _ string) (*model.Channel, error) {
		if retry == 0 {
			return &model.Channel{Id: 43}, nil
		}
		return &model.Channel{Id: 44}, nil
	}
	withCircuitAbilityChecker(t, func(_ string, _ string, _ int) (bool, error) {
		return false, nil
	})

	channel, err := getRandomSatisfiedChannelWithCircuit(
		ctx,
		selector,
		PlusPricingGroupName,
		"gpt-5.4",
		0,
		"/v1/responses",
	)

	require.NoError(t, err)
	require.Nil(t, channel)
}

func TestModelAbilityCircuitDoesNotAffectDefaultGroup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)
	withCircuitAbilityChecker(t, func(_ string, _ string, _ int) (bool, error) {
		require.Fail(t, "default routing must not query the model circuit")
		return false, nil
	})

	channel, err := getRandomSatisfiedChannelWithCircuit(
		ctx,
		func(_ string, _ string, _ int, _ string) (*model.Channel, error) {
			return &model.Channel{Id: 2}, nil
		},
		"default",
		"gpt-5.5",
		0,
		"/v1/responses",
	)

	require.NoError(t, err)
	require.NotNil(t, channel)
	require.Equal(t, 2, channel.Id)
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
