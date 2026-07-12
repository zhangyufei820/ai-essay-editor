package service

import (
	"context"
	"net/http"
)

func (a *taskPollingFetchAdaptor) FetchTaskWithContext(_ context.Context, baseURL, key string, body map[string]any, proxy string) (*http.Response, error) {
	return a.FetchTask(baseURL, key, body, proxy)
}
