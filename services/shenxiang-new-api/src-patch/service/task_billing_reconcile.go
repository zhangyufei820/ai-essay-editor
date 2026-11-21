package service

import (
	"context"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
)

func PrepareTaskBillingAdjustment(task *model.Task, targetQuota int, reason string) {
	prepareTaskBillingAdjustment(task, targetQuota, reason, false)
}

func PrepareDeliveredImageBilling(task *model.Task, targetQuota int) {
	prepareTaskBillingAdjustment(task, targetQuota, "按已交付的图片数量结算", true)
}

func prepareTaskBillingAdjustment(task *model.Task, targetQuota int, reason string, recordUsage bool) {
	if targetQuota < 0 || (targetQuota == task.Quota && !recordUsage) {
		return
	}
	task.PrivateData.BillingAdjustment = &model.TaskBillingAdjustment{
		TargetQuota: targetQuota, Reason: reason, Refund: task.Status == model.TaskStatusFailure, RecordUsage: recordUsage,
	}
}

func ReconcileTaskBillingAdjustment(id int64) error {
	if err := model.ApplyTaskBillingAdjustment(id); err != nil {
		return err
	}
	return model.RecordTaskBillingAdjustment(id, taskAdjustmentLog)
}

func taskAdjustmentLog(task *model.Task) model.RecordTaskBillingLogParams {
	adjustment := task.PrivateData.BillingAdjustment
	kind, amount := model.LogTypeConsume, adjustment.Delta
	if amount < 0 {
		kind, amount = model.LogTypeRefund, -amount
	}
	other := taskBillingOther(task)
	other["task_id"] = task.TaskID
	other["reason"] = adjustment.Reason
	other["pre_consumed_quota"] = adjustment.TargetQuota - adjustment.Delta
	other["actual_quota"] = adjustment.TargetQuota
	return model.RecordTaskBillingLogParams{
		UserId: task.UserId, LogType: kind, Content: adjustment.Reason, ChannelId: task.ChannelId,
		ModelName: taskBillingLogModelName(task), Quota: amount, TokenId: task.PrivateData.TokenId,
		Group: task.Group, Other: other,
	}
}

var taskBillingReconcileCursor atomic.Int64

func StartTaskBillingReconciler() {
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			reconcilePendingTaskBilling(context.Background())
		}
	}()
}

func reconcilePendingTaskBilling(ctx context.Context) {
	const batch = 100
	tasks, err := model.PendingTaskBillingAdjustments(taskBillingReconcileCursor.Load(), batch)
	if err != nil {
		logger.LogError(ctx, "failed to list pending task billing adjustments: "+err.Error())
		return
	}
	for _, task := range tasks {
		if err := ReconcileTaskBillingAdjustment(task.ID); err != nil {
			logger.LogError(ctx, fmt.Sprintf("task billing adjustment pending for %s: %v", task.TaskID, err))
		}
	}
	if len(tasks) < batch {
		taskBillingReconcileCursor.Store(0)
	} else {
		taskBillingReconcileCursor.Store(tasks[len(tasks)-1].ID)
	}
}

func applyPreparedTaskBilling(ctx context.Context, task *model.Task) {
	if task.PrivateData.BillingAdjustment != nil {
		if err := ReconcileTaskBillingAdjustment(task.ID); err != nil {
			logger.LogError(ctx, fmt.Sprintf("task billing adjustment pending for %s: %v", task.TaskID, err))
		}
	}
}
