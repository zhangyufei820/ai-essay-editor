package model

import (
	"fmt"
	"math"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func resetBillingOperationTables(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(
		&BillingOperation{},
		&BillingOutbox{},
		&SubscriptionPreConsumeRecord{},
	))
	for _, table := range []string{
		"billing_outbox",
		"billing_operations",
		"subscription_pre_consume_records",
		"tasks",
		"tokens",
		"user_subscriptions",
		"subscription_plans",
		"users",
	} {
		require.NoError(t, DB.Exec("DELETE FROM "+table).Error)
	}
}

func createBillingUser(t *testing.T, quota int) *User {
	t.Helper()
	user := &User{Username: fmt.Sprintf("billing-user-%d", time.Now().UnixNano()), Quota: quota}
	require.NoError(t, DB.Create(user).Error)
	return user
}

func createBillingToken(t *testing.T, userID int, remainQuota int) *Token {
	t.Helper()
	token := &Token{
		UserId:         userID,
		Key:            fmt.Sprintf("billing-token-%d", time.Now().UnixNano()),
		Name:           "billing-test",
		Status:         1,
		RemainQuota:    remainQuota,
		UnlimitedQuota: false,
	}
	require.NoError(t, DB.Create(token).Error)
	return token
}

func TestGetBillingLedgerModeFailsSafe(t *testing.T) {
	t.Setenv("BILLING_LEDGER_MODE", " active ")
	assert.Equal(t, BillingLedgerModeActive, GetBillingLedgerMode())
	t.Setenv("BILLING_LEDGER_MODE", "unexpected-secret-value")
	assert.Equal(t, BillingLedgerModeOff, GetBillingLedgerMode())
	assert.Equal(t, BillingLedgerModeShadow, NormalizeBillingLedgerMode("SHADOW"))
}

func TestBillingOperationKeysRejectUnsafeIdentifiers(t *testing.T) {
	requestKey, err := RequestBillingOperationKey("req_123")
	require.NoError(t, err)
	assert.Equal(t, "req:req_123", requestKey)
	taskKey, err := TaskBillingOperationKey("task_123")
	require.NoError(t, err)
	assert.Equal(t, "task:task_123", taskKey)

	_, err = RequestBillingOperationKey(" contains-space ")
	assert.Error(t, err)
	_, err = TaskBillingOperationKey("任务")
	assert.Error(t, err)
}

func TestBillingModelsAutoMigrateIdempotently(t *testing.T) {
	models := []interface{}{
		&BillingOperation{},
		&BillingOutbox{},
		&SubscriptionPreConsumeRecord{},
		&UserSubscription{},
	}
	require.NoError(t, DB.AutoMigrate(models...))
	require.NoError(t, DB.AutoMigrate(models...))
	assert.True(t, DB.Migrator().HasTable("billing_operations"))
	assert.True(t, DB.Migrator().HasTable("billing_outbox"))
	assert.True(t, DB.Migrator().HasIndex(&BillingOperation{}, "OperationKey"))
	assert.True(t, DB.Migrator().HasIndex(&BillingOutbox{}, "EffectKey"))
	assert.True(t, DB.Migrator().HasColumn(&BillingOperation{}, "FundingResetEpoch"))
	assert.True(t, DB.Migrator().HasColumn(&SubscriptionPreConsumeRecord{}, "ResetEpoch"))
	assert.True(t, DB.Migrator().HasColumn(&UserSubscription{}, "UsageResetEpoch"))
}

func TestEnsureBillingOperationBaselineActiveChargesAtomicallyAndIsIdempotent(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	token := createBillingToken(t, user.Id, 1000)
	key, err := RequestBillingOperationKey("baseline-wallet")
	require.NoError(t, err)
	baseline := BillingOperationBaseline{
		OperationKey:  key,
		RequestID:     "baseline-wallet",
		Kind:          BillingOperationKindRequest,
		UserID:        user.Id,
		TokenID:       token.Id,
		FundingSource: BillingFundingSourceWallet,
		ChargeToken:   true,
		ReservedQuota: 120,
		LedgerMode:    BillingLedgerModeActive,
	}

	first, err := EnsureBillingOperationBaseline(baseline)
	require.NoError(t, err)
	second, err := EnsureBillingOperationBaseline(baseline)
	require.NoError(t, err)
	assert.Equal(t, first.ID, second.ID)
	assert.EqualValues(t, 120, first.AppliedQuota)
	assert.EqualValues(t, 120, first.DesiredQuota)

	var gotUser User
	require.NoError(t, DB.First(&gotUser, user.Id).Error)
	assert.Equal(t, 880, gotUser.Quota)
	var gotToken Token
	require.NoError(t, DB.First(&gotToken, token.Id).Error)
	assert.Equal(t, 880, gotToken.RemainQuota)
	assert.Equal(t, 120, gotToken.UsedQuota)
}

func TestAllBillingModesUseDurableBalanceKernel(t *testing.T) {
	for _, ledgerMode := range []BillingLedgerMode{BillingLedgerModeOff, BillingLedgerModeShadow, BillingLedgerModeActive} {
		t.Run(string(ledgerMode), func(t *testing.T) {
			resetBillingOperationTables(t)
			user := createBillingUser(t, 1000)
			token := createBillingToken(t, user.Id, 1000)
			requestID := "durable-mode-" + string(ledgerMode)
			key, err := RequestBillingOperationKey(requestID)
			require.NoError(t, err)
			operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
				OperationKey: key, RequestID: requestID, Kind: BillingOperationKindRequest,
				UserID: user.Id, TokenID: token.Id, FundingSource: BillingFundingSourceWallet,
				ChargeToken: true, ReservedQuota: 120, LedgerMode: ledgerMode,
			})
			require.NoError(t, err)
			require.EqualValues(t, 120, operation.AppliedQuota)

			var chargedUser User
			require.NoError(t, DB.First(&chargedUser, user.Id).Error)
			require.Equal(t, 880, chargedUser.Quota)
			var chargedToken Token
			require.NoError(t, DB.First(&chargedToken, token.Id).Error)
			require.Equal(t, 880, chargedToken.RemainQuota)
			require.Equal(t, 120, chargedToken.UsedQuota)

			_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
				OperationKey: key, Outcome: BillingOutcomeFailure, DesiredQuota: 0,
			})
			require.NoError(t, err)
			require.NoError(t, ProcessBillingOperationInline(key))

			var refundedUser User
			require.NoError(t, DB.First(&refundedUser, user.Id).Error)
			require.Equal(t, 1000, refundedUser.Quota)
			var refundedToken Token
			require.NoError(t, DB.First(&refundedToken, token.Id).Error)
			require.Equal(t, 1000, refundedToken.RemainQuota)
			require.Zero(t, refundedToken.UsedQuota)
		})
	}
}

func TestActiveRefundSettlesAfterTokenSoftDelete(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	token := createBillingToken(t, user.Id, 1000)
	key, err := RequestBillingOperationKey("soft-deleted-token-refund")
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "soft-deleted-token-refund", Kind: BillingOperationKindRequest,
		UserID: user.Id, TokenID: token.Id, FundingSource: BillingFundingSourceWallet,
		ChargeToken: true, ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	require.NoError(t, DB.Delete(token).Error)
	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
		OperationKey: key, Outcome: BillingOutcomeFailure, DesiredQuota: 0,
	})
	require.NoError(t, err)
	require.NoError(t, ProcessBillingOperationInline(key))

	var reloadedUser User
	require.NoError(t, DB.First(&reloadedUser, user.Id).Error)
	require.Equal(t, 1000, reloadedUser.Quota)
	var reloadedToken Token
	require.NoError(t, DB.Unscoped().First(&reloadedToken, token.Id).Error)
	require.True(t, reloadedToken.DeletedAt.Valid)
	require.Equal(t, 1000, reloadedToken.RemainQuota)
	require.Zero(t, reloadedToken.UsedQuota)
}

func TestActiveRefundSettlesAfterUserSoftDelete(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := RequestBillingOperationKey("soft-deleted-user-refund")
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "soft-deleted-user-refund", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", user.Id).Update("deleted_at", time.Now()).Error)
	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
		OperationKey: key, Outcome: BillingOutcomeFailure, DesiredQuota: 0,
	})
	require.NoError(t, err)
	require.NoError(t, ProcessBillingOperationInline(key))

	var reloaded User
	require.NoError(t, DB.Unscoped().First(&reloaded, user.Id).Error)
	require.True(t, reloaded.DeletedAt.Valid)
	require.Equal(t, 1000, reloaded.Quota)
}

func TestActiveSubscriptionExpiresOnlyAfterSuccessfulConvergence(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	plan := &SubscriptionPlan{
		Title: "终态过期测试", Currency: "CNY", DurationUnit: SubscriptionDurationMonth,
		DurationValue: 1, Enabled: true, TotalAmount: 100,
	}
	require.NoError(t, DB.Create(plan).Error)
	subscription := &UserSubscription{
		UserId: user.Id, PlanId: plan.Id, AmountTotal: 100, AmountUsed: 90,
		StartTime: time.Now().Add(-time.Hour).Unix(), EndTime: time.Now().Add(time.Hour).Unix(), Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	key, err := RequestBillingOperationKey("subscription-terminal-expiry")
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "subscription-terminal-expiry", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceSubscription,
		ReservedQuota: 10, LedgerMode: BillingLedgerModeActive,
		SubscriptionModelName: "test-model", SubscriptionTargetPlanID: plan.Id,
	})
	require.NoError(t, err)
	require.NoError(t, DB.First(subscription, subscription.Id).Error)
	require.Equal(t, "active", subscription.Status)

	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
		OperationKey: key, Outcome: BillingOutcomeSuccess, DesiredQuota: 10,
	})
	require.NoError(t, err)
	require.NoError(t, ProcessBillingOperationInline(key))
	require.NoError(t, DB.First(subscription, subscription.Id).Error)
	require.Equal(t, "expired", subscription.Status)
}

func TestActiveSubscriptionFailureDoesNotExpireAfterRefund(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	plan := &SubscriptionPlan{
		Title: "失败退款测试", Currency: "CNY", DurationUnit: SubscriptionDurationMonth,
		DurationValue: 1, Enabled: true, TotalAmount: 100,
	}
	require.NoError(t, DB.Create(plan).Error)
	subscription := &UserSubscription{
		UserId: user.Id, PlanId: plan.Id, AmountTotal: 100, AmountUsed: 90,
		StartTime: time.Now().Add(-time.Hour).Unix(), EndTime: time.Now().Add(time.Hour).Unix(), Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	key, err := RequestBillingOperationKey("subscription-terminal-refund")
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "subscription-terminal-refund", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceSubscription,
		ReservedQuota: 10, LedgerMode: BillingLedgerModeActive,
		SubscriptionModelName: "test-model", SubscriptionTargetPlanID: plan.Id,
	})
	require.NoError(t, err)
	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
		OperationKey: key, Outcome: BillingOutcomeFailure, DesiredQuota: 0,
	})
	require.NoError(t, err)
	require.NoError(t, ProcessBillingOperationInline(key))

	require.NoError(t, DB.First(subscription, subscription.Id).Error)
	require.Equal(t, "active", subscription.Status)
	require.EqualValues(t, 90, subscription.AmountUsed)
}

func TestActiveBaselineRejectsUnlimitedTokenUsedQuotaOverflow(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	token := createBillingToken(t, user.Id, 0)
	require.NoError(t, DB.Model(&Token{}).Where("id = ?", token.Id).Updates(map[string]interface{}{
		"unlimited_quota": true,
		"used_quota":      maxBillingQuota,
	}).Error)
	key, err := RequestBillingOperationKey("token-overflow")
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "token-overflow", Kind: BillingOperationKindRequest,
		UserID: user.Id, TokenID: token.Id, FundingSource: BillingFundingSourceImageBenefit,
		ChargeToken: true, ReservedQuota: 1, LedgerMode: BillingLedgerModeActive,
	})
	assert.Error(t, err)
	var operationCount int64
	require.NoError(t, DB.Model(&BillingOperation{}).Where("operation_key = ?", key).Count(&operationCount).Error)
	assert.Zero(t, operationCount)
}

func TestEnsureBillingOperationBaselineConcurrentIsIdempotent(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := RequestBillingOperationKey("baseline-concurrent")
	require.NoError(t, err)
	baseline := BillingOperationBaseline{
		OperationKey:  key,
		RequestID:     "baseline-concurrent",
		Kind:          BillingOperationKindRequest,
		UserID:        user.Id,
		FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100,
		LedgerMode:    BillingLedgerModeActive,
	}

	const workers = 4
	var waitGroup sync.WaitGroup
	errorsByWorker := make([]error, workers)
	waitGroup.Add(workers)
	for worker := 0; worker < workers; worker++ {
		go func(index int) {
			defer waitGroup.Done()
			_, errorsByWorker[index] = EnsureBillingOperationBaseline(baseline)
		}(worker)
	}
	waitGroup.Wait()
	for _, workerErr := range errorsByWorker {
		require.NoError(t, workerErr)
	}
	var gotUser User
	require.NoError(t, DB.First(&gotUser, user.Id).Error)
	assert.Equal(t, 900, gotUser.Quota)
	var count int64
	require.NoError(t, DB.Model(&BillingOperation{}).Where("operation_key = ?", key).Count(&count).Error)
	assert.EqualValues(t, 1, count)
}

func TestActiveBaselineAttachesLedgerMetadataToExistingTaskAtomically(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	token := createBillingToken(t, user.Id, 1000)
	task := &Task{TaskID: "task-preinserted", UserId: user.Id, Status: TaskStatusSubmitted}
	require.NoError(t, DB.Create(task).Error)
	key, err := TaskBillingOperationKey(task.TaskID)
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "task-preinserted-request", TaskID: task.ID, Kind: BillingOperationKindTask,
		UserID: user.Id, TokenID: token.Id, FundingSource: BillingFundingSourceImageBenefit,
		ChargeToken: true, ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	var reloaded Task
	require.NoError(t, DB.First(&reloaded, task.ID).Error)
	assert.Equal(t, 100, reloaded.Quota)
	assert.Equal(t, key, reloaded.PrivateData.BillingOperationKey)
	assert.Equal(t, BillingLedgerModeActive, reloaded.PrivateData.BillingLedgerMode)
	assert.Equal(t, "task-preinserted-request", reloaded.PrivateData.BillingRequestID)
	assert.Equal(t, BillingFundingSourceImageBenefit, reloaded.PrivateData.BillingSource)
	assert.Equal(t, token.Id, reloaded.PrivateData.TokenId)
	assert.True(t, reloaded.PrivateData.BillingChargeToken)
	assert.True(t, reloaded.PrivateData.BillingChargeTokenSet)
}

func TestActiveBaselineRejectsTerminalExistingTaskWithoutCharging(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	task := &Task{TaskID: "task-already-failed", UserId: user.Id, Status: TaskStatusFailure, Quota: 0}
	require.NoError(t, DB.Create(task).Error)
	key, err := TaskBillingOperationKey(task.TaskID)
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "task-already-failed-request", TaskID: task.ID, Kind: BillingOperationKindTask,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	assert.Error(t, err)
	var reloaded User
	require.NoError(t, DB.First(&reloaded, user.Id).Error)
	assert.Equal(t, 1000, reloaded.Quota)
	var operationCount int64
	require.NoError(t, DB.Model(&BillingOperation{}).Where("operation_key = ?", key).Count(&operationCount).Error)
	assert.Zero(t, operationCount)
}

func TestEnsureBaselineReplaysMatchingTerminalOperationIdempotently(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := RequestBillingOperationKey("terminal-baseline")
	require.NoError(t, err)
	baseline := BillingOperationBaseline{
		OperationKey: key, RequestID: "terminal-baseline", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	}
	first, err := EnsureBillingOperationBaseline(baseline)
	require.NoError(t, err)
	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{OperationKey: key, Outcome: BillingOutcomeSuccess, DesiredQuota: 100})
	require.NoError(t, err)
	var effectsBefore int64
	require.NoError(t, DB.Model(&BillingOutbox{}).Where("operation_id = ?", first.ID).Count(&effectsBefore).Error)

	replayed, err := EnsureBillingOperationBaseline(baseline)
	require.NoError(t, err)
	assert.Equal(t, first.ID, replayed.ID)
	assert.Equal(t, BillingOutcomeSuccess, replayed.Outcome)

	var reloaded User
	require.NoError(t, DB.First(&reloaded, user.Id).Error)
	assert.Equal(t, 900, reloaded.Quota)
	var operationCount int64
	require.NoError(t, DB.Model(&BillingOperation{}).Where("operation_key = ?", key).Count(&operationCount).Error)
	assert.EqualValues(t, 1, operationCount)
	var effectsAfter int64
	require.NoError(t, DB.Model(&BillingOutbox{}).Where("operation_id = ?", first.ID).Count(&effectsAfter).Error)
	assert.Equal(t, effectsBefore, effectsAfter)
}

func TestActiveReservationTargetPersistsBeforeApplyingDelta(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := RequestBillingOperationKey("reservation-target")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey:  key,
		RequestID:     "reservation-target",
		Kind:          BillingOperationKindRequest,
		UserID:        user.Id,
		FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100,
		LedgerMode:    BillingLedgerModeActive,
	})
	require.NoError(t, err)
	assert.EqualValues(t, 100, operation.AppliedQuota)

	operation, err = RecordBillingOperationReservation(BillingReservationIntent{
		OperationKey: key,
		TargetQuota:  175,
	})
	require.NoError(t, err)
	assert.EqualValues(t, 175, operation.ReservedQuota)
	assert.EqualValues(t, 175, operation.DesiredQuota)
	assert.EqualValues(t, 100, operation.AppliedQuota)
	var pending int64
	require.NoError(t, DB.Model(&BillingOutbox{}).
		Where("operation_id = ? AND effect_type = ? AND status = ?", operation.ID, BillingOutboxEffectApplyBalances, BillingOutboxStatusPending).
		Count(&pending).Error)
	assert.EqualValues(t, 1, pending)

	require.NoError(t, ProcessBillingOperationInline(key))
	require.NoError(t, DB.Where("operation_key = ?", key).First(operation).Error)
	assert.EqualValues(t, 175, operation.AppliedQuota)
	var gotUser User
	require.NoError(t, DB.First(&gotUser, user.Id).Error)
	assert.Equal(t, 825, gotUser.Quota)
}

func TestReservationTargetUpdatesAttachedTaskQuota(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	task := &Task{TaskID: "task-reservation-update", UserId: user.Id, Status: TaskStatusSubmitted}
	require.NoError(t, DB.Create(task).Error)
	key, err := TaskBillingOperationKey(task.TaskID)
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "task-reservation-update-request", TaskID: task.ID, Kind: BillingOperationKindTask,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	_, err = RecordBillingOperationReservation(BillingReservationIntent{OperationKey: key, TargetQuota: 60})
	require.NoError(t, err)
	var reloaded Task
	require.NoError(t, DB.First(&reloaded, task.ID).Error)
	assert.Equal(t, 60, reloaded.Quota)
}

func TestBillingOutcomeIsIdempotentAndRejectsConflict(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := RequestBillingOperationKey("outcome-cas")
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey:  key,
		RequestID:     "outcome-cas",
		Kind:          BillingOperationKindRequest,
		UserID:        user.Id,
		FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100,
		LedgerMode:    BillingLedgerModeActive,
	})
	require.NoError(t, err)
	intent := BillingOutcomeIntent{OperationKey: key, Outcome: BillingOutcomeSuccess, DesiredQuota: 60}
	first, err := RecordBillingOperationOutcome(intent)
	require.NoError(t, err)
	second, err := RecordBillingOperationOutcome(intent)
	require.NoError(t, err)
	assert.Equal(t, first.EffectSequence, second.EffectSequence)

	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
		OperationKey: key,
		Outcome:      BillingOutcomeFailure,
		DesiredQuota: 0,
	})
	assert.Error(t, err)
	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
		OperationKey: key,
		Outcome:      BillingOutcomeSuccess,
		DesiredQuota: 61,
	})
	assert.Error(t, err)
}

func TestBillingFailureOutcomeRequiresZeroDesiredQuota(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := RequestBillingOperationKey("failure-nonzero")
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "failure-nonzero", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
		OperationKey: key,
		Outcome:      BillingOutcomeFailure,
		DesiredQuota: 1,
	})
	assert.Error(t, err)
}

func TestShadowBillingUsesDurableBalancesAndOutbox(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := RequestBillingOperationKey("shadow-request")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "shadow-request", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeShadow,
	})
	require.NoError(t, err)
	assert.EqualValues(t, 100, operation.AppliedQuota)
	operation, err = RecordShadowBillingOperationOutcome(BillingOutcomeIntent{
		OperationKey: key, Outcome: BillingOutcomeSuccess, DesiredQuota: 40,
	})
	require.NoError(t, err)
	assert.EqualValues(t, 100, operation.AppliedQuota)
	var reloaded User
	require.NoError(t, DB.First(&reloaded, user.Id).Error)
	assert.Equal(t, 900, reloaded.Quota)
	var effectCount int64
	require.NoError(t, DB.Model(&BillingOutbox{}).Where("operation_id = ?", operation.ID).Count(&effectCount).Error)
	assert.GreaterOrEqual(t, effectCount, int64(2))
	require.NoError(t, ProcessBillingOperationInline(key))
	require.NoError(t, DB.First(&reloaded, user.Id).Error)
	assert.Equal(t, 960, reloaded.Quota)
	require.NoError(t, DB.First(&operation, operation.ID).Error)
	assert.EqualValues(t, 40, operation.AppliedQuota)
}

func TestRepeatedBillingWorkerDoesNotDoubleRefund(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := RequestBillingOperationKey("repeat-worker")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey:  key,
		RequestID:     "repeat-worker",
		Kind:          BillingOperationKindRequest,
		UserID:        user.Id,
		FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100,
		LedgerMode:    BillingLedgerModeActive,
	})
	require.NoError(t, err)
	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
		OperationKey: key,
		Outcome:      BillingOutcomeFailure,
		DesiredQuota: 0,
	})
	require.NoError(t, err)
	effects, err := LeaseBillingOutbox("worker-a", 10, 60)
	require.NoError(t, err)
	var balanceEffect *BillingOutbox
	for index := range effects {
		if effects[index].OperationID == operation.ID && effects[index].EffectType == BillingOutboxEffectApplyBalances {
			balanceEffect = &effects[index]
			break
		}
	}
	require.NotNil(t, balanceEffect)
	require.NoError(t, ProcessLeasedBillingOutbox(balanceEffect.ID, "worker-a"))
	require.NoError(t, ProcessLeasedBillingOutbox(balanceEffect.ID, "worker-a"))

	var gotUser User
	require.NoError(t, DB.First(&gotUser, user.Id).Error)
	assert.Equal(t, 1000, gotUser.Quota)
}

func TestSubscriptionFullRefundMarksPreConsumeRecordInSameConvergence(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	plan := &SubscriptionPlan{
		Title:         "测试月卡",
		Currency:      "CNY",
		DurationUnit:  SubscriptionDurationMonth,
		DurationValue: 1,
		Enabled:       true,
		TotalAmount:   1000,
	}
	require.NoError(t, DB.Create(plan).Error)
	subscription := &UserSubscription{
		UserId:      user.Id,
		PlanId:      plan.Id,
		AmountTotal: 1000,
		StartTime:   time.Now().Add(-time.Hour).Unix(),
		EndTime:     time.Now().Add(time.Hour).Unix(),
		Status:      "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	key, err := TaskBillingOperationKey("task-sub-refund")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey:             key,
		RequestID:                "sub-refund-request",
		Kind:                     BillingOperationKindTask,
		UserID:                   user.Id,
		FundingSource:            BillingFundingSourceSubscription,
		FundingRefID:             0,
		ReservedQuota:            100,
		LedgerMode:               BillingLedgerModeActive,
		SubscriptionModelName:    "test-model",
		SubscriptionQuotaType:    SubscriptionQuotaTypeDefault,
		SubscriptionTargetPlanID: plan.Id,
	})
	require.NoError(t, err)
	require.NotNil(t, operation.Subscription)
	assert.Equal(t, subscription.Id, operation.FundingRefID)
	assert.Equal(t, plan.Id, operation.Subscription.PlanID)

	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
		OperationKey: key,
		Outcome:      BillingOutcomeFailure,
		DesiredQuota: 0,
		ErrorMessage: "Bearer should-never-be-persisted",
	})
	require.NoError(t, err)
	require.NoError(t, ProcessBillingOperationInline(key))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	assert.Zero(t, gotSubscription.AmountUsed)
	var record SubscriptionPreConsumeRecord
	require.NoError(t, DB.Where("request_id = ?", "sub-refund-request").First(&record).Error)
	assert.Equal(t, "refunded", record.Status)
	var gotOperation BillingOperation
	require.NoError(t, DB.Where("operation_key = ?", key).First(&gotOperation).Error)
	assert.NotContains(t, gotOperation.ErrorMessage, "Bearer")
}

func TestSubscriptionBaselineUsesStartTimeAsInitialResetEpoch(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	plan := &SubscriptionPlan{Title: "初始周期", Currency: "CNY", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, Enabled: true, TotalAmount: 1000}
	require.NoError(t, DB.Create(plan).Error)
	startTime := time.Now().Add(-time.Hour).Unix()
	subscription := &UserSubscription{
		UserId: user.Id, PlanId: plan.Id, AmountTotal: 1000,
		StartTime: startTime, EndTime: time.Now().Add(time.Hour).Unix(), Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	key, err := RequestBillingOperationKey("sub-start-epoch")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "sub-start-epoch", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceSubscription,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
		SubscriptionModelName: "test-model", SubscriptionTargetPlanID: plan.Id,
	})
	require.NoError(t, err)
	require.Equal(t, startTime, operation.FundingResetEpoch)
	require.NotNil(t, operation.Subscription)
	require.Equal(t, startTime, operation.Subscription.ResetEpoch)
	var record SubscriptionPreConsumeRecord
	require.NoError(t, DB.Where("request_id = ?", "sub-start-epoch").First(&record).Error)
	require.Equal(t, startTime, record.ResetEpoch)
}

func TestSubscriptionPartialSettlementKeepsPreConsumeRecordConsumed(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	plan := &SubscriptionPlan{Title: "普通套餐", Currency: "CNY", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, Enabled: true, TotalAmount: 1000}
	require.NoError(t, DB.Create(plan).Error)
	subscription := &UserSubscription{UserId: user.Id, PlanId: plan.Id, AmountTotal: 1000, StartTime: time.Now().Add(-time.Hour).Unix(), EndTime: time.Now().Add(time.Hour).Unix(), Status: "active"}
	require.NoError(t, DB.Create(subscription).Error)
	key, err := RequestBillingOperationKey("sub-partial")
	require.NoError(t, err)
	baseline := BillingOperationBaseline{
		OperationKey: key, RequestID: "sub-partial", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceSubscription,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
		SubscriptionModelName: "test-model", SubscriptionQuotaType: SubscriptionQuotaTypeDefault,
		SubscriptionTargetPlanID: plan.Id,
	}
	_, err = EnsureBillingOperationBaseline(baseline)
	require.NoError(t, err)
	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{OperationKey: key, Outcome: BillingOutcomeSuccess, DesiredQuota: 40})
	require.NoError(t, err)
	require.NoError(t, ProcessBillingOperationInline(key))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	assert.EqualValues(t, 40, gotSubscription.AmountUsed)
	var record SubscriptionPreConsumeRecord
	require.NoError(t, DB.Where("request_id = ?", "sub-partial").First(&record).Error)
	assert.Equal(t, "consumed", record.Status)
	replayed, err := EnsureBillingOperationBaseline(baseline)
	require.NoError(t, err)
	assert.EqualValues(t, 40, replayed.AppliedQuota)
}

func TestOpenSubscriptionReservationReplayUsesAppliedQuota(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	plan := &SubscriptionPlan{Title: "开放任务重放", Currency: "CNY", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, Enabled: true, TotalAmount: 1000}
	require.NoError(t, DB.Create(plan).Error)
	subscription := &UserSubscription{
		UserId: user.Id, PlanId: plan.Id, AmountTotal: 1000,
		StartTime: time.Now().Add(-time.Hour).Unix(), EndTime: time.Now().Add(time.Hour).Unix(), Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	key, err := TaskBillingOperationKey("subscription-open-replay")
	require.NoError(t, err)
	baseline := BillingOperationBaseline{
		OperationKey: key, RequestID: "subscription-open-replay", Kind: BillingOperationKindTask,
		UserID: user.Id, FundingSource: BillingFundingSourceSubscription,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
		SubscriptionModelName: "test-model", SubscriptionTargetPlanID: plan.Id,
	}
	_, err = EnsureBillingOperationBaseline(baseline)
	require.NoError(t, err)
	_, err = RecordBillingOperationReservation(BillingReservationIntent{OperationKey: key, TargetQuota: 40})
	require.NoError(t, err)
	require.NoError(t, ProcessBillingOperationInline(key))

	replayed, err := EnsureBillingOperationBaseline(baseline)
	require.NoError(t, err)
	require.NotNil(t, replayed.Subscription)
	assert.EqualValues(t, 40, replayed.AppliedQuota)
	assert.EqualValues(t, 0, replayed.Subscription.AmountUsedBefore)
	assert.EqualValues(t, 40, replayed.Subscription.AmountUsedAfter)
}

func TestSubscriptionFailureAfterResetDoesNotRefundCurrentEpoch(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	plan := &SubscriptionPlan{
		Title: "跨周期失败退款", Currency: "CNY", DurationUnit: SubscriptionDurationMonth,
		DurationValue: 1, Enabled: true, TotalAmount: 1000,
	}
	require.NoError(t, DB.Create(plan).Error)
	firstEpoch := time.Now().Add(-2 * time.Hour).Unix()
	secondEpoch := firstEpoch + 3600
	subscription := &UserSubscription{
		UserId: user.Id, PlanId: plan.Id, AmountTotal: 1000, AmountUsed: 20,
		MonthlyAmountTotal: 1000, MonthlyAmountUsed: 300,
		StartTime: firstEpoch, LastResetTime: firstEpoch,
		EndTime: time.Now().Add(time.Hour).Unix(), Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	key, err := RequestBillingOperationKey("sub-reset-failure")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "sub-reset-failure", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceSubscription,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
		SubscriptionModelName: "test-model", SubscriptionTargetPlanID: plan.Id,
	})
	require.NoError(t, err)
	require.Equal(t, firstEpoch, operation.FundingResetEpoch)
	require.NoError(t, DB.Model(&UserSubscription{}).Where("id = ?", subscription.Id).Updates(map[string]interface{}{
		"amount_used":         30,
		"monthly_amount_used": 400,
		"last_reset_time":     secondEpoch,
		"usage_reset_epoch":   secondEpoch,
	}).Error)

	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
		OperationKey: key, Outcome: BillingOutcomeFailure, DesiredQuota: 0,
	})
	require.NoError(t, err)
	require.NoError(t, ProcessBillingOperationInline(key))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	assert.EqualValues(t, 30, gotSubscription.AmountUsed)
	assert.EqualValues(t, 300, gotSubscription.MonthlyAmountUsed)
	var record SubscriptionPreConsumeRecord
	require.NoError(t, DB.Where("request_id = ?", "sub-reset-failure").First(&record).Error)
	assert.Equal(t, firstEpoch, record.ResetEpoch)
	assert.Equal(t, "refunded", record.Status)
}

func TestSubscriptionUnderchargeAfterResetOnlyAdjustsMonthlyUsage(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	plan := &SubscriptionPlan{Title: "跨周期少扣", Currency: "CNY", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, Enabled: true, TotalAmount: 1000}
	require.NoError(t, DB.Create(plan).Error)
	firstEpoch := time.Now().Add(-2 * time.Hour).Unix()
	subscription := &UserSubscription{
		UserId: user.Id, PlanId: plan.Id, AmountTotal: 1000, AmountUsed: 20,
		MonthlyAmountTotal: 1000, MonthlyAmountUsed: 300,
		StartTime: firstEpoch, LastResetTime: firstEpoch,
		EndTime: time.Now().Add(time.Hour).Unix(), Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	key, err := RequestBillingOperationKey("sub-reset-undercharge")
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "sub-reset-undercharge", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceSubscription,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
		SubscriptionModelName: "test-model", SubscriptionTargetPlanID: plan.Id,
	})
	require.NoError(t, err)
	require.NoError(t, DB.Model(&UserSubscription{}).Where("id = ?", subscription.Id).Updates(map[string]interface{}{
		"amount_used":         30,
		"monthly_amount_used": 400,
		"last_reset_time":     firstEpoch + 3600,
		"usage_reset_epoch":   firstEpoch + 3600,
	}).Error)

	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
		OperationKey: key, Outcome: BillingOutcomeSuccess, DesiredQuota: 40,
	})
	require.NoError(t, err)
	require.NoError(t, ProcessBillingOperationInline(key))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	assert.EqualValues(t, 30, gotSubscription.AmountUsed)
	assert.EqualValues(t, 340, gotSubscription.MonthlyAmountUsed)
}

func TestSubscriptionOverchargeAfterResetOnlyAdjustsMonthlyUsage(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	plan := &SubscriptionPlan{Title: "跨周期多扣", Currency: "CNY", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, Enabled: true, TotalAmount: 1000}
	require.NoError(t, DB.Create(plan).Error)
	firstEpoch := time.Now().Add(-2 * time.Hour).Unix()
	subscription := &UserSubscription{
		UserId: user.Id, PlanId: plan.Id, AmountTotal: 1000, AmountUsed: 20,
		MonthlyAmountTotal: 1000, MonthlyAmountUsed: 300,
		StartTime: firstEpoch, LastResetTime: firstEpoch,
		EndTime: time.Now().Add(time.Hour).Unix(), Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	key, err := RequestBillingOperationKey("sub-reset-overcharge")
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "sub-reset-overcharge", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceSubscription,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
		SubscriptionModelName: "test-model", SubscriptionTargetPlanID: plan.Id,
	})
	require.NoError(t, err)
	require.NoError(t, DB.Model(&UserSubscription{}).Where("id = ?", subscription.Id).Updates(map[string]interface{}{
		"amount_used":         30,
		"monthly_amount_used": 400,
		"last_reset_time":     firstEpoch + 3600,
		"usage_reset_epoch":   firstEpoch + 3600,
	}).Error)

	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
		OperationKey: key, Outcome: BillingOutcomeSuccess, DesiredQuota: 140,
	})
	require.NoError(t, err)
	require.NoError(t, ProcessBillingOperationInline(key))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	assert.EqualValues(t, 30, gotSubscription.AmountUsed)
	assert.EqualValues(t, 440, gotSubscription.MonthlyAmountUsed)
}

func TestSubscriptionCrossEpochWithoutMonthlyCounterConverges(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	plan := &SubscriptionPlan{Title: "跨周期无月累计", Currency: "CNY", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, Enabled: true, TotalAmount: 1000}
	require.NoError(t, DB.Create(plan).Error)
	firstEpoch := time.Now().Add(-2 * time.Hour).Unix()
	secondEpoch := firstEpoch + 3600
	subscription := &UserSubscription{
		UserId: user.Id, PlanId: plan.Id, AmountTotal: 1000, AmountUsed: 20,
		StartTime: firstEpoch, LastResetTime: firstEpoch,
		EndTime: time.Now().Add(time.Hour).Unix(), Status: "active",
	}
	require.NoError(t, DB.Create(subscription).Error)
	key, err := RequestBillingOperationKey("sub-reset-no-monthly")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "sub-reset-no-monthly", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceSubscription,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
		SubscriptionModelName: "test-model", SubscriptionTargetPlanID: plan.Id,
	})
	require.NoError(t, err)
	require.NoError(t, DB.Model(&UserSubscription{}).Where("id = ?", subscription.Id).Updates(map[string]interface{}{
		"amount_used":       30,
		"last_reset_time":   secondEpoch,
		"usage_reset_epoch": secondEpoch,
	}).Error)

	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
		OperationKey: key, Outcome: BillingOutcomeFailure, DesiredQuota: 0,
	})
	require.NoError(t, err)
	require.NoError(t, ProcessBillingOperationInline(key))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	assert.EqualValues(t, 30, gotSubscription.AmountUsed)
	assert.Zero(t, gotSubscription.MonthlyAmountUsed)
	require.NoError(t, DB.First(&operation, operation.ID).Error)
	assert.Zero(t, operation.AppliedQuota)
}

func TestSubscriptionCrossEpochMonthlyBoundsKeepLedgerRetryable(t *testing.T) {
	testCases := []struct {
		name        string
		monthlyUsed int64
		desired     int64
	}{
		{name: "underflow", monthlyUsed: 50, desired: 0},
		{name: "overflow", monthlyUsed: math.MaxInt64, desired: 101},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			resetBillingOperationTables(t)
			user := createBillingUser(t, 0)
			plan := &SubscriptionPlan{Title: "跨周期月累计边界", Currency: "CNY", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, Enabled: true, TotalAmount: 1000}
			require.NoError(t, DB.Create(plan).Error)
			firstEpoch := time.Now().Add(-2 * time.Hour).Unix()
			secondEpoch := firstEpoch + 3600
			subscription := &UserSubscription{
				UserId: user.Id, PlanId: plan.Id, AmountTotal: 1000, AmountUsed: 20,
				MonthlyAmountTotal: math.MaxInt64, MonthlyAmountUsed: 300,
				StartTime: firstEpoch, LastResetTime: firstEpoch,
				EndTime: time.Now().Add(time.Hour).Unix(), Status: "active",
			}
			require.NoError(t, DB.Create(subscription).Error)
			requestID := "sub-reset-bound-" + testCase.name
			key, err := RequestBillingOperationKey(requestID)
			require.NoError(t, err)
			operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
				OperationKey: key, RequestID: requestID, Kind: BillingOperationKindRequest,
				UserID: user.Id, FundingSource: BillingFundingSourceSubscription,
				ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
				SubscriptionModelName: "test-model", SubscriptionTargetPlanID: plan.Id,
			})
			require.NoError(t, err)
			require.NoError(t, DB.Model(&UserSubscription{}).Where("id = ?", subscription.Id).Updates(map[string]interface{}{
				"amount_used":         30,
				"monthly_amount_used": testCase.monthlyUsed,
				"last_reset_time":     secondEpoch,
				"usage_reset_epoch":   secondEpoch,
			}).Error)
			outcome := BillingOutcomeSuccess
			if testCase.desired == 0 {
				outcome = BillingOutcomeFailure
			}
			_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{
				OperationKey: key, Outcome: outcome, DesiredQuota: testCase.desired,
			})
			require.NoError(t, err)
			require.Error(t, ProcessBillingOperationInline(key))

			var gotOperation BillingOperation
			require.NoError(t, DB.First(&gotOperation, operation.ID).Error)
			assert.EqualValues(t, 100, gotOperation.AppliedQuota)
			var record SubscriptionPreConsumeRecord
			require.NoError(t, DB.Where("request_id = ?", requestID).First(&record).Error)
			assert.Equal(t, "consumed", record.Status)
			var effect BillingOutbox
			require.NoError(t, DB.Where("operation_id = ? AND effect_type = ?", operation.ID, BillingOutboxEffectApplyBalances).First(&effect).Error)
			assert.Equal(t, BillingOutboxStatusPending, effect.Status)
		})
	}
}

func TestSubscriptionRefundDetectsBalanceDriftWithoutAdvancingLedger(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	plan := &SubscriptionPlan{Title: "漂移测试套餐", Currency: "CNY", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, Enabled: true, TotalAmount: 1000}
	require.NoError(t, DB.Create(plan).Error)
	subscription := &UserSubscription{UserId: user.Id, PlanId: plan.Id, AmountTotal: 1000, StartTime: time.Now().Add(-time.Hour).Unix(), EndTime: time.Now().Add(time.Hour).Unix(), Status: "active"}
	require.NoError(t, DB.Create(subscription).Error)
	key, err := RequestBillingOperationKey("sub-drift")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "sub-drift", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceSubscription,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
		SubscriptionModelName: "test-model", SubscriptionQuotaType: SubscriptionQuotaTypeDefault,
		SubscriptionTargetPlanID: plan.Id,
	})
	require.NoError(t, err)
	require.NoError(t, DB.Model(&UserSubscription{}).Where("id = ?", subscription.Id).Update("amount_used", 0).Error)
	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{OperationKey: key, Outcome: BillingOutcomeFailure, DesiredQuota: 0})
	require.NoError(t, err)
	assert.Error(t, ProcessBillingOperationInline(key))

	var reloadedOperation BillingOperation
	require.NoError(t, DB.First(&reloadedOperation, operation.ID).Error)
	assert.EqualValues(t, 100, reloadedOperation.AppliedQuota)
	var record SubscriptionPreConsumeRecord
	require.NoError(t, DB.Where("request_id = ?", "sub-drift").First(&record).Error)
	assert.Equal(t, "consumed", record.Status)
}

func TestBalanceEffectRemainsRecoverableAfterEightFailures(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 100)
	key, err := RequestBillingOperationKey("retry-forever")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "retry-forever", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{OperationKey: key, Outcome: BillingOutcomeSuccess, DesiredQuota: 200})
	require.NoError(t, err)
	for attempt := 0; attempt < 9; attempt++ {
		require.NoError(t, DB.Model(&BillingOutbox{}).
			Where("operation_id = ? AND effect_type = ?", operation.ID, BillingOutboxEffectApplyBalances).
			Update("available_at", 0).Error)
		leased, leaseErr := LeaseBillingOutbox(fmt.Sprintf("retry-worker-%d", attempt), 20, 60)
		require.NoError(t, leaseErr)
		var effect *BillingOutbox
		for index := range leased {
			if leased[index].OperationID == operation.ID && leased[index].EffectType == BillingOutboxEffectApplyBalances {
				effect = &leased[index]
				break
			}
		}
		require.NotNil(t, effect)
		assert.Error(t, ProcessLeasedBillingOutbox(effect.ID, fmt.Sprintf("retry-worker-%d", attempt)))
	}
	var effect BillingOutbox
	require.NoError(t, DB.Where("operation_id = ? AND effect_type = ?", operation.ID, BillingOutboxEffectApplyBalances).First(&effect).Error)
	assert.Equal(t, BillingOutboxStatusPending, effect.Status)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", user.Id).Update("quota", 100).Error)
	require.NoError(t, DB.Model(&BillingOutbox{}).Where("id = ?", effect.ID).Update("available_at", 0).Error)
	leased, err := LeaseBillingOutbox("retry-worker-success", 20, 60)
	require.NoError(t, err)
	var recovered *BillingOutbox
	for index := range leased {
		if leased[index].ID == effect.ID {
			recovered = &leased[index]
			break
		}
	}
	require.NotNil(t, recovered)
	require.NoError(t, ProcessLeasedBillingOutbox(recovered.ID, "retry-worker-success"))
	require.NoError(t, DB.First(&operation, operation.ID).Error)
	assert.EqualValues(t, 200, operation.AppliedQuota)
}

func TestLeaseRecoveryRequeuesExpiredEffect(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := RequestBillingOperationKey("lease-recovery")
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "lease-recovery", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	_, err = RecordBillingOperationOutcome(BillingOutcomeIntent{OperationKey: key, Outcome: BillingOutcomeSuccess, DesiredQuota: 50})
	require.NoError(t, err)
	leased, err := LeaseBillingOutbox("worker-expired", 10, 1)
	require.NoError(t, err)
	require.NotEmpty(t, leased)
	for _, effect := range leased {
		require.NoError(t, DB.Model(&BillingOutbox{}).Where("id = ?", effect.ID).Update("lease_until", int64(1)).Error)
	}
	requeued, err := RequeueExpiredBillingOutboxLeases(time.Now().Unix())
	require.NoError(t, err)
	assert.GreaterOrEqual(t, requeued, int64(1))
	var pending int64
	require.NoError(t, DB.Model(&BillingOutbox{}).Where("status = ?", BillingOutboxStatusPending).Count(&pending).Error)
	assert.GreaterOrEqual(t, pending, int64(1))
}

func TestTaskBillingIntentRollsBackStatusWhenOutcomeConflicts(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := TaskBillingOperationKey("task-billing-cas")
	require.NoError(t, err)
	task := &Task{
		TaskID:   "task-billing-cas",
		UserId:   user.Id,
		Status:   TaskStatusInProgress,
		Progress: "50%",
		Quota:    100,
		PrivateData: TaskPrivateData{
			BillingOperationKey:   key,
			BillingLedgerMode:     BillingLedgerModeShadow,
			BillingRequestID:      "task-billing-request",
			BillingChargeToken:    false,
			BillingChargeTokenSet: true,
			BillingSource:         BillingFundingSourceWallet,
		},
	}
	require.NoError(t, task.Insert())
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: task.PrivateData.BillingRequestID, TaskID: task.ID,
		Kind: BillingOperationKindTask, UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeShadow,
	})
	require.NoError(t, err)
	_, err = RecordShadowBillingOperationOutcome(BillingOutcomeIntent{OperationKey: key, Outcome: BillingOutcomeSuccess, DesiredQuota: 80})
	require.NoError(t, err)

	task.Status = TaskStatusFailure
	task.Progress = "100%"
	task.Quota = 0
	won, err := task.UpdateWithStatusAndBillingIntent(TaskStatusInProgress, TaskBillingIntent{
		OperationKey: key, LedgerMode: BillingLedgerModeShadow, Outcome: BillingOutcomeFailure,
		ReservedQuota: 100, DesiredQuota: 0, ChargeToken: false, ErrorMessage: "failed",
	})
	assert.False(t, won)
	assert.Error(t, err)
	var reloaded Task
	require.NoError(t, DB.First(&reloaded, task.ID).Error)
	assert.EqualValues(t, TaskStatusInProgress, reloaded.Status)
	assert.Equal(t, 100, reloaded.Quota)
}

func TestTaskBillingIntentRejectsReservedQuotaDrift(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := TaskBillingOperationKey("task-reserved-drift")
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "task-reserved-drift-request", Kind: BillingOperationKindTask,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	task := &Task{
		TaskID: "task-reserved-drift", UserId: user.Id, Status: TaskStatusSubmitted, Quota: 100,
		PrivateData: TaskPrivateData{
			BillingOperationKey: key, BillingLedgerMode: BillingLedgerModeActive,
			BillingRequestID: "task-reserved-drift-request", BillingChargeTokenSet: true,
			BillingSource: BillingFundingSourceWallet,
		},
	}
	require.NoError(t, task.InsertWithBillingReservationIntent(BillingReservationIntent{OperationKey: key, TargetQuota: 100}))
	task.Status = TaskStatusSuccess
	won, err := task.UpdateWithStatusAndBillingIntent(TaskStatusSubmitted, TaskBillingIntent{
		OperationKey: key, LedgerMode: BillingLedgerModeActive, Outcome: BillingOutcomeSuccess,
		ReservedQuota: 99, DesiredQuota: 80,
	})
	assert.False(t, won)
	assert.Error(t, err)
	var reloaded Task
	require.NoError(t, DB.First(&reloaded, task.ID).Error)
	assert.EqualValues(t, TaskStatusSubmitted, reloaded.Status)
}

func TestTaskFailureBillingKeepsReservedQuotaForAudit(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := TaskBillingOperationKey("task-failure-quota")
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "task-failure-quota-request", Kind: BillingOperationKindTask,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	task := &Task{
		TaskID: "task-failure-quota", UserId: user.Id, Status: TaskStatusSubmitted, Quota: 100,
		PrivateData: TaskPrivateData{
			BillingOperationKey: key, BillingLedgerMode: BillingLedgerModeActive,
			BillingRequestID: "task-failure-quota-request", BillingChargeTokenSet: true,
			BillingSource: BillingFundingSourceWallet,
		},
	}
	require.NoError(t, task.InsertWithBillingReservationIntent(BillingReservationIntent{OperationKey: key, TargetQuota: 100}))
	task.Status = TaskStatusFailure
	task.Progress = "100%"
	won, err := task.UpdateWithStatusAndBillingIntent(TaskStatusSubmitted, TaskBillingIntent{
		OperationKey: key, LedgerMode: BillingLedgerModeActive, Outcome: BillingOutcomeFailure,
		ReservedQuota: 100, DesiredQuota: 0,
	})
	require.NoError(t, err)
	assert.True(t, won)
	var reloaded Task
	require.NoError(t, DB.First(&reloaded, task.ID).Error)
	assert.EqualValues(t, TaskStatusFailure, reloaded.Status)
	assert.Equal(t, 100, reloaded.Quota)
	var operation BillingOperation
	require.NoError(t, DB.Where("operation_key = ?", key).First(&operation).Error)
	assert.Zero(t, operation.DesiredQuota)
}

func TestExistingSubscriptionTaskOverridePersistsResetEpochAndFinalizes(t *testing.T) {
	testCases := []struct {
		name         string
		outcome      BillingOutcome
		desiredQuota int64
		taskStatus   TaskStatus
		amountUsed   int64
		recordStatus string
	}{
		{name: "success", outcome: BillingOutcomeSuccess, desiredQuota: 60, taskStatus: TaskStatusSuccess, amountUsed: 60, recordStatus: "consumed"},
		{name: "failure", outcome: BillingOutcomeFailure, desiredQuota: 0, taskStatus: TaskStatusFailure, amountUsed: 0, recordStatus: "refunded"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			resetBillingOperationTables(t)
			user := createBillingUser(t, 0)
			plan := &SubscriptionPlan{
				Title: "task override epoch", Currency: "CNY", DurationUnit: SubscriptionDurationMonth,
				DurationValue: 1, Enabled: true, TotalAmount: 1000,
			}
			require.NoError(t, DB.Create(plan).Error)
			epoch := time.Now().Add(-time.Hour).Unix()
			subscription := &UserSubscription{
				UserId: user.Id, PlanId: plan.Id, AmountTotal: 1000,
				StartTime: epoch, LastResetTime: epoch, UsageResetEpoch: epoch,
				EndTime: time.Now().Add(time.Hour).Unix(), Status: "active",
			}
			require.NoError(t, DB.Create(subscription).Error)
			publicTaskID := "task-subscription-override-" + testCase.name
			task := &Task{TaskID: publicTaskID, UserId: user.Id, Status: TaskStatusInProgress}
			require.NoError(t, DB.Create(task).Error)
			operationKey, err := TaskBillingOperationKey(publicTaskID)
			require.NoError(t, err)
			requestID := "subscription-override-" + testCase.name
			operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
				OperationKey: operationKey, RequestID: requestID, TaskID: task.ID,
				Kind: BillingOperationKindTask, UserID: user.Id,
				FundingSource: BillingFundingSourceSubscription, FundingRefID: subscription.Id,
				ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
				SubscriptionModelName: "test-model", SubscriptionTargetPlanID: plan.Id,
			})
			require.NoError(t, err)
			require.Equal(t, epoch, operation.FundingResetEpoch)

			require.NoError(t, DB.First(task, task.ID).Error)
			require.Equal(t, epoch, task.PrivateData.SubscriptionResetEpoch)
			require.Equal(t, subscription.Id, task.PrivateData.SubscriptionId)
			task.Status = testCase.taskStatus
			task.Progress = "100%"
			won, err := task.UpdateWithStatusAndBillingIntent(TaskStatusInProgress, TaskBillingIntent{
				OperationKey: operationKey, LedgerMode: BillingLedgerModeActive,
				Outcome: testCase.outcome, ReservedQuota: 100, DesiredQuota: testCase.desiredQuota,
			})
			require.NoError(t, err)
			require.True(t, won)
			require.NoError(t, ProcessBillingOperationInline(operationKey))

			require.NoError(t, DB.First(subscription, subscription.Id).Error)
			require.Equal(t, testCase.amountUsed, subscription.AmountUsed)
			var record SubscriptionPreConsumeRecord
			require.NoError(t, DB.Where("request_id = ?", requestID).First(&record).Error)
			require.Equal(t, testCase.recordStatus, record.Status)
		})
	}
}

func TestUntrackedFreeTaskCanFinalizeWithoutBillingOperation(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	key, err := TaskBillingOperationKey("task-free")
	require.NoError(t, err)
	task := &Task{
		TaskID: "task-free", UserId: user.Id, Status: TaskStatusSubmitted, Quota: 0,
		PrivateData: TaskPrivateData{
			BillingOperationKey: key, BillingLedgerMode: BillingLedgerModeActive,
			BillingRequestID: "task-free-request", BillingChargeTokenSet: false,
			BillingSource: BillingFundingSourceWallet,
		},
	}
	require.NoError(t, task.Insert())
	task.Status = TaskStatusSuccess
	task.Progress = "100%"
	won, err := task.UpdateWithStatusAndBillingIntent(TaskStatusSubmitted, TaskBillingIntent{
		OperationKey: key, LedgerMode: BillingLedgerModeActive, Outcome: BillingOutcomeSuccess,
		ReservedQuota: 0, DesiredQuota: 0, ChargeToken: false,
	})
	require.NoError(t, err)
	assert.True(t, won)
	var operationCount int64
	require.NoError(t, DB.Model(&BillingOperation{}).Where("operation_key = ?", key).Count(&operationCount).Error)
	assert.Zero(t, operationCount)
}

func TestUntrackedFreeTaskLocksOperationBeforeTask(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	key, err := TaskBillingOperationKey("task-free-lock-order")
	require.NoError(t, err)
	task := &Task{
		TaskID: "task-free-lock-order", UserId: user.Id, Status: TaskStatusSubmitted, Quota: 0,
		PrivateData: TaskPrivateData{
			BillingOperationKey: key, BillingLedgerMode: BillingLedgerModeActive,
			BillingRequestID: "task-free-lock-order-request", BillingChargeTokenSet: false,
			BillingSource: BillingFundingSourceWallet,
		},
	}
	require.NoError(t, task.Insert())

	var lockOrderMu sync.Mutex
	lockOrder := make([]string, 0, 2)
	callbackName := "test:untracked_free_task_lock_order"
	require.NoError(t, DB.Callback().Query().Before("gorm:query").Register(callbackName, func(tx *gorm.DB) {
		table := tx.Statement.Table
		if table != "billing_operations" && table != "tasks" {
			return
		}
		lockOrderMu.Lock()
		lockOrder = append(lockOrder, table)
		lockOrderMu.Unlock()
	}))
	t.Cleanup(func() {
		require.NoError(t, DB.Callback().Query().Remove(callbackName))
	})

	task.Status = TaskStatusSuccess
	task.Progress = "100%"
	won, err := task.UpdateWithStatusAndBillingIntent(TaskStatusSubmitted, TaskBillingIntent{
		OperationKey: key, LedgerMode: BillingLedgerModeActive, Outcome: BillingOutcomeSuccess,
		ReservedQuota: 0, DesiredQuota: 0, ChargeToken: false,
	})
	require.NoError(t, err)
	require.True(t, won)

	lockOrderMu.Lock()
	observed := append([]string(nil), lockOrder...)
	lockOrderMu.Unlock()
	require.GreaterOrEqual(t, len(observed), 2)
	assert.Equal(t, []string{"billing_operations", "tasks"}, observed[:2])
}

func TestUntrackedFreeTaskRejectsExistingBillingOperationWithoutStatusChange(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	key, err := TaskBillingOperationKey("task-free-tracked-conflict")
	require.NoError(t, err)
	task := &Task{
		TaskID: "task-free-tracked-conflict", UserId: user.Id, Status: TaskStatusSubmitted, Quota: 0,
		PrivateData: TaskPrivateData{
			BillingOperationKey: key, BillingLedgerMode: BillingLedgerModeActive,
			BillingRequestID: "task-free-tracked-conflict-request", BillingChargeTokenSet: false,
			BillingSource: BillingFundingSourceWallet,
		},
	}
	require.NoError(t, task.Insert())
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: task.PrivateData.BillingRequestID, TaskID: task.ID,
		Kind: BillingOperationKindTask, UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 0, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)

	task.Status = TaskStatusSuccess
	task.Progress = "100%"
	won, err := task.UpdateWithStatusAndBillingIntent(TaskStatusSubmitted, TaskBillingIntent{
		OperationKey: key, LedgerMode: BillingLedgerModeActive, Outcome: BillingOutcomeSuccess,
		ReservedQuota: 0, DesiredQuota: 0, ChargeToken: false,
	})
	assert.False(t, won)
	assert.ErrorIs(t, err, ErrBillingOperationConflict)

	var reloaded Task
	require.NoError(t, DB.First(&reloaded, task.ID).Error)
	assert.EqualValues(t, TaskStatusSubmitted, reloaded.Status)
	assert.True(t, reloaded.PrivateData.BillingChargeTokenSet)
}

func TestUntrackedFreeTaskBillingIntentHasSingleConcurrentWinner(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	key, err := TaskBillingOperationKey("task-free-concurrent")
	require.NoError(t, err)
	task := &Task{
		TaskID: "task-free-concurrent", UserId: user.Id, Status: TaskStatusSubmitted, Quota: 0,
		PrivateData: TaskPrivateData{
			BillingOperationKey: key, BillingLedgerMode: BillingLedgerModeActive,
			BillingRequestID: "task-free-concurrent-request", BillingChargeTokenSet: false,
			BillingSource: BillingFundingSourceWallet,
		},
	}
	require.NoError(t, task.Insert())

	type updateResult struct {
		won bool
		err error
	}
	const workers = 8
	results := make(chan updateResult, workers)
	var waitGroup sync.WaitGroup
	waitGroup.Add(workers)
	for range workers {
		go func() {
			defer waitGroup.Done()
			candidate := *task
			candidate.Status = TaskStatusSuccess
			candidate.Progress = "100%"
			won, updateErr := candidate.UpdateWithStatusAndBillingIntent(TaskStatusSubmitted, TaskBillingIntent{
				OperationKey: key, LedgerMode: BillingLedgerModeActive, Outcome: BillingOutcomeSuccess,
				ReservedQuota: 0, DesiredQuota: 0, ChargeToken: false,
			})
			results <- updateResult{won: won, err: updateErr}
		}()
	}
	waitGroup.Wait()
	close(results)

	wins := 0
	for result := range results {
		require.NoError(t, result.err)
		if result.won {
			wins++
		}
	}
	assert.Equal(t, 1, wins)

	var reloaded Task
	require.NoError(t, DB.First(&reloaded, task.ID).Error)
	assert.EqualValues(t, TaskStatusSuccess, reloaded.Status)
	assert.Equal(t, "100%", reloaded.Progress)
}

func TestTaskBillingIntentRejectsOperationAttachedToAnotherTask(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := TaskBillingOperationKey("task-owner")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "task-owner-request", Kind: BillingOperationKindTask,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	owner := &Task{TaskID: "task-owner", UserId: user.Id, Status: TaskStatusSubmitted, Quota: 100}
	require.NoError(t, DB.Create(owner).Error)
	require.NoError(t, DB.Model(&BillingOperation{}).Where("id = ?", operation.ID).Update("task_id", owner.ID).Error)
	other := &Task{
		TaskID: "task-other", UserId: user.Id, Status: TaskStatusSubmitted, Quota: 100,
		PrivateData: TaskPrivateData{
			BillingOperationKey: key, BillingLedgerMode: BillingLedgerModeActive,
			BillingRequestID: "task-owner-request", BillingChargeTokenSet: true,
			BillingSource: BillingFundingSourceWallet,
		},
	}
	require.NoError(t, DB.Create(other).Error)
	other.Status = TaskStatusFailure
	won, err := other.UpdateWithStatusAndBillingIntent(TaskStatusSubmitted, TaskBillingIntent{
		OperationKey: key, LedgerMode: BillingLedgerModeActive, Outcome: BillingOutcomeFailure,
		ReservedQuota: 100, DesiredQuota: 0,
	})
	assert.False(t, won)
	assert.Error(t, err)
	var reloaded Task
	require.NoError(t, DB.First(&reloaded, other.ID).Error)
	assert.EqualValues(t, TaskStatusSubmitted, reloaded.Status)
}

func TestInsertWithBillingReservationIntentTreatsEmptyModeAsLegacy(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 0)
	task := &Task{TaskID: "task-legacy-insert", UserId: user.Id, Status: TaskStatusSubmitted}
	require.NoError(t, task.InsertWithBillingReservationIntent(BillingReservationIntent{}))
	assert.Greater(t, task.ID, int64(0))
}

func TestInsertWithBillingReservationIntentIsAtomic(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := TaskBillingOperationKey("task-handoff")
	require.NoError(t, err)
	_, err = EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "task-handoff-request", Kind: BillingOperationKindTask,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	task := &Task{
		TaskID: "task-handoff", UserId: user.Id, Status: TaskStatusSubmitted, Quota: 60,
		PrivateData: TaskPrivateData{
			BillingOperationKey: key, BillingLedgerMode: BillingLedgerModeActive,
			BillingRequestID: "task-handoff-request", BillingChargeTokenSet: true,
			BillingSource: BillingFundingSourceWallet,
		},
	}
	require.NoError(t, task.InsertWithBillingReservationIntent(BillingReservationIntent{OperationKey: key, TargetQuota: 60}))
	assert.Greater(t, task.ID, int64(0))
	var operation BillingOperation
	require.NoError(t, DB.Where("operation_key = ?", key).First(&operation).Error)
	assert.Equal(t, task.ID, operation.TaskID)
	assert.EqualValues(t, 60, operation.ReservedQuota)
	assert.Equal(t, BillingOutcomeOpen, operation.Outcome)

	duplicate := *task
	duplicate.ID = 0
	err = duplicate.InsertWithBillingReservationIntent(BillingReservationIntent{OperationKey: key, TargetQuota: 70})
	assert.Error(t, err)
	require.NoError(t, DB.Where("operation_key = ?", key).First(&operation).Error)
	assert.EqualValues(t, 60, operation.ReservedQuota)
	var taskCount int64
	require.NoError(t, DB.Model(&Task{}).Where("task_id = ?", task.TaskID).Count(&taskCount).Error)
	assert.EqualValues(t, 1, taskCount)
}

func TestRecoverStaleOpenTaskOperationRefundsMissingTask(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := TaskBillingOperationKey("task-missing-after-crash")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "task-missing-request", Kind: BillingOperationKindTask,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	now := time.Now().Unix()
	require.NoError(t, DB.Model(&BillingOperation{}).Where("id = ?", operation.ID).Update("updated_at", now-3600).Error)
	recovered, err := RecoverStaleOpenBillingOperations(now, 10)
	require.NoError(t, err)
	assert.EqualValues(t, 1, recovered)
	require.NoError(t, ProcessBillingOperationInline(key))
	var gotUser User
	require.NoError(t, DB.First(&gotUser, user.Id).Error)
	assert.Equal(t, 1000, gotUser.Quota)
}

func TestRecoverStaleOpenTaskOperationLeavesExistingTaskOpen(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := TaskBillingOperationKey("task-existing")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "task-existing-request", Kind: BillingOperationKindTask,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	task := &Task{
		TaskID: "task-existing", UserId: user.Id, Status: TaskStatusSubmitted, Quota: 100,
		PrivateData: TaskPrivateData{
			BillingOperationKey: key, BillingLedgerMode: BillingLedgerModeActive,
			BillingRequestID: "task-existing-request", BillingSource: BillingFundingSourceWallet,
			BillingChargeTokenSet: true,
		},
	}
	require.NoError(t, DB.Create(task).Error)
	now := time.Now().Unix()
	require.NoError(t, DB.Model(&BillingOperation{}).Where("id = ?", operation.ID).Updates(map[string]interface{}{"task_id": task.ID, "updated_at": now - 3600}).Error)
	recovered, err := RecoverStaleOpenBillingOperations(now, 10)
	require.NoError(t, err)
	assert.Zero(t, recovered)
	var reloaded BillingOperation
	require.NoError(t, DB.First(&reloaded, operation.ID).Error)
	assert.Equal(t, BillingOutcomeOpen, reloaded.Outcome)
	assert.Equal(t, now, reloaded.UpdatedAt)
}

func TestRecoverStaleOpenRequestOperationRefundsReservation(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := RequestBillingOperationKey("request-crash")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "request-crash", Kind: BillingOperationKindRequest,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	now := time.Now().Unix()
	require.NoError(t, DB.Model(&BillingOperation{}).Where("id = ?", operation.ID).Update("updated_at", now-3*60*60).Error)
	recovered, err := RecoverStaleOpenBillingOperations(now, 10)
	require.NoError(t, err)
	assert.EqualValues(t, 1, recovered)
	require.NoError(t, ProcessBillingOperationInline(key))
	var reloaded User
	require.NoError(t, DB.First(&reloaded, user.Id).Error)
	assert.Equal(t, 1000, reloaded.Quota)
}

func TestRecoverStaleOpenTaskOperationConvergesTerminalTask(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := TaskBillingOperationKey("task-terminal-recovery")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "task-terminal-recovery-request", Kind: BillingOperationKindTask,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	task := &Task{
		TaskID: "task-terminal-recovery", UserId: user.Id, Status: TaskStatusSuccess, Quota: 70,
		PrivateData: TaskPrivateData{
			BillingOperationKey: key, BillingLedgerMode: BillingLedgerModeActive,
			BillingRequestID: "task-terminal-recovery-request", BillingSource: BillingFundingSourceWallet,
			BillingChargeTokenSet: true,
		},
	}
	require.NoError(t, DB.Create(task).Error)
	now := time.Now().Unix()
	require.NoError(t, DB.Model(&BillingOperation{}).Where("id = ?", operation.ID).Update("updated_at", now-3600).Error)
	recovered, err := RecoverStaleOpenBillingOperations(now, 10)
	require.NoError(t, err)
	assert.EqualValues(t, 1, recovered)
	var reloaded BillingOperation
	require.NoError(t, DB.First(&reloaded, operation.ID).Error)
	assert.Equal(t, BillingOutcomeSuccess, reloaded.Outcome)
	assert.EqualValues(t, 70, reloaded.DesiredQuota)
	assert.Equal(t, task.ID, reloaded.TaskID)
}

func TestRecoverStaleOpenAttachedTaskOperationConvergesTerminalOutcome(t *testing.T) {
	for _, testCase := range []struct {
		name        string
		status      TaskStatus
		quota       int
		wantOutcome BillingOutcome
		wantDesired int64
	}{
		{name: "success", status: TaskStatusSuccess, quota: 70, wantOutcome: BillingOutcomeSuccess, wantDesired: 70},
		{name: "failure", status: TaskStatusFailure, quota: 100, wantOutcome: BillingOutcomeFailure, wantDesired: 0},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			resetBillingOperationTables(t)
			user := createBillingUser(t, 1000)
			publicTaskID := "task-attached-terminal-" + testCase.name
			requestID := "request-attached-terminal-" + testCase.name
			key, err := TaskBillingOperationKey(publicTaskID)
			require.NoError(t, err)
			operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
				OperationKey: key, RequestID: requestID, Kind: BillingOperationKindTask,
				UserID: user.Id, FundingSource: BillingFundingSourceWallet,
				ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
			})
			require.NoError(t, err)
			task := &Task{
				TaskID: publicTaskID, UserId: user.Id, Status: testCase.status, Quota: testCase.quota,
				PrivateData: TaskPrivateData{
					BillingOperationKey: key, BillingLedgerMode: BillingLedgerModeActive,
					BillingRequestID: requestID, BillingSource: BillingFundingSourceWallet,
					BillingChargeTokenSet: true,
				},
			}
			require.NoError(t, DB.Create(task).Error)
			now := time.Now().Unix()
			require.NoError(t, DB.Model(&BillingOperation{}).Where("id = ?", operation.ID).Updates(map[string]any{
				"task_id": task.ID, "updated_at": now - 3600,
			}).Error)

			recovered, err := RecoverStaleOpenBillingOperations(now, 10)
			require.NoError(t, err)
			require.EqualValues(t, 1, recovered)
			var reloaded BillingOperation
			require.NoError(t, DB.First(&reloaded, operation.ID).Error)
			require.Equal(t, testCase.wantOutcome, reloaded.Outcome)
			require.Equal(t, testCase.wantDesired, reloaded.DesiredQuota)
		})
	}
}

func TestRecoverStaleOpenAttachedTaskOperationRefundsMissingTask(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 1000)
	key, err := TaskBillingOperationKey("task-attached-missing")
	require.NoError(t, err)
	operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
		OperationKey: key, RequestID: "request-attached-missing", Kind: BillingOperationKindTask,
		UserID: user.Id, FundingSource: BillingFundingSourceWallet,
		ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
	})
	require.NoError(t, err)
	now := time.Now().Unix()
	require.NoError(t, DB.Model(&BillingOperation{}).Where("id = ?", operation.ID).Updates(map[string]any{
		"task_id": int64(999999), "updated_at": now - 3600,
	}).Error)

	recovered, err := RecoverStaleOpenBillingOperations(now, 10)
	require.NoError(t, err)
	require.EqualValues(t, 1, recovered)
	var reloaded BillingOperation
	require.NoError(t, DB.First(&reloaded, operation.ID).Error)
	require.Equal(t, BillingOutcomeFailure, reloaded.Outcome)
	require.Zero(t, reloaded.DesiredQuota)
}

func TestRecoverStaleOpenAttachedTasksDoNotStarveLaterTerminalTask(t *testing.T) {
	resetBillingOperationTables(t)
	user := createBillingUser(t, 2000)
	now := time.Now().Unix()
	for index, status := range []TaskStatus{TaskStatusInProgress, TaskStatusInProgress, TaskStatusSuccess} {
		publicTaskID := fmt.Sprintf("task-stale-page-%d", index)
		requestID := fmt.Sprintf("request-stale-page-%d", index)
		key, err := TaskBillingOperationKey(publicTaskID)
		require.NoError(t, err)
		operation, err := EnsureBillingOperationBaseline(BillingOperationBaseline{
			OperationKey: key, RequestID: requestID, Kind: BillingOperationKindTask,
			UserID: user.Id, FundingSource: BillingFundingSourceWallet,
			ReservedQuota: 100, LedgerMode: BillingLedgerModeActive,
		})
		require.NoError(t, err)
		task := &Task{
			TaskID: publicTaskID, UserId: user.Id, Status: status, Quota: 100,
			PrivateData: TaskPrivateData{
				BillingOperationKey: key, BillingLedgerMode: BillingLedgerModeActive,
				BillingRequestID: requestID, BillingSource: BillingFundingSourceWallet,
				BillingChargeTokenSet: true,
			},
		}
		require.NoError(t, DB.Create(task).Error)
		require.NoError(t, DB.Model(&BillingOperation{}).Where("id = ?", operation.ID).Updates(map[string]any{
			"task_id": task.ID, "updated_at": now - 3600,
		}).Error)
	}

	recovered, err := RecoverStaleOpenBillingOperations(now, 2)
	require.NoError(t, err)
	require.Zero(t, recovered)
	recovered, err = RecoverStaleOpenBillingOperations(now, 2)
	require.NoError(t, err)
	require.EqualValues(t, 1, recovered)
	var terminal BillingOperation
	require.NoError(t, DB.Where("operation_key = ?", "task:task-stale-page-2").First(&terminal).Error)
	require.Equal(t, BillingOutcomeSuccess, terminal.Outcome)
}

func TestAdminDeleteUserSubscriptionRejectsUnsettledBilling(t *testing.T) {
	for _, testCase := range []struct {
		name         string
		outcome      BillingOutcome
		desiredQuota int64
		appliedQuota int64
		wantBlocked  bool
	}{
		{name: "open", outcome: BillingOutcomeOpen, desiredQuota: 100, appliedQuota: 100, wantBlocked: true},
		{name: "pending_refund", outcome: BillingOutcomeFailure, desiredQuota: 0, appliedQuota: 100, wantBlocked: true},
		{name: "pending_surcharge", outcome: BillingOutcomeSuccess, desiredQuota: 150, appliedQuota: 100, wantBlocked: true},
		{name: "settled", outcome: BillingOutcomeSuccess, desiredQuota: 100, appliedQuota: 100, wantBlocked: false},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			resetBillingOperationTables(t)
			user := createBillingUser(t, 1000)
			plan := &SubscriptionPlan{
				Title: "删除保护", Currency: "CNY", DurationUnit: SubscriptionDurationMonth,
				DurationValue: 1, Enabled: true, TotalAmount: 1000,
			}
			require.NoError(t, DB.Create(plan).Error)
			subscription := &UserSubscription{
				UserId: user.Id, PlanId: plan.Id, AmountTotal: 1000,
				StartTime: time.Now().Add(-time.Hour).Unix(), EndTime: time.Now().Add(time.Hour).Unix(), Status: "active",
			}
			require.NoError(t, DB.Create(subscription).Error)
			require.NoError(t, DB.Create(&BillingOperation{
				OperationKey: "req:delete-subscription-" + testCase.name,
				RequestID:    "delete-subscription-" + testCase.name,
				Kind:         BillingOperationKindRequest, UserID: user.Id,
				FundingSource: BillingFundingSourceSubscription, FundingRefID: subscription.Id,
				BaselineQuota: 100, ReservedQuota: 100, DesiredQuota: testCase.desiredQuota,
				AppliedQuota: testCase.appliedQuota, LedgerMode: BillingLedgerModeActive,
				Outcome: testCase.outcome, CreatedAt: time.Now().Unix(), UpdatedAt: time.Now().Unix(),
			}).Error)

			_, err := AdminDeleteUserSubscription(subscription.Id)
			if testCase.wantBlocked {
				require.ErrorIs(t, err, ErrSubscriptionBillingPending)
				var count int64
				require.NoError(t, DB.Model(&UserSubscription{}).Where("id = ?", subscription.Id).Count(&count).Error)
				require.EqualValues(t, 1, count)
				return
			}
			require.NoError(t, err)
			var count int64
			require.NoError(t, DB.Model(&UserSubscription{}).Where("id = ?", subscription.Id).Count(&count).Error)
			require.Zero(t, count)
		})
	}
}
