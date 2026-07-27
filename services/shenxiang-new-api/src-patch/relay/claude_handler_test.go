package relay

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestNormalizeKiroClaudeFunctionToolsPreservesWangwangOpenAIToolShape(t *testing.T) {
	body := []byte(`{"model":"claude-fable-5","tools":[{"type":"function","function":{"name":"read_file","parameters":{"type":"object"}}},{"type":"custom","name":"bash"}]}`)

	got, err := normalizeKiroClaudeFunctionTools(body, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://wangwang.sbs"},
	})

	require.NoError(t, err)
	assert.Equal(t, "function", gjson.GetBytes(got, "tools.0.type").String())
	assert.Equal(t, "read_file", gjson.GetBytes(got, "tools.0.function.name").String())
	assert.Equal(t, "object", gjson.GetBytes(got, "tools.0.function.parameters.type").String())
	assert.Equal(t, "custom", gjson.GetBytes(got, "tools.1.type").String())
}

func TestNormalizeKiroClaudeFunctionToolsConvertsPdhlzyToClaudeTools(t *testing.T) {
	body := []byte(`{"messages":[{"role":"user","content":"Read both files"},{"role":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"read_file","arguments":"{\"path\":\"/tmp/a\"}"}},{"id":"call_2","type":"function","function":{"name":"read_file","arguments":"{\"path\":\"/tmp/b\"}"}}]},{"role":"tool","tool_call_id":"call_1","content":"A"},{"role":"tool","tool_call_id":"call_2","content":"B"}],"tools":[{"type":"function","function":{"name":"read_file","description":"Read a file","parameters":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}}},{"type":"custom","name":"bash"}]}`)

	got, err := normalizeKiroClaudeFunctionTools(body, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://pdhlzy.com"},
	})

	require.NoError(t, err)
	assert.False(t, gjson.GetBytes(got, "tools.0.type").Exists())
	assert.False(t, gjson.GetBytes(got, "tools.0.function").Exists())
	assert.Equal(t, "read_file", gjson.GetBytes(got, "tools.0.name").String())
	assert.Equal(t, "Read a file", gjson.GetBytes(got, "tools.0.description").String())
	assert.Equal(t, "object", gjson.GetBytes(got, "tools.0.input_schema.type").String())
	assert.Equal(t, "string", gjson.GetBytes(got, "tools.0.input_schema.properties.path.type").String())
	assert.Equal(t, "path", gjson.GetBytes(got, "tools.0.input_schema.required.0").String())
	assert.Equal(t, "custom", gjson.GetBytes(got, "tools.1.type").String())
	assert.Equal(t, int64(3), gjson.GetBytes(got, "messages.#").Int())
	assert.False(t, gjson.GetBytes(got, "messages.1.tool_calls").Exists())
	assert.Equal(t, "tool_use", gjson.GetBytes(got, "messages.1.content.0.type").String())
	assert.Equal(t, "call_1", gjson.GetBytes(got, "messages.1.content.0.id").String())
	assert.Equal(t, "read_file", gjson.GetBytes(got, "messages.1.content.0.name").String())
	assert.Equal(t, "/tmp/a", gjson.GetBytes(got, "messages.1.content.0.input.path").String())
	assert.Equal(t, "tool_use", gjson.GetBytes(got, "messages.1.content.1.type").String())
	assert.Equal(t, "call_2", gjson.GetBytes(got, "messages.1.content.1.id").String())
	assert.Equal(t, "/tmp/b", gjson.GetBytes(got, "messages.1.content.1.input.path").String())
	assert.Equal(t, "user", gjson.GetBytes(got, "messages.2.role").String())
	assert.Equal(t, "tool_result", gjson.GetBytes(got, "messages.2.content.0.type").String())
	assert.Equal(t, "call_1", gjson.GetBytes(got, "messages.2.content.0.tool_use_id").String())
	assert.Equal(t, "A", gjson.GetBytes(got, "messages.2.content.0.content").String())
	assert.Equal(t, "tool_result", gjson.GetBytes(got, "messages.2.content.1.type").String())
	assert.Equal(t, "call_2", gjson.GetBytes(got, "messages.2.content.1.tool_use_id").String())
	assert.Equal(t, "B", gjson.GetBytes(got, "messages.2.content.1.content").String())
}

func TestNormalizeKiroClaudeFunctionToolsLeavesOtherProvidersUntouched(t *testing.T) {
	body := []byte(`{"tools":[{"type":"function","function":{"name":"read_file"}}]}`)

	got, err := normalizeKiroClaudeFunctionTools(body, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://api.example.com"},
	})

	require.NoError(t, err)
	assert.JSONEq(t, string(body), string(got))
}
