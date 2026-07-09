package service

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGenerateTextOtherInfoIncludesRelayRetryAttempts(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	err := types.WithOpenAIError(types.OpenAIError{
		Message: "temporary upstream busy",
		Type:    "rate_limit_error",
		Code:    "rate_limit_exceeded",
	}, http.StatusTooManyRequests)
	RecordRelayRetryAttempt(c, 21, "星人文本月卡链路", 0, err)

	other := GenerateTextOtherInfo(c, &relaycommon.RelayInfo{
		StartTime:         time.UnixMilli(1000),
		FirstResponseTime: time.UnixMilli(1500),
		ChannelMeta:       &relaycommon.ChannelMeta{},
	}, 1, 1, 1, 0, 0, -1, -1)

	attempts, ok := other["retry_attempts"].([]map[string]interface{})
	require.True(t, ok)
	require.Len(t, attempts, 1)
	require.Equal(t, 21, attempts[0]["channel_id"])
	require.Equal(t, "星人文本月卡链路", attempts[0]["channel_name"])
	require.Equal(t, http.StatusTooManyRequests, attempts[0]["status_code"])
	require.Equal(t, "rate_limit_exceeded", attempts[0]["error_code"])
	require.Equal(t, "openai_error", attempts[0]["error_type"])
	require.Equal(t, "temporary upstream busy", attempts[0]["error_message"])
	require.Equal(t, 0, attempts[0]["retry_index"])
}

func TestGenerateTextOtherInfoOmitsEmptyRelayRetryAttempts(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	other := GenerateTextOtherInfo(c, &relaycommon.RelayInfo{
		StartTime:         time.UnixMilli(1000),
		FirstResponseTime: time.UnixMilli(1500),
		ChannelMeta:       &relaycommon.ChannelMeta{},
	}, 1, 1, 1, 0, 0, -1, -1)

	_, exists := other["retry_attempts"]
	require.False(t, exists)
}

func TestGenerateTextOtherInfoHidesDiscountImage2UpstreamMapping(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("public_image_model_alias", PublicDiscountImage2ModelName)

	other := GenerateTextOtherInfo(c, &relaycommon.RelayInfo{
		OriginModelName:   InternalDiscountImage2ModelName,
		StartTime:         time.UnixMilli(1000),
		FirstResponseTime: time.UnixMilli(1500),
		ChannelMeta:       &relaycommon.ChannelMeta{UpstreamModelName: "gpt-image-2", IsModelMapped: true},
	}, 1, 1, 1, 0, 0, -1, -1)

	require.NotContains(t, other, "is_model_mapped")
	require.NotContains(t, other, "upstream_model_name")
}

func TestGenerateTextOtherInfoKeepsSafeModelMapping(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	other := GenerateTextOtherInfo(c, &relaycommon.RelayInfo{
		OriginModelName:   "public-text-model",
		StartTime:         time.UnixMilli(1000),
		FirstResponseTime: time.UnixMilli(1500),
		ChannelMeta:       &relaycommon.ChannelMeta{UpstreamModelName: "provider-text-model", IsModelMapped: true},
	}, 1, 1, 1, 0, 0, -1, -1)

	require.Equal(t, true, other["is_model_mapped"])
	require.Equal(t, "provider-text-model", other["upstream_model_name"])
}
