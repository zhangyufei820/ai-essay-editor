package service

import (
	"context"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestTaskBillingReconcileRetriesTerminalChargeAtomically(t *testing.T) {
	truncate(t)
	const userID, tokenID, channelID = 351, 352, 353
	seedUser(t, userID, 10000)
	seedToken(t, tokenID, userID, "test-task-billing-token", 10)
	seedChannel(t, channelID)
	task := makeTask(userID, channelID, 1000, tokenID, BillingSourceWallet, 0)
	require.NoError(t, model.DB.Create(task).Error)
	prior := task.Status
	task.Status, task.Progress = model.TaskStatusSuccess, "100%"
	PrepareTaskBillingAdjustment(task, 1200, "final amount")
	won, err := task.UpdateWithStatus(prior)
	require.NoError(t, err)
	require.True(t, won)

	require.Error(t, ReconcileTaskBillingAdjustment(task.ID))
	require.Equal(t, 10000, getUserQuota(t, userID))
	require.Equal(t, int64(0), countLogs(t))
	require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", tokenID).Update("remain_quota", 500).Error)
	reconcilePendingTaskBilling(context.Background())
	require.Equal(t, 9800, getUserQuota(t, userID))
	require.Equal(t, 300, getTokenRemainQuota(t, tokenID))
	require.Equal(t, int64(1), countLogs(t))
	require.NoError(t, ReconcileTaskBillingAdjustment(task.ID))
	require.Equal(t, 9800, getUserQuota(t, userID))
	require.Equal(t, int64(1), countLogs(t))
	var fresh model.Task
	require.NoError(t, model.DB.First(&fresh, task.ID).Error)
	require.Equal(t, 1200, fresh.Quota)
	require.True(t, fresh.PrivateData.BillingAdjustment.Logged)
}

func TestTaskBillingReconcileRetriesLogWithoutSecondRefund(t *testing.T) {
	truncate(t)
	const userID, channelID = 361, 362
	seedUser(t, userID, 1000)
	seedChannel(t, channelID)
	task := makeTask(userID, channelID, 200, 0, BillingSourceWallet, 0)
	task.Status = model.TaskStatusFailure
	PrepareTaskBillingAdjustment(task, 0, "supplier failure")
	require.NoError(t, model.DB.Create(task).Error)

	require.NoError(t, model.ApplyTaskBillingAdjustment(task.ID))
	require.Equal(t, 1200, getUserQuota(t, userID))
	require.Equal(t, int64(0), countLogs(t))
	reconcilePendingTaskBilling(context.Background())
	require.Equal(t, 1200, getUserQuota(t, userID))
	require.Equal(t, int64(1), countLogs(t))
	require.EqualValues(t, model.LogTypeRefund, getLastLog(t).Type)
}
