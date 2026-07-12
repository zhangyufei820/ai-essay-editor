package service

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

	"github.com/stretchr/testify/require"
)

const expectedPublicAsyncTaskFailure = "模型服务暂时无法处理该任务，请稍后重试"

type asyncTaskFailureAdaptor struct {
	body   []byte
	result *relaycommon.TaskInfo
}

func (a *asyncTaskFailureAdaptor) Init(*relaycommon.RelayInfo) {}

func (a *asyncTaskFailureAdaptor) FetchTaskWithContext(context.Context, string, string, map[string]any, string) (*http.Response, error) {
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(bytes.NewReader(a.body)),
	}, nil
}

func (a *asyncTaskFailureAdaptor) ParseTaskResult([]byte) (*relaycommon.TaskInfo, error) {
	return a.result, nil
}

func (a *asyncTaskFailureAdaptor) AdjustBillingOnComplete(*model.Task, *relaycommon.TaskInfo) int {
	return 0
}

func TestSunoFailurePersistsOnlyPublicReason(t *testing.T) {
	truncate(t)
	rawReason := sensitiveAsyncTaskFailureFixture()
	baseURL := "https://suno.example"
	channel := &model.Channel{Id: 891, Name: "suno-redaction", BaseURL: &baseURL, Status: common.ChannelStatusEnabled}
	require.NoError(t, model.DB.Create(channel).Error)
	task := &model.Task{
		TaskID:    "public-suno-redaction",
		Platform:  constant.TaskPlatformSuno,
		ChannelId: channel.Id,
		Status:    model.TaskStatusInProgress,
		Progress:  "50%",
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
		PrivateData: model.TaskPrivateData{
			UpstreamTaskID: "upstream-suno-redaction",
		},
	}
	require.NoError(t, model.DB.Create(task).Error)

	responsePayload := dto.TaskResponse[[]dto.SunoDataResponse]{
		Code: dto.TaskSuccessCode,
		Data: []dto.SunoDataResponse{{
			TaskID:     task.GetUpstreamTaskID(),
			Status:     string(model.TaskStatusFailure),
			FailReason: rawReason,
			FinishTime: time.Now().Unix(),
			Data:       []byte(`{"error_message":"` + rawReason + `"}`),
		}},
	}
	responseBody, err := common.Marshal(responsePayload)
	require.NoError(t, err)
	adaptor := &asyncTaskFailureAdaptor{body: responseBody}
	previousFactory := GetTaskAdaptorFunc
	GetTaskAdaptorFunc = func(constant.TaskPlatform) TaskPollingAdaptor { return adaptor }
	t.Cleanup(func() { GetTaskAdaptorFunc = previousFactory })

	require.NoError(t, updateSunoTasks(
		context.Background(),
		channel.Id,
		[]string{task.GetUpstreamTaskID()},
		map[string]*model.Task{task.GetUpstreamTaskID(): task},
	))

	var persisted model.Task
	require.NoError(t, model.DB.First(&persisted, task.ID).Error)
	assertPublicAsyncTaskFailure(t, persisted.FailReason)
	assertNoSensitiveAsyncTaskFailure(t, string(persisted.Data))
}

func TestVideoFailurePersistsOnlyPublicReason(t *testing.T) {
	truncate(t)
	rawReason := sensitiveAsyncTaskFailureFixture()
	task := &model.Task{
		TaskID:    "public-video-redaction",
		Platform:  constant.TaskPlatform("kling"),
		ChannelId: 892,
		Status:    model.TaskStatusInProgress,
		Progress:  "50%",
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
		PrivateData: model.TaskPrivateData{
			UpstreamTaskID: "upstream-video-redaction",
		},
	}
	require.NoError(t, model.DB.Create(task).Error)
	responseBody, err := common.Marshal(map[string]any{"reason": rawReason})
	require.NoError(t, err)
	adaptor := &asyncTaskFailureAdaptor{
		body: responseBody,
		result: &relaycommon.TaskInfo{
			TaskID: task.GetUpstreamTaskID(),
			Status: string(model.TaskStatusFailure),
			Reason: rawReason,
		},
	}

	require.NoError(t, updateVideoSingleTask(
		context.Background(),
		adaptor,
		&model.Channel{Id: task.ChannelId},
		task.GetUpstreamTaskID(),
		map[string]*model.Task{task.GetUpstreamTaskID(): task},
	))

	var persisted model.Task
	require.NoError(t, model.DB.First(&persisted, task.ID).Error)
	assertPublicAsyncTaskFailure(t, persisted.FailReason)
	assertNoSensitiveAsyncTaskFailure(t, string(persisted.Data))
}

func TestFailureResponseRedactionCoversScalarAndArrayValues(t *testing.T) {
	rawReason := sensitiveAsyncTaskFailureFixture()

	for _, body := range [][]byte{
		[]byte(`"` + rawReason + `"`),
		[]byte(`["safe status","` + rawReason + `"]`),
	} {
		redacted := RedactAsyncTaskResponseBody(body, true)

		assertNoSensitiveAsyncTaskFailure(t, string(redacted))
		require.Less(t, len(redacted), 1024)
	}
}

func sensitiveAsyncTaskFailureFixture() string {
	return "Geek2API Moonapix CCAPI DragTokens upstream https://internal.example/v1 " +
		"Authorization: Bearer bearer-credential token=token-credential " +
		"secret=secret-credential password=password-credential " + strings.Repeat("x", 4096)
}

func assertPublicAsyncTaskFailure(t *testing.T, value string) {
	t.Helper()
	require.Equal(t, expectedPublicAsyncTaskFailure, value)
	require.LessOrEqual(t, len(value), 128)
	assertNoSensitiveAsyncTaskFailure(t, value)
}

func assertNoSensitiveAsyncTaskFailure(t *testing.T, value string) {
	t.Helper()
	lower := strings.ToLower(value)
	for _, forbidden := range []string{
		"bearer-credential",
		"token-credential",
		"secret-credential",
		"password-credential",
		"https://",
		"geek2api",
		"moonapix",
		"ccapi",
		"dragtokens",
	} {
		require.NotContains(t, lower, forbidden)
	}
}
