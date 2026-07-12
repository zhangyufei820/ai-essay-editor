package model

import "errors"

func (task *Task) FailIfTaskIDMissing(fromStatus TaskStatus, reason string, finishTime int64, progress string) (bool, error) {
	if task == nil || task.ID <= 0 {
		return false, errors.New("task is required")
	}
	result := DB.Model(&Task{}).
		Where("id = ? AND status = ? AND (task_id IS NULL OR TRIM(task_id) = '')", task.ID, fromStatus).
		Updates(map[string]interface{}{
			"status":      TaskStatusFailure,
			"progress":    progress,
			"fail_reason": reason,
			"finish_time": finishTime,
			"updated_at":  finishTime,
		})
	if result.Error != nil {
		return false, result.Error
	}
	if result.RowsAffected == 0 {
		return false, nil
	}
	task.Status = TaskStatusFailure
	task.Progress = progress
	task.FailReason = reason
	task.FinishTime = finishTime
	task.UpdatedAt = finishTime
	return true, nil
}
