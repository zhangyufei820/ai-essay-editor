package service

import (
	"go/ast"
	"go/parser"
	"go/token"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type saturationBillingRecorder struct {
	reserved int
}

func (recorder *saturationBillingRecorder) Settle(int) error         { return nil }
func (recorder *saturationBillingRecorder) Refund(*gin.Context)      {}
func (recorder *saturationBillingRecorder) NeedsRefund() bool        { return false }
func (recorder *saturationBillingRecorder) GetPreConsumedQuota() int { return recorder.reserved }
func (recorder *saturationBillingRecorder) Reserve(target int) error {
	recorder.reserved = target
	return nil
}

func TestCalculateAudioQuotaSaturatesPriceOverflow(t *testing.T) {
	quota, clamp := calculateAudioQuota(QuotaInfo{
		UsePrice:   true,
		ModelPrice: float64(common.MaxQuota) / common.QuotaPerUnit * 2,
		GroupRatio: 1,
	})

	require.Equal(t, common.MaxQuota, quota)
	require.NotNil(t, clamp)
	require.Equal(t, "QuotaFromDecimal", clamp.Op)
	require.Equal(t, common.QuotaClampOverflow, clamp.Kind)
}

func TestCalculateAudioQuotaSaturatesTokenOverflow(t *testing.T) {
	quota, clamp := calculateAudioQuota(QuotaInfo{
		InputDetails: TokenDetails{TextTokens: common.MaxQuota},
		ModelName:    "audio-quota-saturation-test",
		ModelRatio:   2,
		GroupRatio:   1,
	})

	require.Equal(t, common.MaxQuota, quota)
	require.NotNil(t, clamp)
	require.Equal(t, "QuotaFromDecimal", clamp.Op)
	require.Equal(t, common.QuotaClampOverflow, clamp.Kind)
}

func TestCalculateAudioQuotaPreservesMinimumOne(t *testing.T) {
	quota, clamp := calculateAudioQuota(QuotaInfo{
		ModelName:  "audio-quota-minimum-test",
		ModelRatio: 1,
		GroupRatio: 1,
	})

	require.Equal(t, 1, quota)
	require.Nil(t, clamp)
}

func TestAudioQuotaClampIsAttachableToConsumeLog(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)
	relayInfo := &relaycommon.RelayInfo{
		UserId:          42,
		OriginModelName: "audio-quota-saturation-test",
	}

	_, clamp := calculateAudioQuota(QuotaInfo{
		UsePrice:   true,
		ModelPrice: float64(common.MaxQuota) / common.QuotaPerUnit * 2,
		GroupRatio: 1,
	})
	noteQuotaClamp(relayInfo, clamp)
	other := map[string]interface{}{"audio": true}
	attachQuotaSaturation(ctx, relayInfo, other)

	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok)
	saturation, ok := adminInfo["quota_saturation"].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, common.QuotaClampOverflow, saturation["kind"])
	require.Equal(t, common.MaxQuota, saturation["clamped"])
}

func TestPreWssConsumeQuotaSaturatesCumulativeReservation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)
	ctx.Set(realtimeBillingTargetQuotaKey, common.MaxQuota)
	billing := &saturationBillingRecorder{}
	relayInfo := &relaycommon.RelayInfo{
		OriginModelName: "audio-quota-cumulative-test",
		UsingGroup:      "default",
		UserGroup:       "default",
		PriceData: types.PriceData{
			ModelRatio: 1,
		},
		Billing: billing,
	}
	usage := &dto.RealtimeUsage{
		InputTokenDetails: dto.InputTokenDetails{TextTokens: 1},
	}

	require.NoError(t, PreWssConsumeQuota(ctx, relayInfo, usage))
	require.Equal(t, common.MaxQuota, billing.reserved)
	require.NotNil(t, relayInfo.QuotaClamp)
	require.Equal(t, common.QuotaClampOverflow, relayInfo.QuotaClamp.Kind)
}

func TestAudioQuotaConsumePathsPreserveClampAuditOrder(t *testing.T) {
	testCases := []struct {
		name          string
		function      string
		otherInfoCall string
	}{
		{name: "wss", function: "PostWssConsumeQuota", otherInfoCall: "GenerateWssOtherInfo"},
		{name: "audio", function: "PostAudioConsumeQuota", otherInfoCall: "GenerateAudioOtherInfo"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			calls := quotaFunctionCalls(t, testCase.function)
			requireCallBefore(t, calls, "calculateAudioQuota", "noteQuotaClamp")
			requireCallBefore(t, calls, testCase.otherInfoCall, "attachQuotaSaturation")
			requireCallBefore(t, calls, "attachQuotaSaturation", "RecordConsumeLog")
		})
	}

	preWssCalls := quotaFunctionCalls(t, "PreWssConsumeQuota")
	requireCallBefore(t, preWssCalls, "calculateAudioQuota", "noteQuotaClamp")
}

func quotaFunctionCalls(t *testing.T, functionName string) []string {
	t.Helper()

	parsed, err := parser.ParseFile(token.NewFileSet(), "quota.go", nil, 0)
	require.NoError(t, err)

	var calls []string
	for _, declaration := range parsed.Decls {
		function, ok := declaration.(*ast.FuncDecl)
		if !ok || function.Name.Name != functionName {
			continue
		}
		ast.Inspect(function.Body, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok {
				return true
			}
			switch called := call.Fun.(type) {
			case *ast.Ident:
				calls = append(calls, called.Name)
			case *ast.SelectorExpr:
				calls = append(calls, called.Sel.Name)
			}
			return true
		})
		break
	}

	require.NotEmpty(t, calls, "function %s not found or contains no calls", functionName)
	return calls
}

func requireCallBefore(t *testing.T, calls []string, before string, after string) {
	t.Helper()

	beforeIndex := -1
	afterIndex := -1
	for index, call := range calls {
		if call == before && beforeIndex == -1 {
			beforeIndex = index
		}
		if call == after && afterIndex == -1 {
			afterIndex = index
		}
	}

	require.NotEqual(t, -1, beforeIndex, "%s call missing from %v", before, calls)
	require.NotEqual(t, -1, afterIndex, "%s call missing from %v", after, calls)
	require.Less(t, beforeIndex, afterIndex, "%s must run before %s", before, after)
}
