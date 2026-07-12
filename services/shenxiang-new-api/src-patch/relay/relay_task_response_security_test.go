package relay

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
)

type trackingTaskResponseBody struct {
	io.Reader
	closed bool
}

func (body *trackingTaskResponseBody) Close() error {
	body.closed = true
	return nil
}

func TestBufferTaskSubmitResponseCapsAndClosesBody(t *testing.T) {
	t.Setenv("MAX_UPSTREAM_RESPONSE_BYTES", "4")
	body := &trackingTaskResponseBody{Reader: strings.NewReader("12345")}
	response := &http.Response{StatusCode: http.StatusOK, Body: body}

	_, err := bufferTaskSubmitResponse(response)
	require.Error(t, err)
	require.True(t, body.closed)
}

func TestBufferTaskSubmitResponseReplaysBoundedBody(t *testing.T) {
	t.Setenv("MAX_UPSTREAM_RESPONSE_BYTES", "16")
	body := &trackingTaskResponseBody{Reader: strings.NewReader("bounded")}
	response := &http.Response{StatusCode: http.StatusOK, Body: body}

	buffered, err := bufferTaskSubmitResponse(response)
	require.NoError(t, err)
	require.Equal(t, "bounded", string(buffered))
	require.True(t, body.closed)
	replayed, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	require.Equal(t, "bounded", string(replayed))
}

func TestBufferTaskSubmitResponseRejectsMissingResponse(t *testing.T) {
	_, err := bufferTaskSubmitResponse(nil)
	require.Error(t, err)
	_, err = bufferTaskSubmitResponse(&http.Response{})
	require.Error(t, err)
}

func TestSanitizeDispatchedTaskErrorHidesProviderDetails(t *testing.T) {
	taskErr := &dto.TaskError{
		Code:       "geek2api_failure",
		Message:    "provider secret leaked",
		Error:      errors.New("provider secret leaked"),
		StatusCode: http.StatusBadGateway,
	}

	sanitized := sanitizeDispatchedTaskError(taskErr)
	require.Equal(t, "service_unavailable", sanitized.Code)
	require.Equal(t, "模型服务暂时不可用，请稍后重试。", sanitized.Message)
	require.EqualError(t, sanitized.Error, "provider secret leaked")
	require.Equal(t, http.StatusBadGateway, sanitized.StatusCode)
}
