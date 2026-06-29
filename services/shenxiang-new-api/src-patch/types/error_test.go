package types

import (
	"errors"
	"net/http"
	"testing"
)

func TestPublicMessageHidesUpstreamQuotaAsServiceUnavailable(t *testing.T) {
	err := WithOpenAIError(OpenAIError{
		Message: "账户额度不足，请充值或联系管理员。",
		Type:    "insufficient_user_quota",
		Code:    string(ErrorCodeInsufficientUserQuota),
	}, http.StatusForbidden)

	if got, want := err.PublicMessage(), "模型服务暂时不可用，请稍后重试。"; got != want {
		t.Fatalf("PublicMessage() = %q, want %q", got, want)
	}
}

func TestPublicMessageHidesGenericUpstreamQuotaAsServiceUnavailable(t *testing.T) {
	err := WithOpenAIError(OpenAIError{
		Message: "You exceeded quota for this account.",
		Type:    "insufficient_quota",
		Code:    "insufficient_quota",
	}, http.StatusForbidden)

	if got, want := err.PublicMessage(), "模型服务暂时不可用，请稍后重试。"; got != want {
		t.Fatalf("PublicMessage() = %q, want %q", got, want)
	}

	publicErr := err.ToPublicOpenAIError("req-test")
	if got, want := publicErr.Code, any("service_unavailable"); got != want {
		t.Fatalf("ToPublicOpenAIError().Code = %v, want %v", got, want)
	}
}

func TestPublicMessageKeepsLocalQuotaMessage(t *testing.T) {
	err := NewErrorWithStatusCode(
		errors.New("订阅额度不足"),
		ErrorCodeInsufficientUserQuota,
		http.StatusForbidden,
	)

	if got, want := err.PublicMessage(), "账户额度不足，请充值或联系管理员。"; got != want {
		t.Fatalf("PublicMessage() = %q, want %q", got, want)
	}
}
