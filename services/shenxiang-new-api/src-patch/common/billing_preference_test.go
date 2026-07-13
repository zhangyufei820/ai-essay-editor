package common

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalizeBillingPreferenceAllowsMonthlyCardAndWallet(t *testing.T) {
	require.Equal(t, "monthly_card_and_wallet", NormalizeBillingPreference(" monthly_card_and_wallet "))
}
