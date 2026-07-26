package relay

import (
	"bytes"
	"encoding/json"
	"runtime"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestLogDebugRequestBodySkipsWorkWhenDebugDisabled(t *testing.T) {
	originalDebugEnabled := common.DebugEnabled
	common.DebugEnabled = false
	t.Cleanup(func() {
		common.DebugEnabled = originalDebugEnabled
	})

	body := bytes.Repeat([]byte(`{"token":"sk-1234567890","input":"long context"}`), 4096)
	context := &gin.Context{}
	allocations := testing.AllocsPerRun(20, func() {
		logDebugRequestBody(context, body)
	})

	require.Zero(t, allocations)
}

func TestDebugBodyPreviewStillRedactsSensitiveValues(t *testing.T) {
	preview := debugBodyPreview([]byte(`{"authorization":"Bearer abcdefghijklmnop","token":"sk-1234567890"}`))

	require.NotContains(t, preview, "abcdefghijklmnop")
	require.NotContains(t, preview, "sk-1234567890")
	require.Contains(t, preview, "[REDACTED]")
}

func TestCloneOpenAIResponsesRequestDoesNotShareMutableData(t *testing.T) {
	maxOutputTokens := uint(8192)
	stream := true
	temperature := 0.7
	request := &dto.OpenAIResponsesRequest{
		Model:           "gpt-5.6-sol",
		Input:           json.RawMessage(`[{"role":"user","content":"hello"}]`),
		Tools:           json.RawMessage(`[{"type":"function","name":"lookup"}]`),
		MaxOutputTokens: &maxOutputTokens,
		Stream:          &stream,
		Temperature:     &temperature,
		StreamOptions:   &dto.StreamOptions{IncludeUsage: true},
		Reasoning: &dto.Reasoning{
			Effort:  "high",
			Mode:    json.RawMessage(`"auto"`),
			Context: json.RawMessage(`{"summary":"keep"}`),
		},
	}

	cloned := cloneOpenAIResponsesRequest(request)
	require.NotSame(t, request, cloned)
	require.Equal(t, request, cloned)

	cloned.Model = "mapped-model"
	cloned.Input[0] = '{'
	cloned.Tools[0] = '{'
	*cloned.MaxOutputTokens = 4096
	*cloned.Stream = false
	*cloned.Temperature = 0.2
	cloned.StreamOptions.IncludeUsage = false
	cloned.Reasoning.Effort = "xhigh"
	cloned.Reasoning.Mode[0] = 'n'
	cloned.Reasoning.Context[0] = '['

	require.Equal(t, "gpt-5.6-sol", request.Model)
	require.Equal(t, byte('['), request.Input[0])
	require.Equal(t, byte('['), request.Tools[0])
	require.Equal(t, uint(8192), *request.MaxOutputTokens)
	require.True(t, *request.Stream)
	require.Equal(t, 0.7, *request.Temperature)
	require.True(t, request.StreamOptions.IncludeUsage)
	require.Equal(t, "high", request.Reasoning.Effort)
	require.Equal(t, byte('"'), request.Reasoning.Mode[0])
	require.Equal(t, byte('{'), request.Reasoning.Context[0])
}

func BenchmarkCloneOpenAIResponsesRequestLarge(b *testing.B) {
	payload := bytes.Repeat([]byte(`{"type":"input_text","text":"long context"},`), 20000)
	request := &dto.OpenAIResponsesRequest{
		Model:     "gpt-5.6-sol",
		Input:     append(json.RawMessage{'['}, payload...),
		Tools:     append(json.RawMessage{'['}, payload...),
		Reasoning: &dto.Reasoning{Effort: "xhigh"},
	}
	b.SetBytes(int64(len(request.Input) + len(request.Tools)))
	b.ReportAllocs()

	b.Run("typed_clone", func(b *testing.B) {
		for range b.N {
			cloned := cloneOpenAIResponsesRequest(request)
			runtime.KeepAlive(cloned)
		}
	})

	b.Run("reflect_deep_copy", func(b *testing.B) {
		for range b.N {
			cloned, err := common.DeepCopy(request)
			if err != nil {
				b.Fatal(err)
			}
			runtime.KeepAlive(cloned)
		}
	})
}
