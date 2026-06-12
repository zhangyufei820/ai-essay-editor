package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestIsChannelCurrentPriorityForGroupModelRejectsStaleAffinityChannel(t *testing.T) {
	withChannelSatisfyCacheForTest(t, map[string]map[string][]int{
		"default": {
			"gpt-5.5": {2, 3},
		},
	}, map[int]*Channel{
		2: testChannelWithPriority(2, common.ChannelStatusEnabled, 40),
		3: testChannelWithPriority(3, common.ChannelStatusEnabled, 20),
	})

	require.True(t, IsChannelCurrentPriorityForGroupModel("default", "gpt-5.5", 2))
	require.False(t, IsChannelCurrentPriorityForGroupModel("default", "gpt-5.5", 3))
}

func TestIsChannelCurrentPriorityForGroupModelKeepsSamePriorityAffinityChannel(t *testing.T) {
	withChannelSatisfyCacheForTest(t, map[string]map[string][]int{
		"default": {
			"gpt-5.5": {2, 14},
		},
	}, map[int]*Channel{
		2:  testChannelWithPriority(2, common.ChannelStatusEnabled, 40),
		14: testChannelWithPriority(14, common.ChannelStatusEnabled, 40),
	})

	require.True(t, IsChannelCurrentPriorityForGroupModel("default", "gpt-5.5", 14))
}

func withChannelSatisfyCacheForTest(t *testing.T, groups map[string]map[string][]int, channels map[int]*Channel) {
	t.Helper()

	oldMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true

	channelSyncLock.Lock()
	oldGroups := group2model2channels
	oldChannels := channelsIDM
	group2model2channels = groups
	channelsIDM = channels
	channelSyncLock.Unlock()

	t.Cleanup(func() {
		channelSyncLock.Lock()
		group2model2channels = oldGroups
		channelsIDM = oldChannels
		channelSyncLock.Unlock()
		common.MemoryCacheEnabled = oldMemoryCacheEnabled
	})
}

func testChannelWithPriority(id int, status int, priority int64) *Channel {
	return &Channel{
		Id:       id,
		Status:   status,
		Priority: &priority,
	}
}
