package service

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type contextPollingAdaptor struct {
	started          chan struct{}
	deadlineObserved chan bool
	legacyCalls      atomic.Int32
}

func (a *contextPollingAdaptor) Init(*relaycommon.RelayInfo) {}

func (a *contextPollingAdaptor) FetchTask(string, string, map[string]any, string) (*http.Response, error) {
	a.legacyCalls.Add(1)
	return nil, errors.New("legacy fetch path called")
}

func (a *contextPollingAdaptor) FetchTaskWithContext(ctx context.Context, _ string, _ string, _ map[string]any, _ string) (*http.Response, error) {
	if a.deadlineObserved != nil {
		_, hasDeadline := ctx.Deadline()
		a.deadlineObserved <- hasDeadline
	}
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

func resetAsyncVideoWatcherLifecycleForTest(t *testing.T) {
	t.Helper()
	stopCtx, stopCancel := context.WithTimeout(context.Background(), time.Second)
	require.NoError(t, StopAsyncVideoWatchers(stopCtx))
	stopCancel()
	ConfigureAsyncVideoWatcherContext(context.Background())
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), time.Second)
		defer cleanupCancel()
		require.NoError(t, StopAsyncVideoWatchers(cleanupCtx))
		ConfigureAsyncVideoWatcherContext(context.Background())
	})
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

func TestVideoPollingBoundsContextAwareFetchWithoutParentDeadline(t *testing.T) {
	adaptor := &contextPollingAdaptor{
		started:          make(chan struct{}),
		deadlineObserved: make(chan bool, 1),
	}
	task := &model.Task{
		ChannelId: 12,
		TaskID:    "public-deadline-task",
		Status:    model.TaskStatusInProgress,
	}
	task.PrivateData.UpstreamTaskID = "upstream-deadline-task"
	tasks := map[string]*model.Task{}
	indexPollingTask(tasks, task.ChannelId, task.GetUpstreamTaskID(), task)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)

	go func() {
		done <- updateVideoSingleTask(ctx, adaptor, &model.Channel{Id: task.ChannelId}, task.GetUpstreamTaskID(), tasks)
	}()

	select {
	case hasDeadline := <-adaptor.deadlineObserved:
		require.True(t, hasDeadline, "polling must bound an adaptor that otherwise waits forever")
	case <-time.After(time.Second):
		t.Fatal("context-aware fetch was not started")
	}
	cancel()
	select {
	case err := <-done:
		require.ErrorIs(t, err, context.Canceled)
	case <-time.After(time.Second):
		t.Fatal("bounded polling did not stop after parent cancellation")
	}
}

func TestSunoPollingBoundsContextAwareFetchWithoutParentDeadline(t *testing.T) {
	truncate(t)
	baseURL := "https://suno.example.test"
	channel := &model.Channel{Id: 13, BaseURL: &baseURL}
	require.NoError(t, model.DB.Create(channel).Error)
	adaptor := &contextPollingAdaptor{
		started:          make(chan struct{}),
		deadlineObserved: make(chan bool, 1),
	}
	previousFactory := GetTaskAdaptorFunc
	GetTaskAdaptorFunc = func(constant.TaskPlatform) TaskPollingAdaptor { return adaptor }
	t.Cleanup(func() { GetTaskAdaptorFunc = previousFactory })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)

	go func() {
		done <- updateSunoTasks(ctx, channel.Id, []string{"upstream-suno-deadline"}, nil)
	}()

	select {
	case hasDeadline := <-adaptor.deadlineObserved:
		require.True(t, hasDeadline, "Suno polling must bound an adaptor that otherwise waits forever")
	case <-time.After(time.Second):
		t.Fatal("Suno context-aware fetch was not started")
	}
	cancel()
	select {
	case err := <-done:
		require.ErrorIs(t, err, context.Canceled)
	case <-time.After(time.Second):
		t.Fatal("bounded Suno polling did not stop after parent cancellation")
	}
}

func TestTaskPollingTimeoutPreservesEarlierParentDeadline(t *testing.T) {
	parentDeadline := time.Now().Add(time.Second)
	parentCtx, parentCancel := context.WithDeadline(context.Background(), parentDeadline)
	defer parentCancel()

	boundedCtx, boundedCancel := withTaskPollingTimeout(parentCtx, taskPollingRunTimeout)
	defer boundedCancel()
	boundedDeadline, hasDeadline := boundedCtx.Deadline()

	require.True(t, hasDeadline)
	require.Equal(t, parentDeadline, boundedDeadline)
}

func TestStopAsyncVideoWatchersCancelsWithoutReportingTimeout(t *testing.T) {
	resetAsyncVideoWatcherLifecycleForTest(t)
	var logs bytes.Buffer
	common.LogWriterMu.Lock()
	previousErrorWriter := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &logs
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultErrorWriter = previousErrorWriter
		common.LogWriterMu.Unlock()
	})

	const taskID = "watcher-stop-cancel-task"
	watcherDone := make(chan struct{})
	go func() {
		WatchAsyncVideoTask(taskID)
		close(watcherDone)
	}()
	require.Eventually(t, func() bool {
		_, active := activeAsyncVideoWatchers.Load(taskID)
		return active
	}, time.Second, time.Millisecond)

	stopCtx, stopCancel := context.WithTimeout(context.Background(), time.Second)
	require.NoError(t, StopAsyncVideoWatchers(stopCtx))
	stopCancel()
	select {
	case <-watcherDone:
	case <-time.After(time.Second):
		t.Fatal("watcher did not drain after stop cancellation")
	}
	_, active := activeAsyncVideoWatchers.Load(taskID)
	require.False(t, active)
	WatchAsyncVideoTask("watcher-rejected-after-stop")
	_, active = activeAsyncVideoWatchers.Load("watcher-rejected-after-stop")
	require.False(t, active)
	common.LogWriterMu.RLock()
	logOutput := logs.String()
	common.LogWriterMu.RUnlock()
	require.NotContains(t, logOutput, "timed out for task "+taskID)
}

func TestConfigureAsyncVideoWatcherWaitsForOldGenerationBeforeStartingNew(t *testing.T) {
	resetAsyncVideoWatcherLifecycleForTest(t)
	asyncVideoWatcherLifecycle.Lock()
	previousGeneration := asyncVideoWatcherLifecycle.generation
	previousGeneration.waitGroup.Add(1)
	asyncVideoWatcherLifecycle.Unlock()
	oldGenerationReleased := false
	defer func() {
		if !oldGenerationReleased {
			previousGeneration.waitGroup.Done()
		}
	}()

	nextContext, nextCancel := context.WithCancel(context.Background())
	defer nextCancel()
	configureDone := make(chan struct{})
	go func() {
		ConfigureAsyncVideoWatcherContext(nextContext)
		close(configureDone)
	}()
	select {
	case <-previousGeneration.context.Done():
	case <-time.After(time.Second):
		t.Fatal("reconfigure did not cancel the old generation")
	}

	const taskID = "watcher-next-generation-task"
	watchCallStarted := make(chan struct{})
	watchDone := make(chan struct{})
	go func() {
		close(watchCallStarted)
		WatchAsyncVideoTask(taskID)
		close(watchDone)
	}()
	<-watchCallStarted
	earlyStartDeadline := time.Now().Add(150 * time.Millisecond)
	earlyStarted := false
	for time.Now().Before(earlyStartDeadline) {
		if _, active := activeAsyncVideoWatchers.Load(taskID); active {
			earlyStarted = true
			break
		}
		time.Sleep(time.Millisecond)
	}
	watchReturnedEarly := false
	select {
	case <-watchDone:
		watchReturnedEarly = true
	default:
	}

	previousGeneration.waitGroup.Done()
	oldGenerationReleased = true
	select {
	case <-configureDone:
	case <-time.After(time.Second):
		t.Fatal("reconfigure did not finish after the old generation drained")
	}
	require.Eventually(t, func() bool {
		_, active := activeAsyncVideoWatchers.Load(taskID)
		return active
	}, time.Second, time.Millisecond)
	nextCancel()
	select {
	case <-watchDone:
	case <-time.After(time.Second):
		t.Fatal("new generation watcher did not stop after cancellation")
	}
	require.False(t, earlyStarted, "new generation accepted a watcher before the old generation drained")
	require.False(t, watchReturnedEarly, "watcher was rejected instead of waiting for reconfiguration")
}

func TestPollAsyncVideoTaskDatabaseLookupHonorsContextDeadline(t *testing.T) {
	sqlDB, err := model.DB.DB()
	require.NoError(t, err)
	connection, err := sqlDB.Conn(context.Background())
	require.NoError(t, err)

	type pollResult struct {
		done bool
		err  error
	}
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	resultChannel := make(chan pollResult, 1)
	go func() {
		done, pollErr := pollAsyncVideoTaskByPublicID(ctx, "blocked-database-context-task")
		resultChannel <- pollResult{done: done, err: pollErr}
	}()

	var result pollResult
	queryIgnoredDeadline := false
	select {
	case result = <-resultChannel:
	case <-time.After(500 * time.Millisecond):
		queryIgnoredDeadline = true
	}
	require.NoError(t, connection.Close())
	if queryIgnoredDeadline {
		select {
		case <-resultChannel:
		case <-time.After(time.Second):
		}
		t.Fatal("database lookup remained blocked after its context deadline")
	}
	require.False(t, result.done)
	require.ErrorIs(t, result.err, context.DeadlineExceeded)
}
