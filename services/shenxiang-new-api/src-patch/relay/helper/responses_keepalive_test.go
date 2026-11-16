package helper

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestResponsesKeepAliveIsScopedToStreamingResponses(t *testing.T) {
	for _, tc := range []struct {
		path                  string
		stream, disable, want bool
	}{
		{"/v1/responses", true, false, true},
		{"/v1/responses", false, false, false},
		{"/v1/responses", true, true, false},
		{"/v1/chat/completions", true, false, false},
		{"/pg/images/generations", true, false, false},
	} {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, tc.path, nil)
		require.Equal(t, tc.want, ResponsesKeepAliveEnabled(c, &relaycommon.RelayInfo{IsStream: tc.stream, DisablePing: tc.disable}))
	}
	require.False(t, ResponsesKeepAliveEnabled(nil, nil))
}

type responsesFlushRecorder struct {
	*httptest.ResponseRecorder
	flushed chan struct{}
	once    sync.Once
}

func (r *responsesFlushRecorder) Flush() {
	r.ResponseRecorder.Flush()
	r.once.Do(func() { close(r.flushed) })
}

func TestResponsesKeepAliveContinuesWhileUpstreamBodyIsSilent(t *testing.T) {
	t.Setenv("RESPONSES_INITIAL_RESPONSE_TIMEOUT", "30")
	settings := operation_setting.GetGeneralSetting()
	oldEnabled := settings.PingIntervalEnabled
	settings.PingIntervalEnabled = false
	t.Cleanup(func() { settings.PingIntervalEnabled = oldEnabled })
	reader, writer := io.Pipe()
	defer reader.Close()
	defer writer.Close()
	recorder := &responsesFlushRecorder{ResponseRecorder: httptest.NewRecorder(), flushed: make(chan struct{})}
	c, _ := gin.CreateTestContext(recorder)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil).WithContext(ctx)
	info := &relaycommon.RelayInfo{IsStream: true, ChannelMeta: &relaycommon.ChannelMeta{}}
	done := make(chan struct{})
	go func() {
		StreamScannerHandler(c, &http.Response{Body: reader}, info, func(string, *StreamResult) {})
		close(done)
	}()
	select {
	case <-recorder.flushed:
	case <-time.After(15 * time.Second):
		cancel()
		t.Fatal("no keepalive was flushed while upstream body was silent")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("keepalive outlived the cancelled stream")
	}
	require.Equal(t, ": PING\n\n", recorder.Body.String())
	require.False(t, c.GetBool("response_stream_output_sent"))
	require.Zero(t, info.ReceivedResponseCount)
}
