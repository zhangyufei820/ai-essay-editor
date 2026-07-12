package service

import (
	"context"
	"crypto/sha256"
	"fmt"
	"os"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	billingLedgerWorkerBatchSize = 50
	billingLedgerWorkerLease     = 30
	billingLedgerWorkerInterval  = 5 * time.Second
)

var billingLedgerWorkerSequence uint64
var billingLedgerWorkerInstance = func() string {
	hostname, _ := os.Hostname()
	digest := sha256.Sum256([]byte(fmt.Sprintf("%s:%d:%d", hostname, os.Getpid(), time.Now().UnixNano())))
	return fmt.Sprintf("%x", digest[:8])
}()

func RunBillingLedgerMaintenanceOnce(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	now := common.GetTimestamp()
	var firstErr error
	if _, err := model.RequeueExpiredBillingOutboxLeasesWithContext(ctx, now); err != nil {
		firstErr = fmt.Errorf("requeue expired billing outbox leases: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if _, err := model.RecoverStaleOpenBillingOperationsWithContext(ctx, now, billingLedgerWorkerBatchSize); err != nil && firstErr == nil {
		firstErr = fmt.Errorf("recover stale billing operations: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	workerID := fmt.Sprintf("billing-ledger-%s-%d", billingLedgerWorkerInstance, atomic.AddUint64(&billingLedgerWorkerSequence, 1))
	for processed := 0; processed < billingLedgerWorkerBatchSize; processed++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		effects, err := model.LeaseBillingOutboxWithContext(ctx, workerID, 1, billingLedgerWorkerLease)
		if err != nil {
			if firstErr == nil {
				firstErr = fmt.Errorf("lease billing outbox: %w", err)
			}
			break
		}
		if len(effects) == 0 {
			break
		}
		effect := effects[0]
		if err := model.ProcessLeasedBillingOutboxWithContext(ctx, effect.ID, workerID); err != nil && firstErr == nil {
			firstErr = fmt.Errorf("process billing outbox effect %d: %w", effect.ID, err)
		}
	}
	return firstErr
}

func BillingLedgerWorkerLoop(ctx context.Context) {
	if ctx == nil {
		ctx = context.Background()
	}
	run := func() {
		if err := RunBillingLedgerMaintenanceOnce(ctx); err != nil && ctx.Err() == nil {
			common.SysLog("billing ledger maintenance failed: " + err.Error())
		}
	}
	run()
	ticker := time.NewTicker(billingLedgerWorkerInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			run()
		}
	}
}
