package vertex

import (
	"bytes"
	"context"
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	taskcommon "github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	vertexcore "github.com/QuantumNous/new-api/relay/channel/vertex"
	"github.com/QuantumNous/new-api/service"
)

func (a *TaskAdaptor) FetchTaskWithContext(ctx context.Context, baseURL, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid task_id")
	}
	upstreamName, err := taskcommon.DecodeLocalTaskID(taskID)
	if err != nil {
		return nil, fmt.Errorf("decode task_id failed: %w", err)
	}
	requestURL, err := buildFetchOperationURL(baseURL, upstreamName)
	if err != nil {
		return nil, err
	}
	encoded, err := common.Marshal(fetchOperationPayload{OperationName: upstreamName})
	if err != nil {
		return nil, err
	}
	credentials := &vertexcore.Credentials{}
	if err := common.Unmarshal([]byte(key), credentials); err != nil {
		return nil, fmt.Errorf("failed to decode credentials: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	token, err := vertexcore.AcquireAccessToken(*credentials, proxy)
	if err != nil {
		return nil, fmt.Errorf("failed to acquire access token: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(encoded))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("x-goog-user-project", credentials.ProjectID)
	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client failed: %w", err)
	}
	return client.Do(req)
}
