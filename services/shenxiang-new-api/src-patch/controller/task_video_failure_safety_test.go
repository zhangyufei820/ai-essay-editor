package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type controllerAsyncTaskFailureAdaptor struct {
	body   []byte
	result *relaycommon.TaskInfo
}

func (a *controllerAsyncTaskFailureAdaptor) Init(*relaycommon.RelayInfo) {}

func (a *controllerAsyncTaskFailureAdaptor) FetchTaskWithContext(context.Context, string, string, map[string]any, string) (*http.Response, error) {
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(bytes.NewReader(a.body)),
	}, nil
}

func (a *controllerAsyncTaskFailureAdaptor) ParseTaskResult([]byte) (*relaycommon.TaskInfo, error) {
	return a.result, nil
}

func (a *controllerAsyncTaskFailureAdaptor) AdjustBillingOnComplete(*model.Task, *relaycommon.TaskInfo) int {
	return 0
}

func TestVideoPollingControllerReturnsOnlyPublicFailureReason(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(
		&model.Task{},
		&model.Channel{},
		&model.BillingOperation{},
		&model.BillingOutbox{},
	))
	previousDB := model.DB
	previousFactory := service.GetTaskAdaptorFunc
	previousRedisEnabled := common.RedisEnabled
	model.DB = db
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB = previousDB
		service.GetTaskAdaptorFunc = previousFactory
		common.RedisEnabled = previousRedisEnabled
	})

	rawReason := "Geek2API Moonapix provider https://internal.example/v1 " +
		"Authorization: Bearer bearer-credential token=token-credential " +
		"secret=secret-credential password=password-credential " + strings.Repeat("x", 4096)
	baseURL := "https://video.example"
	channel := &model.Channel{
		Id:      893,
		Name:    "video-redaction",
		BaseURL: &baseURL,
		Status:  common.ChannelStatusEnabled,
	}
	require.NoError(t, model.DB.Create(channel).Error)
	task := &model.Task{
		TaskID:    "public-controller-video-redaction",
		Platform:  constant.TaskPlatform("kling"),
		ChannelId: channel.Id,
		Status:    model.TaskStatusInProgress,
		Progress:  "50%",
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
		PrivateData: model.TaskPrivateData{
			UpstreamTaskID: "upstream-controller-video-redaction",
		},
	}
	require.NoError(t, model.DB.Create(task).Error)
	responseBody, err := json.Marshal(map[string]any{"reason": rawReason})
	require.NoError(t, err)
	adaptor := &controllerAsyncTaskFailureAdaptor{
		body: responseBody,
		result: &relaycommon.TaskInfo{
			TaskID: task.GetUpstreamTaskID(),
			Status: string(model.TaskStatusFailure),
			Reason: rawReason,
		},
	}
	service.GetTaskAdaptorFunc = func(constant.TaskPlatform) service.TaskPollingAdaptor { return adaptor }

	require.NoError(t, UpdateVideoTaskAll(
		context.Background(),
		task.Platform,
		map[int][]string{channel.Id: {task.GetUpstreamTaskID()}},
		map[string]*model.Task{task.GetUpstreamTaskID(): task},
	))

	var persisted model.Task
	require.NoError(t, model.DB.First(&persisted, task.ID).Error)
	require.Equal(t, service.PublicAsyncTaskFailureMessage, persisted.FailReason)
	require.LessOrEqual(t, len(persisted.FailReason), 128)

	playgroundResponse := taskToPlaygroundVideoTask(&persisted, &playgroundVideoMediaMarker{})
	playgroundJSON, err := json.Marshal(playgroundResponse)
	require.NoError(t, err)
	dtoJSON, err := json.Marshal(relay.TaskModel2Dto(&persisted))
	require.NoError(t, err)
	for _, encoded := range []string{string(playgroundJSON), string(dtoJSON)} {
		require.Contains(t, encoded, service.PublicAsyncTaskFailureMessage)
		assertNoAsyncTaskFailureSecret(t, encoded)
	}
}

func assertNoAsyncTaskFailureSecret(t *testing.T, encoded string) {
	t.Helper()
	lower := strings.ToLower(encoded)
	for _, forbidden := range []string{
		"bearer-credential",
		"token-credential",
		"secret-credential",
		"password-credential",
		"https://internal.example",
		"geek2api",
		"moonapix",
	} {
		require.NotContains(t, lower, forbidden)
	}
}
