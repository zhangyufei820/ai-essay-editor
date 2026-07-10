package service

import (
	"errors"
	"sync"
)

var subscriptionConcurrencySlots = struct {
	sync.Mutex
	active map[int]int
}{active: make(map[int]int)}

func acquireSubscriptionConcurrency(subscriptionID int, limit int) (func(), error) {
	if subscriptionID <= 0 || limit <= 0 {
		return func() {}, nil
	}

	subscriptionConcurrencySlots.Lock()
	defer subscriptionConcurrencySlots.Unlock()

	if subscriptionConcurrencySlots.active[subscriptionID] >= limit {
		return nil, errors.New("subscription concurrency limit exceeded")
	}
	subscriptionConcurrencySlots.active[subscriptionID]++

	var once sync.Once
	return func() {
		once.Do(func() {
			subscriptionConcurrencySlots.Lock()
			defer subscriptionConcurrencySlots.Unlock()

			current := subscriptionConcurrencySlots.active[subscriptionID]
			if current <= 1 {
				delete(subscriptionConcurrencySlots.active, subscriptionID)
				return
			}
			subscriptionConcurrencySlots.active[subscriptionID] = current - 1
		})
	}, nil
}
