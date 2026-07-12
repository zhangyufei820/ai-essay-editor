package service

import (
	"fmt"

	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

const (
	BillingSourceWallet       = "wallet"
	BillingSourceSubscription = "subscription"
	BillingSourceImageBenefit = "image_benefit"
)

// PreConsumeBilling 根据用户计费偏好创建 BillingSession 并执行预扣费。
// 会话存储在 relayInfo.Billing 上，供后续 Settle / Refund 使用。
func PreConsumeBilling(c *gin.Context, preConsumedQuota int, relayInfo *relaycommon.RelayInfo) *types.NewAPIError {
	session, apiErr := NewBillingSession(c, relayInfo, preConsumedQuota)
	if apiErr != nil {
		return apiErr
	}
	relayInfo.Billing = session
	return nil
}

// ---------------------------------------------------------------------------
// SettleBilling — 后结算辅助函数
// ---------------------------------------------------------------------------

// SettleBilling 执行计费结算。如果 RelayInfo 上有 BillingSession 则通过 session 结算，
// 否则回退到旧的 PostConsumeQuota 路径（兼容按次计费等场景）。
func SettleBilling(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, actualQuota int) error {
	if relayInfo.Billing != nil {
		actualBillingQuota := EffectiveMonthlyCardTextBillingQuota(relayInfo, actualQuota)
		preConsumed := relayInfo.Billing.GetPreConsumedQuota()
		delta := actualBillingQuota - preConsumed

		if actualBillingQuota != actualQuota {
			logger.LogInfo(ctx, fmt.Sprintf("月卡文本额度换算：按量额度 %s，月卡实际扣减 %s（约 %.1f 倍文本额度）",
				logger.FormatQuota(actualQuota),
				logger.FormatQuota(actualBillingQuota),
				MonthlyCardTextValueMultiplierForRelayInfo(relayInfo),
			))
		}

		if delta > 0 {
			logger.LogInfo(ctx, fmt.Sprintf("预扣费后补扣费：%s（实际消耗：%s，预扣费：%s）",
				logger.FormatQuota(delta),
				logger.FormatQuota(actualBillingQuota),
				logger.FormatQuota(preConsumed),
			))
		} else if delta < 0 {
			logger.LogInfo(ctx, fmt.Sprintf("预扣费后返还扣费：%s（实际消耗：%s，预扣费：%s）",
				logger.FormatQuota(-delta),
				logger.FormatQuota(actualBillingQuota),
				logger.FormatQuota(preConsumed),
			))
		} else {
			logger.LogInfo(ctx, fmt.Sprintf("预扣费与实际消耗一致，无需调整：%s（按次计费）",
				logger.FormatQuota(actualBillingQuota),
			))
		}

		if err := relayInfo.Billing.Settle(actualBillingQuota); err != nil {
			return err
		}

		// 发送额度通知（订阅计费使用订阅剩余额度）
		if actualBillingQuota != 0 {
			if relayInfo.BillingSource == BillingSourceSubscription {
				checkAndSendSubscriptionQuotaNotify(relayInfo)
			} else {
				checkAndSendQuotaNotify(relayInfo, actualBillingQuota-preConsumed, preConsumed)
			}
		}
		return nil
	}

	// 回退：无 BillingSession 时使用旧路径
	quotaDelta := actualQuota - relayInfo.FinalPreConsumedQuota
	if quotaDelta != 0 {
		return PostConsumeQuota(relayInfo, quotaDelta, relayInfo.FinalPreConsumedQuota, true)
	}
	return nil
}

func SettleBillingAtPreConsumedQuota(ctx *gin.Context, relayInfo *relaycommon.RelayInfo) (int, error) {
	if relayInfo == nil {
		return 0, fmt.Errorf("relay info is nil")
	}
	if relayInfo.Billing == nil {
		preConsumedQuota := relayInfo.FinalPreConsumedQuota
		return preConsumedQuota, SettleBilling(ctx, relayInfo, preConsumedQuota)
	}

	preConsumedQuota := relayInfo.Billing.GetPreConsumedQuota()
	if err := relayInfo.Billing.Settle(preConsumedQuota); err != nil {
		return preConsumedQuota, err
	}
	if preConsumedQuota != 0 {
		if relayInfo.BillingSource == BillingSourceSubscription {
			checkAndSendSubscriptionQuotaNotify(relayInfo)
		} else {
			checkAndSendQuotaNotify(relayInfo, 0, preConsumedQuota)
		}
	}
	return preConsumedQuota, nil
}
