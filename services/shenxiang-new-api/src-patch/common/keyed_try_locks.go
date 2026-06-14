package common

import "sync"

type KeyedTryLocks[K comparable] struct {
	locks sync.Map
}

type keyedTryLock struct {
	ch chan struct{}
}

func NewKeyedTryLocks[K comparable]() *KeyedTryLocks[K] {
	return &KeyedTryLocks[K]{}
}

func (m *KeyedTryLocks[K]) TryLock(key K) (func(), bool) {
	actual, _ := m.locks.LoadOrStore(key, &keyedTryLock{ch: make(chan struct{}, 1)})
	lock := actual.(*keyedTryLock)
	select {
	case lock.ch <- struct{}{}:
		// Unlock only releases the slot. We deliberately do NOT delete the
		// key from the map here: draining the channel and deleting the entry
		// cannot be done atomically, so another goroutine could acquire the
		// lock between the drain and the delete, and the delete would then
		// evict a *held* lock — breaking mutual exclusion. Entries are keyed
		// by a bounded set (e.g. user id), so retaining them is acceptable.
		return func() {
			select {
			case <-lock.ch:
			default:
			}
		}, true
	default:
		return nil, false
	}
}
