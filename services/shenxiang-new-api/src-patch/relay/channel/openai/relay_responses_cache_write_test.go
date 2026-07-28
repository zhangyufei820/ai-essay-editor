package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestOaiResponsesHandlerCopiesCacheWriteTokens(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)

	response := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body: io.NopCloser(strings.NewReader(`{
			"object":"response",
			"status":"completed",
			"usage":{
				"input_tokens":100,
				"output_tokens":20,
				"total_tokens":120,
				"input_tokens_details":{"cached_tokens":70,"cache_write_tokens":15}
			}
		}`)),
	}

	usage, apiErr := OaiResponsesHandler(context, nil, response)
	require.Nil(t, apiErr)
	require.Equal(t, 70, usage.PromptTokensDetails.CachedTokens)
	require.Equal(t, 15, usage.PromptTokensDetails.CachedCreationTokens)
}

func TestOaiResponsesStreamHandlerCopiesCacheWriteTokens(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)

	response := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body: io.NopCloser(strings.NewReader(strings.Join([]string{
			`data: {"type":"response.completed","response":{"object":"response","status":"completed","usage":{"input_tokens":100,"output_tokens":20,"total_tokens":120,"input_tokens_details":{"cached_tokens":70,"cache_write_tokens":15}}}}`,
			`data: [DONE]`,
			``,
		}, "\n"))),
	}

	usage, apiErr := OaiResponsesStreamHandler(context, &relaycommon.RelayInfo{}, response)
	require.NotNil(t, apiErr)
	require.Equal(t, types.ErrorCodeEmptyResponse, apiErr.GetErrorCode())
	require.Equal(t, 70, usage.PromptTokensDetails.CachedTokens)
	require.Equal(t, 15, usage.PromptTokensDetails.CachedCreationTokens)
	require.NotContains(t, recorder.Body.String(), "response.completed")
}
