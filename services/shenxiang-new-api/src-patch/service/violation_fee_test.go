package service

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/types"
)

func TestNormalizeViolationFeeErrorPromptBlockedSkipsRetryWithoutViolationFee(t *testing.T) {
	err := types.WithOpenAIError(types.OpenAIError{
		Message: "Your request was rejected by the safety system. safety_violations=[sexual].",
		Type:    "upstream_error",
		Code:    "rate_limit_exceeded",
	}, http.StatusTooManyRequests)

	normalized := NormalizeViolationFeeError(err)

	if normalized.GetErrorCode() != types.ErrorCodePromptBlocked {
		t.Fatalf("expected prompt_blocked, got %s", normalized.GetErrorCode())
	}
	if !types.IsSkipRetryError(normalized) {
		t.Fatalf("expected prompt blocked errors to skip retry")
	}
	if shouldChargeViolationFee(normalized) {
		t.Fatalf("generic provider safety blocks must not charge violation fee")
	}
	if normalized.ToOpenAIError().Message == "" {
		t.Fatalf("expected upstream message to be preserved")
	}
}

func TestNormalizeViolationFeeErrorLeavesOrdinaryRateLimitRetryable(t *testing.T) {
	err := types.WithOpenAIError(types.OpenAIError{
		Message: "rate limit exceeded",
		Type:    "upstream_error",
		Code:    "rate_limit_exceeded",
	}, http.StatusTooManyRequests)

	normalized := NormalizeViolationFeeError(err)

	if normalized.GetErrorCode() != types.ErrorCode("rate_limit_exceeded") {
		t.Fatalf("expected ordinary rate limit code to be preserved, got %s", normalized.GetErrorCode())
	}
	if types.IsSkipRetryError(normalized) {
		t.Fatalf("ordinary rate limits should remain eligible for fallback retry")
	}
}
