package service

import (
	"context"
	"errors"
	"fmt"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type failingSettleFunding struct{}

func (*failingSettleFunding) Source() string       { return BillingSourceWallet }
func (*failingSettleFunding) PreConsume(int) error { return nil }
func (*failingSettleFunding) Settle(int) error     { return errors.New("forced settlement failure") }
func (*failingSettleFunding) Refund() error        { return nil }
func (*failingSettleFunding) Close()               {}

func newBillingLedgerTestContext() *gin.Context {
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	return context
}

func newWalletBillingRelayInfo(requestID string, userID int, tokenID int) *relaycommon.RelayInfo {
	return &relaycommon.RelayInfo{
		UserId:          userID,
		TokenId:         tokenID,
		TokenKey:        "sk-ledger-test",
		RequestId:       requestID,
		OriginModelName: "gpt-ledger-test",
		UserSetting: dto.UserSetting{
			BillingPreference: "wallet_only",
		},
	}
}

func TestBillingSessionActiveWalletBaselineIsAtomicAndIdempotent(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))
	const userID, tokenID = 201, 201
	seedUser(t, userID, 1000)
	seedToken(t, tokenID, userID, "sk-ledger-test", 1000)
	relayInfo := newWalletBillingRelayInfo("active-wallet-baseline", userID, tokenID)

	first, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
	require.Nil(t, apiErr)
	require.NotNil(t, first)
	require.Equal(t, 900, getUserQuota(t, userID))
	require.Equal(t, 900, getTokenRemainQuota(t, tokenID))
	require.Equal(t, 100, getTokenUsedQuota(t, tokenID))

	second, apiErr := NewBillingSession(newBillingLedgerTestContext(), newWalletBillingRelayInfo("active-wallet-baseline", userID, tokenID), 100)
	require.Nil(t, apiErr)
	require.NotNil(t, second)
	require.Equal(t, 900, getUserQuota(t, userID))
	require.Equal(t, 900, getTokenRemainQuota(t, tokenID))
	require.Equal(t, 100, getTokenUsedQuota(t, tokenID))

	var operation model.BillingOperation
	require.NoError(t, model.DB.Where("operation_key = ?", "req:active-wallet-baseline").First(&operation).Error)
	require.EqualValues(t, 100, operation.BaselineQuota)
	require.EqualValues(t, 100, operation.AppliedQuota)
	require.True(t, operation.ChargeToken)
}

func TestBillingSessionActiveSyncSettleAndRefundAreIdempotent(t *testing.T) {
	t.Run("settle", func(t *testing.T) {
		truncate(t)
		t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))
		const userID, tokenID = 202, 202
		seedUser(t, userID, 1000)
		seedToken(t, tokenID, userID, "sk-ledger-settle", 1000)
		relayInfo := newWalletBillingRelayInfo("active-sync-settle", userID, tokenID)
		relayInfo.TokenKey = "sk-ledger-settle"
		session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
		require.Nil(t, apiErr)

		require.NoError(t, session.Settle(60))
		require.NoError(t, session.Settle(60))
		session.Refund(nil)
		require.Equal(t, 940, getUserQuota(t, userID))
		require.Equal(t, 940, getTokenRemainQuota(t, tokenID))
		var operation model.BillingOperation
		require.NoError(t, model.DB.Where("operation_key = ?", "req:active-sync-settle").First(&operation).Error)
		require.Equal(t, model.BillingOutcomeSuccess, operation.Outcome)
		require.EqualValues(t, 60, operation.DesiredQuota)
		require.EqualValues(t, 60, operation.AppliedQuota)
	})

	t.Run("refund", func(t *testing.T) {
		truncate(t)
		t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))
		const userID, tokenID = 203, 203
		seedUser(t, userID, 1000)
		seedToken(t, tokenID, userID, "sk-ledger-refund", 1000)
		relayInfo := newWalletBillingRelayInfo("active-sync-refund", userID, tokenID)
		relayInfo.TokenKey = "sk-ledger-refund"
		session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
		require.Nil(t, apiErr)

		session.Refund(nil)
		session.Refund(nil)
		require.Equal(t, 1000, getUserQuota(t, userID))
		require.Equal(t, 1000, getTokenRemainQuota(t, tokenID))
		var operation model.BillingOperation
		require.NoError(t, model.DB.Where("operation_key = ?", "req:active-sync-refund").First(&operation).Error)
		require.Equal(t, model.BillingOutcomeFailure, operation.Outcome)
		require.Zero(t, operation.DesiredQuota)
		require.Zero(t, operation.AppliedQuota)
	})
}

func TestBillingSessionActiveTaskHandoffTransfersRefundOwnership(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))
	const userID, tokenID = 204, 204
	seedUser(t, userID, 1000)
	seedToken(t, tokenID, userID, "sk-ledger-task", 1000)
	relayInfo := newWalletBillingRelayInfo("active-task-handoff", userID, tokenID)
	relayInfo.TokenKey = "sk-ledger-task"
	relayInfo.TaskRelayInfo = &relaycommon.TaskRelayInfo{PublicTaskID: "task_active_handoff"}
	relayInfo.ForcePreConsume = true
	session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
	require.Nil(t, apiErr)
	require.NoError(t, session.Settle(60))
	require.True(t, session.NeedsRefund())

	task := &model.Task{
		TaskID: "task_active_handoff",
		UserId: userID,
		Status: model.TaskStatusSubmitted,
	}
	intent, useIntent, err := session.PrepareTaskBillingHandoff(task)
	require.NoError(t, err)
	require.True(t, useIntent)
	require.Equal(t, model.BillingLedgerModeActive, task.PrivateData.BillingLedgerMode)
	require.True(t, task.PrivateData.BillingChargeTokenSet)
	require.True(t, task.PrivateData.BillingChargeToken)
	require.Equal(t, 60, task.Quota)
	require.NoError(t, task.InsertWithBillingReservationIntent(intent))
	session.CompleteTaskBillingHandoff()
	require.False(t, session.NeedsRefund())
	session.Refund(nil)

	require.Equal(t, 940, getUserQuota(t, userID))
	require.Equal(t, 940, getTokenRemainQuota(t, tokenID))
	var operation model.BillingOperation
	require.NoError(t, model.DB.Where("operation_key = ?", intent.OperationKey).First(&operation).Error)
	require.Equal(t, model.BillingOutcomeOpen, operation.Outcome)
	require.Equal(t, task.ID, operation.TaskID)
	require.EqualValues(t, 60, operation.ReservedQuota)
}

func TestBillingSessionActiveTaskInsertFailureCanRefund(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))
	const userID, tokenID = 205, 205
	seedUser(t, userID, 1000)
	seedToken(t, tokenID, userID, "sk-ledger-task-refund", 1000)
	relayInfo := newWalletBillingRelayInfo("active-task-insert-failure", userID, tokenID)
	relayInfo.TokenKey = "sk-ledger-task-refund"
	relayInfo.TaskRelayInfo = &relaycommon.TaskRelayInfo{PublicTaskID: "task_active_insert_failure"}
	relayInfo.ForcePreConsume = true
	session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
	require.Nil(t, apiErr)
	require.NoError(t, session.Settle(60))

	task := &model.Task{TaskID: "task_active_insert_failure", UserId: userID, Status: model.TaskStatusSubmitted}
	_, useIntent, err := session.PrepareTaskBillingHandoff(task)
	require.NoError(t, err)
	require.True(t, useIntent)
	session.Refund(nil)
	require.Equal(t, 1000, getUserQuota(t, userID))
	require.Equal(t, 1000, getTokenRemainQuota(t, tokenID))
	var operation model.BillingOperation
	require.NoError(t, model.DB.Where("operation_key = ?", "task:task_active_insert_failure").First(&operation).Error)
	require.Equal(t, model.BillingOutcomeFailure, operation.Outcome)
	require.Zero(t, operation.AppliedQuota)
}

func TestBillingSessionExistingTaskOverrideRefundKeepsOperationOpen(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeShadow))
	const userID, tokenID = 206, 206
	seedUser(t, userID, 1000)
	seedToken(t, tokenID, userID, "sk-ledger-override", 1000)
	task := &model.Task{
		TaskID: "task_existing_override",
		UserId: userID,
		Status: model.TaskStatusInProgress,
		PrivateData: model.TaskPrivateData{
			BillingOperationKey: "task:task_existing_override",
			BillingLedgerMode:   model.BillingLedgerModeActive,
			BillingRequestID:    "active-existing-override",
		},
	}
	require.NoError(t, model.DB.Create(task).Error)
	ginContext := newBillingLedgerTestContext()
	require.NoError(t, SetTaskBillingOperationOverride(ginContext, task.PrivateData.BillingOperationKey, model.BillingLedgerModeActive, task.ID))
	relayInfo := newWalletBillingRelayInfo("active-existing-override", userID, tokenID)
	relayInfo.TokenKey = "sk-ledger-override"
	session, apiErr := NewBillingSession(ginContext, relayInfo, 100)
	require.Nil(t, apiErr)

	session.Refund(nil)
	require.Equal(t, 900, getUserQuota(t, userID))
	require.Equal(t, 900, getTokenRemainQuota(t, tokenID))
	var operation model.BillingOperation
	require.NoError(t, model.DB.Where("operation_key = ?", task.PrivateData.BillingOperationKey).First(&operation).Error)
	require.Equal(t, model.BillingOutcomeOpen, operation.Outcome)
	require.Equal(t, task.ID, operation.TaskID)
	require.Equal(t, model.BillingLedgerModeActive, operation.LedgerMode)
}

func TestBillingSessionShadowUsesDurableOutbox(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeShadow))
	const userID, tokenID = 211, 211
	seedUser(t, userID, 1000)
	seedToken(t, tokenID, userID, "sk-ledger-shadow", 1000)
	relayInfo := newWalletBillingRelayInfo("shadow-sync-settle", userID, tokenID)
	relayInfo.TokenKey = "sk-ledger-shadow"
	session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
	require.Nil(t, apiErr)
	require.Equal(t, 900, getUserQuota(t, userID))
	require.Equal(t, 900, getTokenRemainQuota(t, tokenID))

	require.NoError(t, session.Settle(60))
	require.Equal(t, 940, getUserQuota(t, userID))
	require.Equal(t, 940, getTokenRemainQuota(t, tokenID))
	var operation model.BillingOperation
	require.NoError(t, model.DB.Where("operation_key = ?", "req:shadow-sync-settle").First(&operation).Error)
	require.Equal(t, model.BillingLedgerModeShadow, operation.LedgerMode)
	require.Equal(t, model.BillingOutcomeSuccess, operation.Outcome)
	require.EqualValues(t, 60, operation.AppliedQuota)
	var outboxCount int64
	require.NoError(t, model.DB.Model(&model.BillingOutbox{}).Where("operation_id = ?", operation.ID).Count(&outboxCount).Error)
	require.GreaterOrEqual(t, outboxCount, int64(3))
}

func TestBillingSessionShadowPersistsSettlementWhenInlineConvergenceFails(t *testing.T) {
	truncate(t)
	seedUser(t, 220, 100)
	operationKey, err := model.RequestBillingOperationKey("shadow-failed-settlement")
	require.NoError(t, err)
	_, err = model.EnsureBillingOperationBaseline(model.BillingOperationBaseline{
		OperationKey:  operationKey,
		RequestID:     "shadow-failed-settlement",
		Kind:          model.BillingOperationKindRequest,
		UserID:        220,
		FundingSource: BillingSourceWallet,
		ReservedQuota: 100,
		LedgerMode:    model.BillingLedgerModeShadow,
	})
	require.NoError(t, err)
	session := &BillingSession{
		relayInfo:        &relaycommon.RelayInfo{UserId: 220, RequestId: "shadow-failed-settlement"},
		funding:          &failingSettleFunding{},
		ledgerMode:       model.BillingLedgerModeShadow,
		operationKey:     operationKey,
		operationKind:    model.BillingOperationKindRequest,
		ledgerTracked:    true,
		preConsumedQuota: 100,
	}

	require.NoError(t, session.Settle(120))
	var operation model.BillingOperation
	require.NoError(t, model.DB.Where("operation_key = ?", operationKey).First(&operation).Error)
	require.Equal(t, model.BillingOutcomeSuccess, operation.Outcome)
	require.EqualValues(t, 120, operation.DesiredQuota)
	require.EqualValues(t, 100, operation.AppliedQuota)
}

func TestBillingSessionTaskInsertFailureRefundsLegacyWalletModes(t *testing.T) {
	for index, ledgerMode := range []model.BillingLedgerMode{model.BillingLedgerModeOff, model.BillingLedgerModeShadow} {
		t.Run(string(ledgerMode), func(t *testing.T) {
			truncate(t)
			t.Setenv("BILLING_LEDGER_MODE", string(ledgerMode))
			userID := 221 + index
			tokenID := 221 + index
			seedUser(t, userID, 1000)
			seedToken(t, tokenID, userID, "sk-task-insert-refund-"+string(rune('a'+index)), 1000)
			relayInfo := newWalletBillingRelayInfo("task-insert-refund-"+string(rune('a'+index)), userID, tokenID)
			relayInfo.TokenKey = "sk-task-insert-refund-" + string(rune('a'+index))
			relayInfo.TaskRelayInfo = &relaycommon.TaskRelayInfo{PublicTaskID: "task_insert_refund_" + string(rune('a'+index))}
			relayInfo.ForcePreConsume = true
			session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
			require.Nil(t, apiErr)
			require.NoError(t, session.Settle(60))
			require.Equal(t, 940, getUserQuota(t, userID))
			require.Equal(t, 940, getTokenRemainQuota(t, tokenID))

			task := &model.Task{TaskID: relayInfo.TaskRelayInfo.PublicTaskID, UserId: userID, Status: model.TaskStatusSubmitted}
			_, useIntent, err := session.PrepareTaskBillingHandoff(task)
			require.NoError(t, err)
			require.True(t, useIntent)
			session.Refund(nil)
			require.Equal(t, 1000, getUserQuota(t, userID))
			require.Equal(t, 1000, getTokenRemainQuota(t, tokenID))
			var operation model.BillingOperation
			require.NoError(t, model.DB.Where("operation_key = ?", "task:"+task.TaskID).First(&operation).Error)
			require.Equal(t, model.BillingOutcomeFailure, operation.Outcome)
		})
	}
}

func TestBillingSessionTaskInsertFailureRefundsSubscriptionSettlementDelta(t *testing.T) {
	for index, actualQuota := range []int{60, 140} {
		t.Run(fmt.Sprintf("actual_%d", actualQuota), func(t *testing.T) {
			truncate(t)
			t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeShadow))
			userID := 230 + index
			tokenID := 230 + index
			planID := 230 + index
			subscriptionID := 230 + index
			seedUser(t, userID, 1000)
			seedToken(t, tokenID, userID, fmt.Sprintf("sk-subscription-refund-%d", index), 1000)
			require.NoError(t, model.DB.Create(&model.SubscriptionPlan{
				Id: planID, Title: "Shadow Plan", Enabled: true, TotalAmount: 1000,
			}).Error)
			require.NoError(t, model.DB.Create(&model.UserSubscription{
				Id: subscriptionID, UserId: userID, PlanId: planID, AmountTotal: 1000,
				Status: "active", StartTime: time.Now().Add(-time.Hour).Unix(), EndTime: time.Now().Add(time.Hour).Unix(),
			}).Error)
			relayInfo := &relaycommon.RelayInfo{
				UserId: userID, TokenId: tokenID, TokenKey: fmt.Sprintf("sk-subscription-refund-%d", index),
				RequestId: fmt.Sprintf("subscription-task-refund-%d", index), OriginModelName: "gpt-ledger-test",
				TaskRelayInfo:   &relaycommon.TaskRelayInfo{PublicTaskID: fmt.Sprintf("task_subscription_refund_%d", index)},
				ForcePreConsume: true,
				UserSetting:     dto.UserSetting{BillingPreference: "subscription_only"},
			}
			session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
			require.Nil(t, apiErr)
			require.NoError(t, session.Settle(actualQuota))
			var subscription model.UserSubscription
			require.NoError(t, model.DB.First(&subscription, subscriptionID).Error)
			require.EqualValues(t, actualQuota, subscription.AmountUsed)

			task := &model.Task{TaskID: relayInfo.TaskRelayInfo.PublicTaskID, UserId: userID, Status: model.TaskStatusSubmitted}
			_, _, err := session.PrepareTaskBillingHandoff(task)
			require.NoError(t, err)
			session.Refund(nil)
			require.NoError(t, model.DB.First(&subscription, subscriptionID).Error)
			require.Zero(t, subscription.AmountUsed)
			require.Equal(t, 1000, getTokenRemainQuota(t, tokenID))
			var record model.SubscriptionPreConsumeRecord
			require.NoError(t, model.DB.Where("request_id = ?", relayInfo.RequestId).First(&record).Error)
			require.Equal(t, "refunded", record.Status)
		})
	}
}

func TestBillingSessionActiveReserveFailsClosedUntilLedgerConverges(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))
	const userID, tokenID = 240, 240
	seedUser(t, userID, 1000)
	seedToken(t, tokenID, userID, "sk-reserve-fail-closed", 1000)
	relayInfo := newWalletBillingRelayInfo("active-reserve-fail-closed", userID, tokenID)
	relayInfo.TokenKey = "sk-reserve-fail-closed"
	session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
	require.Nil(t, apiErr)
	require.NoError(t, model.DB.Exec(`
		CREATE TRIGGER fail_reserve_applied_quota_update
		BEFORE UPDATE OF applied_quota ON billing_operations
		WHEN NEW.applied_quota != OLD.applied_quota
		BEGIN
			SELECT RAISE(FAIL, 'forced reserve convergence failure');
		END
	`).Error)

	reserveErr := session.Reserve(150)
	require.EqualError(t, reserveErr, "billing reservation could not be confirmed")
	reserveErr = session.Reserve(150)
	require.EqualError(t, reserveErr, "billing reservation could not be confirmed")
	require.Equal(t, 900, getUserQuota(t, userID))
	require.Equal(t, 900, getTokenRemainQuota(t, tokenID))
	session.Refund(nil)
	require.NoError(t, model.DB.Exec("DROP TRIGGER IF EXISTS fail_reserve_applied_quota_update").Error)
	require.NoError(t, model.DB.Model(&model.BillingOutbox{}).Where("status = ?", model.BillingOutboxStatusPending).Update("available_at", 0).Error)
	require.NoError(t, RunBillingLedgerMaintenanceOnce(context.Background()))
	require.NoError(t, RunBillingLedgerMaintenanceOnce(context.Background()))
	require.Equal(t, 1000, getUserQuota(t, userID))
	require.Equal(t, 1000, getTokenRemainQuota(t, tokenID))
}

func TestBillingSessionInlineFailureIsRecoveredByWorker(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))
	const userID, tokenID = 212, 212
	seedUser(t, userID, 1000)
	seedToken(t, tokenID, userID, "sk-ledger-inline-retry", 1000)
	relayInfo := newWalletBillingRelayInfo("active-inline-retry", userID, tokenID)
	relayInfo.TokenKey = "sk-ledger-inline-retry"
	session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
	require.Nil(t, apiErr)
	require.NoError(t, model.DB.Exec(`
		CREATE TRIGGER fail_billing_applied_quota_update
		BEFORE UPDATE OF applied_quota ON billing_operations
		WHEN NEW.applied_quota != OLD.applied_quota
		BEGIN
			SELECT RAISE(FAIL, 'forced inline billing failure');
		END
	`).Error)
	t.Cleanup(func() { model.DB.Exec("DROP TRIGGER IF EXISTS fail_billing_applied_quota_update") })

	require.NoError(t, session.Settle(60))
	require.Equal(t, 900, getUserQuota(t, userID))
	require.Equal(t, 900, getTokenRemainQuota(t, tokenID))
	var operation model.BillingOperation
	require.NoError(t, model.DB.Where("operation_key = ?", "req:active-inline-retry").First(&operation).Error)
	require.Equal(t, model.BillingOutcomeSuccess, operation.Outcome)
	require.EqualValues(t, 100, operation.AppliedQuota)
	require.EqualValues(t, 60, operation.DesiredQuota)
	require.NoError(t, model.DB.Exec("DROP TRIGGER IF EXISTS fail_billing_applied_quota_update").Error)
	require.NoError(t, model.DB.Model(&model.BillingOutbox{}).
		Where("operation_id = ? AND status = ?", operation.ID, model.BillingOutboxStatusPending).
		Update("available_at", 0).Error)

	require.NoError(t, RunBillingLedgerMaintenanceOnce(context.Background()))
	require.Equal(t, 940, getUserQuota(t, userID))
	require.Equal(t, 940, getTokenRemainQuota(t, tokenID))
	require.NoError(t, model.DB.Where("id = ?", operation.ID).First(&operation).Error)
	require.EqualValues(t, 60, operation.AppliedQuota)
}

func TestBillingSessionActiveRefundRemainsRetryableWhenIntentWriteFails(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))
	const userID, tokenID = 241, 241
	seedUser(t, userID, 1000)
	seedToken(t, tokenID, userID, "sk-refund-intent-retry", 1000)
	relayInfo := newWalletBillingRelayInfo("active-refund-intent-retry", userID, tokenID)
	relayInfo.TokenKey = "sk-refund-intent-retry"
	session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
	require.Nil(t, apiErr)
	require.NoError(t, model.DB.Exec(`
		CREATE TRIGGER fail_billing_refund_outcome
		BEFORE UPDATE OF outcome ON billing_operations
		WHEN NEW.outcome != OLD.outcome
		BEGIN
			SELECT RAISE(FAIL, 'forced refund outcome failure');
		END
	`).Error)

	session.Refund(nil)
	require.True(t, session.NeedsRefund())
	require.Equal(t, 900, getUserQuota(t, userID))
	require.NoError(t, model.DB.Exec("DROP TRIGGER IF EXISTS fail_billing_refund_outcome").Error)
	session.Refund(nil)
	require.False(t, session.NeedsRefund())
	require.Equal(t, 1000, getUserQuota(t, userID))
	require.Equal(t, 1000, getTokenRemainQuota(t, tokenID))
}

func TestBillingSessionActiveSubscriptionCopiesMetadataAndRefunds(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))
	const userID, tokenID, planID, subscriptionID = 207, 207, 207, 207
	seedUser(t, userID, 1000)
	seedToken(t, tokenID, userID, "sk-ledger-subscription", 1000)
	plan := &model.SubscriptionPlan{
		Id:               planID,
		Title:            "Ledger Pro",
		Enabled:          true,
		TotalAmount:      1000,
		ConcurrencyLimit: 1,
	}
	require.NoError(t, model.DB.Create(plan).Error)
	require.NoError(t, model.DB.Create(&model.UserSubscription{
		Id:               subscriptionID,
		UserId:           userID,
		PlanId:           planID,
		AmountTotal:      1000,
		ConcurrencyLimit: 1,
		Status:           "active",
		StartTime:        time.Now().Add(-time.Hour).Unix(),
		EndTime:          time.Now().Add(time.Hour).Unix(),
	}).Error)
	relayInfo := &relaycommon.RelayInfo{
		UserId:          userID,
		TokenId:         tokenID,
		TokenKey:        "sk-ledger-subscription",
		RequestId:       "active-subscription",
		OriginModelName: "gpt-ledger-test",
		UserSetting: dto.UserSetting{
			BillingPreference: "subscription_only",
		},
	}
	session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
	require.Nil(t, apiErr)
	require.Equal(t, BillingSourceSubscription, relayInfo.BillingSource)
	require.Equal(t, subscriptionID, relayInfo.SubscriptionId)
	require.Equal(t, planID, relayInfo.SubscriptionPlanId)
	require.Equal(t, "Ledger Pro", relayInfo.SubscriptionPlanTitle)
	require.Equal(t, int64(100), relayInfo.SubscriptionPreConsumed)
	require.Equal(t, 900, getTokenRemainQuota(t, tokenID))
	subscriptionConcurrencySlots.Lock()
	require.Equal(t, 1, subscriptionConcurrencySlots.active[subscriptionID])
	subscriptionConcurrencySlots.Unlock()

	session.Refund(nil)
	var subscription model.UserSubscription
	require.NoError(t, model.DB.First(&subscription, subscriptionID).Error)
	require.Zero(t, subscription.AmountUsed)
	require.Equal(t, 1000, getTokenRemainQuota(t, tokenID))
	subscriptionConcurrencySlots.Lock()
	require.Zero(t, subscriptionConcurrencySlots.active[subscriptionID])
	subscriptionConcurrencySlots.Unlock()
}

func TestBillingSessionSubscriptionReservationDoesNotDoubleCountPostDelta(t *testing.T) {
	for _, targetQuota := range []int{40, 150} {
		t.Run(fmt.Sprintf("target_%d", targetQuota), func(t *testing.T) {
			truncate(t)
			t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))
			const userID, tokenID, planID, subscriptionID = 217, 217, 217, 217
			seedUser(t, userID, 1000)
			seedToken(t, tokenID, userID, "sk-ledger-subscription-reserve", 1000)
			require.NoError(t, model.DB.Create(&model.SubscriptionPlan{
				Id: planID, Title: "Ledger Reserve", Enabled: true, TotalAmount: 1000,
			}).Error)
			require.NoError(t, model.DB.Create(&model.UserSubscription{
				Id: subscriptionID, UserId: userID, PlanId: planID, AmountTotal: 1000,
				Status: "active", StartTime: time.Now().Add(-time.Hour).Unix(), EndTime: time.Now().Add(time.Hour).Unix(),
			}).Error)
			publicTaskID := "subscription-reserve-" + fmt.Sprint(targetQuota)
			relayInfo := &relaycommon.RelayInfo{
				UserId: userID, TokenId: tokenID, TokenKey: "sk-ledger-subscription-reserve",
				RequestId: "active-subscription-reserve-" + fmt.Sprint(targetQuota), OriginModelName: "gpt-ledger-test",
				UserSetting:   dto.UserSetting{BillingPreference: "subscription_only"},
				TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: publicTaskID}, ForcePreConsume: true,
			}
			session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
			require.Nil(t, apiErr)

			require.NoError(t, session.Settle(targetQuota))
			require.Equal(t, int64(targetQuota), relayInfo.SubscriptionPreConsumed)
			require.Equal(t, int64(targetQuota), relayInfo.SubscriptionAmountUsedAfterPreConsume)
			require.Zero(t, relayInfo.SubscriptionPostDelta)
			if targetQuota == 150 {
				require.NoError(t, session.Settle(200))
				targetQuota = 200
				require.Equal(t, int64(targetQuota), relayInfo.SubscriptionPreConsumed)
				require.Equal(t, int64(targetQuota), relayInfo.SubscriptionAmountUsedAfterPreConsume)
				require.Zero(t, relayInfo.SubscriptionPostDelta)
			}
			task := &model.Task{TaskID: publicTaskID, UserId: userID, Status: model.TaskStatusSubmitted}
			intent, useIntent, err := session.PrepareTaskBillingHandoff(task)
			require.NoError(t, err)
			require.True(t, useIntent)
			require.NoError(t, task.InsertWithBillingReservationIntent(intent))
			session.CompleteTaskBillingHandoff()
		})
	}
}

func TestBillingSessionSubscriptionReplayUsesAppliedQuotaAsDisplayBaseline(t *testing.T) {
	for _, testCase := range []struct {
		name          string
		reservedQuota int
		appliedQuota  int
	}{
		{name: "lower_terminal_reservation", reservedQuota: 40, appliedQuota: 40},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			truncate(t)
			t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))
			const userID, tokenID, planID, subscriptionID = 218, 218, 218, 218
			seedUser(t, userID, 1000)
			seedToken(t, tokenID, userID, "sk-ledger-subscription-replay", 1000)
			require.NoError(t, model.DB.Create(&model.SubscriptionPlan{
				Id: planID, Title: "Ledger Replay", Enabled: true, TotalAmount: 1000,
			}).Error)
			require.NoError(t, model.DB.Create(&model.UserSubscription{
				Id: subscriptionID, UserId: userID, PlanId: planID, AmountTotal: 1000,
				Status: "active", StartTime: time.Now().Add(-time.Hour).Unix(), EndTime: time.Now().Add(time.Hour).Unix(),
			}).Error)
			requestID := "active-subscription-replay-" + testCase.name
			newRelayInfo := func() *relaycommon.RelayInfo {
				return &relaycommon.RelayInfo{
					UserId: userID, TokenId: tokenID, TokenKey: "sk-ledger-subscription-replay",
					RequestId: requestID, OriginModelName: "gpt-ledger-test",
					UserSetting: dto.UserSetting{BillingPreference: "subscription_only"},
				}
			}
			first, apiErr := NewBillingSession(newBillingLedgerTestContext(), newRelayInfo(), 100)
			require.Nil(t, apiErr)
			first.funding.Close()

			require.NoError(t, model.DB.Model(&model.BillingOperation{}).
				Where("operation_key = ?", "req:"+requestID).
				Updates(map[string]any{
					"reserved_quota": testCase.reservedQuota,
					"desired_quota":  testCase.reservedQuota,
					"applied_quota":  testCase.appliedQuota,
				}).Error)
			require.NoError(t, model.DB.Model(&model.UserSubscription{}).
				Where("id = ?", subscriptionID).
				Update("amount_used", testCase.appliedQuota).Error)

			replayedInfo := newRelayInfo()
			replayed, apiErr := NewBillingSession(newBillingLedgerTestContext(), replayedInfo, 100)
			require.Nil(t, apiErr)
			require.NotNil(t, replayed)
			require.Equal(t, testCase.reservedQuota, replayed.GetPreConsumedQuota())
			require.Equal(t, int64(testCase.reservedQuota), replayedInfo.SubscriptionPreConsumed)
			require.Equal(t, int64(testCase.reservedQuota), replayedInfo.SubscriptionAmountUsedAfterPreConsume)
			require.Zero(t, replayedInfo.SubscriptionPostDelta)
			replayed.funding.Close()
		})
	}
}

func TestBillingSessionRejectsUnconvergedSubscriptionReplay(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))
	const userID, tokenID, planID, subscriptionID = 219, 219, 219, 219
	seedUser(t, userID, 1000)
	seedToken(t, tokenID, userID, "sk-ledger-subscription-unconverged", 1000)
	require.NoError(t, model.DB.Create(&model.SubscriptionPlan{
		Id: planID, Title: "Ledger Pending", Enabled: true, TotalAmount: 1000, ConcurrencyLimit: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.UserSubscription{
		Id: subscriptionID, UserId: userID, PlanId: planID, AmountTotal: 1000, ConcurrencyLimit: 1,
		Status: "active", StartTime: time.Now().Add(-time.Hour).Unix(), EndTime: time.Now().Add(time.Hour).Unix(),
	}).Error)
	newRelayInfo := func() *relaycommon.RelayInfo {
		return &relaycommon.RelayInfo{
			UserId: userID, TokenId: tokenID, TokenKey: "sk-ledger-subscription-unconverged",
			RequestId: "active-subscription-unconverged", OriginModelName: "gpt-ledger-test",
			UserSetting: dto.UserSetting{BillingPreference: "subscription_only"},
		}
	}
	first, apiErr := NewBillingSession(newBillingLedgerTestContext(), newRelayInfo(), 100)
	require.Nil(t, apiErr)
	first.funding.Close()
	require.NoError(t, model.DB.Model(&model.BillingOperation{}).
		Where("operation_key = ?", "req:active-subscription-unconverged").
		Updates(map[string]any{"reserved_quota": 150, "desired_quota": 150, "applied_quota": 100}).Error)

	replayed, apiErr := NewBillingSession(newBillingLedgerTestContext(), newRelayInfo(), 100)
	require.Nil(t, replayed)
	require.NotNil(t, apiErr)
	subscriptionConcurrencySlots.Lock()
	require.Zero(t, subscriptionConcurrencySlots.active[subscriptionID])
	subscriptionConcurrencySlots.Unlock()
}

func TestBillingSessionInvalidLedgerModeFallsBackToDurableOff(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", "invalid-mode")
	const userID, tokenID = 208, 208
	seedUser(t, userID, 1000)
	seedToken(t, tokenID, userID, "sk-ledger-off", 1000)
	relayInfo := newWalletBillingRelayInfo("invalid-mode-fallback", userID, tokenID)
	relayInfo.TokenKey = "sk-ledger-off"
	session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
	require.Nil(t, apiErr)
	require.NotNil(t, session)
	require.Equal(t, 900, getUserQuota(t, userID))
	require.Equal(t, 900, getTokenRemainQuota(t, tokenID))
	var operationCount int64
	require.NoError(t, model.DB.Model(&model.BillingOperation{}).Count(&operationCount).Error)
	require.Equal(t, int64(1), operationCount)
}

func TestBillingLedgerMaintenanceRecoversExpiredLeaseAndStaleTask(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeOff))
	const userID = 209
	seedUser(t, userID, 1000)
	operationKey, err := model.TaskBillingOperationKey("task_worker_stale")
	require.NoError(t, err)
	operation, err := model.EnsureBillingOperationBaseline(model.BillingOperationBaseline{
		OperationKey:  operationKey,
		RequestID:     "worker-stale-request",
		Kind:          model.BillingOperationKindTask,
		UserID:        userID,
		FundingSource: BillingSourceWallet,
		ReservedQuota: 100,
		LedgerMode:    model.BillingLedgerModeActive,
	})
	require.NoError(t, err)
	require.Equal(t, 900, getUserQuota(t, userID))
	require.NoError(t, model.DB.Model(&model.BillingOperation{}).Where("id = ?", operation.ID).Update("updated_at", time.Now().Add(-time.Hour).Unix()).Error)
	leasing, err := model.LeaseBillingOutbox("expired-worker", 10, 1)
	require.NoError(t, err)
	for _, effect := range leasing {
		require.NoError(t, model.DB.Model(&model.BillingOutbox{}).Where("id = ?", effect.ID).Update("lease_until", int64(1)).Error)
	}

	require.NoError(t, RunBillingLedgerMaintenanceOnce(context.Background()))
	require.Equal(t, 1000, getUserQuota(t, userID))
	require.NoError(t, model.DB.Where("id = ?", operation.ID).First(operation).Error)
	require.Equal(t, model.BillingOutcomeFailure, operation.Outcome)
	require.Zero(t, operation.AppliedQuota)
}

func TestBillingOperationOverrideWithInvalidContextFailsClosed(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeOff))
	const userID, tokenID = 210, 210
	seedUser(t, userID, 1000)
	seedToken(t, tokenID, userID, "sk-invalid-override", 1000)
	ginContext := newBillingLedgerTestContext()
	ginContext.Set(taskBillingOperationOverrideContextKey, "invalid")
	_, apiErr := NewBillingSession(ginContext, newWalletBillingRelayInfo("invalid-override", userID, tokenID), 100)
	require.NotNil(t, apiErr)
	require.Equal(t, 1000, getUserQuota(t, userID))
	require.Equal(t, 1000, getTokenRemainQuota(t, tokenID))
}

func TestBillingLedgerWorkerLoopStopsWithContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	done := make(chan struct{})
	go func() {
		BillingLedgerWorkerLoop(ctx)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		require.Fail(t, "billing ledger worker did not stop")
	}
}

func TestBillingLedgerMaintenanceDatabaseCallsHonorContextDeadline(t *testing.T) {
	sqlDB, err := model.DB.DB()
	require.NoError(t, err)
	connection, err := sqlDB.Conn(context.Background())
	require.NoError(t, err)

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	result := make(chan error, 1)
	go func() {
		result <- RunBillingLedgerMaintenanceOnce(ctx)
	}()

	select {
	case maintenanceErr := <-result:
		require.ErrorIs(t, maintenanceErr, context.DeadlineExceeded)
	case <-time.After(500 * time.Millisecond):
		require.NoError(t, connection.Close())
		t.Fatal("billing ledger database call ignored its context deadline")
	}
	require.NoError(t, connection.Close())
}
