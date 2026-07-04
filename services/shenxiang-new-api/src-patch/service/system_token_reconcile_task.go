package service

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/bytedance/gopkg/util/gopool"
)

const (
	systemTokenReconcileTickInterval = 10 * time.Minute
)

var (
	systemTokenReconcileOnce    sync.Once
	systemTokenReconcileRunning atomic.Bool
)

func StartSystemTokenReconcileTask() {
	systemTokenReconcileOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("admin system token reconcile task started: user_id=%d tick=%s", AdminSystemTokenUserID, systemTokenReconcileTickInterval))
			runSystemTokenReconcileOnce()
			ticker := time.NewTicker(systemTokenReconcileTickInterval)
			defer ticker.Stop()
			for range ticker.C {
				runSystemTokenReconcileOnce()
			}
		})
	})
}

func runSystemTokenReconcileOnce() {
	if !systemTokenReconcileRunning.CompareAndSwap(false, true) {
		return
	}
	defer systemTokenReconcileRunning.Store(false)

	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	result, err := EnsureSystemTokensForUserID(ctx, AdminSystemTokenUserID)
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("admin system token reconcile failed: user_id=%d error=%v", AdminSystemTokenUserID, err))
		return
	}
	if result.Created > 0 || result.Updated > 0 {
		logger.LogInfo(ctx, fmt.Sprintf("admin system token reconcile completed: user_id=%d created=%d updated=%d skipped=%d", AdminSystemTokenUserID, result.Created, result.Updated, result.Skipped))
	}
}
