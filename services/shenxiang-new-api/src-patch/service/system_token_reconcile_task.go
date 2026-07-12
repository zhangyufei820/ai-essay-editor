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
			logger.LogInfo(context.Background(), fmt.Sprintf("system token reconcile task started: admin_user_id=%d tick=%s", AdminSystemTokenUserID, systemTokenReconcileTickInterval))
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

	adminResult, err := EnsureSystemTokensForUserID(ctx, AdminSystemTokenUserID)
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("admin system token reconcile failed: user_id=%d error=%v", AdminSystemTokenUserID, err))
	} else if adminResult.Created > 0 || adminResult.Updated > 0 {
		logger.LogInfo(ctx, fmt.Sprintf("admin system token reconcile completed: user_id=%d created=%d updated=%d skipped=%d", AdminSystemTokenUserID, adminResult.Created, adminResult.Updated, adminResult.Skipped))
	}

	grokResult, grokErr := ReconcileManagedGrok45UserTokens(ctx)
	if grokErr != nil {
		logger.LogWarn(ctx, fmt.Sprintf("managed Grok token reconcile failed: scanned=%d created=%d updated=%d failed=%d error=%v", grokResult.UsersScanned, grokResult.Created, grokResult.Updated, grokResult.Failed, grokErr))
		return
	}
	if grokResult.Created > 0 || grokResult.Updated > 0 {
		logger.LogInfo(ctx, fmt.Sprintf("managed Grok token reconcile completed: scanned=%d created=%d updated=%d skipped=%d", grokResult.UsersScanned, grokResult.Created, grokResult.Updated, grokResult.Skipped))
	}
}
