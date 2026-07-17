package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/require"
)

type playgroundVideoTestAdaptor struct {
	body []byte
}

func (a *playgroundVideoTestAdaptor) Init(info *relaycommon.RelayInfo) {}

func (a *playgroundVideoTestAdaptor) FetchTask(baseURL string, key string, body map[string]any, proxy string) (*http.Response, error) {
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       ioNopCloser{strings.NewReader(string(a.body))},
	}, nil
}

func (a *playgroundVideoTestAdaptor) ParseTaskResult(body []byte) (*relaycommon.TaskInfo, error) {
	var payload struct {
		Status string `json:"status"`
		URL    string `json:"url"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	return &relaycommon.TaskInfo{
		Status: payload.Status,
		Url:    payload.URL,
	}, nil
}

func (a *playgroundVideoTestAdaptor) AdjustBillingOnComplete(task *model.Task, taskResult *relaycommon.TaskInfo) int {
	return 0
}

type ioNopCloser struct {
	*strings.Reader
}

func (c ioNopCloser) Close() error {
	return nil
}

func TestCachePlaygroundVideoTaskResultWritesMediaItem(t *testing.T) {
	truncate(t)
	tmp := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", tmp)
	t.Setenv("PLAYGROUND_MEDIA_URL_PREFIX", "/pg/media/files")
	t.Setenv("PLAYGROUND_MEDIA_MAX_MB", "1")
	t.Setenv("PLAYGROUND_MEDIA_KEEP_MINUTES", "4320")

	task := &model.Task{
		TaskID:    "task_playground_video_success",
		UserId:    1001,
		ChannelId: 23,
		Status:    model.TaskStatusInProgress,
		Progress:  "50%",
		Platform:  constant.TaskPlatform("relaydance-video"),
		Data: json.RawMessage(`{
			"playground_media": {
				"request_id": "req_test_video",
				"prompt": "red cube",
				"model": "seedance-nsfw",
				"workflow": "video",
				"size": "1920x1080",
				"duration": 4,
				"group": "internal",
				"endpoint": "/pg/videos"
			}
		}`),
		PrivateData: model.TaskPrivateData{UpstreamTaskID: "upstream_video_success"},
	}
	require.NoError(t, model.DB.Create(task).Error)
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId:    task.UserId,
		CreatedAt: 1,
		Type:      model.LogTypeConsume,
		ModelName: "seedance-nsfw",
		Other: common.MapToJsonStr(map[string]interface{}{
			"task_id":               task.TaskID,
			"playground_video_task": true,
			"request_phase":         "submitted",
			"task_status":           "SUBMITTED",
		}),
	}).Error)

	body, err := json.Marshal(map[string]any{
		"status": model.TaskStatusSuccess,
		"url":    "data:video/mp4;base64,ZmFrZSBtcDQgYnl0ZXM=",
	})
	require.NoError(t, err)

	err = updateVideoSingleTask(context.Background(), &playgroundVideoTestAdaptor{body: body}, &model.Channel{Id: 23, Key: "sk-test"}, "upstream_video_success", map[string]*model.Task{
		"upstream_video_success": task,
	})
	require.NoError(t, err)

	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, "task_id = ?", task.TaskID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusSuccess), reloaded.Status)
	require.Contains(t, reloaded.GetResultURL(), "/pg/media/files/u-1001/")
	var log model.Log
	require.NoError(t, model.LOG_DB.First(&log, "user_id = ? AND type = ?", task.UserId, model.LogTypeConsume).Error)
	other, err := common.StrToMap(log.Other)
	require.NoError(t, err)
	require.Equal(t, "completed", other["request_phase"])
	require.Equal(t, "SUCCESS", other["task_status"])
	require.Equal(t, "video", other["media_kind"])
	require.Equal(t, "upstream_video_success", other["upstream_task_id"])
	require.Contains(t, other["cached_url"], "/pg/media/files/u-1001/")

	userDir := filepath.Join(tmp, "u-1001")
	entries, err := os.ReadDir(userDir)
	require.NoError(t, err)
	var mediaFiles int
	var metadataFiles int
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".json") {
			metadataFiles++
			data, err := os.ReadFile(filepath.Join(userDir, entry.Name()))
			require.NoError(t, err)
			require.Contains(t, string(data), `"kind": "video"`)
			require.Contains(t, string(data), `"model": "seedance-nsfw"`)
			continue
		}
		mediaFiles++
		require.Equal(t, ".mp4", filepath.Ext(entry.Name()))
	}
	require.Equal(t, 1, mediaFiles)
	require.Equal(t, 1, metadataFiles)
}

func TestCachePlaygroundVideoTaskResultCreatesCompletionReceiptLog(t *testing.T) {
	truncate(t)
	tmp := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", tmp)
	t.Setenv("PLAYGROUND_MEDIA_URL_PREFIX", "/pg/media/files")
	t.Setenv("PLAYGROUND_MEDIA_MAX_MB", "1")
	t.Setenv("PLAYGROUND_MEDIA_KEEP_MINUTES", "4320")

	task := &model.Task{
		TaskID:     "task_receipt_video_success",
		UserId:     1005,
		ChannelId:  26,
		Status:     model.TaskStatusInProgress,
		Progress:   "50%",
		Platform:   constant.TaskPlatform("relaydance-video"),
		Group:      "default",
		StartTime:  100,
		FinishTime: 0,
		Data: json.RawMessage(`{
			"playground_media": {
				"request_id": "req_receipt_video",
				"prompt": "poster in the wind",
				"model": "seedance-2.0-ld-17",
				"workflow": "video",
				"size": "1280x720",
				"duration": 15,
				"group": "default",
				"endpoint": "/pg/videos"
			}
		}`),
		PrivateData: model.TaskPrivateData{
			UpstreamTaskID: "upstream_receipt_video_success",
			TokenId:        252,
			BillingContext: &model.TaskBillingContext{
				OriginModelName: "seedance-2.0-ld-17",
				ModelPrice:      0.88,
				GroupRatio:      1,
				PerCallBilling:  true,
			},
		},
		Properties: model.Properties{OriginModelName: "seedance-2.0-ld-17"},
		Quota:      443835,
	}
	require.NoError(t, model.DB.Create(task).Error)
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId:    task.UserId,
		Username:  "receipt-user",
		CreatedAt: 1,
		Type:      model.LogTypeConsume,
		Content:   "操作 textGenerate",
		ModelName: "seedance-2.0-ld-17",
		TokenName: "playground-default",
		Quota:     task.Quota,
		ChannelId: task.ChannelId,
		TokenId:   252,
		Group:     "default",
		RequestId: "req_receipt_video",
		Other: common.MapToJsonStr(map[string]interface{}{
			"task_id":               task.TaskID,
			"request_path":          "/pg/videos",
			"playground_video_task": true,
			"request_phase":         "submitted",
			"task_status":           "SUBMITTED",
			"media_kind":            "video",
		}),
	}).Error)

	body, err := json.Marshal(map[string]any{
		"status": model.TaskStatusSuccess,
		"url":    "data:video/mp4;base64,ZmFrZSBtcDQgYnl0ZXM=",
	})
	require.NoError(t, err)

	err = updateVideoSingleTask(context.Background(), &playgroundVideoTestAdaptor{body: body}, &model.Channel{Id: 26, Key: "sk-test"}, "upstream_receipt_video_success", map[string]*model.Task{
		"upstream_receipt_video_success": task,
	})
	require.NoError(t, err)

	var logs []model.Log
	require.NoError(t, model.LOG_DB.Where("user_id = ?", task.UserId).Order("id asc").Find(&logs).Error)
	require.Len(t, logs, 2)
	require.Equal(t, "操作 textGenerate", logs[0].Content)
	require.Equal(t, task.Quota, logs[0].Quota)
	require.Equal(t, "媒体工坊视频任务完成", logs[1].Content)
	require.Equal(t, 0, logs[1].Quota)

	submittedOther, err := common.StrToMap(logs[0].Other)
	require.NoError(t, err)
	require.Equal(t, "completed", submittedOther["request_phase"])
	require.Equal(t, "SUCCESS", submittedOther["task_status"])
	require.Equal(t, "upstream_receipt_video_success", submittedOther["upstream_task_id"])

	receiptOther, err := common.StrToMap(logs[1].Other)
	require.NoError(t, err)
	require.Equal(t, "completed", receiptOther["request_phase"])
	require.Equal(t, "SUCCESS", receiptOther["task_status"])
	require.Equal(t, "video", receiptOther["media_kind"])
	require.Equal(t, true, receiptOther["playground_video_task"])
	require.Equal(t, true, receiptOther["playground_video_completion_log"])
	require.Equal(t, "receipt", receiptOther["completion_log_kind"])
	require.Equal(t, float64(logs[0].Id), receiptOther["source_log_id"])
	require.Equal(t, float64(0), receiptOther["receipt_quota"])
	require.Equal(t, float64(task.Quota), receiptOther["original_quota"])
	require.Equal(t, task.TaskID, receiptOther["task_id"])
	require.Equal(t, "upstream_receipt_video_success", receiptOther["upstream_task_id"])
	require.Contains(t, receiptOther["cached_url"], "/pg/media/files/u-1005/")

	err = updateVideoSingleTask(context.Background(), &playgroundVideoTestAdaptor{body: body}, &model.Channel{Id: 26, Key: "sk-test"}, "upstream_receipt_video_success", map[string]*model.Task{
		"upstream_receipt_video_success": task,
	})
	require.NoError(t, err)
	var count int64
	require.NoError(t, model.LOG_DB.Model(&model.Log{}).Where("user_id = ?", task.UserId).Count(&count).Error)
	require.Equal(t, int64(2), count)
}

func TestCachePlaygroundVideoTaskResultCreatesLogWhenSubmittedLogMissing(t *testing.T) {
	truncate(t)
	tmp := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", tmp)
	t.Setenv("PLAYGROUND_MEDIA_URL_PREFIX", "/pg/media/files")
	t.Setenv("PLAYGROUND_MEDIA_MAX_MB", "1")
	t.Setenv("PLAYGROUND_MEDIA_KEEP_MINUTES", "4320")

	task := &model.Task{
		TaskID:    "task_missing_log_video_success",
		UserId:    1004,
		ChannelId: 26,
		Status:    model.TaskStatusInProgress,
		Progress:  "50%",
		Platform:  constant.TaskPlatform("relaydance-video"),
		Group:     "default",
		Data: json.RawMessage(`{
			"playground_media": {
				"request_id": "req_missing_video",
				"prompt": "wind moves a poster",
				"model": "seedance-2.0-ld-17",
				"workflow": "video",
				"size": "1280x720",
				"duration": 15,
				"group": "default",
				"endpoint": "/pg/videos"
			}
		}`),
		PrivateData: model.TaskPrivateData{
			UpstreamTaskID: "task_upstream_missing_log_success",
			TokenId:        252,
			BillingContext: &model.TaskBillingContext{
				OriginModelName: "seedance-2.0-ld-17",
				ModelPrice:      0.88,
				GroupRatio:      1,
				PerCallBilling:  true,
			},
		},
		Properties: model.Properties{OriginModelName: "seedance-2.0-ld-17"},
		Quota:      443835,
	}
	require.NoError(t, model.DB.Create(task).Error)

	body, err := json.Marshal(map[string]any{
		"status": model.TaskStatusSuccess,
		"url":    "data:video/mp4;base64,ZmFrZSBtcDQgYnl0ZXM=",
	})
	require.NoError(t, err)

	err = updateVideoSingleTask(context.Background(), &playgroundVideoTestAdaptor{body: body}, &model.Channel{Id: 26, Key: "sk-test"}, "task_upstream_missing_log_success", map[string]*model.Task{
		"task_upstream_missing_log_success": task,
	})
	require.NoError(t, err)

	var log model.Log
	require.NoError(t, model.LOG_DB.First(&log, "user_id = ? AND type = ?", task.UserId, model.LogTypeConsume).Error)
	require.Equal(t, "媒体工坊视频任务完成", log.Content)
	require.Equal(t, "seedance-2.0-ld-17", log.ModelName)
	require.Equal(t, 0, log.Quota)
	require.Equal(t, 26, log.ChannelId)
	require.Equal(t, 252, log.TokenId)
	other, err := common.StrToMap(log.Other)
	require.NoError(t, err)
	require.Equal(t, "completed", other["request_phase"])
	require.Equal(t, "SUCCESS", other["task_status"])
	require.Equal(t, "video", other["media_kind"])
	require.Equal(t, task.TaskID, other["task_id"])
	require.Equal(t, "task_upstream_missing_log_success", other["upstream_task_id"])
	require.Equal(t, true, other["playground_video_completion_log"])
	require.Equal(t, "standalone", other["completion_log_kind"])
	require.Equal(t, float64(0), other["receipt_quota"])
	require.Equal(t, float64(443835), other["original_quota"])
	require.Contains(t, other["cached_url"], "/pg/media/files/u-1004/")
}

func TestCachePlaygroundVideoTaskResultCachesPlainVideoTask(t *testing.T) {
	truncate(t)
	tmp := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", tmp)
	t.Setenv("PLAYGROUND_MEDIA_URL_PREFIX", "/pg/media/files")
	t.Setenv("PLAYGROUND_MEDIA_MAX_MB", "1")
	t.Setenv("PLAYGROUND_MEDIA_KEEP_MINUTES", "4320")
	task := &model.Task{
		TaskID:      "task_plain_video_success",
		UserId:      1002,
		ChannelId:   23,
		Status:      model.TaskStatusInProgress,
		Progress:    "50%",
		Platform:    constant.TaskPlatform("relaydance-video"),
		Data:        json.RawMessage(`{}`),
		PrivateData: model.TaskPrivateData{UpstreamTaskID: "upstream_plain_success"},
	}
	require.NoError(t, model.DB.Create(task).Error)
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId:    task.UserId,
		CreatedAt: 1,
		Type:      model.LogTypeConsume,
		ModelName: "seedance-nsfw",
		Other: common.MapToJsonStr(map[string]interface{}{
			"task_id":       task.TaskID,
			"request_path":  "/v1/videos",
			"request_phase": "submitted",
			"task_status":   "SUBMITTED",
			"media_kind":    "video",
		}),
	}).Error)

	body, err := json.Marshal(map[string]any{
		"status": model.TaskStatusSuccess,
		"url":    "data:video/mp4;base64,ZmFrZSBtcDQgYnl0ZXM=",
	})
	require.NoError(t, err)

	err = updateVideoSingleTask(context.Background(), &playgroundVideoTestAdaptor{body: body}, &model.Channel{Id: 23, Key: "sk-test"}, "upstream_plain_success", map[string]*model.Task{
		"upstream_plain_success": task,
	})
	require.NoError(t, err)

	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, "task_id = ?", task.TaskID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusSuccess), reloaded.Status)
	require.Contains(t, reloaded.GetResultURL(), "/pg/media/files/u-1002/")
	var log model.Log
	require.NoError(t, model.LOG_DB.First(&log, "user_id = ? AND type = ?", task.UserId, model.LogTypeConsume).Error)
	other, err := common.StrToMap(log.Other)
	require.NoError(t, err)
	require.Equal(t, "completed", other["request_phase"])
	require.Equal(t, "SUCCESS", other["task_status"])
	require.Equal(t, "video", other["media_kind"])
	require.Contains(t, other["result_url"], "/pg/media/files/u-1002/")
	require.Contains(t, other["video_url"], "/pg/media/files/u-1002/")
	require.Contains(t, other["cached_url"], "/pg/media/files/u-1002/")
	entries, err := os.ReadDir(filepath.Join(tmp, "u-1002"))
	require.NoError(t, err)
	require.NotEmpty(t, entries)
}

func TestCachePlaygroundVideoTaskResultFallsBackToAuthenticatedUpstreamContent(t *testing.T) {
	truncate(t)
	tmp := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", tmp)
	t.Setenv("PLAYGROUND_MEDIA_URL_PREFIX", "/pg/media/files")
	t.Setenv("PLAYGROUND_MEDIA_MAX_MB", "1")
	t.Setenv("PLAYGROUND_MEDIA_KEEP_MINUTES", "4320")

	var sawAuth bool
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/videos/upstream_private_success/content", r.URL.Path)
		if r.Header.Get("Authorization") == "Bearer saved-task-key" {
			sawAuth = true
		}
		w.Header().Set("Content-Type", "video/mp4")
		_, _ = w.Write([]byte("fake mp4 bytes"))
	}))
	defer upstream.Close()

	task := &model.Task{
		TaskID:    "task_private_video_success",
		UserId:    1003,
		ChannelId: 23,
		Status:    model.TaskStatusInProgress,
		Progress:  "50%",
		Platform:  constant.TaskPlatform("relaydance-video"),
		Data: json.RawMessage(`{
			"playground_media": {
				"request_id": "req_private_video",
				"prompt": "@image1 move this image",
				"model": "seedance-nsfw",
				"workflow": "video",
				"size": "720x1280",
				"duration": 4,
				"group": "internal",
				"endpoint": "/pg/videos"
			}
		}`),
		PrivateData: model.TaskPrivateData{
			Key:            "saved-task-key",
			UpstreamTaskID: "upstream_private_success",
		},
	}
	require.NoError(t, model.DB.Create(task).Error)
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId:    task.UserId,
		CreatedAt: 1,
		Type:      model.LogTypeConsume,
		ModelName: "seedance-nsfw",
		Other: common.MapToJsonStr(map[string]interface{}{
			"task_id":               task.TaskID,
			"request_path":          "/pg/videos",
			"playground_video_task": true,
			"request_phase":         "submitted",
			"task_status":           "SUBMITTED",
			"media_kind":            "video",
		}),
	}).Error)

	body, err := json.Marshal(map[string]any{
		"status": model.TaskStatusSuccess,
	})
	require.NoError(t, err)

	err = updateVideoSingleTask(
		context.Background(),
		&playgroundVideoTestAdaptor{body: body},
		&model.Channel{Id: 23, Key: "rotated-channel-key", BaseURL: &upstream.URL},
		"upstream_private_success",
		map[string]*model.Task{"upstream_private_success": task},
	)
	require.NoError(t, err)
	require.True(t, sawAuth, "upstream content fallback must send channel authorization")

	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, "task_id = ?", task.TaskID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusSuccess), reloaded.Status)
	require.Contains(t, reloaded.GetResultURL(), "/pg/media/files/u-1003/")
	var log model.Log
	require.NoError(t, model.LOG_DB.First(&log, "user_id = ? AND type = ?", task.UserId, model.LogTypeConsume).Error)
	other, err := common.StrToMap(log.Other)
	require.NoError(t, err)
	require.Equal(t, "completed", other["request_phase"])
	require.Equal(t, "video", other["media_kind"])
	require.Contains(t, other["cached_url"], "/pg/media/files/u-1003/")
}

func TestVideoPollingKeepsTemporaryLookupFailurePending(t *testing.T) {
	truncate(t)
	task := &model.Task{
		TaskID:    "task_video_lookup_pending",
		UserId:    1006,
		ChannelId: 26,
		Status:    model.TaskStatusInProgress,
		Progress:  "50%",
		Platform:  constant.TaskPlatform("relaydance-video"),
		Quota:     443835,
		PrivateData: model.TaskPrivateData{
			Key:            "saved-task-key",
			UpstreamTaskID: "upstream_lookup_pending",
		},
		Properties: model.Properties{
			OriginModelName:   "seedance-2.0-ld-17",
			UpstreamModelName: "seedance-2.0-wc-b-720p",
		},
	}
	require.NoError(t, model.DB.Create(task).Error)
	body, err := json.Marshal(map[string]any{
		"status":   model.TaskStatusQueued,
		"progress": 0,
	})
	require.NoError(t, err)

	err = updateVideoSingleTask(
		context.Background(),
		&playgroundVideoTestAdaptor{body: body},
		&model.Channel{Id: 26, Key: "rotated-channel-key"},
		"upstream_lookup_pending",
		map[string]*model.Task{"upstream_lookup_pending": task},
	)
	require.NoError(t, err)

	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, "task_id = ?", task.TaskID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusQueued), reloaded.Status)
	require.Equal(t, task.Quota, reloaded.Quota)
	require.Zero(t, reloaded.FinishTime)
	require.Empty(t, reloaded.FailReason)
}

func TestRedactVideoResponseBodyRemovesProviderDetailsAndDirectURLs(t *testing.T) {
	raw := []byte(`{
		"id":"internal-task-id",
		"task_id":"internal-task-id",
		"model":"internal-video-model",
		"status":"failed",
		"provider_code":"vendor_balance_error",
		"message":"supplier backend rejected the request",
		"result_url":"https://provider.example/video.mp4",
		"data":{"channel_id":27,"error":{"code":"vendor_error","detail":"upstream detail"}}
	}`)
	redacted := redactVideoResponseBody(raw)
	text := strings.ToLower(string(redacted))
	for _, forbidden := range []string{
		"internal-task-id",
		"internal-video-model",
		"vendor_balance_error",
		"supplier",
		"provider.example",
		"channel_id",
		"upstream detail",
	} {
		require.NotContains(t, text, forbidden)
	}
	require.Contains(t, text, `"status":"failed"`)
}
