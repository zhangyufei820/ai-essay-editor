package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/require"
)

func TestBuildMonthlyCardTokenDefaultsToStablePublicGroup(t *testing.T) {
	token := buildMonthlyCardToken(42, "test-key")

	require.Equal(t, 42, token.UserId)
	require.Equal(t, "default", token.Group)
	require.False(t, token.CrossGroupRetry)
	require.True(t, token.UnlimitedQuota)
	require.ElementsMatch(t, service.MonthlyCardAllowedModels(), token.GetModelLimits())
}
