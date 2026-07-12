package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

	"github.com/stretchr/testify/require"
)

type safetyTaskPollingAdaptor struct {
	response   func() *http.Response
	parse      func([]byte) (*relaycommon.TaskInfo, error)
	parseCalls atomic.Int32
}

func (a *safetyTaskPollingAdaptor) Init(*relaycommon.RelayInfo) {}

func (a *safetyTaskPollingAdaptor) FetchTask(string, string, map[string]any, string) (*http.Response, error) {
	return a.response(), nil
}

func (a *safetyTaskPollingAdaptor) FetchTaskWithContext(context.Context, string, string, map[string]any, string) (*http.Response, error) {
	return a.response(), nil
}

func (a *safetyTaskPollingAdaptor) ParseTaskResult(body []byte) (*relaycommon.TaskInfo, error) {
	a.parseCalls.Add(1)
	if a.parse != nil {
		return a.parse(body)
	}
	return &relaycommon.TaskInfo{}, nil
}

func (a *safetyTaskPollingAdaptor) AdjustBillingOnComplete(*model.Task, *relaycommon.TaskInfo) int {
	return 0
}

type trackedResponseBody struct {
	io.Reader
	closed atomic.Bool
}

func (b *trackedResponseBody) Close() error {
	b.closed.Store(true)
	return nil
}

func TestTaskPollingCapsVideoAndSunoResponseBodies(t *testing.T) {
	t.Setenv("MAX_UPSTREAM_RESPONSE_BYTES", "16")

	t.Run("video", func(t *testing.T) {
		adaptor := &safetyTaskPollingAdaptor{response: func() *http.Response {
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(strings.Repeat("x", 17)))}
		}}
		task := &model.Task{TaskID: "public-video", Status: model.TaskStatusInProgress, PrivateData: model.TaskPrivateData{UpstreamTaskID: "upstream-video"}}

		err := updateVideoSingleTask(context.Background(), adaptor, &model.Channel{}, "upstream-video", map[string]*model.Task{"upstream-video": task})

		require.ErrorContains(t, err, "upstream response exceeds 16 byte limit")
	})

	t.Run("suno", func(t *testing.T) {
		truncate(t)
		baseURL := "https://suno.example"
		channel := &model.Channel{Id: 909, Name: "suno", BaseURL: &baseURL, Status: common.ChannelStatusEnabled}
		require.NoError(t, model.DB.Create(channel).Error)
		body := &trackedResponseBody{Reader: strings.NewReader(strings.Repeat("x", 17))}
		adaptor := &safetyTaskPollingAdaptor{response: func() *http.Response {
			return &http.Response{StatusCode: http.StatusOK, Body: body}
		}}
		previousFactory := GetTaskAdaptorFunc
		GetTaskAdaptorFunc = func(constant.TaskPlatform) TaskPollingAdaptor { return adaptor }
		t.Cleanup(func() { GetTaskAdaptorFunc = previousFactory })

		err := updateSunoTasks(context.Background(), channel.Id, []string{"upstream-suno"}, map[string]*model.Task{})

		require.ErrorContains(t, err, "upstream response exceeds 16 byte limit")
		require.True(t, body.closed.Load())
	})
}

func TestVideoPollingNonSuccessHTTPDoesNotParseOrRefund(t *testing.T) {
	truncate(t)
	const userID, quota = 910, 100
	seedUser(t, userID, 1000)
	task := makeTask(userID, 0, quota, 0, BillingSourceWallet, 0)
	task.TaskID = "public-http-error"
	task.PrivateData.UpstreamTaskID = "upstream-http-error"
	require.NoError(t, model.DB.Create(task).Error)
	body := &trackedResponseBody{Reader: strings.NewReader(`{"error":{"message":"unauthorized"},"status":"FAILURE"}`)}
	adaptor := &safetyTaskPollingAdaptor{
		response: func() *http.Response {
			return &http.Response{StatusCode: http.StatusUnauthorized, Body: body}
		},
		parse: func([]byte) (*relaycommon.TaskInfo, error) {
			return relaycommon.FailTaskInfo("unauthorized"), nil
		},
	}

	err := updateVideoSingleTask(
		context.Background(), adaptor, &model.Channel{}, task.GetUpstreamTaskID(),
		map[string]*model.Task{task.GetUpstreamTaskID(): task},
	)

	require.ErrorContains(t, err, "non-success status 401")
	require.Zero(t, adaptor.parseCalls.Load())
	require.True(t, body.closed.Load())
	require.Equal(t, 1000, getUserQuota(t, userID))
	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusInProgress), reloaded.Status)
}

func TestVideoCASLoserDoesNotPublishMedia(t *testing.T) {
	truncate(t)
	root := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", root)
	task := &model.Task{
		TaskID:    "public-cas-video",
		Platform:  constant.TaskPlatform("kling"),
		UserId:    707,
		ChannelId: 707,
		Status:    model.TaskStatusInProgress,
		Progress:  "20%",
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
		PrivateData: model.TaskPrivateData{
			UpstreamTaskID: "upstream-cas-video",
		},
	}
	require.NoError(t, model.DB.Create(task).Error)
	require.NotZero(t, task.ID)
	require.NoError(t, model.DB.Model(&model.Task{}).Where("id = ?", task.ID).Update("status", model.TaskStatusSuccess).Error)

	responsePayload := dto.TaskResponse[model.Task]{
		Code: dto.TaskSuccessCode,
		Data: model.Task{
			TaskID:   "upstream-cas-video",
			Status:   model.TaskStatusSuccess,
			Progress: "100%",
			PrivateData: model.TaskPrivateData{
				ResultURL: "data:video/mp4;base64," + base64.StdEncoding.EncodeToString(bytes.Repeat([]byte("v"), 32)),
			},
		},
	}
	responseBody, err := common.Marshal(responsePayload)
	require.NoError(t, err)
	adaptor := &safetyTaskPollingAdaptor{response: func() *http.Response {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(responseBody))}
	}}

	require.NoError(t, updateVideoSingleTask(
		context.Background(),
		adaptor,
		&model.Channel{Id: task.ChannelId},
		task.GetUpstreamTaskID(),
		map[string]*model.Task{task.GetUpstreamTaskID(): task},
	))

	entries, readErr := os.ReadDir(root)
	require.NoError(t, readErr)
	require.Empty(t, entries)
}

func TestSunoStalePollerDoesNotRefundTwice(t *testing.T) {
	truncate(t)
	const userID, channelID, preConsumed = 808, 808, 100
	seedUser(t, userID, 1000)
	baseURL := "https://suno.example"
	channel := &model.Channel{Id: channelID, Name: "suno-cas", BaseURL: &baseURL, Status: common.ChannelStatusEnabled}
	require.NoError(t, model.DB.Create(channel).Error)
	task := makeTask(userID, channelID, preConsumed, 0, BillingSourceWallet, 0)
	task.TaskID = "public-suno-cas"
	task.PrivateData.UpstreamTaskID = "upstream-suno-cas"
	require.NoError(t, model.DB.Create(task).Error)

	var firstView model.Task
	var staleView model.Task
	require.NoError(t, model.DB.First(&firstView, task.ID).Error)
	require.NoError(t, model.DB.First(&staleView, task.ID).Error)
	responsePayload := dto.TaskResponse[[]dto.SunoDataResponse]{
		Code: dto.TaskSuccessCode,
		Data: []dto.SunoDataResponse{{
			TaskID:     task.GetUpstreamTaskID(),
			Status:     model.TaskStatusFailure,
			FailReason: "upstream failed",
			FinishTime: time.Now().Unix(),
			Data:       []byte(`{}`),
		}},
	}
	responseBody, err := common.Marshal(responsePayload)
	require.NoError(t, err)
	adaptor := &safetyTaskPollingAdaptor{response: func() *http.Response {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(responseBody))}
	}}
	previousFactory := GetTaskAdaptorFunc
	GetTaskAdaptorFunc = func(constant.TaskPlatform) TaskPollingAdaptor { return adaptor }
	t.Cleanup(func() { GetTaskAdaptorFunc = previousFactory })

	require.NoError(t, updateSunoTasks(context.Background(), channelID, []string{task.GetUpstreamTaskID()}, map[string]*model.Task{task.GetUpstreamTaskID(): &firstView}))
	require.NoError(t, updateSunoTasks(context.Background(), channelID, []string{task.GetUpstreamTaskID()}, map[string]*model.Task{task.GetUpstreamTaskID(): &staleView}))

	require.Equal(t, 1000+preConsumed, getUserQuota(t, userID))
	require.Equal(t, int64(1), countLogs(t))
}

func TestUnavailableChannelFailureRefundsOnlyCASWinner(t *testing.T) {
	truncate(t)
	const userID, preConsumed = 818, 120
	seedUser(t, userID, 1000)
	task := makeTask(userID, 9999, preConsumed, 0, BillingSourceWallet, 0)
	task.TaskID = "public-missing-channel"
	task.PrivateData.UpstreamTaskID = "upstream-missing-channel"
	require.NoError(t, model.DB.Create(task).Error)

	var firstView model.Task
	var staleView model.Task
	require.NoError(t, model.DB.First(&firstView, task.ID).Error)
	require.NoError(t, model.DB.First(&staleView, task.ID).Error)
	taskIDs := []string{task.GetUpstreamTaskID()}
	reason := "channel unavailable"

	failPollingTasksForUnavailableChannel(context.Background(), task.ChannelId, taskIDs, map[string]*model.Task{task.GetUpstreamTaskID(): &firstView}, reason, true)
	failPollingTasksForUnavailableChannel(context.Background(), task.ChannelId, taskIDs, map[string]*model.Task{task.GetUpstreamTaskID(): &staleView}, reason, true)

	var persisted model.Task
	require.NoError(t, model.DB.First(&persisted, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusFailure), persisted.Status)
	require.Equal(t, 1000+preConsumed, getUserQuota(t, userID))
	var refundLogs int64
	require.NoError(t, model.DB.Model(&model.Log{}).Where("type = ?", model.LogTypeRefund).Count(&refundLogs).Error)
	require.Equal(t, int64(1), refundLogs)
}

func TestRedactVideoResponseBodyRemovesSecretsAndRawInvalidBody(t *testing.T) {
	input := []byte(`{"response":{"authorization":"Bearer secret","access_token":"token-secret","nested":{"password":"password-secret"},"video":"` + strings.Repeat("a", 5000) + `"}}`)

	redacted := redactVideoResponseBody(input)

	require.NotContains(t, string(redacted), "Bearer secret")
	require.NotContains(t, string(redacted), "token-secret")
	require.NotContains(t, string(redacted), "password-secret")
	require.Less(t, len(redacted), 1024)

	invalid := redactVideoResponseBody([]byte("raw upstream secret that is not json"))
	require.NotContains(t, string(invalid), "raw upstream secret")
	require.Contains(t, string(invalid), "response_redacted")
}

func TestMissingUpstreamTaskFailsWithCASAndRefund(t *testing.T) {
	truncate(t)
	const userID, preConsumed = 828, 80
	seedUser(t, userID, 1000)
	task := &model.Task{
		Platform:   constant.TaskPlatform("kling"),
		UserId:     userID,
		Quota:      preConsumed,
		Status:     model.TaskStatusSubmitted,
		Progress:   taskcommon.ProgressSubmitted,
		SubmitTime: time.Now().Unix(),
		CreatedAt:  time.Now().Unix(),
		UpdatedAt:  time.Now().Unix(),
	}
	require.NoError(t, model.DB.Create(task).Error)

	previousFactory := GetTaskAdaptorFunc
	previousLimit := constant.TaskQueryLimit
	constant.TaskQueryLimit = 100
	GetTaskAdaptorFunc = func(constant.TaskPlatform) TaskPollingAdaptor {
		return &safetyTaskPollingAdaptor{}
	}
	t.Cleanup(func() {
		GetTaskAdaptorFunc = previousFactory
		constant.TaskQueryLimit = previousLimit
	})

	summary := RunTaskPollingOnce(context.Background(), nil)

	require.Equal(t, 1, summary.Total)
	require.Equal(t, 1, summary.FixedNullTasks)
	var persisted model.Task
	require.NoError(t, model.DB.First(&persisted, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusFailure), persisted.Status)
	require.Equal(t, taskcommon.ProgressComplete, persisted.Progress)
	require.NotEmpty(t, persisted.FailReason)
	require.Positive(t, persisted.FinishTime)
	require.Equal(t, 1000+preConsumed, getUserQuota(t, userID))
	var refundLogs int64
	require.NoError(t, model.DB.Model(&model.Log{}).Where("type = ?", model.LogTypeRefund).Count(&refundLogs).Error)
	require.Equal(t, int64(1), refundLogs)
}

func TestMissingUpstreamTaskCASLoserDoesNotRefund(t *testing.T) {
	truncate(t)
	const userID, preConsumed = 838, 90
	seedUser(t, userID, 1000)
	task := &model.Task{
		Platform:  constant.TaskPlatform("kling"),
		UserId:    userID,
		Quota:     preConsumed,
		Status:    model.TaskStatusSubmitted,
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	}
	require.NoError(t, model.DB.Create(task).Error)
	var stale model.Task
	require.NoError(t, model.DB.First(&stale, task.ID).Error)
	require.NoError(t, model.DB.Model(&model.Task{}).Where("id = ?", task.ID).Update("status", model.TaskStatusSuccess).Error)

	won, err := failPollingTaskWithoutUpstreamID(context.Background(), &stale, true)

	require.NoError(t, err)
	require.False(t, won)
	var persisted model.Task
	require.NoError(t, model.DB.First(&persisted, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusSuccess), persisted.Status)
	require.Equal(t, 1000, getUserQuota(t, userID))
	var refundLogs int64
	require.NoError(t, model.DB.Model(&model.Log{}).Where("type = ?", model.LogTypeRefund).Count(&refundLogs).Error)
	require.Zero(t, refundLogs)
}

func TestMissingUpstreamTaskDoesNotOverwriteConcurrentTaskIDAssignment(t *testing.T) {
	truncate(t)
	const userID, preConsumed = 848, 70
	seedUser(t, userID, 1000)
	task := &model.Task{
		Platform:  constant.TaskPlatform("kling"),
		UserId:    userID,
		Quota:     preConsumed,
		Status:    model.TaskStatusSubmitted,
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	}
	require.NoError(t, model.DB.Create(task).Error)
	var stale model.Task
	require.NoError(t, model.DB.First(&stale, task.ID).Error)
	require.NoError(t, model.DB.Model(&model.Task{}).Where("id = ?", task.ID).Update("task_id", "assigned-upstream-id").Error)

	won, err := failPollingTaskWithoutUpstreamID(context.Background(), &stale, true)

	require.NoError(t, err)
	require.False(t, won)
	var persisted model.Task
	require.NoError(t, model.DB.First(&persisted, task.ID).Error)
	require.Equal(t, "assigned-upstream-id", persisted.TaskID)
	require.Equal(t, model.TaskStatus(model.TaskStatusSubmitted), persisted.Status)
	require.Equal(t, 1000, getUserQuota(t, userID))
}

func TestMissingUpstreamActiveTaskPersistsTerminalRefundIntent(t *testing.T) {
	truncate(t)
	const userID, preConsumed = 849, 70
	seedUser(t, userID, 1000+preConsumed)
	task := &model.Task{
		TaskID:   "task_missing_active_upstream",
		Platform: constant.TaskPlatform("kling"),
		UserId:   userID,
		Quota:    preConsumed,
		Status:   model.TaskStatusSubmitted,
		PrivateData: model.TaskPrivateData{
			UpstreamTaskID: "   ",
			BillingSource:  BillingSourceWallet,
		},
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	}
	operationKey := prepareActiveTaskBillingOperation(t, task, false)
	require.Equal(t, 1000, getUserQuota(t, userID))

	won, err := failPollingTaskWithoutUpstreamID(context.Background(), task, true)

	require.NoError(t, err)
	require.True(t, won)
	var persisted model.Task
	require.NoError(t, model.DB.First(&persisted, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusFailure), persisted.Status)
	require.Equal(t, PublicAsyncTaskFailureMessage, persisted.FailReason)
	require.Equal(t, 1000+preConsumed, getUserQuota(t, userID))
	var operation model.BillingOperation
	require.NoError(t, model.DB.Where("operation_key = ?", operationKey).First(&operation).Error)
	require.Equal(t, model.BillingOutcomeFailure, operation.Outcome)
	require.Zero(t, operation.AppliedQuota)
}

func TestPollingTaskIndexSeparatesIdenticalUpstreamIDsByChannel(t *testing.T) {
	first := &model.Task{ChannelId: 101, TaskID: "public-first"}
	second := &model.Task{ChannelId: 202, TaskID: "public-second"}
	tasks := map[string]*model.Task{}

	indexPollingTask(tasks, first.ChannelId, "shared-upstream-id", first)
	indexPollingTask(tasks, second.ChannelId, "shared-upstream-id", second)

	require.Same(t, first, lookupPollingTask(tasks, first.ChannelId, "shared-upstream-id"))
	require.Same(t, second, lookupPollingTask(tasks, second.ChannelId, "shared-upstream-id"))
}

func TestSanitizePollingFailureRemovesProviderCredentialsAndURLs(t *testing.T) {
	raw := "upstream geek2api rejected request_id=req-123 bearer sk-super-secret at https://provider.example/video?id=signed-token password=hunter2"

	got := sanitizePollingFailure(raw)

	for _, forbidden := range []string{"geek2api", "req-123", "sk-super-secret", "provider.example", "signed-token", "hunter2"} {
		require.NotContains(t, strings.ToLower(got), strings.ToLower(forbidden))
	}
	require.NotEmpty(t, got)
	require.LessOrEqual(t, len([]rune(got)), maxPollingFailureRunes)
}
