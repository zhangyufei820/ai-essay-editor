package gemini

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGeminiImageHandlerConvertsInlineDataCandidates(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body: io.NopCloser(strings.NewReader(`{
			"candidates": [
				{
					"content": {
						"parts": [
							{"text": "done"},
							{"inlineData": {"mimeType": "image/png", "data": "ZmFrZS1wbmc="}}
						]
					}
				}
			],
			"usageMetadata": {
				"promptTokenCount": 297,
				"candidatesTokenCount": 1120,
				"totalTokenCount": 1417
			}
		}`)),
	}

	usage, apiErr := GeminiImageHandler(ctx, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "banana-2"},
	}, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	require.Equal(t, 297, usage.PromptTokens)
	require.Equal(t, 1120, usage.CompletionTokens)
	require.Equal(t, 1417, usage.TotalTokens)

	require.Equal(t, http.StatusOK, recorder.Code)
	var imageResponse dto.ImageResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &imageResponse))
	require.Len(t, imageResponse.Data, 1)
	require.Equal(t, "ZmFrZS1wbmc=", imageResponse.Data[0].B64Json)
}
