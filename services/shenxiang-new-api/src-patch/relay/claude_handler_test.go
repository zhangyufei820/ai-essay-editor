package relay

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestNormalizeWangwangClaudeFunctionTools(t *testing.T) {
	body := []byte(`{"model":"claude-fable-5","tools":[{"type":"function","function":{"name":"read_file","parameters":{"type":"object"}}},{"type":"custom","name":"bash"}]}`)

	got, err := normalizeWangwangClaudeFunctionTools(body, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://wangwang.sbs"},
	})

	require.NoError(t, err)
	assert.False(t, gjson.GetBytes(got, "tools.0.type").Exists())
	assert.Equal(t, "read_file", gjson.GetBytes(got, "tools.0.function.name").String())
	assert.Equal(t, "object", gjson.GetBytes(got, "tools.0.function.parameters.type").String())
	assert.Equal(t, "custom", gjson.GetBytes(got, "tools.1.type").String())
}

func TestNormalizeWangwangClaudeFunctionToolsLeavesOtherProvidersUntouched(t *testing.T) {
	body := []byte(`{"tools":[{"type":"function","function":{"name":"read_file"}}]}`)

	got, err := normalizeWangwangClaudeFunctionTools(body, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://pdhlzy.com"},
	})

	require.NoError(t, err)
	assert.JSONEq(t, string(body), string(got))
}
