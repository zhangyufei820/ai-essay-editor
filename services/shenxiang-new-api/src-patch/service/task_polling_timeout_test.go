package service

import (
	"context"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestFinalizeAsyncVideoTaskTimeoutRefundsOnce(t *testing.T) {
	truncate(t)

	const (
		userID       = 81
		tokenID      = 82
		channelID    = 83
		walletQuota  = 10000
		preConsumed  = 13698
		tokenBalance = 5000
	)
	seedUser(t, userID, walletQuota)
	seedToken(t, tokenID, userID, "sk-timeout-refund", tokenBalance)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	task.TaskID = "task_timeout_refund_once"
	task.Platform = constant.TaskPlatform("55")
	task.SubmitTime = time.Now().Add(-asyncVideoWatchTimeout - time.Minute).Unix()
	require.NoError(t, model.DB.Create(task).Error)

	done, err := finalizeAsyncVideoTaskTimeout(context.Background(), task.TaskID)
	require.NoError(t, err)
	require.True(t, done)
	done, err = finalizeAsyncVideoTaskTimeout(context.Background(), task.TaskID)
	require.NoError(t, err)
	require.True(t, done)

	require.Equal(t, walletQuota+preConsumed, getUserQuota(t, userID))
	require.Equal(t, tokenBalance+preConsumed, getTokenRemainQuota(t, tokenID))
	require.Equal(t, -preConsumed, getTokenUsedQuota(t, tokenID))
	var refundLogCount int64
	require.NoError(t, model.LOG_DB.Model(&model.Log{}).Where("type = ?", model.LogTypeRefund).Count(&refundLogCount).Error)
	require.Equal(t, int64(1), refundLogCount)

	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusFailure), reloaded.Status)
	require.Equal(t, asyncVideoTimeoutReason, reloaded.FailReason)
}

func TestAsyncVideoTaskExpiredExcludesNonVideoTasks(t *testing.T) {
	startedAt := time.Now().Add(-asyncVideoWatchTimeout - time.Minute).Unix()
	require.False(t, asyncVideoTaskExpired(&model.Task{Platform: constant.TaskPlatformSuno, SubmitTime: startedAt}, time.Now()))
	require.False(t, asyncVideoTaskExpired(&model.Task{Platform: constant.TaskPlatformPlaygroundImage, SubmitTime: startedAt}, time.Now()))
	require.True(t, asyncVideoTaskExpired(&model.Task{Platform: constant.TaskPlatform("55"), SubmitTime: startedAt}, time.Now()))
	require.False(t, asyncVideoTaskExpired(&model.Task{Platform: constant.TaskPlatform("55"), SubmitTime: time.Now().Unix()}, time.Now()))
	require.False(t, asyncVideoTaskExpired(nil, time.Now()))
}
