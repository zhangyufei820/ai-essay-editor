package service

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const subscriptionConcurrencyTTL = 10 * time.Minute

var subscriptionConcurrencyMu sync.Mutex
var subscriptionConcurrencyCounts = map[int]int{}

func acquireSubscriptionConcurrency(subscriptionId int, limit int) (func(), error) {
	if subscriptionId <= 0 || limit <= 0 {
		return func() {}, nil
	}
	if common.RedisEnabled && common.RDB != nil {
		return acquireSubscriptionConcurrencyRedis(subscriptionId, limit)
	}
	return acquireSubscriptionConcurrencyMemory(subscriptionId, limit)
}

func acquireSubscriptionConcurrencyRedis(subscriptionId int, limit int) (func(), error) {
	ctx := context.Background()
	key := subscriptionConcurrencyKey(subscriptionId)
	count, err := common.RDB.Incr(ctx, key).Result()
	if err != nil {
		return nil, err
	}
	if count == 1 {
		_ = common.RDB.Expire(ctx, key, subscriptionConcurrencyTTL).Err()
	}
	if count > int64(limit) {
		_, _ = common.RDB.Decr(ctx, key).Result()
		return nil, fmt.Errorf("subscription concurrency limit exceeded")
	}
	var once sync.Once
	return func() {
		once.Do(func() {
			next, err := common.RDB.Decr(ctx, key).Result()
			if err == nil && next <= 0 {
				_ = common.RDB.Del(ctx, key).Err()
			}
		})
	}, nil
}

func acquireSubscriptionConcurrencyMemory(subscriptionId int, limit int) (func(), error) {
	subscriptionConcurrencyMu.Lock()
	defer subscriptionConcurrencyMu.Unlock()
	if subscriptionConcurrencyCounts[subscriptionId] >= limit {
		return nil, fmt.Errorf("subscription concurrency limit exceeded")
	}
	subscriptionConcurrencyCounts[subscriptionId]++
	var once sync.Once
	return func() {
		once.Do(func() {
			subscriptionConcurrencyMu.Lock()
			defer subscriptionConcurrencyMu.Unlock()
			if subscriptionConcurrencyCounts[subscriptionId] <= 1 {
				delete(subscriptionConcurrencyCounts, subscriptionId)
				return
			}
			subscriptionConcurrencyCounts[subscriptionId]--
		})
	}, nil
}

func subscriptionConcurrencyKey(subscriptionId int) string {
	return "subscription:concurrency:" + strconv.Itoa(subscriptionId)
}
