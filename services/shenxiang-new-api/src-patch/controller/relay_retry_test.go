package controller

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

func TestShouldRetryHonorsSkipRetryBeforeChannelError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	err := types.NewError(
		errors.New("channel override should not retry"),
		types.ErrorCodeChannelNoAvailableKey,
		types.ErrOptionWithSkipRetry(),
	)

	if shouldRetry(c, err, 1) {
		t.Fatalf("skip-retry channel errors must not retry")
	}
}

func TestShouldRetryStillRetriesOrdinaryChannelError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	err := types.NewError(
		errors.New("channel has no available key"),
		types.ErrorCodeChannelNoAvailableKey,
	)

	if !shouldRetry(c, err, 1) {
		t.Fatalf("ordinary channel errors should still retry")
	}
}
