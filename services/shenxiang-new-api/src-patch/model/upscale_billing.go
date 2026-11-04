package model

import (
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"time"
)

// UpscaleTaskTransaction serializes state transitions across API requests and nodes.
func UpscaleTaskTransaction(id string, change func(*gorm.DB, *Task) error) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var task Task
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("task_id = ? AND platform = ?", id, "playground_upscale").First(&task).Error; err != nil {
			return err
		}
		if err := change(tx, &task); err != nil {
			return err
		}
		return tx.Save(&task).Error
	})
}

var ErrUpscaleTaskExists = errors.New("upscale task already exists")

// ReserveUpscaleTask atomically creates the durable request, wallet reservation and audit row.
func ReserveUpscaleTask(task *Task, tokenID int) error {
	if LOG_DB != nil && LOG_DB != DB {
		return errors.New("放大账务需要同库事务")
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		if task.Quota <= 0 {
			return errors.New("放大价格尚未配置")
		}
		var owner User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", task.UserId).First(&owner).Error; err != nil {
			return err
		}
		var existing Task
		if err := tx.Where("task_id = ? AND user_id = ? AND platform = ?", task.TaskID, task.UserId, task.Platform).First(&existing).Error; err == nil {
			return ErrUpscaleTaskExists
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		q := tx.Model(&User{}).Where("id = ? AND status = 1 AND quota >= ?", task.UserId, task.Quota).Updates(map[string]interface{}{"quota": gorm.Expr("quota - ?", task.Quota), "used_quota": gorm.Expr("used_quota + ?", task.Quota)})
		if q.Error != nil {
			return q.Error
		}
		if q.RowsAffected != 1 {
			return errors.New("余额不足，请先充值")
		}
		if tokenID > 0 {
			var token Token
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ? AND status = 1", tokenID, task.UserId).First(&token).Error; err != nil {
				return errors.New("令牌不可用")
			}
			if token.ExpiredTime != -1 && token.ExpiredTime <= time.Now().Unix() {
				return errors.New("令牌已过期")
			}
			if !token.UnlimitedQuota && token.RemainQuota < task.Quota {
				return errors.New("令牌额度不足")
			}
			updates := map[string]interface{}{"used_quota": gorm.Expr("used_quota + ?", task.Quota)}
			if !token.UnlimitedQuota {
				updates["remain_quota"] = gorm.Expr("remain_quota - ?", task.Quota)
			}
			if err := tx.Model(&token).Updates(updates).Error; err != nil {
				return err
			}
		}
		if err := tx.Create(task).Error; err != nil {
			return err
		}
		other, _ := json.Marshal(map[string]interface{}{"task_id": task.TaskID, "billing_source": "wallet", "billing_settlement": "upscale_reserved", "currency": "CNY", "request_path": "/pg/upscale/tasks"})
		return tx.Create(&Log{UserId: task.UserId, CreatedAt: time.Now().Unix(), Type: LogTypeConsume, ModelName: task.Properties.OriginModelName, Quota: task.Quota, TokenId: tokenID, ChannelId: task.ChannelId, Group: task.Group, Content: "高清放大任务预扣费", Other: string(other)}).Error
	})
	if err == nil {
		_ = InvalidateUserCache(task.UserId)
		_ = InvalidateUserTokensCache(task.UserId)
	}
	return err
}

// RefundUnacceptedUpscaleTask refunds only a persisted reservation for a proven rejection.
// Ambiguous network failures and accepted upstream failures deliberately retain the reservation.
func RefundUnacceptedUpscaleTask(task *Task, tx *gorm.DB) error {
	var data map[string]interface{}
	if err := json.Unmarshal(task.Data, &data); err != nil {
		return err
	}
	if data["billing_state"] != "reserved" && data["billing_state"] != "submitting" {
		return errors.New("当前任务不能退款")
	}
	if task.PrivateData.UpstreamTaskID != "" {
		return errors.New("任务已受理，不能退款")
	}
	if err := tx.Model(&User{}).Where("id = ?", task.UserId).Updates(map[string]interface{}{"quota": gorm.Expr("quota + ?", task.Quota), "used_quota": gorm.Expr("used_quota - ?", task.Quota)}).Error; err != nil {
		return err
	}
	if task.PrivateData.TokenId > 0 {
		var token Token
		if err := tx.Where("id = ? AND user_id = ?", task.PrivateData.TokenId, task.UserId).First(&token).Error; err != nil {
			return err
		}
		u := map[string]interface{}{"used_quota": gorm.Expr("used_quota - ?", task.Quota)}
		if !token.UnlimitedQuota {
			u["remain_quota"] = gorm.Expr("remain_quota + ?", task.Quota)
		}
		if err := tx.Model(&token).Updates(u).Error; err != nil {
			return err
		}
	}
	other, _ := json.Marshal(map[string]interface{}{"task_id": task.TaskID, "billing_settlement": "upscale_unaccepted_refund", "currency": "CNY"})
	if err := tx.Create(&Log{UserId: task.UserId, CreatedAt: time.Now().Unix(), Type: LogTypeRefund, ModelName: task.Properties.OriginModelName, Quota: task.Quota, TokenId: task.PrivateData.TokenId, Content: "高清放大未受理，退回预扣费用", Other: string(other)}).Error; err != nil {
		return err
	}
	data["billing_state"] = "refunded"
	task.SetData(data)
	return nil
}
