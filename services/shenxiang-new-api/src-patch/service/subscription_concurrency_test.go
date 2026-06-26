package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestAcquireSubscriptionConcurrencyMemoryLimitAndRelease(t *testing.T) {
	oldRedisEnabled := common.RedisEnabled
	oldCounts := subscriptionConcurrencyCounts
	common.RedisEnabled = false
	subscriptionConcurrencyCounts = map[int]int{}
	t.Cleanup(func() {
		common.RedisEnabled = oldRedisEnabled
		subscriptionConcurrencyCounts = oldCounts
	})

	releases := make([]func(), 0, 5)
	for i := 0; i < 5; i++ {
		release, err := acquireSubscriptionConcurrency(100, 5)
		require.NoError(t, err)
		releases = append(releases, release)
	}
	_, err := acquireSubscriptionConcurrency(100, 5)
	require.Error(t, err)

	releases[0]()
	release, err := acquireSubscriptionConcurrency(100, 5)
	require.NoError(t, err)
	release()
	for _, release := range releases[1:] {
		release()
	}
	require.Empty(t, subscriptionConcurrencyCounts)
}
