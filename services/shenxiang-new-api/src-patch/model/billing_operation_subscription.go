package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

func applyBillingBaseline(tx *gorm.DB, operation *BillingOperation, input BillingOperationBaseline) (*BillingSubscriptionMetadata, error) {
	if tx == nil || operation == nil {
		return nil, errors.New("invalid active billing baseline")
	}
	var metadata *BillingSubscriptionMetadata
	if input.ReservedQuota > 0 {
		switch input.FundingSource {
		case BillingFundingSourceWallet:
			if err := applyBillingWalletDelta(tx, input.UserID, input.ReservedQuota); err != nil {
				return nil, err
			}
		case BillingFundingSourceSubscription:
			var err error
			metadata, err = preConsumeBillingSubscriptionWithTx(tx, input)
			if err != nil {
				return nil, err
			}
			operation.FundingRefID = metadata.UserSubscriptionID
		case BillingFundingSourceImageBenefit:
		default:
			return nil, errors.New("unsupported billing funding source")
		}
		if input.ChargeToken {
			if err := applyBillingTokenDelta(tx, input.TokenID, input.UserID, input.ReservedQuota); err != nil {
				return nil, err
			}
		}
	}
	return metadata, nil
}

func preConsumeBillingSubscriptionWithTx(tx *gorm.DB, input BillingOperationBaseline) (*BillingSubscriptionMetadata, error) {
	if tx == nil {
		return nil, errors.New("transaction is nil")
	}
	if input.RequestID == "" || input.UserID <= 0 || input.ReservedQuota <= 0 {
		return nil, errors.New("invalid subscription billing baseline")
	}
	var existing SubscriptionPreConsumeRecord
	existingQuery := tx.Where("request_id = ?", input.RequestID).Limit(1).Find(&existing)
	if existingQuery.Error != nil {
		return nil, existingQuery.Error
	}
	if existingQuery.RowsAffected > 0 {
		return nil, fmt.Errorf("%w: subscription request id already consumed", ErrBillingOperationConflict)
	}
	now := billingDBTimestampWithTx(tx)
	var subscriptions []UserSubscription
	if err := lockForUpdate(tx).
		Where("user_id = ? AND status = ? AND end_time > ?", input.UserID, "active", now).
		Order("end_time asc, id asc").
		Find(&subscriptions).Error; err != nil {
		return nil, errors.New("no active subscription")
	}
	if len(subscriptions) == 0 {
		return nil, errors.New("no active subscription")
	}
	for _, candidate := range subscriptions {
		subscription := candidate
		if input.FundingRefID > 0 && subscription.Id != input.FundingRefID {
			continue
		}
		if input.SubscriptionTargetPlanID > 0 && subscription.PlanId != input.SubscriptionTargetPlanID {
			continue
		}
		plan, err := getSubscriptionPlanByIdTx(tx, subscription.PlanId)
		if err != nil {
			return nil, err
		}
		if input.SubscriptionQuotaType == SubscriptionQuotaTypeMonthlyCardText && !isCurrentMonthlyCardTextDiscountPlan(plan) {
			continue
		}
		if err := maybeResetUserSubscriptionWithPlanTx(tx, &subscription, plan, now); err != nil {
			return nil, err
		}
		resetEpoch := subscriptionResetEpoch(&subscription)
		if resetEpoch <= 0 {
			return nil, errors.New("subscription reset epoch is missing")
		}
		amountUsedBefore := subscription.AmountUsed
		monthlyAmountUsedBefore := subscription.MonthlyAmountUsed
		if amountUsedBefore < 0 || monthlyAmountUsedBefore < 0 {
			return nil, errors.New("subscription used quota is negative")
		}
		if amountUsedBefore > maxBillingStoredQuota-input.ReservedQuota {
			return nil, errors.New("subscription used quota would overflow")
		}
		if subscription.MonthlyAmountTotal > 0 && monthlyAmountUsedBefore > maxBillingStoredQuota-input.ReservedQuota {
			return nil, errors.New("subscription monthly used quota would overflow")
		}
		if subscription.AmountTotal > 0 && subscription.AmountTotal-amountUsedBefore < input.ReservedQuota {
			continue
		}
		if subscription.MonthlyAmountTotal > 0 && subscription.MonthlyAmountTotal-monthlyAmountUsedBefore < input.ReservedQuota {
			continue
		}
		record := &SubscriptionPreConsumeRecord{
			RequestId:          input.RequestID,
			UserId:             input.UserID,
			UserSubscriptionId: subscription.Id,
			PreConsumed:        input.ReservedQuota,
			ResetEpoch:         resetEpoch,
			Status:             "consumed",
		}
		if err := tx.Create(record).Error; err != nil {
			return nil, err
		}
		subscription.AmountUsed += input.ReservedQuota
		if subscription.MonthlyAmountTotal > 0 {
			subscription.MonthlyAmountUsed += input.ReservedQuota
		}
		if err := tx.Save(&subscription).Error; err != nil {
			return nil, err
		}
		return &BillingSubscriptionMetadata{
			UserSubscriptionID:      subscription.Id,
			PreConsumed:             input.ReservedQuota,
			ResetEpoch:              resetEpoch,
			AmountTotal:             subscription.AmountTotal,
			AmountUsedBefore:        amountUsedBefore,
			AmountUsedAfter:         subscription.AmountUsed,
			MonthlyAmountTotal:      subscription.MonthlyAmountTotal,
			MonthlyAmountUsedBefore: monthlyAmountUsedBefore,
			MonthlyAmountUsedAfter:  subscription.MonthlyAmountUsed,
			PlanID:                  subscription.PlanId,
			PlanTitle:               plan.Title,
			ConcurrencyLimit:        subscription.ConcurrencyLimit,
		}, nil
	}
	return nil, fmt.Errorf("subscription quota insufficient, need=%d", input.ReservedQuota)
}

func billingDBTimestampWithTx(tx *gorm.DB) int64 {
	if tx == nil {
		return common.GetTimestamp()
	}
	var timestamp int64
	var err error
	switch {
	case common.UsingMainDatabase(common.DatabaseTypePostgreSQL):
		err = tx.Raw("SELECT EXTRACT(EPOCH FROM NOW())::bigint").Scan(&timestamp).Error
	case common.UsingMainDatabase(common.DatabaseTypeSQLite):
		err = tx.Raw("SELECT strftime('%s','now')").Scan(&timestamp).Error
	default:
		err = tx.Raw("SELECT UNIX_TIMESTAMP()").Scan(&timestamp).Error
	}
	if err != nil || timestamp <= 0 {
		return common.GetTimestamp()
	}
	return timestamp
}

func loadBillingSubscriptionMetadata(tx *gorm.DB, operation *BillingOperation) (*BillingSubscriptionMetadata, error) {
	if tx == nil || operation == nil || operation.FundingRefID <= 0 {
		return nil, errors.New("invalid subscription metadata request")
	}
	var subscription UserSubscription
	if err := tx.Where("id = ? AND user_id = ?", operation.FundingRefID, operation.UserID).First(&subscription).Error; err != nil {
		return nil, err
	}
	plan, err := getSubscriptionPlanByIdTx(tx, subscription.PlanId)
	if err != nil {
		return nil, err
	}
	metadata := &BillingSubscriptionMetadata{
		UserSubscriptionID:     subscription.Id,
		ResetEpoch:             operation.FundingResetEpoch,
		AmountTotal:            subscription.AmountTotal,
		AmountUsedAfter:        subscription.AmountUsed,
		MonthlyAmountTotal:     subscription.MonthlyAmountTotal,
		MonthlyAmountUsedAfter: subscription.MonthlyAmountUsed,
		PlanID:                 subscription.PlanId,
		PlanTitle:              plan.Title,
		ConcurrencyLimit:       subscription.ConcurrencyLimit,
	}
	if operation.RequestID != "" {
		var record SubscriptionPreConsumeRecord
		query := tx.Where("request_id = ? AND user_subscription_id = ?", operation.RequestID, subscription.Id).Limit(1).Find(&record)
		if query.Error != nil {
			return nil, query.Error
		}
		if query.RowsAffected == 1 {
			metadata.PreConsumed = record.PreConsumed
			metadata.ResetEpoch = subscriptionPreConsumeResetEpoch(&record, &subscription)
			if metadata.ResetEpoch <= 0 {
				return nil, fmt.Errorf("%w: subscription reset epoch cannot be determined", ErrBillingOperationConflict)
			}
			if operation.FundingResetEpoch > 0 && metadata.ResetEpoch > 0 && operation.FundingResetEpoch != metadata.ResetEpoch {
				return nil, fmt.Errorf("%w: subscription reset epoch does not match", ErrBillingOperationConflict)
			}
			if record.Status == "consumed" {
				appliedQuota := operation.AppliedQuota
				if appliedQuota < 0 {
					return nil, fmt.Errorf("%w: subscription applied quota is negative", ErrBillingOperationConflict)
				}
				metadata.AmountUsedBefore = subscription.AmountUsed
				if metadata.ResetEpoch == subscriptionResetEpoch(&subscription) {
					if subscription.AmountUsed < appliedQuota {
						return nil, fmt.Errorf("%w: subscription used quota is below applied quota", ErrBillingOperationConflict)
					}
					metadata.AmountUsedBefore -= appliedQuota
				}
				metadata.MonthlyAmountUsedBefore = subscription.MonthlyAmountUsed
				if subscription.MonthlyAmountTotal > 0 || subscription.MonthlyAmountUsed > 0 {
					if subscription.MonthlyAmountUsed < appliedQuota {
						return nil, fmt.Errorf("%w: subscription monthly quota is below applied quota", ErrBillingOperationConflict)
					}
					metadata.MonthlyAmountUsedBefore -= appliedQuota
				}
			} else {
				metadata.AmountUsedBefore = subscription.AmountUsed
				metadata.MonthlyAmountUsedBefore = subscription.MonthlyAmountUsed
			}
		}
	}
	return metadata, nil
}
