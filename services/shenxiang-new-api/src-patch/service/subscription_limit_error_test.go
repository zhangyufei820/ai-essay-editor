package service

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/types"
)

func TestSubscriptionLimitAPIErrorDistinguishesConcurrency(t *testing.T) {
	err := subscriptionLimitAPIError(&model.SubscriptionLimitError{Reason: "concurrency"})

	if got, want := err.GetErrorCode(), types.ErrorCodeSubscriptionConcurrency; got != want {
		t.Fatalf("GetErrorCode() = %q, want %q", got, want)
	}
	if got, want := err.StatusCode, http.StatusTooManyRequests; got != want {
		t.Fatalf("StatusCode = %d, want %d", got, want)
	}
	if got, want := err.PublicMessage(), "当前月卡并发已满，请等待已有任务完成后重试。"; got != want {
		t.Fatalf("PublicMessage() = %q, want %q", got, want)
	}
}

func TestSubscriptionLimitAPIErrorKeepsQuotaLimitsAsQuota(t *testing.T) {
	err := subscriptionLimitAPIError(&model.SubscriptionLimitError{Reason: "monthly"})

	if got, want := err.GetErrorCode(), types.ErrorCodeInsufficientUserQuota; got != want {
		t.Fatalf("GetErrorCode() = %q, want %q", got, want)
	}
	if got, want := err.StatusCode, http.StatusForbidden; got != want {
		t.Fatalf("StatusCode = %d, want %d", got, want)
	}
	if got, want := err.PublicMessage(), "账户额度不足，请充值或联系管理员。"; got != want {
		t.Fatalf("PublicMessage() = %q, want %q", got, want)
	}
}
