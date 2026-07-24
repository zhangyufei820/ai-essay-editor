package service

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type realtimeBillingRecorder struct {
	preConsumedQuota int
	reserveTargets   []int
	settleTargets    []int
}

func (r *realtimeBillingRecorder) Settle(actualQuota int) error {
	r.settleTargets = append(r.settleTargets, actualQuota)
	return nil
}

func (r *realtimeBillingRecorder) Refund(c *gin.Context) {}

func (r *realtimeBillingRecorder) NeedsRefund() bool {
	return false
}

func (r *realtimeBillingRecorder) GetPreConsumedQuota() int {
	return r.preConsumedQuota
}

func (r *realtimeBillingRecorder) Reserve(targetQuota int) error {
	r.reserveTargets = append(r.reserveTargets, targetQuota)
	r.preConsumedQuota = targetQuota
	return nil
}

func TestPreWssConsumeQuotaReservesCumulativeDiscountQuota(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	billing := &realtimeBillingRecorder{}
	relayInfo := &relaycommon.RelayInfo{
		OriginModelName: "gpt-5.5",
		UsingGroup:      DiscountPricingGroupName,
		Billing:         billing,
		PriceData: types.PriceData{
			ModelRatio: 1,
		},
	}
	usage := &dto.RealtimeUsage{
		TotalTokens: 100,
		InputTokens: 100,
		InputTokenDetails: dto.InputTokenDetails{
			TextTokens: 100,
		},
	}

	require.NoError(t, PreWssConsumeQuota(ctx, relayInfo, usage))
	require.NoError(t, PreWssConsumeQuota(ctx, relayInfo, usage))
	require.NoError(t, relayInfo.Billing.Settle(10))

	require.Equal(t, []int{25, 50}, billing.reserveTargets)
	require.Equal(t, []int{10}, billing.settleTargets)
}
