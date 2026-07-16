package model

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestFormatUserLogsRemovesProviderDiagnostics(t *testing.T) {
	logs := []*Log{{
		Id:                99,
		ChannelId:         27,
		ChannelName:       "private relay",
		UpstreamRequestId: "provider-request-id",
		Content:           "upstream supplier failed",
		Other: common.MapToJsonStr(map[string]interface{}{
			"task_id":             "task_public",
			"channel_id":          27,
			"upstream_task_id":    "task_private",
			"provider_error_code": "balance_error",
			"fail_reason":         "upstream channel rejected the request",
		}),
	}}

	formatUserLogs(logs, 0)
	require.Equal(t, 0, logs[0].ChannelId)
	require.Empty(t, logs[0].ChannelName)
	require.Empty(t, logs[0].UpstreamRequestId)
	combined := strings.ToLower(logs[0].Content + "\n" + logs[0].Other)
	for _, forbidden := range []string{"supplier", "upstream", "channel_id", "task_private", "balance_error"} {
		require.NotContains(t, combined, forbidden)
	}
	require.Contains(t, logs[0].Other, "task_public")
}
