package model

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const AffiliateUserRebateRatesOptionKey = "affiliate_setting.user_rebate_rates"

func affiliateUserRebateRatesJSON() string {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[AffiliateUserRebateRatesOptionKey]
	common.OptionMapRWMutex.RUnlock()
	return strings.TrimSpace(raw)
}

func affiliateUserRebateRate(inviterID int) decimal.Decimal {
	if inviterID <= 0 {
		return decimal.Zero
	}
	raw := affiliateUserRebateRatesJSON()
	if raw == "" {
		return decimal.Zero
	}
	var rates map[string]float64
	if err := json.Unmarshal([]byte(raw), &rates); err != nil {
		common.SysLog("failed to parse affiliate rebate rates: " + err.Error())
		return decimal.Zero
	}
	rateFloat, ok := rates[strconv.Itoa(inviterID)]
	if !ok || rateFloat <= 0 {
		return decimal.Zero
	}
	if rateFloat > 1 {
		rateFloat = 1
	}
	return decimal.NewFromFloat(rateFloat)
}

func applyAffiliateRebateForPaidOrderTx(tx *gorm.DB, buyerID int, baseQuota int, orderRef string) (int, int, error) {
	if tx == nil || buyerID <= 0 || baseQuota <= 0 {
		return 0, 0, nil
	}

	var buyer User
	if err := tx.Select("id", "inviter_id").Where("id = ?", buyerID).First(&buyer).Error; err != nil {
		return 0, 0, err
	}
	if buyer.InviterId <= 0 || buyer.InviterId == buyerID {
		return 0, 0, nil
	}

	rate := affiliateUserRebateRate(buyer.InviterId)
	if rate.LessThanOrEqual(decimal.Zero) {
		return 0, 0, nil
	}

	rebateQuota := decimal.NewFromInt(int64(baseQuota)).Mul(rate).Round(0).IntPart()
	if rebateQuota <= 0 {
		return buyer.InviterId, 0, nil
	}

	if err := tx.Model(&User{}).Where("id = ?", buyer.InviterId).Updates(map[string]interface{}{
		"aff_quota":   gorm.Expr("aff_quota + ?", rebateQuota),
		"aff_history": gorm.Expr("aff_history + ?", rebateQuota),
	}).Error; err != nil {
		return buyer.InviterId, 0, err
	}

	content := fmt.Sprintf("邀请用户支付返利 %s", logger.LogQuota(int(rebateQuota)))
	if strings.TrimSpace(orderRef) != "" {
		content = fmt.Sprintf("%s，订单: %s", content, orderRef)
	}
	rebateLog := &Log{
		UserId:    buyer.InviterId,
		CreatedAt: common.GetTimestamp(),
		Type:      LogTypeSystem,
		Content:   content,
		Quota:     int(rebateQuota),
	}
	ensureLogRequestId(rebateLog)
	if err := tx.Create(rebateLog).Error; err != nil {
		return buyer.InviterId, 0, err
	}

	return buyer.InviterId, int(rebateQuota), nil
}
