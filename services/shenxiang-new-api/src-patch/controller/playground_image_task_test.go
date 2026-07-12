package controller

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
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

func TestNormalizePlaygroundImageTaskPayloadConvertsStringN(t *testing.T) {
	raw := []byte(`{
		"model":"gpt-image-2-4K",
		"prompt":"edit poster",
		"n":"1",
		"size":"2048x1152"
	}`)
	request := dto.ImageRequest{
		Model:  "gpt-image-2-4K",
		Prompt: "edit poster",
	}

	normalized, changed := normalizePlaygroundImageTaskPayload(raw, &request)
	require.True(t, changed)
	require.NotNil(t, request.N)
	require.Equal(t, uint(1), *request.N)

	var replay dto.ImageRequest
	require.NoError(t, json.Unmarshal(normalized, &replay))
	require.NotNil(t, replay.N)
	require.Equal(t, uint(1), *replay.N)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(normalized, &payload))
	require.Equal(t, float64(1), payload["n"])
}

func TestNormalizePlaygroundImageTaskPayloadMapsRawGPTImage2ToProductModel(t *testing.T) {
	raw := []byte(`{
		"model":"gpt-image-2",
		"prompt":"poster",
		"resolution":"4K",
		"size":"2160x3840"
	}`)
	request := dto.ImageRequest{
		Model:  "gpt-image-2",
		Prompt: "poster",
	}

	normalized, changed := normalizePlaygroundImageTaskPayload(raw, &request)
	require.True(t, changed)
	require.Equal(t, "gpt-image-2-4K", request.Model)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(normalized, &payload))
	require.Equal(t, "gpt-image-2-4K", payload["model"])
	require.Equal(t, "4K", payload["resolution"])
}

func TestNormalizePlaygroundImageTaskPayloadMapsDiscountImage2PublicAliasToInternalModel(t *testing.T) {
	raw := []byte(`{
		"model":"特价 image-2",
		"prompt":"poster",
		"resolution":"2K",
		"size":"2048x2048"
	}`)
	request := dto.ImageRequest{
		Model:  "特价 image-2",
		Prompt: "poster",
	}

	normalized, changed := normalizePlaygroundImageTaskPayload(raw, &request)
	require.True(t, changed)
	require.Equal(t, "geek2api-image-2", request.Model)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(normalized, &payload))
	require.Equal(t, "geek2api-image-2", payload["model"])
	require.Equal(t, "2K", payload["resolution"])
	require.NotContains(t, payload, "display_model")
}

func TestPlaygroundImageTaskResponsesUseDiscountImage2PublicDisplayName(t *testing.T) {
	task := &model.Task{
		TaskID:     "task-discount-image-2",
		Status:     model.TaskStatusSubmitted,
		Progress:   "10%",
		SubmitTime: time.Now().Unix(),
		Properties: model.Properties{
			Input:           "poster",
			OriginModelName: "geek2api-image-2",
		},
	}
	task.SetData(playgroundImageTaskPayload{
		Model:        "geek2api-image-2",
		DisplayModel: "特价 image-2",
		Prompt:       "poster",
		RequestID:    "req-discount-image-2",
		Item: &playgroundMediaItem{
			ID:          "media-discount-image-2",
			Kind:        "image",
			URL:         "/pg/media/files/u-1/discount.png",
			DisplayURL:  "/pg/media/files/u-1/discount.png",
			CachedURL:   "/pg/media/files/u-1/discount.png",
			Filename:    "discount.png",
			Model:       "geek2api-image-2",
			Status:      "ready",
			CacheStatus: "cached",
			Metadata: map[string]interface{}{
				"model": "geek2api-image-2",
			},
		},
	})

	playgroundResponse := taskToPlaygroundImageTask(task)
	openAIResponse := taskToOpenAIImageTask(task)

	playgroundJSON, err := json.Marshal(playgroundResponse)
	require.NoError(t, err)
	openAIJSON, err := json.Marshal(openAIResponse)
	require.NoError(t, err)

	require.Contains(t, string(playgroundJSON), "特价 image-2")
	require.Contains(t, string(openAIJSON), "特价 image-2")
	require.NotContains(t, string(playgroundJSON), "geek2api")
	require.NotContains(t, string(openAIJSON), "geek2api")
}

func TestPlaygroundImageTaskEditsMultipartReplaysWithNormalizedN(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	require.NoError(t, writer.WriteField("model", "gpt-image-2-4K"))
	require.NoError(t, writer.WriteField("prompt", "edit poster"))
	require.NoError(t, writer.WriteField("n", "1"))
	require.NoError(t, writer.WriteField("size", "2048x1152"))
	require.NoError(t, writer.Close())

	request := httptest.NewRequest(http.MethodPost, "/pg/images/tasks/edits", bytes.NewReader(body.Bytes()))
	request.Header.Set("Content-Type", writer.FormDataContentType())
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = request

	replayPath := resolvePlaygroundImageTaskRequestPath(ctx)
	require.Equal(t, "/pg/images/edits", replayPath)
	require.Equal(t, relayconstant.RelayModeImagesEdits, relayconstant.Path2RelayMode(replayPath))

	var imageReq dto.ImageRequest
	require.NoError(t, parsePlaygroundImageTaskRequest(ctx, &imageReq))
	require.NotNil(t, imageReq.N)
	require.Equal(t, uint(1), *imageReq.N)
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

func TestMarkPlaygroundImageTaskSuccessKeepsFailReasonEmpty(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Task{}, &model.Log{}))
	oldDB := model.DB
	oldLogDB := model.LOG_DB
	model.DB = db
	model.LOG_DB = db
	t.Cleanup(func() {
		model.DB = oldDB
		model.LOG_DB = oldLogDB
	})

	payload := &playgroundImageTaskPayload{
		RequestID: "req-image-success",
		Model:     "image 2电商商品图快速通道(1.5K)",
		Prompt:    "blue square",
		Workflow:  "文生图",
	}
	task := &model.Task{
		TaskID:     "task-image-success",
		Platform:   constant.TaskPlatformPlaygroundImage,
		UserId:     1001,
		Group:      "internal",
		ChannelId:  22,
		Quota:      0,
		Action:     constant.TaskActionImageGenerate,
		Status:     model.TaskStatusInProgress,
		Progress:   "50%",
		SubmitTime: time.Now().Add(-20 * time.Second).Unix(),
		StartTime:  time.Now().Add(-15 * time.Second).Unix(),
		Properties: model.Properties{
			Input:           payload.Prompt,
			OriginModelName: payload.Model,
		},
	}
	task.SetData(payload)
	require.NoError(t, model.DB.Create(task).Error)
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId:    task.UserId,
		Username:  "test-user",
		CreatedAt: common.GetTimestamp(),
		Type:      model.LogTypeConsume,
		Content:   "媒体工坊图片任务生成中",
		ModelName: payload.Model,
		Quota:     task.Quota,
		RequestId: payload.RequestID,
		Other: common.MapToJsonStr(map[string]interface{}{
			"task_id":               task.TaskID,
			"request_id":            payload.RequestID,
			"request_phase":         "submitted",
			"task_status":           string(task.Status),
			"playground_image_task": true,
		}),
	}).Error)

	resultURL := "/pg/media/files/u-1001/image-success.png"
	item := &playgroundMediaItem{
		ID:          "media-image-success",
		Kind:        "image",
		URL:         resultURL,
		DisplayURL:  resultURL,
		CachedURL:   resultURL,
		Filename:    "image-success.png",
		Prompt:      payload.Prompt,
		Model:       payload.Model,
		Workflow:    payload.Workflow,
		Status:      "ready",
		CacheStatus: "cached",
	}

	markPlaygroundImageTaskSuccess(task, item, payload, http.StatusOK, 3767, false)

	var reloaded model.Task
	require.NoError(t, model.DB.Where("task_id = ?", task.TaskID).First(&reloaded).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusSuccess), reloaded.Status)
	require.Empty(t, reloaded.FailReason)
	require.Equal(t, resultURL, reloaded.GetResultURL())
	require.Equal(t, 3767, reloaded.Quota)

	openAIResponse := taskToOpenAIImageTask(&reloaded)
	require.Equal(t, resultURL, openAIResponse["result_url"])
	require.Empty(t, openAIResponse["fail_reason"])
	require.Empty(t, openAIResponse["message"])
	nested, ok := openAIResponse["data"].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, resultURL, nested["result_url"])
	require.Empty(t, nested["fail_reason"])
}

func TestSanitizePlaygroundImageTaskFailureKeepsUpstreamRejectionReason(t *testing.T) {
	reason := `status_code=400, 抱歉，我不能帮你生成这张图片。你可以尝试一种更温和的描述。 (request_id: req_123, upstream channel #22, token sk-secret-value)`

	got := sanitizePlaygroundImageTaskFailure(reason)

	require.Contains(t, got, "抱歉，我不能帮你生成这张图片")
	require.Contains(t, got, "你可以尝试一种更温和的描述")
	require.NotContains(t, got, "request_id")
	require.NotContains(t, got, "upstream")
	require.NotContains(t, got, "channel")
	require.NotContains(t, got, "sk-secret-value")
}

func TestSanitizePlaygroundImageTaskFailureKeepsWrappedUpstreamRejectionReason(t *testing.T) {
	reason := `upstream error: 抱歉，我不能帮你生成这张图片。请改成安全版画面。`

	got := sanitizePlaygroundImageTaskFailure(reason)

	require.Equal(t, "抱歉，我不能帮你生成这张图片。请改成安全版画面", got)
}

func TestSanitizePlaygroundImageTaskFailureHidesCredentialOnlyErrors(t *testing.T) {
	got := sanitizePlaygroundImageTaskFailure("upstream request failed with bearer abcdefghijklmnop")

	require.Equal(t, "模型服务暂时无法处理该请求，请稍后重试或调整参数", got)
}

func TestSanitizePlaygroundImageTaskFailureHidesUpstreamBalanceErrors(t *testing.T) {
	reason := "余额不足以发起生图请求：当前可用 $1.972320，本次及在途任务预计最多需要 $1.980000。请充值后重试。Insufficient balance to start image generation: available $1.972320, required up to $1.980000"

	got := sanitizePlaygroundImageTaskFailure(reason)

	require.Equal(t, "模型服务暂时不可用，请稍后重试。", got)
	require.NotContains(t, got, "余额不足")
	require.NotContains(t, got, "$1.972320")
	require.NotContains(t, got, "required up to")
}

func TestSanitizePlaygroundImageTaskFailureKeepsChannelErrorReasons(t *testing.T) {
	cases := []struct {
		name   string
		raw    string
		expect string
	}{
		{
			name:   "unsupported model",
			raw:    "status_code=500, not supported model for image generation, only imagen models are supported (request id: req_123, upstream channel #18)",
			expect: "not supported model for image generation, only imagen models are supported",
		},
		{
			name:   "application not found",
			raw:    "status_code=404, Application not found",
			expect: "Application not found",
		},
		{
			name:   "no available channel",
			raw:    "status_code=503, No available channel for model gpt-image-2-vip under group default (distributor) (request id: req_123)",
			expect: "No available channel for model gpt-image-2-vip under group default (distributor)",
		},
		{
			name:   "cloudflare timeout",
			raw:    "status_code=524, The origin web server did not return a complete response within the 120-second Proxy Read Timeout window.",
			expect: "The origin web server did not return a complete response within the 120-second Proxy Read Timeout window",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := sanitizePlaygroundImageTaskFailure(tc.raw)
			require.Contains(t, got, tc.expect)
			require.NotContains(t, got, "request id")
			require.NotContains(t, got, "upstream channel #")
			require.NotContains(t, got, "status_code")
		})
	}
}

func TestResolvePlaygroundImageTaskFailureReasonPrefersRelayErrorLog(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	oldLogDB := model.LOG_DB
	model.LOG_DB = db
	t.Cleanup(func() {
		model.LOG_DB = oldLogDB
	})

	requestID := "req-image-upstream-rejected"
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId:    1001,
		CreatedAt: common.GetTimestamp(),
		Type:      model.LogTypeError,
		Content:   `status_code=400, 抱歉，我不能帮你生成这张图片。你可以尝试一种更温和的描述。 (request_id: req_123, upstream channel #22)`,
		RequestId: requestID,
	}).Error)
	body := []byte(`{"error":{"message":"请求参数有误，请检查后重试。"}}`)

	got := resolvePlaygroundImageTaskFailureReason(nil, 1001, requestID, body, 400)

	require.Contains(t, got, "抱歉，我不能帮你生成这张图片")
	require.Contains(t, got, "你可以尝试一种更温和的描述")
	require.NotContains(t, got, "status_code")
	require.NotContains(t, got, "request_id")
	require.NotContains(t, got, "channel")
}

func TestResolvePlaygroundImageTaskFailureReasonPrefersCapturedChannelError(t *testing.T) {
	body := []byte(`{"error":{"message":"请求参数有误，请检查后重试。"}}`)
	capture := &playgroundImageTaskResultCapture{
		LastFailureReason:    "Application not found",
		LastFailureChannelID: 24,
	}

	got := resolvePlaygroundImageTaskFailureReason(capture, 1001, "req-missing-db-error", body, 400)

	require.Equal(t, "Application not found", got)
}

func TestProcessChannelErrorCapturesAsyncPlaygroundImageFailureReason(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	capture := &playgroundImageTaskResultCapture{}
	ctx.Set("playground_image_async_worker", true)
	ctx.Set(playgroundImageTaskResultCaptureKey, capture)

	processChannelError(
		ctx,
		*types.NewChannelError(24, 0, "moonapix", false, "", false),
		types.NewErrorWithStatusCode(errors.New("Application not found"), types.ErrorCodeBadResponseStatusCode, http.StatusNotFound),
	)

	require.Equal(t, "Application not found", capture.LastFailureReason)
	require.Equal(t, 24, capture.LastFailureChannelID)
}

func TestShouldRetryPlaygroundImageTaskFailureOnlyForTransientErrors(t *testing.T) {
	cases := []struct {
		name   string
		reason string
		status int
		want   bool
	}{
		{
			name:   "subscription concurrency",
			reason: "subscription concurrency limit exceeded",
			status: http.StatusForbidden,
			want:   true,
		},
		{
			name:   "context deadline",
			reason: "context deadline exceeded",
			status: http.StatusGatewayTimeout,
			want:   true,
		},
		{
			name:   "upstream unavailable",
			reason: "媒体工坊图片备用渠道暂不可用",
			status: http.StatusServiceUnavailable,
			want:   true,
		},
		{
			name:   "quota insufficient",
			reason: "subscription monthly quota insufficient",
			status: http.StatusForbidden,
			want:   false,
		},
		{
			name:   "policy rejection",
			reason: "抱歉，我不能帮你生成这张图片。请改成安全版画面。",
			status: http.StatusBadRequest,
			want:   false,
		},
		{
			name:   "unsupported model",
			reason: "not supported model for image generation",
			status: http.StatusInternalServerError,
			want:   false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, shouldRetryPlaygroundImageTaskFailure(tc.reason, tc.status))
		})
	}
}

func TestCanRetryPlaygroundImageTaskFailureStopsAfterQuotaOrMaxAttempts(t *testing.T) {
	t.Setenv("PLAYGROUND_IMAGE_TASK_RETRY_TIMES", "2")
	payload := &playgroundImageTaskPayload{RequestFile: "/tmp/request.body"}

	require.True(t, canRetryPlaygroundImageTaskFailure(payload, 0, "context deadline exceeded", http.StatusGatewayTimeout))

	payload.ActualQuota = 10
	require.False(t, canRetryPlaygroundImageTaskFailure(payload, 0, "context deadline exceeded", http.StatusGatewayTimeout))

	payload.ActualQuota = 0
	require.False(t, canRetryPlaygroundImageTaskFailure(payload, 10, "context deadline exceeded", http.StatusGatewayTimeout))

	payload.RetryCount = 2
	require.False(t, canRetryPlaygroundImageTaskFailure(payload, 0, "context deadline exceeded", http.StatusGatewayTimeout))
}

func TestPlaygroundImageTaskRetrySettingsAreBounded(t *testing.T) {
	t.Setenv("PLAYGROUND_IMAGE_TASK_RETRY_TIMES", "99")
	t.Setenv("PLAYGROUND_IMAGE_TASK_RETRY_BASE_DELAY_SECONDS", "3")
	t.Setenv("PLAYGROUND_IMAGE_TASK_RETRY_MAX_DELAY_SECONDS", "10")

	require.Equal(t, playgroundImageTaskMaxRetryTimes, playgroundImageTaskRetryTimes())
	require.Equal(t, 3*time.Second, playgroundImageTaskRetryDelay(1))
	require.Equal(t, 6*time.Second, playgroundImageTaskRetryDelay(2))
	require.Equal(t, 10*time.Second, playgroundImageTaskRetryDelay(3))
}

func TestMarkPlaygroundImageTaskLogFailureKeepsSubmittedChannelWhenTaskChannelMissing(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	oldLogDB := model.LOG_DB
	model.LOG_DB = db
	t.Cleanup(func() {
		model.LOG_DB = oldLogDB
	})

	requestID := "req-image-failure-channel"
	task := &model.Task{
		TaskID:     "task-image-failure-channel",
		UserId:     1001,
		ChannelId:  0,
		Group:      "default",
		StartTime:  time.Now().Add(-4 * time.Second).Unix(),
		FinishTime: time.Now().Unix(),
	}
	payload := &playgroundImageTaskPayload{RequestID: requestID}
	initialOther := map[string]interface{}{
		"request_phase": "submitted",
	}
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId:    task.UserId,
		CreatedAt: common.GetTimestamp(),
		Type:      model.LogTypeConsume,
		Content:   "媒体工坊图片任务生成中",
		ModelName: "gpt-image-2-4K",
		ChannelId: 22,
		RequestId: requestID,
		Other:     common.MapToJsonStr(initialOther),
	}).Error)

	markPlaygroundImageTaskLogFailure(task, payload, "provider rejected request")

	var log model.Log
	require.NoError(t, model.LOG_DB.Where("request_id = ?", requestID).First(&log).Error)
	require.Equal(t, 22, log.ChannelId)
	other, err := common.StrToMap(log.Other)
	require.NoError(t, err)
	require.Equal(t, float64(22), other["channel_id"])
}

func TestMarkPlaygroundImageTaskLogFailureFallsBackToSubmittedChannelLog(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	oldLogDB := model.LOG_DB
	model.LOG_DB = db
	t.Cleanup(func() {
		model.LOG_DB = oldLogDB
	})

	requestID := "req-image-submitted-channel"
	task := &model.Task{
		TaskID:     "task-image-submitted-channel",
		UserId:     1001,
		ChannelId:  0,
		Group:      "default",
		StartTime:  time.Now().Add(-4 * time.Second).Unix(),
		FinishTime: time.Now().Unix(),
	}
	payload := &playgroundImageTaskPayload{RequestID: requestID}
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId:    task.UserId,
		CreatedAt: common.GetTimestamp(),
		Type:      model.LogTypeConsume,
		Content:   "媒体工坊图片任务生成中",
		ModelName: "gpt-image-2-4K",
		ChannelId: 0,
		RequestId: requestID,
		Other:     common.MapToJsonStr(map[string]interface{}{"request_phase": "submitted"}),
	}).Error)
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId:    task.UserId,
		CreatedAt: common.GetTimestamp(),
		Type:      model.LogTypeSystem,
		Content:   "媒体工坊图片请求已提交",
		ModelName: "gpt-image-2-4K",
		ChannelId: 24,
		RequestId: requestID,
		Other:     common.MapToJsonStr(map[string]interface{}{"request_phase": "submitted"}),
	}).Error)

	markPlaygroundImageTaskLogFailure(task, payload, "Application not found")

	var log model.Log
	require.NoError(t, model.LOG_DB.Where("request_id = ? AND type = ?", requestID, model.LogTypeError).First(&log).Error)
	require.Equal(t, 24, log.ChannelId)
	other, err := common.StrToMap(log.Other)
	require.NoError(t, err)
	require.Equal(t, float64(24), other["channel_id"])
	require.Equal(t, "Application not found", other["fail_reason"])
}

type playgroundImageTaskTestBodyStorage struct {
	reader     *bytes.Reader
	data       []byte
	filePath   string
	closeErr   error
	closeCount int
}

func newPlaygroundImageTaskTestBodyStorage(t *testing.T, data []byte) *playgroundImageTaskTestBodyStorage {
	t.Helper()
	filePath := filepath.Join(t.TempDir(), "request.body")
	require.NoError(t, os.WriteFile(filePath, data, 0o600))
	return &playgroundImageTaskTestBodyStorage{
		reader:   bytes.NewReader(data),
		data:     data,
		filePath: filePath,
	}
}

func (storage *playgroundImageTaskTestBodyStorage) Read(buffer []byte) (int, error) {
	return storage.reader.Read(buffer)
}

func (storage *playgroundImageTaskTestBodyStorage) Seek(offset int64, whence int) (int64, error) {
	return storage.reader.Seek(offset, whence)
}

func (storage *playgroundImageTaskTestBodyStorage) Close() error {
	storage.closeCount++
	_ = os.Remove(storage.filePath)
	return storage.closeErr
}

func (storage *playgroundImageTaskTestBodyStorage) Bytes() ([]byte, error) {
	return append([]byte(nil), storage.data...), nil
}

func (storage *playgroundImageTaskTestBodyStorage) Size() int64 {
	return int64(len(storage.data))
}

func (storage *playgroundImageTaskTestBodyStorage) IsDisk() bool {
	return true
}

func setupPlaygroundImageTaskStateTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Task{}, &model.Log{}))

	oldDB := model.DB
	oldLogDB := model.LOG_DB
	model.DB = db
	model.LOG_DB = db
	t.Cleanup(func() {
		model.DB = oldDB
		model.LOG_DB = oldLogDB
		require.NoError(t, sqlDB.Close())
	})
	return db
}

func createPlaygroundImageTaskSubmittedTestLog(t *testing.T, db *gorm.DB, task *model.Task, requestID string) model.Log {
	t.Helper()
	logEntry := model.Log{
		UserId:    task.UserId,
		Username:  "image-task-test-user",
		CreatedAt: common.GetTimestamp(),
		Type:      model.LogTypeConsume,
		Content:   "媒体工坊图片任务生成中",
		ModelName: "gpt-image-2-4K",
		Quota:     task.Quota,
		RequestId: requestID,
		Other: common.MapToJsonStr(map[string]interface{}{
			"task_id":               task.TaskID,
			"request_id":            requestID,
			"request_phase":         "submitted",
			"task_status":           string(task.Status),
			"playground_image_task": true,
		}),
	}
	require.NoError(t, db.Create(&logEntry).Error)
	return logEntry
}

func createPlaygroundImageTaskOwnedTestMedia(t *testing.T, root string, userID int, filename string) (*playgroundMediaItem, string) {
	t.Helper()
	userDir := filepath.Join(root, playgroundMediaUserDirName(userID))
	require.NoError(t, os.MkdirAll(userDir, 0o700))
	mediaPath := filepath.Join(userDir, filename)
	require.NoError(t, os.WriteFile(mediaPath, []byte("image"), 0o600))
	require.NoError(t, os.WriteFile(mediaPath+".json", []byte("{}"), 0o600))
	mediaURL := playgroundMediaURLPrefix() + "/" + playgroundMediaUserDirName(userID) + "/" + filename
	return &playgroundMediaItem{
		ID:          strings.TrimSuffix(filename, filepath.Ext(filename)),
		Kind:        "image",
		URL:         mediaURL,
		DisplayURL:  mediaURL,
		CachedURL:   mediaURL,
		Filename:    filename,
		Status:      "ready",
		CacheStatus: "cached",
	}, mediaPath
}

func TestReplacePlaygroundImageTaskBodyStorageClosesOldStorageOnce(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	oldStorage := newPlaygroundImageTaskTestBodyStorage(t, []byte("old"))
	newStorage := newPlaygroundImageTaskTestBodyStorage(t, []byte("new"))
	ctx.Set(common.KeyBodyStorage, oldStorage)

	require.NoError(t, replacePlaygroundImageTaskBodyStorage(ctx, newStorage))
	require.Equal(t, 1, oldStorage.closeCount)
	require.NoFileExists(t, oldStorage.filePath)
	stored, exists := ctx.Get(common.KeyBodyStorage)
	require.True(t, exists)
	require.Same(t, newStorage, stored)

	common.CleanupBodyStorage(ctx)
	require.Equal(t, 1, oldStorage.closeCount)
	require.Equal(t, 1, newStorage.closeCount)
	require.NoFileExists(t, newStorage.filePath)
}

func TestReplacePlaygroundImageTaskBodyStorageUsesReplacementOnCloseFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	oldStorage := newPlaygroundImageTaskTestBodyStorage(t, []byte("old"))
	oldStorage.closeErr = errors.New("close failed")
	newStorage := newPlaygroundImageTaskTestBodyStorage(t, []byte("new"))
	ctx.Set(common.KeyBodyStorage, oldStorage)

	require.Error(t, replacePlaygroundImageTaskBodyStorage(ctx, newStorage))
	require.Equal(t, 1, oldStorage.closeCount)
	require.Equal(t, 0, newStorage.closeCount)
	stored, exists := ctx.Get(common.KeyBodyStorage)
	require.True(t, exists)
	require.Same(t, newStorage, stored)
	common.CleanupBodyStorage(ctx)
	require.Equal(t, 1, newStorage.closeCount)
	require.NoFileExists(t, newStorage.filePath)
}

func TestCreateImageTaskFailsClosedWhenNormalizedBodyStorageCreationFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	body := []byte(`{
		"model":"banana-2",
		"prompt":"test image",
		"responseFormat":{"image":{"aspectRatio":"9:16","imageSize":"2K"}}
	}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/tasks/generations", bytes.NewReader(body))
	ctx.Request.Header.Set("Content-Type", "application/json")
	oldStorage := newPlaygroundImageTaskTestBodyStorage(t, body)
	failedStorage := newPlaygroundImageTaskTestBodyStorage(t, []byte("failed replacement"))
	ctx.Set(common.KeyBodyStorage, oldStorage)
	factoryCalled := false

	createImageTaskWithBodyStorageFactory(ctx, false, func([]byte) (common.BodyStorage, error) {
		factoryCalled = true
		return failedStorage, errors.New("storage unavailable")
	})

	require.True(t, factoryCalled)
	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	stored, exists := ctx.Get(common.KeyBodyStorage)
	require.True(t, exists)
	require.Same(t, oldStorage, stored)
	require.Equal(t, 1, failedStorage.closeCount)
	require.NoFileExists(t, failedStorage.filePath)
	common.CleanupBodyStorage(ctx)
	require.Equal(t, 1, oldStorage.closeCount)
	require.NoFileExists(t, oldStorage.filePath)
}

func TestClaimPlaygroundImageTaskAllowsOnlyOneWorker(t *testing.T) {
	db := setupPlaygroundImageTaskStateTestDB(t)
	task := &model.Task{
		TaskID:   "task-image-single-claim",
		Platform: constant.TaskPlatformPlaygroundImage,
		UserId:   1001,
		Action:   constant.TaskActionImageGenerate,
		Status:   model.TaskStatusSubmitted,
		Progress: "10%",
	}
	task.SetData(playgroundImageTaskPayload{RequestFile: "/tmp/request.body"})
	require.NoError(t, db.Create(task).Error)

	start := make(chan struct{})
	type claimResult struct {
		claimed bool
		err     error
	}
	results := make(chan claimResult, 2)
	for workerIndex := 0; workerIndex < 2; workerIndex++ {
		go func() {
			<-start
			_, claimed, err := claimPlaygroundImageTask(task.TaskID, task.UserId)
			results <- claimResult{claimed: claimed, err: err}
		}()
	}
	close(start)

	claimCount := 0
	for workerIndex := 0; workerIndex < 2; workerIndex++ {
		result := <-results
		require.NoError(t, result.err)
		if result.claimed {
			claimCount++
		}
	}
	require.Equal(t, 1, claimCount)

	var reloaded model.Task
	require.NoError(t, db.Where("task_id = ?", task.TaskID).First(&reloaded).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusInProgress), reloaded.Status)
}

func TestClaimPlaygroundImageTaskRejectsTerminalTask(t *testing.T) {
	db := setupPlaygroundImageTaskStateTestDB(t)
	task := &model.Task{
		TaskID:   "task-image-terminal-claim",
		Platform: constant.TaskPlatformPlaygroundImage,
		UserId:   1001,
		Action:   constant.TaskActionImageGenerate,
		Status:   model.TaskStatusSuccess,
		Progress: "100%",
	}
	require.NoError(t, db.Create(task).Error)

	_, claimed, err := claimPlaygroundImageTask(task.TaskID, task.UserId)
	require.NoError(t, err)
	require.False(t, claimed)
}

func TestPlaygroundImageTaskRecoveryWaitsUntilRetryDeadline(t *testing.T) {
	now := time.Unix(2_000_000_000, 0)
	payload := &playgroundImageTaskPayload{NextRetryAt: now.Add(time.Minute).Unix()}
	started := make(chan struct{}, 1)
	runner := func() {
		started <- struct{}{}
	}

	require.False(t, playgroundImageTaskRecoveryReady(payload, now))
	require.False(t, schedulePlaygroundImageTaskRecovery(payload, now, runner))
	select {
	case <-started:
		require.Fail(t, "future retry deadline started recovery worker")
	default:
	}
	payload.NextRetryAt = now.Unix()
	require.True(t, playgroundImageTaskRecoveryReady(payload, now))
	require.True(t, schedulePlaygroundImageTaskRecovery(payload, now, runner))
	select {
	case <-started:
	case <-time.After(time.Second):
		require.Fail(t, "due recovery worker did not start")
	}
	payload.NextRetryAt = 0
	require.True(t, playgroundImageTaskRecoveryReady(payload, now))
}

func TestMarkPlaygroundImageTaskFailureCannotRegressSuccessOrRefund(t *testing.T) {
	db := setupPlaygroundImageTaskStateTestDB(t)
	mediaRoot := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", mediaRoot)
	require.NoError(t, db.Create(&model.User{
		Id:       1001,
		Username: "image-task-test-user",
		Password: "test-password",
		Status:   common.UserStatusEnabled,
		Quota:    100,
	}).Error)
	requestFile := filepath.Join(mediaRoot, "tasks", playgroundMediaUserDirName(1001), "task.body")
	require.NoError(t, os.MkdirAll(filepath.Dir(requestFile), 0o700))
	require.NoError(t, os.WriteFile(requestFile, []byte("request"), 0o600))
	payload := playgroundImageTaskPayload{RequestID: "req-terminal-failure", RequestFile: requestFile}
	task := &model.Task{
		TaskID:     "task-terminal-failure",
		Platform:   constant.TaskPlatformPlaygroundImage,
		UserId:     1001,
		Quota:      20,
		Action:     constant.TaskActionImageGenerate,
		Status:     model.TaskStatusSuccess,
		Progress:   "100%",
		FinishTime: time.Now().Unix(),
		PrivateData: model.TaskPrivateData{
			ResultURL: "/pg/media/files/u-1001/winner.png",
		},
	}
	task.SetData(payload)
	require.NoError(t, db.Create(task).Error)
	submittedLog := createPlaygroundImageTaskSubmittedTestLog(t, db, task, payload.RequestID)

	staleTask := *task
	staleTask.Status = model.TaskStatusInProgress
	staleTask.Progress = "50%"
	markPlaygroundImageTaskFailure(&staleTask, "stale worker failed")

	var reloadedTask model.Task
	require.NoError(t, db.Where("task_id = ?", task.TaskID).First(&reloadedTask).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusSuccess), reloadedTask.Status)
	require.Equal(t, "/pg/media/files/u-1001/winner.png", reloadedTask.GetResultURL())
	require.FileExists(t, requestFile)
	var reloadedUser model.User
	require.NoError(t, db.Where("id = ?", task.UserId).First(&reloadedUser).Error)
	require.Equal(t, 100, reloadedUser.Quota)
	var refundCount int64
	require.NoError(t, db.Model(&model.Log{}).Where("type = ?", model.LogTypeRefund).Count(&refundCount).Error)
	require.Zero(t, refundCount)
	var reloadedLog model.Log
	require.NoError(t, db.First(&reloadedLog, submittedLog.Id).Error)
	require.Equal(t, model.LogTypeConsume, reloadedLog.Type)
}

func TestMarkPlaygroundImageTaskSuccessLoserCleansOwnedMediaOnly(t *testing.T) {
	db := setupPlaygroundImageTaskStateTestDB(t)
	mediaRoot := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", mediaRoot)
	requestFile := filepath.Join(mediaRoot, "tasks", playgroundMediaUserDirName(1001), "task.body")
	require.NoError(t, os.MkdirAll(filepath.Dir(requestFile), 0o700))
	require.NoError(t, os.WriteFile(requestFile, []byte("request"), 0o600))
	payload := playgroundImageTaskPayload{RequestID: "req-success-loser", RequestFile: requestFile}
	task := &model.Task{
		TaskID:   "task-success-loser",
		Platform: constant.TaskPlatformPlaygroundImage,
		UserId:   1001,
		Action:   constant.TaskActionImageGenerate,
		Status:   model.TaskStatusSuccess,
		Progress: "100%",
		PrivateData: model.TaskPrivateData{
			ResultURL: "/pg/media/files/u-1001/winner.png",
		},
	}
	task.SetData(payload)
	require.NoError(t, db.Create(task).Error)
	submittedLog := createPlaygroundImageTaskSubmittedTestLog(t, db, task, payload.RequestID)
	loserItem, loserPath := createPlaygroundImageTaskOwnedTestMedia(t, mediaRoot, task.UserId, "11111111111111111111111111111111.png")

	staleTask := *task
	staleTask.Status = model.TaskStatusInProgress
	staleTask.Progress = "50%"
	stalePayload := payload
	markPlaygroundImageTaskSuccess(&staleTask, loserItem, &stalePayload, http.StatusOK, 25, true)

	require.NoFileExists(t, loserPath)
	require.NoFileExists(t, loserPath+".json")
	recoveryItem, recoveryPath := createPlaygroundImageTaskOwnedTestMedia(t, mediaRoot, task.UserId, "22222222222222222222222222222222.png")
	recoveryPayload := payload
	markPlaygroundImageTaskSuccess(&staleTask, recoveryItem, &recoveryPayload, http.StatusOK, 25, false)
	require.FileExists(t, recoveryPath)
	require.FileExists(t, recoveryPath+".json")
	require.FileExists(t, requestFile)
	var reloadedTask model.Task
	require.NoError(t, db.Where("task_id = ?", task.TaskID).First(&reloadedTask).Error)
	require.Equal(t, "/pg/media/files/u-1001/winner.png", reloadedTask.GetResultURL())
	var reloadedLog model.Log
	require.NoError(t, db.First(&reloadedLog, submittedLog.Id).Error)
	other, err := common.StrToMap(reloadedLog.Other)
	require.NoError(t, err)
	require.Equal(t, "submitted", other["request_phase"])
	require.NotEqual(t, true, other["playground_image_completion_log"])
}

func TestConcurrentPlaygroundImageTaskSuccessKeepsOneMediaAndCompletionLog(t *testing.T) {
	db := setupPlaygroundImageTaskStateTestDB(t)
	mediaRoot := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", mediaRoot)
	requestFile := filepath.Join(mediaRoot, "tasks", playgroundMediaUserDirName(1001), "task.body")
	require.NoError(t, os.MkdirAll(filepath.Dir(requestFile), 0o700))
	require.NoError(t, os.WriteFile(requestFile, []byte("request"), 0o600))
	payload := playgroundImageTaskPayload{RequestID: "req-concurrent-success", RequestFile: requestFile}
	task := &model.Task{
		TaskID:     "task-concurrent-success",
		Platform:   constant.TaskPlatformPlaygroundImage,
		UserId:     1001,
		Action:     constant.TaskActionImageGenerate,
		Status:     model.TaskStatusInProgress,
		Progress:   "50%",
		StartTime:  time.Now().Add(-time.Second).Unix(),
		SubmitTime: time.Now().Add(-2 * time.Second).Unix(),
	}
	task.SetData(payload)
	require.NoError(t, db.Create(task).Error)
	createPlaygroundImageTaskSubmittedTestLog(t, db, task, payload.RequestID)
	firstItem, firstPath := createPlaygroundImageTaskOwnedTestMedia(t, mediaRoot, task.UserId, "11111111111111111111111111111111.png")
	secondItem, secondPath := createPlaygroundImageTaskOwnedTestMedia(t, mediaRoot, task.UserId, "22222222222222222222222222222222.png")

	var firstTask model.Task
	var secondTask model.Task
	require.NoError(t, db.Where("task_id = ?", task.TaskID).First(&firstTask).Error)
	require.NoError(t, db.Where("task_id = ?", task.TaskID).First(&secondTask).Error)
	firstPayload := payload
	secondPayload := payload
	start := make(chan struct{})
	done := make(chan struct{}, 2)
	go func() {
		<-start
		markPlaygroundImageTaskSuccess(&firstTask, firstItem, &firstPayload, http.StatusOK, 30, true)
		done <- struct{}{}
	}()
	go func() {
		<-start
		markPlaygroundImageTaskSuccess(&secondTask, secondItem, &secondPayload, http.StatusOK, 30, true)
		done <- struct{}{}
	}()
	close(start)
	<-done
	<-done

	var reloadedTask model.Task
	require.NoError(t, db.Where("task_id = ?", task.TaskID).First(&reloadedTask).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusSuccess), reloadedTask.Status)
	require.Contains(t, []string{firstItem.URL, secondItem.URL}, reloadedTask.GetResultURL())
	firstExists := fileExistsForPlaygroundImageTaskTest(firstPath)
	secondExists := fileExistsForPlaygroundImageTaskTest(secondPath)
	require.NotEqual(t, firstExists, secondExists)
	if reloadedTask.GetResultURL() == firstItem.URL {
		require.True(t, firstExists)
		require.False(t, secondExists)
	} else {
		require.False(t, firstExists)
		require.True(t, secondExists)
	}
	require.NoFileExists(t, requestFile)

	var logs []model.Log
	require.NoError(t, db.Where("request_id = ?", payload.RequestID).Find(&logs).Error)
	completionLogs := 0
	for _, logEntry := range logs {
		other, err := common.StrToMap(logEntry.Other)
		require.NoError(t, err)
		if completed, _ := other["playground_image_completion_log"].(bool); completed {
			completionLogs++
		}
	}
	require.Equal(t, 1, completionLogs)
}

func fileExistsForPlaygroundImageTaskTest(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func configurePlaygroundImageTaskPersistenceTest(t *testing.T, root string) {
	t.Helper()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", root)
	t.Setenv("PLAYGROUND_IMAGE_TASK_REQUEST_MAX_MB", "1")
	t.Setenv("PLAYGROUND_IMAGE_TASK_MAX_PENDING_PER_USER", "100")
	t.Setenv("PLAYGROUND_MEDIA_USER_MAX_MB", "10")
	t.Setenv("PLAYGROUND_MEDIA_TOTAL_MAX_MB", "20")
	t.Setenv("PLAYGROUND_MEDIA_MAX_FILES_PER_USER", "100")
}

func requireNoPlaygroundImageTaskTempFiles(t *testing.T, root string) {
	t.Helper()
	err := filepath.WalkDir(root, func(_ string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if strings.HasPrefix(entry.Name(), ".playground-image-task-") {
			t.Errorf("unexpected image task temp file: %s", entry.Name())
		}
		return nil
	})
	if err != nil && !os.IsNotExist(err) {
		require.NoError(t, err)
	}
}

func requirePlaygroundImageTaskPersistHTTPStatus(t *testing.T, err error, expectedStatus int) string {
	t.Helper()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	respondPlaygroundImageTaskPersistError(ctx, err)
	require.Equal(t, expectedStatus, recorder.Code)
	return recorder.Body.String()
}

func TestPersistPlaygroundImageTaskRequestRejectsOversizedBodyWith413(t *testing.T) {
	root := t.TempDir()
	configurePlaygroundImageTaskPersistenceTest(t, root)
	body := bytes.Repeat([]byte("x"), (1<<20)+1)

	requestFile, err := persistPlaygroundImageTaskRequest(7, "task-too-large", body)

	require.Empty(t, requestFile)
	require.ErrorIs(t, err, common.ErrPlaygroundImageTaskRequestTooLarge)
	requirePlaygroundImageTaskPersistHTTPStatus(t, err, http.StatusRequestEntityTooLarge)
	requireNoPlaygroundImageTaskTempFiles(t, root)
	_, statErr := os.Stat(filepath.Join(root, "tasks", playgroundMediaUserDirName(7), "task-too-large.body"))
	require.True(t, os.IsNotExist(statErr))
}

func TestPersistPlaygroundImageTaskRequestPublishesAtomically(t *testing.T) {
	root := t.TempDir()
	configurePlaygroundImageTaskPersistenceTest(t, root)
	body := []byte("complete request body")

	requestFile, err := persistPlaygroundImageTaskRequest(7, "task-atomic", body)

	require.NoError(t, err)
	require.FileExists(t, requestFile)
	stored, err := os.ReadFile(requestFile)
	require.NoError(t, err)
	require.Equal(t, body, stored)
	requireNoPlaygroundImageTaskTempFiles(t, root)
}

func TestWritePlaygroundImageTaskRequestAtomicallyCleansTempAfterPublishFailure(t *testing.T) {
	requestRoot := t.TempDir()
	targetPath := filepath.Join(requestRoot, "task.body")
	require.NoError(t, os.Mkdir(targetPath, 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(targetPath, "block-rename"), []byte("x"), 0o600))

	err := writePlaygroundImageTaskRequestAtomically(requestRoot, targetPath, []byte("request"))

	require.Error(t, err)
	require.DirExists(t, targetPath)
	requireNoPlaygroundImageTaskTempFiles(t, requestRoot)
}

func TestPersistPlaygroundImageTaskRequestEnforcesConcurrentPendingLimit(t *testing.T) {
	root := t.TempDir()
	configurePlaygroundImageTaskPersistenceTest(t, root)
	t.Setenv("PLAYGROUND_IMAGE_TASK_MAX_PENDING_PER_USER", "1")

	start := make(chan struct{})
	results := make(chan error, 8)
	for requestIndex := 0; requestIndex < 8; requestIndex++ {
		go func(index int) {
			<-start
			_, err := persistPlaygroundImageTaskRequest(7, fmt.Sprintf("task-pending-%d", index), []byte("request"))
			results <- err
		}(requestIndex)
	}
	close(start)

	successes := 0
	pendingRejections := 0
	var pendingErr error
	for requestIndex := 0; requestIndex < 8; requestIndex++ {
		err := <-results
		switch {
		case err == nil:
			successes++
		case errors.Is(err, common.ErrPlaygroundImageTaskPendingLimitExceeded):
			pendingRejections++
			pendingErr = err
		default:
			require.NoError(t, err)
		}
	}
	require.Equal(t, 1, successes)
	require.Equal(t, 7, pendingRejections)
	requirePlaygroundImageTaskPersistHTTPStatus(t, pendingErr, http.StatusTooManyRequests)
	_, pendingFiles, err := common.PlaygroundImageTaskRequestUsage(filepath.Join(root, "tasks", playgroundMediaUserDirName(7)))
	require.NoError(t, err)
	require.Equal(t, 1, pendingFiles)
	requireNoPlaygroundImageTaskTempFiles(t, root)
}

func TestPersistPlaygroundImageTaskRequestEnforcesConcurrentUserByteQuota(t *testing.T) {
	root := t.TempDir()
	configurePlaygroundImageTaskPersistenceTest(t, root)
	t.Setenv("PLAYGROUND_MEDIA_USER_MAX_MB", "1")
	body := bytes.Repeat([]byte("x"), 400*1024)

	start := make(chan struct{})
	results := make(chan error, 4)
	for requestIndex := 0; requestIndex < 4; requestIndex++ {
		go func(index int) {
			<-start
			_, err := persistPlaygroundImageTaskRequest(7, fmt.Sprintf("task-quota-%d", index), body)
			results <- err
		}(requestIndex)
	}
	close(start)

	successes := 0
	quotaRejections := 0
	for requestIndex := 0; requestIndex < 4; requestIndex++ {
		err := <-results
		switch {
		case err == nil:
			successes++
		case errors.Is(err, common.ErrPlaygroundImageTaskUserQuotaExceeded):
			quotaRejections++
		default:
			require.NoError(t, err)
		}
	}
	require.Equal(t, 2, successes)
	require.Equal(t, 2, quotaRejections)
	requestBytes, pendingFiles, err := common.PlaygroundImageTaskRequestUsage(filepath.Join(root, "tasks", playgroundMediaUserDirName(7)))
	require.NoError(t, err)
	require.Equal(t, int64(800*1024), requestBytes)
	require.Equal(t, 2, pendingFiles)
	requireNoPlaygroundImageTaskTempFiles(t, root)
}

func TestPersistPlaygroundImageTaskRequestIncludesMediaInUserFileQuota(t *testing.T) {
	root := t.TempDir()
	configurePlaygroundImageTaskPersistenceTest(t, root)
	t.Setenv("PLAYGROUND_MEDIA_MAX_FILES_PER_USER", "1")
	userDir := filepath.Join(root, playgroundMediaUserDirName(7))
	require.NoError(t, os.MkdirAll(userDir, 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(userDir, "existing.png"), []byte("image"), 0o600))

	requestFile, err := persistPlaygroundImageTaskRequest(7, "task-file-quota", []byte("request"))

	require.Empty(t, requestFile)
	require.ErrorIs(t, err, common.ErrPlaygroundImageTaskUserQuotaExceeded)
	requirePlaygroundImageTaskPersistHTTPStatus(t, err, http.StatusTooManyRequests)
	requireNoPlaygroundImageTaskTempFiles(t, root)
}

func TestPersistPlaygroundImageTaskRequestIncludesMediaInUserByteQuota(t *testing.T) {
	root := t.TempDir()
	configurePlaygroundImageTaskPersistenceTest(t, root)
	t.Setenv("PLAYGROUND_MEDIA_USER_MAX_MB", "1")
	userDir := filepath.Join(root, playgroundMediaUserDirName(7))
	require.NoError(t, os.MkdirAll(userDir, 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(userDir, "existing.png"), bytes.Repeat([]byte("x"), 900*1024), 0o600))

	requestFile, err := persistPlaygroundImageTaskRequest(7, "task-user-quota", bytes.Repeat([]byte("y"), 200*1024))

	require.Empty(t, requestFile)
	require.ErrorIs(t, err, common.ErrPlaygroundImageTaskUserQuotaExceeded)
	requirePlaygroundImageTaskPersistHTTPStatus(t, err, http.StatusTooManyRequests)
	requireNoPlaygroundImageTaskTempFiles(t, root)
}

func TestPersistPlaygroundImageTaskRequestEnforcesGlobalByteQuota(t *testing.T) {
	root := t.TempDir()
	configurePlaygroundImageTaskPersistenceTest(t, root)
	t.Setenv("PLAYGROUND_MEDIA_TOTAL_MAX_MB", "1")
	otherUserDir := filepath.Join(root, playgroundMediaUserDirName(8))
	require.NoError(t, os.MkdirAll(otherUserDir, 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(otherUserDir, "existing.png"), bytes.Repeat([]byte("x"), 900*1024), 0o600))

	requestFile, err := persistPlaygroundImageTaskRequest(7, "task-global-quota", bytes.Repeat([]byte("y"), 200*1024))

	require.Empty(t, requestFile)
	require.ErrorIs(t, err, common.ErrPlaygroundImageTaskTotalQuotaExceeded)
	body := requirePlaygroundImageTaskPersistHTTPStatus(t, err, http.StatusInsufficientStorage)
	require.NotContains(t, body, root)
	requireNoPlaygroundImageTaskTempFiles(t, root)
}

func TestPlaygroundImageTaskPersistenceIOErrorReturnsSanitized500(t *testing.T) {
	parent := t.TempDir()
	blockedRoot := filepath.Join(parent, "cache-file")
	require.NoError(t, os.WriteFile(blockedRoot, []byte("not a directory"), 0o600))
	configurePlaygroundImageTaskPersistenceTest(t, blockedRoot)

	requestFile, err := persistPlaygroundImageTaskRequest(7, "task-io-error", []byte("request"))

	require.Empty(t, requestFile)
	require.Error(t, err)
	body := requirePlaygroundImageTaskPersistHTTPStatus(t, err, http.StatusInternalServerError)
	require.NotContains(t, body, blockedRoot)
}

func TestPlaygroundImageTaskWorkerLimitIsConfigurableAndClamped(t *testing.T) {
	t.Setenv("PLAYGROUND_IMAGE_TASK_MAX_WORKERS", "64")
	require.Equal(t, 64, playgroundImageTaskWorkerLimit())
	require.Equal(t, 64, cap(newPlaygroundImageWorkerSemaphore()))

	t.Setenv("PLAYGROUND_IMAGE_TASK_MAX_WORKERS", "0")
	require.Equal(t, playgroundImageTaskDefaultWorkerLimit, playgroundImageTaskWorkerLimit())

	t.Setenv("PLAYGROUND_IMAGE_TASK_MAX_WORKERS", "9999")
	require.Equal(t, playgroundImageTaskMaxWorkerLimit, playgroundImageTaskWorkerLimit())
}

func TestPlaygroundMediaQuotaConfigurationIsClampedBeforeByteConversion(t *testing.T) {
	t.Setenv("PLAYGROUND_MEDIA_USER_MAX_MB", "999999999")
	t.Setenv("PLAYGROUND_MEDIA_TOTAL_MAX_MB", "999999999")
	t.Setenv("PLAYGROUND_MEDIA_MAX_FILES_PER_USER", "999999999")

	require.Equal(t, int64(10*1024)*1024*1024, common.PlaygroundMediaUserMaxBytes())
	require.Equal(t, int64(100*1024)*1024*1024, common.PlaygroundMediaTotalMaxBytes())
	require.Equal(t, 10_000, common.PlaygroundMediaMaxFilesPerUser())
}
