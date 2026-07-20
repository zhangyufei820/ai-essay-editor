package controller

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestPublicPlaygroundTaskFailureReasonKeepsSafeRejection(t *testing.T) {
	reason := "抱歉，我不能帮你生成这张图片。请调整描述后重试。"

	require.Equal(t, "提示词或参考图被安全策略拒绝，请调整内容后重试。", publicPlaygroundTaskFailureReason(reason))
}

func TestPublicPlaygroundTaskFailureReasonUsesCuratedMessages(t *testing.T) {
	testCases := []struct {
		name     string
		reason   string
		expected string
	}{
		{name: "safety with internal details", reason: "provider response: 抱歉，我不能帮你生成这张图片 (token test-secret-value)", expected: "提示词或参考图被安全策略拒绝，请调整内容后重试。"},
		{name: "access", reason: "provider response: permission denied for account ref-42", expected: "当前账号暂未开通该模型，请联系管理员或切换模型。"},
		{name: "timeout", reason: "provider response: gateway timeout at https://internal.invalid/v1", expected: "本次生成等待时间过长，请稍后刷新媒体工坊查看结果；如果没有结果，再降低分辨率或重试。"},
		{name: "busy", reason: "provider response: concurrency limit exceeded", expected: "模型服务暂时不可用，请稍后重试。"},
		{name: "no result", reason: "provider response: returned no video", expected: "本次生成暂时未完成，请稍后重试或切换模型。"},
		{name: "unknown", reason: "InternalRelayX engine failure ref-42", expected: "本次生成暂时未完成，请稍后重试或切换模型。"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			require.Equal(t, testCase.expected, publicPlaygroundTaskFailureReason(testCase.reason))
			require.NotContains(t, testCase.expected, "InternalRelayX")
			require.NotContains(t, testCase.expected, "internal.invalid")
			require.NotContains(t, testCase.expected, "ref-42")
		})
	}
}

func TestPublicPlaygroundTaskFailureReasonClassifiesInternalDetails(t *testing.T) {
	reason := "provider error: unsupported model internal-model-x at https://vendor.invalid/v1 (channel #7, request_id: req-1, bearer test-secret-value)"

	got := publicPlaygroundTaskFailureReason(reason)

	require.Equal(t, "当前参数不符合所选模型要求，请检查尺寸、数量和参考素材后重试。", got)
	require.NotContains(t, got, "internal-model-x")
	require.NotContains(t, got, "vendor.invalid")
	require.NotContains(t, got, "channel")
	require.NotContains(t, got, "test-secret-value")
}

func TestPlaygroundTaskResponsesExposeOnlyPublicFailureMessage(t *testing.T) {
	task := &model.Task{
		TaskID:     "task-public-failure",
		Status:     model.TaskStatusFailure,
		FailReason: "provider error: unsupported model internal-model-x (channel #7, request_id: req-1)",
	}
	task.SetData(playgroundImageTaskPayload{
		TokenID:         7,
		TokenName:       "internal-token",
		UseAPIToken:     true,
		ClientIP:        "192.0.2.10",
		Error:           task.FailReason,
		LastRetryReason: task.FailReason,
	})

	imageResponse := taskToPlaygroundImageTask(task)
	videoResponse := taskToPlaygroundVideoTask(task, &playgroundVideoMediaMarker{})
	expected := "当前参数不符合所选模型要求，请检查尺寸、数量和参考素材后重试。"

	require.Equal(t, expected, imageResponse["public_message"])
	require.Equal(t, expected, imageResponse["fail_reason"])
	require.Equal(t, expected, videoResponse["public_message"])
	require.Equal(t, expected, videoResponse["fail_reason"])
	require.Equal(t, expected, videoResponse["message"])
	require.Equal(t, expected, videoResponse["data"].(gin.H)["public_message"])
	imagePayload := imageResponse["data"].(playgroundImageTaskPayload)
	require.Zero(t, imagePayload.TokenID)
	require.Empty(t, imagePayload.TokenName)
	require.False(t, imagePayload.UseAPIToken)
	require.Empty(t, imagePayload.ClientIP)
	require.Equal(t, expected, imagePayload.Error)
	require.Equal(t, expected, imagePayload.LastRetryReason)
	imageJSON, err := json.Marshal(imageResponse)
	require.NoError(t, err)
	videoJSON, err := json.Marshal(videoResponse)
	require.NoError(t, err)
	for _, responseJSON := range []string{string(imageJSON), string(videoJSON)} {
		require.NotContains(t, responseJSON, "internal-model-x")
		require.NotContains(t, responseJSON, "internal-token")
		require.NotContains(t, responseJSON, "192.0.2.10")
		require.NotContains(t, responseJSON, "provider error")
		require.NotContains(t, responseJSON, "channel #7")
	}
}
