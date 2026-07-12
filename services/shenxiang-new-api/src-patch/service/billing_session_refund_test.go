package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/require"
)

func TestBillingSessionRejectsNegativeSettlementInEveryLedgerMode(t *testing.T) {
	for _, ledgerMode := range []model.BillingLedgerMode{
		model.BillingLedgerModeOff,
		model.BillingLedgerModeShadow,
		model.BillingLedgerModeActive,
	} {
		t.Run(string(ledgerMode), func(t *testing.T) {
			funding := &recordingRefundFunding{}
			session := &BillingSession{
				relayInfo:        &relaycommon.RelayInfo{UserId: 1},
				funding:          funding,
				ledgerMode:       ledgerMode,
				ledgerTracked:    true,
				preConsumedQuota: 10,
			}

			require.EqualError(t, session.Settle(-1), "billing actual quota cannot be negative")
			require.Zero(t, funding.settleCall)
		})
	}
}

type recordingRefundFunding struct {
	settleCall int
	refundCall int
	closeCall  int
}

func (f *recordingRefundFunding) Source() string         { return BillingSourceWallet }
func (f *recordingRefundFunding) PreConsume(_ int) error { return nil }
func (f *recordingRefundFunding) Settle(_ int) error {
	f.settleCall++
	return nil
}
func (f *recordingRefundFunding) Close() { f.closeCall++ }
func (f *recordingRefundFunding) Refund() error {
	f.refundCall++
	return nil
}

func TestBillingSessionUntrackedRefundFailsClosed(t *testing.T) {
	funding := &recordingRefundFunding{}
	session := &BillingSession{
		relayInfo:        &relaycommon.RelayInfo{UserId: 1},
		funding:          funding,
		preConsumedQuota: 10,
		tokenConsumed:    10,
	}

	session.Refund(nil)
	require.True(t, session.refunded)
	require.Zero(t, funding.refundCall)
	require.Equal(t, 1, funding.closeCall)
	require.NoError(t, session.Settle(20))
	require.Zero(t, funding.settleCall)
}
