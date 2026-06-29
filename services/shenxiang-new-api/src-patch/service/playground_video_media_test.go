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
		if r.Header.Get("Authorization") == "Bearer sk-test" {
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
		PrivateData: model.TaskPrivateData{UpstreamTaskID: "upstream_private_success"},
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
		&model.Channel{Id: 23, Key: "sk-test", BaseURL: &upstream.URL},
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
