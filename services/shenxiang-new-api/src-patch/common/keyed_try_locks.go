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
		return func() {
			select {
			case <-lock.ch:
			default:
			}
			m.locks.CompareAndDelete(key, lock)
		}, true
	default:
		return nil, false
	}
}
