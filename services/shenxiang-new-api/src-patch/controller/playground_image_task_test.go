package controller

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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

func TestNormalizePlaygroundImageTaskPayloadForcesGrokBase64Response(t *testing.T) {
	raw := []byte(`{"model":"grok-imagine-image","prompt":"test","response_format":"url"}`)
	request := dto.ImageRequest{
		Model:          "grok-imagine-image",
		Prompt:         "test",
		ResponseFormat: "url",
	}

	normalized, changed := normalizePlaygroundImageTaskPayload(raw, &request)
	require.True(t, changed)
	require.Equal(t, "b64_json", request.ResponseFormat)
	require.JSONEq(t, `{"model":"grok-imagine-image","prompt":"test","response_format":"b64_json"}`, string(normalized))
}

func TestNormalizePlaygroundImageTaskPayloadKeepsOtherModelResponseFormat(t *testing.T) {
	raw := []byte(`{"model":"banana-2","prompt":"test","response_format":"url"}`)
	request := dto.ImageRequest{
		Model:          "banana-2",
		Prompt:         "test",
		ResponseFormat: "url",
	}

	normalized, changed := normalizePlaygroundImageTaskPayload(raw, &request)
	require.False(t, changed)
	require.Nil(t, normalized)
	require.Equal(t, "url", request.ResponseFormat)
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

func TestCacheFirstPlaygroundImageTaskResultRetainsMismatchedImageSize(t *testing.T) {
	gin.SetMode(gin.TestMode)
	root := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", root)

	var imageBytes bytes.Buffer
	require.NoError(t, png.Encode(&imageBytes, image.NewRGBA(image.Rect(0, 0, 1024, 768))))
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodGet, "/pg/images/tasks/task-size-mismatch", nil)
	ctx.Set("id", 7)

	item, err := cacheFirstPlaygroundImageTaskResult(
		ctx,
		&model.Task{TaskID: "task-size-mismatch"},
		&playgroundImageTaskPayload{
			Metadata: map[string]interface{}{
				"effective_size": "2048x1536",
			},
		},
		&dto.ImageResponse{Data: []dto.ImageData{{B64Json: base64.StdEncoding.EncodeToString(imageBytes.Bytes())}}},
	)

	require.NoError(t, err)
	require.NotNil(t, item)
	require.Equal(t, "1024x768", item.Metadata["actual_size"])
	require.Equal(t, true, item.Metadata["requested_actual_mismatch"])
	entries, readErr := os.ReadDir(filepath.Join(root, "u-7"))
	require.NoError(t, readErr)
	require.NotEmpty(t, entries)
	require.FileExists(t, filepath.Join(root, "u-7", item.Filename))
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

	markPlaygroundImageTaskSuccess(task, item, payload, http.StatusOK, 3767)

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
