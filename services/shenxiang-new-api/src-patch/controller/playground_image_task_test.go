package controller

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestNormalizePlaygroundImageTaskPayloadAddsGeminiImageConfig(t *testing.T) {
	raw := []byte(`{
		"model":"banana-2",
		"prompt":"test image",
		"responseFormat":{"image":{"aspectRatio":"9:16","imageSize":"2K"}},
		"generationConfig":{"responseFormat":{"image":{"aspectRatio":"9:16","imageSize":"2K"}}}
	}`)
	var request dto.ImageRequest
	require.NoError(t, json.Unmarshal(raw, &request))

	normalized, changed := normalizePlaygroundImageTaskPayload(raw, &request)
	require.True(t, changed)
	require.Equal(t, "9:16", request.AspectRatio)
	require.Equal(t, "2K", request.Resolution)
	require.Equal(t, "2K", request.ImageSize)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(normalized, &payload))
	require.Equal(t, "9:16", payload["aspect_ratio"])
	require.Equal(t, "2K", payload["resolution"])
	require.Equal(t, "2K", payload["image_size"])
	extraBody := payload["extra_body"].(map[string]any)
	google := extraBody["google"].(map[string]any)
	imageConfig := google["image_config"].(map[string]any)
	require.Equal(t, "9:16", imageConfig["aspect_ratio"])
	require.Equal(t, "2K", imageConfig["image_size"])
}

func TestMarkPlaygroundImageTaskLogFailureConvertsConsumeLogToError(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	oldLogDB := model.LOG_DB
	model.LOG_DB = db
	t.Cleanup(func() {
		model.LOG_DB = oldLogDB
	})
	require.NoError(t, model.LOG_DB.Exec("DELETE FROM logs").Error)

	requestID := "req-image-failure"
	task := &model.Task{
		TaskID:     "task-image-failure",
		UserId:     1001,
		ChannelId:  16,
		Group:      "default",
		Quota:      123,
		StartTime:  time.Now().Add(-4 * time.Second).Unix(),
		FinishTime: time.Now().Unix(),
	}
	payload := &playgroundImageTaskPayload{RequestID: requestID}
	initialOther := map[string]interface{}{
		"task_id":               task.TaskID,
		"request_id":            requestID,
		"request_phase":         "submitted",
		"playground_image_task": true,
	}
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId:    task.UserId,
		CreatedAt: common.GetTimestamp(),
		Type:      model.LogTypeConsume,
		Content:   "媒体工坊图片任务生成中",
		ModelName: "gpt-image-2-4K",
		Quota:     task.Quota,
		RequestId: requestID,
		Other:     common.MapToJsonStr(initialOther),
	}).Error)

	markPlaygroundImageTaskLogFailure(task, payload, "provider timed out")

	var log model.Log
	require.NoError(t, model.LOG_DB.Where("request_id = ?", requestID).First(&log).Error)
	require.Equal(t, model.LogTypeError, log.Type)
	require.Equal(t, 0, log.Quota)
	require.Contains(t, log.Content, "媒体工坊图片任务失败")
	other, err := common.StrToMap(log.Other)
	require.NoError(t, err)
	require.Equal(t, "media_task_failed", other["failure_kind"])
	require.Equal(t, "error", other["final_log_type"])
	require.Equal(t, "media_task_failed", other["refund_reason"])
	require.Equal(t, "preconsume_refund_task_failed", other["billing_settlement"])
}
