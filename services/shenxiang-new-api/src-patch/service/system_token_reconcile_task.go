package service

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/bytedance/gopkg/util/gopool"
)

const (
	systemTokenReconcileTickInterval = 10 * time.Minute
	systemTokenReconcileBatchSize    = 200
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
			logger.LogInfo(context.Background(), fmt.Sprintf("system token reconcile task started: tick=%s", systemTokenReconcileTickInterval))
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

	ctx := context.Background()
	var scanned int
	var created int
	var failed int
	lastID := 0
	for {
		var users []*model.User
		if err := model.DB.WithContext(ctx).
			Where("id > ? AND status = ?", lastID, common.UserStatusEnabled).
			Order("id asc").
			Limit(systemTokenReconcileBatchSize).
			Find(&users).Error; err != nil {
			logger.LogError(ctx, fmt.Sprintf("system token reconcile: query users failed: %v", err))
			return
		}
		if len(users) == 0 {
			break
		}
		for _, user := range users {
			if user == nil {
				continue
			}
			lastID = user.Id
			scanned++
			result, err := EnsureSystemTokensForUserID(ctx, user.Id)
			if err != nil {
				failed++
				logger.LogWarn(ctx, fmt.Sprintf("system token reconcile: user_id=%d failed: %v", user.Id, err))
				continue
			}
			created += result.Created
		}
	}
	if created > 0 || failed > 0 {
		logger.LogInfo(ctx, fmt.Sprintf("system token reconcile completed: scanned=%d created=%d failed=%d", scanned, created, failed))
	}
}
