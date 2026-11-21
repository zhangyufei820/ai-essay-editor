package claude

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

func TestClaudeStreamRequiresMessageStop(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 5
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })
	const start = `data: {"type":"message_start","message":{"id":"msg_test","model":"claude-test","usage":{"input_tokens":10}}}` + "\n\n"
	const delta = `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}` + "\n\n"
	const usageEvent = `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}` + "\n\n"
	const stop = `data: {"type":"message_stop"}` + "\n\n"

	for _, tc := range []struct {
		name    string
		data    string
		err     bool
		partial bool
	}{
		{name: "empty upstream", err: true},
		{name: "missing message stop", data: start + delta + usageEvent, err: true, partial: true},
		{name: "successful stop", data: start + delta + usageEvent + stop},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
			info := &relaycommon.RelayInfo{
				RelayFormat: types.RelayFormatOpenAI,
				ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "claude-test"},
			}
			upstream := &http.Response{Body: io.NopCloser(strings.NewReader(tc.data))}
			actualUsage, apiErr := ClaudeStreamHandler(c, upstream, info)
			if tc.err {
				require.NotNil(t, apiErr)
				require.Equal(t, http.StatusBadGateway, apiErr.StatusCode)
				require.NotContains(t, recorder.Body.String(), "[DONE]")
				if tc.partial {
					require.NotNil(t, actualUsage)
					require.Equal(t, 10, actualUsage.PromptTokens)
					require.Equal(t, 3, actualUsage.CompletionTokens)
				} else {
					require.Nil(t, actualUsage)
					require.Empty(t, recorder.Body.String())
				}
				return
			}
			require.Nil(t, apiErr)
			require.NotNil(t, actualUsage)
			require.Contains(t, recorder.Body.String(), "data: [DONE]")
		})
	}
}
