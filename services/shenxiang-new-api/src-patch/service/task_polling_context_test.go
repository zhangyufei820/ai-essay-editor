package service

import (
	"context"
	"errors"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

	"github.com/stretchr/testify/require"
)

type contextPollingAdaptor struct {
	started     chan struct{}
	legacyCalls atomic.Int32
}

func (a *contextPollingAdaptor) Init(*relaycommon.RelayInfo) {}

func (a *contextPollingAdaptor) FetchTask(string, string, map[string]any, string) (*http.Response, error) {
	a.legacyCalls.Add(1)
	return nil, errors.New("legacy fetch path called")
}

func (a *contextPollingAdaptor) FetchTaskWithContext(ctx context.Context, _ string, _ string, _ map[string]any, _ string) (*http.Response, error) {
	close(a.started)
	<-ctx.Done()
	return nil, ctx.Err()
}

func (a *contextPollingAdaptor) ParseTaskResult([]byte) (*relaycommon.TaskInfo, error) {
	return &relaycommon.TaskInfo{}, nil
}

func (a *contextPollingAdaptor) AdjustBillingOnComplete(*model.Task, *relaycommon.TaskInfo) int {
	return 0
}

func TestRunTaskPollingOnceCanceledContextDoesNotMutateTasks(t *testing.T) {
	truncate(t)
	task := &model.Task{
		TaskID:     "cancelled_poll_task",
		Platform:   constant.TaskPlatform("kling"),
		Status:     model.TaskStatusInProgress,
		Progress:   "20%",
		SubmitTime: time.Now().Unix(),
		CreatedAt:  time.Now().Unix(),
		UpdatedAt:  time.Now().Unix(),
	}
	require.NoError(t, model.DB.Create(task).Error)

	previousFactory := GetTaskAdaptorFunc
	GetTaskAdaptorFunc = func(constant.TaskPlatform) TaskPollingAdaptor { return nil }
	t.Cleanup(func() { GetTaskAdaptorFunc = previousFactory })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	summary := RunTaskPollingOnce(ctx, nil)

	require.Zero(t, summary.Total)
	var persisted model.Task
	require.NoError(t, model.DB.First(&persisted, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusInProgress), persisted.Status)
	require.Equal(t, "20%", persisted.Progress)
}

func TestCanceledContextStopsVideoDispatchBeforeAdaptorLookup(t *testing.T) {
	var factoryCalls atomic.Int32
	previousFactory := GetTaskAdaptorFunc
	GetTaskAdaptorFunc = func(constant.TaskPlatform) TaskPollingAdaptor {
		factoryCalls.Add(1)
		return nil
	}
	t.Cleanup(func() { GetTaskAdaptorFunc = previousFactory })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	tasksByChannel := map[int][]string{1: {"upstream-task"}}
	tasksByID := map[string]*model.Task{"upstream-task": {TaskID: "public-task"}}

	err := UpdateVideoTasks(ctx, constant.TaskPlatform("kling"), tasksByChannel, tasksByID)
	DispatchPlatformUpdate(ctx, constant.TaskPlatform("kling"), tasksByChannel, tasksByID)

	require.ErrorIs(t, err, context.Canceled)
	require.Zero(t, factoryCalls.Load())
}

func TestVideoPollingCancelsInFlightContextAwareFetch(t *testing.T) {
	adaptor := &contextPollingAdaptor{started: make(chan struct{})}
	task := &model.Task{
		ChannelId: 11,
		TaskID:    "public-context-task",
		Status:    model.TaskStatusInProgress,
	}
	task.PrivateData.UpstreamTaskID = "upstream-context-task"
	tasks := map[string]*model.Task{}
	indexPollingTask(tasks, task.ChannelId, task.GetUpstreamTaskID(), task)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)

	go func() {
		done <- updateVideoSingleTask(ctx, adaptor, &model.Channel{Id: task.ChannelId}, task.GetUpstreamTaskID(), tasks)
	}()

	select {
	case <-adaptor.started:
	case <-time.After(time.Second):
		t.Fatal("context-aware fetch was not started")
	}
	cancel()
	select {
	case err := <-done:
		require.ErrorIs(t, err, context.Canceled)
	case <-time.After(time.Second):
		t.Fatal("polling did not stop after context cancellation")
	}
	require.Zero(t, adaptor.legacyCalls.Load())
}
