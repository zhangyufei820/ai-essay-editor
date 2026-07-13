package service

import (
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/require"
)

func TestFundingAPIErrorMapsWrappedInsufficientQuotaToForbidden(t *testing.T) {
	apiErr := fundingAPIError(fmt.Errorf("wallet conditional debit: %w", model.ErrInsufficientQuota))
	require.True(t, errors.Is(apiErr, model.ErrInsufficientQuota), "unexpected error: %v", apiErr)
	require.Equal(t, types.ErrorCodeInsufficientUserQuota, apiErr.GetErrorCode())
	require.Equal(t, http.StatusForbidden, apiErr.StatusCode)
}

func TestBillingSessionReserveRejectsMissingDurableOperation(t *testing.T) {
	session := &BillingSession{
		relayInfo: &relaycommon.RelayInfo{UserId: 91, IsPlayground: true},
		funding:   &WalletFunding{userId: 91},
	}
	require.EqualError(t, session.Reserve(80), "durable billing operation is required for reservation")
}

func TestBillingSessionReserveMapsLedgerInsufficientQuotaToForbidden(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))
	const userID, tokenID = 291, 291
	seedUser(t, userID, 120)
	seedToken(t, tokenID, userID, "sk-ledger-reserve", 120)
	relayInfo := newWalletBillingRelayInfo("reserve-insufficient", userID, tokenID)
	relayInfo.TokenKey = "sk-ledger-reserve"
	session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, 100)
	require.Nil(t, apiErr)

	err := session.Reserve(150)
	require.Error(t, err)
	var reserveAPIError *types.NewAPIError
	require.ErrorAs(t, err, &reserveAPIError)
	require.ErrorIs(t, err, model.ErrInsufficientQuota)
	require.Equal(t, types.ErrorCodeInsufficientUserQuota, reserveAPIError.GetErrorCode())
	require.Equal(t, http.StatusForbidden, reserveAPIError.StatusCode)
	require.Equal(t, 20, getUserQuota(t, userID))
	require.Equal(t, 20, getTokenRemainQuota(t, tokenID))
}
