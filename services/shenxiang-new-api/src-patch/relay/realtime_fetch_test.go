package relay

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/require"
)

type realtimeFetchAdaptor struct {
	fetch func(context.Context) (*http.Response, error)
	parse func([]byte) (*relaycommon.TaskInfo, error)
}

func (adaptor *realtimeFetchAdaptor) Init(*relaycommon.RelayInfo) {}

func (adaptor *realtimeFetchAdaptor) FetchTaskWithContext(
	ctx context.Context,
	_ string,
	_ string,
	_ map[string]any,
	_ string,
) (*http.Response, error) {
	return adaptor.fetch(ctx)
}

func (adaptor *realtimeFetchAdaptor) ParseTaskResult(body []byte) (*relaycommon.TaskInfo, error) {
	return adaptor.parse(body)
}

func (adaptor *realtimeFetchAdaptor) AdjustBillingOnComplete(*model.Task, *relaycommon.TaskInfo) int {
	return 0
}

func installRealtimeFetchTestDependencies(t *testing.T, adaptor service.TaskPollingAdaptor) {
	t.Helper()
	originalLookup := realtimeChannelLookup
	originalFactory := realtimePollingAdaptorFactory
	realtimeChannelLookup = func(int, bool) (*model.Channel, error) {
		return &model.Channel{Id: 1, Type: constant.ChannelTypeGemini, Key: "test-key"}, nil
	}
	realtimePollingAdaptorFactory = func(int) service.TaskPollingAdaptor { return adaptor }
	t.Cleanup(func() {
		realtimeChannelLookup = originalLookup
		realtimePollingAdaptorFactory = originalFactory
	})
}

func TestRealtimeFetchUsesBoundedRequestContext(t *testing.T) {
	var remaining time.Duration
	adaptor := &realtimeFetchAdaptor{
		fetch: func(ctx context.Context) (*http.Response, error) {
			deadline, ok := ctx.Deadline()
			require.True(t, ok)
			remaining = time.Until(deadline)
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"status":"IN_PROGRESS"}`))}, nil
		},
		parse: func([]byte) (*relaycommon.TaskInfo, error) {
			return &relaycommon.TaskInfo{Status: model.TaskStatusInProgress}, nil
		},
	}
	installRealtimeFetchTestDependencies(t, adaptor)
	task := &model.Task{TaskID: "task-realtime-context", ChannelId: 1, Status: model.TaskStatusInProgress}

	response := tryRealtimeFetch(context.Background(), task, false)

	require.NotEmpty(t, response)
	require.Greater(t, remaining, 29*time.Second)
	require.LessOrEqual(t, remaining, 30*time.Second)
}

func TestRealtimeFetchPreservesEarlierParentDeadline(t *testing.T) {
	var remaining time.Duration
	adaptor := &realtimeFetchAdaptor{
		fetch: func(ctx context.Context) (*http.Response, error) {
			deadline, ok := ctx.Deadline()
			require.True(t, ok)
			remaining = time.Until(deadline)
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"status":"IN_PROGRESS"}`))}, nil
		},
		parse: func([]byte) (*relaycommon.TaskInfo, error) {
			return &relaycommon.TaskInfo{Status: model.TaskStatusInProgress}, nil
		},
	}
	installRealtimeFetchTestDependencies(t, adaptor)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	task := &model.Task{TaskID: "task-realtime-parent", ChannelId: 1, Status: model.TaskStatusInProgress}

	require.NotEmpty(t, tryRealtimeFetch(ctx, task, false))
	require.Greater(t, remaining, 0*time.Second)
	require.LessOrEqual(t, remaining, time.Second)
}

func TestRealtimeFetchCapsAndClosesResponseBody(t *testing.T) {
	t.Setenv("MAX_UPSTREAM_RESPONSE_BYTES", "4")
	body := &trackingTaskResponseBody{Reader: strings.NewReader("12345")}
	adaptor := &realtimeFetchAdaptor{
		fetch: func(context.Context) (*http.Response, error) {
			return &http.Response{StatusCode: http.StatusOK, Body: body}, nil
		},
		parse: func([]byte) (*relaycommon.TaskInfo, error) {
			t.Fatal("oversized response must not be parsed")
			return nil, nil
		},
	}
	installRealtimeFetchTestDependencies(t, adaptor)
	task := &model.Task{TaskID: "task-realtime-cap", ChannelId: 1, Status: model.TaskStatusInProgress}

	require.Nil(t, tryRealtimeFetch(context.Background(), task, false))
	require.True(t, body.closed)
}

func TestRealtimeFetchDoesNotCallUpstreamForTerminalTasks(t *testing.T) {
	fetchCalls := 0
	adaptor := &realtimeFetchAdaptor{
		fetch: func(context.Context) (*http.Response, error) {
			fetchCalls++
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"status":"FAILURE"}`))}, nil
		},
		parse: func([]byte) (*relaycommon.TaskInfo, error) {
			return &relaycommon.TaskInfo{Status: model.TaskStatusFailure}, nil
		},
	}
	installRealtimeFetchTestDependencies(t, adaptor)

	for _, status := range []model.TaskStatus{model.TaskStatusSuccess, model.TaskStatusFailure} {
		task := &model.Task{TaskID: "task-realtime-terminal", ChannelId: 1, Status: status}
		require.Nil(t, tryRealtimeFetch(context.Background(), task, false))
		require.Equal(t, status, task.Status)
	}
	require.Zero(t, fetchCalls)
}

func TestRealtimeFetchNonSuccessHTTPDoesNotParseOrMutateTask(t *testing.T) {
	parseCalls := 0
	body := &trackingTaskResponseBody{Reader: strings.NewReader(`{"error":{"message":"unauthorized"}}`)}
	adaptor := &realtimeFetchAdaptor{
		fetch: func(context.Context) (*http.Response, error) {
			return &http.Response{StatusCode: http.StatusUnauthorized, Body: body}, nil
		},
		parse: func([]byte) (*relaycommon.TaskInfo, error) {
			parseCalls++
			return relaycommon.FailTaskInfo("unauthorized"), nil
		},
	}
	installRealtimeFetchTestDependencies(t, adaptor)
	task := &model.Task{TaskID: "task-realtime-http-error", ChannelId: 1, Status: model.TaskStatusInProgress}

	require.Nil(t, tryRealtimeFetch(context.Background(), task, false))
	require.Zero(t, parseCalls)
	require.True(t, body.closed)
	require.Equal(t, model.TaskStatus(model.TaskStatusInProgress), task.Status)
}

func TestRealtimeFetchDefersSuccessToCompleteBackgroundFinalization(t *testing.T) {
	adaptor := &realtimeFetchAdaptor{
		fetch: func(context.Context) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(`{"status":"SUCCESS","video":"data:video/mp4;base64,AAAA"}`)),
			}, nil
		},
		parse: func([]byte) (*relaycommon.TaskInfo, error) {
			return &relaycommon.TaskInfo{
				Status:    model.TaskStatusSuccess,
				Url:       "data:video/mp4;base64,AAAA",
				RemoteUrl: "https://provider.example/video.mp4",
			}, nil
		},
	}
	installRealtimeFetchTestDependencies(t, adaptor)
	task := &model.Task{TaskID: "task-realtime-success-deferred", ChannelId: 1, Status: model.TaskStatusInProgress}

	require.Nil(t, tryRealtimeFetch(context.Background(), task, false))
	require.Equal(t, model.TaskStatus(model.TaskStatusInProgress), task.Status)
	require.Empty(t, task.Data)
	require.Empty(t, task.PrivateData.ResultURL)
}

func TestRealtimeFetchDefersFailureToCompleteBackgroundFinalization(t *testing.T) {
	adaptor := &realtimeFetchAdaptor{
		fetch: func(context.Context) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(`{"status":"FAILURE","error":"provider failure"}`)),
			}, nil
		},
		parse: func([]byte) (*relaycommon.TaskInfo, error) {
			return relaycommon.FailTaskInfo("provider failure"), nil
		},
	}
	installRealtimeFetchTestDependencies(t, adaptor)
	task := &model.Task{TaskID: "task-realtime-failure-deferred", ChannelId: 1, Status: model.TaskStatusInProgress}

	require.Nil(t, tryRealtimeFetch(context.Background(), task, false))
	require.Equal(t, model.TaskStatus(model.TaskStatusInProgress), task.Status)
	require.Empty(t, task.FailReason)
	require.Empty(t, task.Data)
}
