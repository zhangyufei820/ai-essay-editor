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
