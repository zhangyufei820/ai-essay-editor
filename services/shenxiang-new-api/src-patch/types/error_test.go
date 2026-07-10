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

func TestPublicMessageKeepsSubscriptionConcurrencyMessage(t *testing.T) {
	err := NewErrorWithStatusCode(
		errors.New("subscription concurrency limit exceeded"),
		ErrorCodeSubscriptionConcurrency,
		http.StatusTooManyRequests,
	)

	if got, want := err.PublicMessage(), "当前月卡并发已满，请等待已有任务完成后重试。"; got != want {
		t.Fatalf("PublicMessage() = %q, want %q", got, want)
	}

	publicErr := err.ToPublicOpenAIError("req-test")
	if got, want := publicErr.Message, "当前月卡并发已满，请等待已有任务完成后重试。 (request id: req-test)"; got != want {
		t.Fatalf("ToPublicOpenAIError().Message = %q, want %q", got, want)
	}
	if got, want := publicErr.Code, any(ErrorCodeSubscriptionConcurrency); got != want {
		t.Fatalf("ToPublicOpenAIError().Code = %v, want %v", got, want)
	}
}

func TestPublicMessageHidesSupplierNames(t *testing.T) {
	for _, message := range []string{
		"geek2api-image-2 upstream rejected request",
		"ccapi provider returned invalid response",
		"moonapix balance_not_enough",
		"dragtokens temporary error",
	} {
		err := WithOpenAIError(OpenAIError{
			Message: message,
			Type:    "upstream_error",
			Code:    "bad_response",
		}, http.StatusBadGateway)

		publicErr := err.ToPublicOpenAIError("req-test")
		if got, want := publicErr.Message, "模型服务暂时不可用，请稍后重试。 (request id: req-test)"; got != want {
			t.Fatalf("Message for %q = %q, want %q", message, got, want)
		}
		if publicErr.Code == "bad_response" {
			t.Fatalf("Code for %q = %v, want sanitized service_unavailable", message, publicErr.Code)
		}
	}
}
