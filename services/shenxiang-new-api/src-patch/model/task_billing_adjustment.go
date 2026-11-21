package model

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"gorm.io/gorm"
)

// TaskBillingAdjustment is saved with the task transition. Applied is set in
// the same transaction as the balance changes, so a retry cannot charge twice.
type TaskBillingAdjustment struct {
	TargetQuota int    `json:"target_quota"`
	Reason      string `json:"reason"`
	Refund      bool   `json:"refund,omitempty"`
	RecordUsage bool   `json:"record_usage,omitempty"`
	Applied     bool   `json:"applied,omitempty"`
	Logged      bool   `json:"logged,omitempty"`
	Delta       int    `json:"delta,omitempty"`
	AsOf        int64  `json:"as_of,omitempty"`
}

// ReserveImageTaskBilling commits the reservation and its task receipt before dispatch.
func ReserveImageTaskBilling(taskID, requestID string, owner, channelID, quota, tokenID int, source string,
	quotaType, targetPlanID int, holdSubscription func(*SubscriptionPreConsumeResult, SubscriptionPlanInfo) error) error {
	if owner <= 0 || quota <= 0 {
		return errors.New("invalid image task reservation")
	}
	now := GetDBTimestamp()
	err := DB.Transaction(func(tx *gorm.DB) error {
		var task Task
		if err := lockForUpdate(tx).Where("task_id = ? AND user_id = ?", taskID, owner).First(&task).Error; err != nil {
			return err
		}
		if task.Status != TaskStatusInProgress || task.Platform != constant.TaskPlatformPlaygroundImage || task.Quota != 0 || task.PrivateData.BillingSource != "" {
			return errors.New("image task is not eligible for a new reservation")
		}
		subscriptionID := 0
		switch source {
		case "wallet":
			result := tx.Model(&User{}).Where("id = ? AND status = ? AND quota >= ?", owner, common.UserStatusEnabled, quota).
				Update("quota", gorm.Expr("quota - ?", quota))
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrUserQuotaInsufficient
			}
		case "subscription":
			if requestID == "" || holdSubscription == nil {
				return errors.New("missing subscription reservation information")
			}
			res, err := preConsumeUserSubscriptionWithTx(tx, requestID, owner, quotaType, targetPlanID, int64(quota), now)
			if err != nil {
				return err
			}
			var sub UserSubscription
			if err := tx.Where("id = ? AND user_id = ?", res.UserSubscriptionId, owner).First(&sub).Error; err != nil {
				return err
			}
			plan, err := getSubscriptionPlanByIdTx(tx, sub.PlanId)
			if err != nil {
				return err
			}
			if err := holdSubscription(res, SubscriptionPlanInfo{PlanId: sub.PlanId, PlanTitle: plan.Title, ConcurrencyLimit: sub.ConcurrencyLimit}); err != nil {
				return err
			}
			subscriptionID = res.UserSubscriptionId
		default:
			return errors.New("unsupported image task funding source")
		}
		if tokenID > 0 {
			if err := adjustTaskTokenWithTx(tx, owner, tokenID, quota, true); err != nil {
				return err
			}
		}
		task.PrivateData.BillingSource = source
		task.PrivateData.SubscriptionId = subscriptionID
		task.PrivateData.TokenId = tokenID
		return tx.Model(&task).Updates(map[string]any{
			"quota": quota, "channel_id": channelID, "private_data": task.PrivateData,
		}).Error
	})
	if err == nil {
		if cacheErr := invalidateTaskBillingCache(owner, tokenID); cacheErr != nil {
			common.SysError("failed to clear image reservation cache: " + cacheErr.Error())
		}
	}
	return err
}

func PendingTaskBillingAdjustments(afterID int64, limit int) ([]Task, error) {
	var pending string
	switch common.MainDatabaseType() {
	case common.DatabaseTypePostgreSQL:
		pending = "private_data->'billing_adjustment' IS NOT NULL AND COALESCE(private_data->'billing_adjustment'->>'logged', 'false') <> 'true'"
	case common.DatabaseTypeSQLite:
		pending = "JSON_EXTRACT(private_data, '$.billing_adjustment') IS NOT NULL AND COALESCE(JSON_EXTRACT(private_data, '$.billing_adjustment.logged'), 0) <> TRUE"
	default:
		pending = "JSON_EXTRACT(private_data, '$.billing_adjustment') IS NOT NULL AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(private_data, '$.billing_adjustment.logged')), 'false') <> 'true'"
	}
	var tasks []Task
	err := DB.Where("id > ?", afterID).
		Where("status IN ?", []TaskStatus{TaskStatusSuccess, TaskStatusFailure}).
		Where(pending).Order("id").Limit(limit).Find(&tasks).Error
	return tasks, err
}

// ApplyTaskBillingAdjustment commits the financial adjustment and its receipt
// together. Missing, soft-deleted tokens are no longer usable and have no
// balance to restore. Deleted wallets are adjusted through their retained row.
func ApplyTaskBillingAdjustment(id int64) error {
	var owner, tokenID int
	err := DB.Transaction(func(tx *gorm.DB) error {
		var task Task
		if err := lockForUpdate(tx).First(&task, id).Error; err != nil {
			return err
		}
		adjustment := task.PrivateData.BillingAdjustment
		if adjustment == nil || adjustment.Applied {
			return nil
		}
		if task.Status != TaskStatusSuccess && task.Status != TaskStatusFailure {
			return errors.New("task billing adjustment requires a terminal task")
		}
		if adjustment.TargetQuota < 0 || (adjustment.Refund && (task.Status != TaskStatusFailure || adjustment.TargetQuota != 0)) ||
			(!adjustment.Refund && task.Status != TaskStatusSuccess) {
			return errors.New("task billing adjustment does not match terminal state")
		}
		delta := adjustment.TargetQuota - task.Quota
		owner, tokenID = task.UserId, task.PrivateData.TokenId
		if delta != 0 {
			switch task.PrivateData.BillingSource {
			case "image_benefit":
			case "subscription":
				var subscription UserSubscription
				if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", task.PrivateData.SubscriptionId, owner).First(&subscription).Error; err != nil {
					return err
				}
				if err := postConsumeUserSubscriptionDeltaWithTx(tx, task.PrivateData.SubscriptionId, int64(delta)); err != nil {
					return err
				}
			default:
				result := tx.Unscoped().Model(&User{}).Where("id = ?", owner).
					Update("quota", gorm.Expr("quota - ?", delta))
				if result.Error != nil {
					return result.Error
				}
				if result.RowsAffected != 1 {
					return errors.New("task billing wallet not found")
				}
			}
			if tokenID > 0 {
				if err := adjustTaskTokenWithTx(tx, owner, tokenID, delta, false); err != nil {
					return err
				}
			}
		}
		usage := delta
		if adjustment.RecordUsage {
			usage = adjustment.TargetQuota
		}
		if usage > 0 {
			userFields := map[string]any{"used_quota": gorm.Expr("used_quota + ?", usage)}
			if adjustment.RecordUsage {
				userFields["request_count"] = gorm.Expr("request_count + 1")
			}
			if err := tx.Unscoped().Model(&User{}).Where("id = ?", owner).Updates(userFields).Error; err != nil {
				return err
			}
			if task.ChannelId > 0 {
				if err := tx.Model(&Channel{}).Where("id = ?", task.ChannelId).
					Update("used_quota", gorm.Expr("used_quota + ?", usage)).Error; err != nil {
					return err
				}
			}
		}
		adjustment.Applied = true
		adjustment.Delta = delta
		adjustment.AsOf = common.GetTimestamp()
		return tx.Model(&task).Updates(map[string]any{
			"quota": adjustment.TargetQuota, "private_data": task.PrivateData,
		}).Error
	})
	if err != nil {
		return err
	}
	// A crash after commit still leaves the receipt discoverable by the poller.
	// Cache invalidations are repeated by the log step before it marks completion.
	if owner > 0 {
		return invalidateTaskBillingCache(owner, tokenID)
	}
	return nil
}

func adjustTaskTokenWithTx(tx *gorm.DB, owner, tokenID, delta int, required bool) error {
	var token Token
	err := lockForUpdate(tx).Where("id = ? AND user_id = ?", tokenID, owner).First(&token).Error
	if errors.Is(err, gorm.ErrRecordNotFound) && !required {
		return nil
	}
	if err != nil {
		return err
	}
	if required && (token.Status != common.TokenStatusEnabled || (token.ExpiredTime != -1 && token.ExpiredTime <= common.GetTimestamp())) {
		return errors.New("image task token is no longer valid")
	}
	if delta > 0 && !token.UnlimitedQuota && token.RemainQuota < delta {
		return errors.New("token quota is not enough for task settlement")
	}
	updates := map[string]any{
		"used_quota": gorm.Expr("used_quota + ?", delta), "accessed_time": common.GetTimestamp(),
	}
	if !token.UnlimitedQuota {
		updates["remain_quota"] = gorm.Expr("remain_quota - ?", delta)
	}
	return tx.Model(&token).Updates(updates).Error
}

// SettleImageQuota updates the funding source and token in one transaction.
func SettleImageQuota(owner, tokenID, subscriptionID int, source string, delta int) error {
	if delta == 0 {
		return nil
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		switch source {
		case "image_benefit":
		case "subscription":
			var subscription UserSubscription
			if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", subscriptionID, owner).First(&subscription).Error; err != nil {
				return err
			}
			if err := postConsumeUserSubscriptionDeltaWithTx(tx, subscriptionID, int64(delta)); err != nil {
				return err
			}
		default:
			q := tx.Model(&User{}).Where("id = ?", owner)
			if delta > 0 {
				q = q.Where("quota >= ?", delta)
			}
			result := q.Update("quota", gorm.Expr("quota - ?", delta))
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrUserQuotaInsufficient
			}
		}
		if tokenID > 0 {
			return adjustTaskTokenWithTx(tx, owner, tokenID, delta, false)
		}
		return nil
	})
	if err == nil {
		if cacheErr := invalidateTaskBillingCache(owner, tokenID); cacheErr != nil {
			common.SysError("failed to clear image billing cache: " + cacheErr.Error())
		}
	}
	return err
}

func invalidateTaskBillingCache(owner, tokenID int) error {
	if err := InvalidateUserCache(owner); err != nil {
		return err
	}
	if !common.RedisEnabled || tokenID <= 0 {
		return nil
	}
	var token Token
	err := DB.Select(commonKeyCol).Where("id = ? AND user_id = ?", tokenID, owner).First(&token).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	return cacheDeleteToken(token.Key)
}

// RecordTaskBillingAdjustment writes the receipt once, including when the
// deployment uses a separate log database. The task lock serializes attempts.
func RecordTaskBillingAdjustment(id int64, logParams func(*Task) RecordTaskBillingLogParams) error {
	var task Task
	if err := DB.First(&task, id).Error; err != nil {
		return err
	}
	if a := task.PrivateData.BillingAdjustment; a == nil || !a.Applied || a.Logged {
		return nil
	}
	if err := invalidateTaskBillingCache(task.UserId, task.PrivateData.TokenId); err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).First(&task, id).Error; err != nil {
			return err
		}
		a := task.PrivateData.BillingAdjustment
		if a == nil || !a.Applied || a.Logged {
			return nil
		}
		if a.Delta != 0 {
			params := logParams(&task)
			if params.LogType != LogTypeConsume || common.LogConsumeEnabled {
				logDB := LOG_DB
				if logDB == nil || logDB == DB {
					logDB = tx
				}
				requestID := fmt.Sprintf("task-billing-adjustment-%d", task.ID)
				var count int64
				if err := logDB.Model(&Log{}).Where("request_id = ?", requestID).Count(&count).Error; err != nil {
					return err
				}
				if count == 0 {
					var username string
					if err := tx.Unscoped().Model(&User{}).Where("id = ?", task.UserId).Select("username").Find(&username).Error; err != nil {
						return err
					}
					log := Log{UserId: task.UserId, Username: username, CreatedAt: a.AsOf, Type: params.LogType,
						Content: params.Content, TokenName: "task", ModelName: params.ModelName,
						Quota: params.Quota, ChannelId: params.ChannelId, TokenId: params.TokenId, Group: params.Group,
						RequestId: requestID, Other: common.MapToJsonStr(params.Other)}
					if err := logDB.Create(&log).Error; err != nil {
						return err
					}
				}
			}
		}
		if task.Platform == constant.TaskPlatformPlaygroundImage && (a.RecordUsage || a.Refund) {
			logDB := LOG_DB
			if logDB == nil || logDB == DB {
				logDB = tx
			}
			if err := updateImageTaskAccountingLog(logDB, &task, a); err != nil {
				return err
			}
		}
		a.Logged = true
		return tx.Model(&task).Update("private_data", task.PrivateData).Error
	})
}

func updateImageTaskAccountingLog(db *gorm.DB, task *Task, a *TaskBillingAdjustment) error {
	var payload struct {
		RequestID string `json:"request_id"`
	}
	if json.Unmarshal(task.Data, &payload) != nil || payload.RequestID == "" {
		return nil
	}
	var logs []Log
	if err := db.Where("user_id = ? AND request_id = ?", task.UserId, payload.RequestID).Limit(32).Find(&logs).Error; err != nil {
		return err
	}
	for _, log := range logs {
		other, err := common.StrToMap(log.Other)
		if err != nil || fmt.Sprint(other["task_id"]) != task.TaskID {
			continue
		}
		other["actual_quota"] = a.TargetQuota
		other["charged_quota"] = a.TargetQuota
		other["billing_settlement"] = "image_delivery_settled"
		if a.Refund {
			other["billing_settlement"] = "image_task_refunded"
		}
		if err := db.Model(&Log{}).Where("id = ?", log.Id).Update("other", common.MapToJsonStr(other)).Error; err != nil {
			return err
		}
	}
	return nil
}
