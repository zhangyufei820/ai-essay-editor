package jimeng

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/pkg/errors"
)

func (a *TaskAdaptor) FetchTaskWithContext(ctx context.Context, baseURL, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid task_id")
	}
	requestURL := fmt.Sprintf("%s/?Action=CVSync2AsyncGetResult&Version=2022-08-31", baseURL)
	if isNewAPIRelay(key) {
		requestURL = fmt.Sprintf("%s/jimeng/?Action=CVSync2AsyncGetResult&Version=2022-08-31", a.baseURL)
	}
	encoded, err := common.Marshal(map[string]string{"req_key": "jimeng_vgfm_t2v_l20", "task_id": taskID})
	if err != nil {
		return nil, errors.Wrap(err, "marshal fetch task payload failed")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(encoded))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	if isNewAPIRelay(key) {
		req.Header.Set("Authorization", "Bearer "+key)
	} else {
		keyParts := strings.Split(key, "|")
		if len(keyParts) != 2 {
			return nil, fmt.Errorf("invalid api key format for jimeng: expected 'ak|sk'")
		}
		if err := a.signRequest(req, strings.TrimSpace(keyParts[0]), strings.TrimSpace(keyParts[1])); err != nil {
			return nil, errors.Wrap(err, "sign request failed")
		}
	}
	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client failed: %w", err)
	}
	return client.Do(req)
}
