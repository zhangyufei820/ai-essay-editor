package service

import (
	"net/http/httptest"
	"testing"
	"time"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type blockingRefundFunding struct {
	release chan struct{}
}

func (f *blockingRefundFunding) Source() string          { return BillingSourceWallet }
func (f *blockingRefundFunding) PreConsume(_ int) error { return nil }
func (f *blockingRefundFunding) Settle(_ int) error     { return nil }
func (f *blockingRefundFunding) Close()                 {}
func (f *blockingRefundFunding) Refund() error {
	<-f.release
	return nil
}

func TestBillingSessionRefundCompletesBeforeReturning(t *testing.T) {
	funding := &blockingRefundFunding{release: make(chan struct{})}
	session := &BillingSession{
		relayInfo:        &relaycommon.RelayInfo{UserId: 1},
		funding:          funding,
		preConsumedQuota: 10,
		tokenConsumed:    1,
	}
	done := make(chan struct{})
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	go func() {
		session.Refund(ctx)
		close(done)
	}()

	select {
	case <-done:
		close(funding.release)
		t.Fatal("Refund returned before the funding refund completed")
	case <-time.After(50 * time.Millisecond):
	}

	close(funding.release)
	require.Eventually(t, func() bool {
		select {
		case <-done:
			return true
		default:
			return false
		}
	}, time.Second, 10*time.Millisecond)
}
