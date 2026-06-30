package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUpdatePlaygroundImageTaskConsumeLogResultCreatesStandaloneLogWhenSourceMissing(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Log{}))

	oldLogDB := LOG_DB
	LOG_DB = db
	t.Cleanup(func() {
		LOG_DB = oldLogDB
	})

	const (
		userID    = 1088
		requestID = "req-image-receipt"
		taskID    = "task-image-receipt"
	)

	err = UpdatePlaygroundImageTaskConsumeLogResult(
		userID,
		requestID,
		taskID,
		"https://cdn.example.com/image.png",
		1700000000,
		string(TaskStatusSuccess),
		map[string]interface{}{
			"actual_quota": 22,
			"channel_id":   17,
			"use_time":     6,
			"token_name":   "playground-default",
			"model_name":   "gpt-image-2-4K",
			"group":        "default",
		},
	)
	require.NoError(t, err)

	var logs []Log
	require.NoError(t, LOG_DB.Where("user_id = ?", userID).Order("id asc").Find(&logs).Error)
	require.Len(t, logs, 1)

	receipt := logs[0]
	require.Equal(t, LogTypeConsume, receipt.Type)
	require.Equal(t, "媒体工坊图片任务完成", receipt.Content)
	require.Equal(t, requestID, receipt.RequestId)
	require.Equal(t, 17, receipt.ChannelId)
	require.Equal(t, 0, receipt.Quota)

	other, err := common.StrToMap(receipt.Other)
	require.NoError(t, err)
	require.Equal(t, "completed", other["request_phase"])
	require.Equal(t, "SUCCESS", other["task_status"])
	require.Equal(t, "image", other["media_kind"])
	require.Equal(t, true, other["playground_image_task"])
	require.Equal(t, true, other["playground_image_completion_log"])
	require.Equal(t, "standalone", other["completion_log_kind"])
	require.Equal(t, float64(0), other["receipt_quota"])
	require.Equal(t, float64(22), other["original_quota"])
	require.Equal(t, float64(17), other["channel_id"])
	require.Equal(t, float64(6), other["use_time"])
	require.Equal(t, taskID, other["task_id"])
	require.Equal(t, requestID, other["request_id"])
	require.Equal(t, "https://cdn.example.com/image.png", other["result_url"])
	require.Equal(t, "https://cdn.example.com/image.png", other["cached_url"])
}

func TestUpdatePlaygroundImageTaskConsumeLogResultCreatesReceiptAlongsideSubmittedLog(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Log{}))

	oldLogDB := LOG_DB
	LOG_DB = db
	t.Cleanup(func() {
		LOG_DB = oldLogDB
	})

	const (
		userID    = 1099
		requestID = "req-image-receipt-existing"
		taskID    = "task-image-receipt-existing"
	)

	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    userID,
		Username:  "test-user",
		CreatedAt: 1,
		Type:      LogTypeConsume,
		Content:   "媒体工坊图片任务生成中",
		Quota:     88,
		RequestId: requestID,
		Other: common.MapToJsonStr(map[string]interface{}{
			"task_id":               taskID,
			"request_id":            requestID,
			"request_phase":         "submitted",
			"task_status":           "SUBMITTED",
			"playground_image_task": true,
		}),
	}).Error)

	err = UpdatePlaygroundImageTaskConsumeLogResult(
		userID,
		requestID,
		taskID,
		"https://cdn.example.com/image-result.png",
		1700000001,
		string(TaskStatusSuccess),
		map[string]interface{}{
			"actual_quota": 88,
			"channel_id":   19,
			"use_time":     7,
			"token_name":   "playground-default",
			"model_name":   "gpt-image-2-4K",
			"group":        "default",
		},
	)
	require.NoError(t, err)

	var logs []Log
	require.NoError(t, LOG_DB.Where("user_id = ?", userID).Order("id asc").Find(&logs).Error)
	require.Len(t, logs, 2)

	submitted := logs[0]
	require.Equal(t, "媒体工坊图片任务生成中", submitted.Content)
	submittedOther, err := common.StrToMap(submitted.Other)
	require.NoError(t, err)
	require.Equal(t, "completed", submittedOther["request_phase"])
	require.Equal(t, "SUCCESS", submittedOther["task_status"])
	require.Equal(t, "image", submittedOther["media_kind"])
	require.Equal(t, "https://cdn.example.com/image-result.png", submittedOther["result_url"])

	receipt := logs[1]
	require.Equal(t, "媒体工坊图片任务完成", receipt.Content)
	require.Equal(t, 0, receipt.Quota)
	receiptOther, err := common.StrToMap(receipt.Other)
	require.NoError(t, err)
	require.Equal(t, "receipt", receiptOther["completion_log_kind"])
	require.Equal(t, true, receiptOther["playground_image_completion_log"])
	require.Equal(t, float64(88), receiptOther["original_quota"])
	require.Equal(t, float64(0), receiptOther["receipt_quota"])
	require.Equal(t, float64(19), receiptOther["channel_id"])
	require.Equal(t, taskID, receiptOther["task_id"])
	require.Equal(t, requestID, receiptOther["request_id"])
	require.Equal(t, "https://cdn.example.com/image-result.png", receiptOther["result_url"])
}
