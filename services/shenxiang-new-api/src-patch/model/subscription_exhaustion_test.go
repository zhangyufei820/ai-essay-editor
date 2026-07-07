package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUserSubscriptionQuotaExhaustedUsesMonthlyCapWhenPresent(t *testing.T) {
	sub := &UserSubscription{
		Status:             "active",
		AmountTotal:        100,
		AmountUsed:         100,
		MonthlyAmountTotal: 1000,
		MonthlyAmountUsed:  999,
		NextResetTime:      123,
	}

	require.False(t, userSubscriptionQuotaExhausted(sub))

	sub.MonthlyAmountUsed = 1000
	require.True(t, userSubscriptionQuotaExhausted(sub))
}

func TestUserSubscriptionQuotaExhaustedIgnoresResettingDailyCap(t *testing.T) {
	sub := &UserSubscription{
		Status:        "active",
		AmountTotal:   100,
		AmountUsed:    100,
		NextResetTime: 123,
	}

	require.False(t, userSubscriptionQuotaExhausted(sub))
}

func TestUserSubscriptionQuotaExhaustedUsesNonResettingTotalCap(t *testing.T) {
	sub := &UserSubscription{
		Status:      "active",
		AmountTotal: 100,
		AmountUsed:  100,
	}

	require.True(t, userSubscriptionQuotaExhausted(sub))
}
