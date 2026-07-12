package model

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	BillingOutboxEffectApplyBalances   = "apply_balances"
	BillingOutboxEffectInvalidateCache = "invalidate_cache"

	BillingOutboxStatusPending    = "pending"
	BillingOutboxStatusProcessing = "processing"
	BillingOutboxStatusDone       = "done"
	BillingOutboxStatusDead       = "dead"

	billingOutboxMaxAttempts = 8
)

var (
	ErrBillingOutboxLease        = errors.New("billing outbox lease is not owned")
	ErrBillingConvergencePending = errors.New("billing operation convergence is pending")
	billingInlineWorkerSequence  uint64
)

type BillingOutbox struct {
	ID          int64  `json:"id" gorm:"primaryKey"`
	OperationID int64  `json:"operation_id" gorm:"not null;index"`
	EffectKey   string `json:"effect_key" gorm:"type:varchar(191);not null;uniqueIndex"`
	EffectType  string `json:"effect_type" gorm:"type:varchar(32);not null;index"`
	Sequence    int64  `json:"sequence" gorm:"column:effect_sequence;type:bigint;not null;index"`
	Status      string `json:"status" gorm:"type:varchar(16);not null;index"`
	Attempts    int    `json:"attempts" gorm:"not null;default:0"`
	AvailableAt int64  `json:"available_at" gorm:"type:bigint;not null;index"`
	LeaseOwner  string `json:"lease_owner" gorm:"type:varchar(128);not null;default:'';index"`
	LeaseUntil  int64  `json:"lease_until" gorm:"type:bigint;not null;default:0;index"`
	LastError   string `json:"last_error" gorm:"type:varchar(64);not null;default:''"`
	CreatedAt   int64  `json:"created_at" gorm:"type:bigint;not null;index"`
	UpdatedAt   int64  `json:"updated_at" gorm:"type:bigint;not null;index"`
}

func (BillingOutbox) TableName() string {
	return "billing_outbox"
}

func enqueueBillingOutboxEffect(tx *gorm.DB, operation *BillingOperation, effectType string, sequence int64) error {
	if tx == nil || operation == nil || operation.ID <= 0 {
		return errors.New("invalid billing outbox effect")
	}
	if effectType != BillingOutboxEffectApplyBalances && effectType != BillingOutboxEffectInvalidateCache {
		return errors.New("invalid billing outbox effect type")
	}
	digest := sha256.Sum256([]byte(operation.OperationKey))
	now := common.GetTimestamp()
	effect := &BillingOutbox{
		OperationID: operation.ID,
		EffectKey:   fmt.Sprintf("%x:%s:%d", digest, effectType, sequence),
		EffectType:  effectType,
		Sequence:    sequence,
		Status:      BillingOutboxStatusPending,
		AvailableAt: now,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	return tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "effect_key"}},
		DoNothing: true,
	}).Create(effect).Error
}

func LeaseBillingOutbox(workerID string, limit int, leaseSeconds int64) ([]BillingOutbox, error) {
	return LeaseBillingOutboxWithContext(context.Background(), workerID, limit, leaseSeconds)
}

func LeaseBillingOutboxWithContext(ctx context.Context, workerID string, limit int, leaseSeconds int64) ([]BillingOutbox, error) {
	if DB == nil {
		return nil, errors.New("database is not initialized")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := validateBillingWorkerID(workerID); err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	if leaseSeconds <= 0 {
		leaseSeconds = 30
	}
	if leaseSeconds > 3600 {
		leaseSeconds = 3600
	}
	now := common.GetTimestamp()
	leased := make([]BillingOutbox, 0, limit)
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var candidates []BillingOutbox
		if err := lockForUpdate(tx).
			Where("status = ? AND available_at <= ?", BillingOutboxStatusPending, now).
			Order("available_at asc, id asc").
			Limit(limit).
			Find(&candidates).Error; err != nil {
			return err
		}
		for _, candidate := range candidates {
			result := tx.Model(&BillingOutbox{}).
				Where("id = ? AND status = ?", candidate.ID, BillingOutboxStatusPending).
				Updates(map[string]interface{}{
					"status":      BillingOutboxStatusProcessing,
					"lease_owner": workerID,
					"lease_until": now + leaseSeconds,
					"attempts":    gorm.Expr("CASE WHEN attempts < 30 THEN attempts + 1 ELSE attempts END"),
					"updated_at":  now,
				})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				continue
			}
			candidate.Status = BillingOutboxStatusProcessing
			candidate.LeaseOwner = workerID
			candidate.LeaseUntil = now + leaseSeconds
			if candidate.Attempts < 30 {
				candidate.Attempts++
			}
			candidate.UpdatedAt = now
			leased = append(leased, candidate)
		}
		return nil
	})
	return leased, err
}

func ProcessLeasedBillingOutbox(effectID int64, workerID string) error {
	return ProcessLeasedBillingOutboxWithContext(context.Background(), effectID, workerID)
}

func ProcessLeasedBillingOutboxWithContext(ctx context.Context, effectID int64, workerID string) error {
	if DB == nil {
		return errors.New("database is not initialized")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if effectID <= 0 {
		return errors.New("invalid billing outbox effect id")
	}
	if err := validateBillingWorkerID(workerID); err != nil {
		return err
	}
	db := DB.WithContext(ctx)
	var effect BillingOutbox
	if err := db.Where("id = ?", effectID).First(&effect).Error; err != nil {
		return err
	}
	if effect.Status == BillingOutboxStatusDone {
		return nil
	}
	var err error
	switch effect.EffectType {
	case BillingOutboxEffectApplyBalances:
		err = processBillingBalanceEffect(db, effectID, workerID)
	case BillingOutboxEffectInvalidateCache:
		err = processBillingCacheEffect(ctx, db, effectID, workerID)
	default:
		err = errors.New("unsupported billing outbox effect")
	}
	if err == nil || errors.Is(err, ErrBillingOutboxLease) {
		return err
	}
	if markErr := markBillingOutboxFailure(db, effectID, workerID); markErr != nil {
		return fmt.Errorf("billing effect failed: %v; failed to persist retry: %w", err, markErr)
	}
	return err
}

func ProcessBillingOperationInline(operationKey string) error {
	return ProcessBillingOperationInlineWithContext(context.Background(), operationKey)
}

func ProcessBillingOperationInlineWithContext(ctx context.Context, operationKey string) error {
	if DB == nil {
		return errors.New("database is not initialized")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if operationKey == "" {
		return errors.New("billing operation key is empty")
	}
	db := DB.WithContext(ctx)
	workerID := fmt.Sprintf("inline-%d", atomic.AddUint64(&billingInlineWorkerSequence, 1))
	for iteration := 0; iteration < 32; iteration++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		effect, found, err := leaseBillingOperationEffect(db, operationKey, workerID, 30)
		if err != nil {
			return err
		}
		if !found {
			var operation BillingOperation
			if err := db.Where("operation_key = ?", operationKey).First(&operation).Error; err != nil {
				return err
			}
			if operation.AppliedQuota != operation.DesiredQuota {
				return ErrBillingConvergencePending
			}
			return nil
		}
		if err := ProcessLeasedBillingOutboxWithContext(ctx, effect.ID, workerID); err != nil {
			return err
		}
	}
	return errors.New("billing inline effect limit exceeded")
}

func leaseBillingOperationEffect(db *gorm.DB, operationKey string, workerID string, leaseSeconds int64) (*BillingOutbox, bool, error) {
	now := common.GetTimestamp()
	var leased *BillingOutbox
	err := db.Transaction(func(tx *gorm.DB) error {
		var operation BillingOperation
		if err := tx.Where("operation_key = ?", operationKey).First(&operation).Error; err != nil {
			return err
		}
		var effect BillingOutbox
		query := lockForUpdate(tx).
			Where("operation_id = ? AND status = ? AND available_at <= ?", operation.ID, BillingOutboxStatusPending, now).
			Order("effect_sequence asc, id asc").
			Limit(1).
			Find(&effect)
		if query.Error != nil {
			return query.Error
		}
		if query.RowsAffected == 0 {
			return nil
		}
		result := tx.Model(&BillingOutbox{}).
			Where("id = ? AND status = ?", effect.ID, BillingOutboxStatusPending).
			Updates(map[string]interface{}{
				"status":      BillingOutboxStatusProcessing,
				"lease_owner": workerID,
				"lease_until": now + leaseSeconds,
				"attempts":    gorm.Expr("CASE WHEN attempts < 30 THEN attempts + 1 ELSE attempts END"),
				"updated_at":  now,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return nil
		}
		effect.Status = BillingOutboxStatusProcessing
		effect.LeaseOwner = workerID
		effect.LeaseUntil = now + leaseSeconds
		if effect.Attempts < 30 {
			effect.Attempts++
		}
		leased = &effect
		return nil
	})
	return leased, leased != nil, err
}

func processBillingBalanceEffect(db *gorm.DB, effectID int64, workerID string) error {
	return db.Transaction(func(tx *gorm.DB) error {
		effect, operation, err := loadLeasedBillingEffect(tx, effectID, workerID)
		if err != nil {
			return err
		}
		if effect == nil {
			return nil
		}
		if effect.EffectType != BillingOutboxEffectApplyBalances {
			return errors.New("billing outbox effect type mismatch")
		}
		delta := operation.DesiredQuota - operation.AppliedQuota
		if delta != 0 || (operation.FundingSource == BillingFundingSourceSubscription && operation.Outcome == BillingOutcomeFailure && operation.DesiredQuota == 0) {
			if err := applyBillingFundingDelta(tx, operation, delta); err != nil {
				return err
			}
			if delta != 0 && operation.ChargeToken {
				if err := applyBillingTokenDelta(tx, operation.TokenID, operation.UserID, delta); err != nil {
					return err
				}
			}
		}
		now := common.GetTimestamp()
		if err := tx.Model(&BillingOperation{}).Where("id = ?", operation.ID).Updates(map[string]interface{}{
			"applied_quota": operation.DesiredQuota,
			"updated_at":    now,
		}).Error; err != nil {
			return err
		}
		if operation.FundingSource == BillingFundingSourceSubscription &&
			operation.Outcome == BillingOutcomeSuccess && operation.FundingRefID > 0 {
			if _, _, _, err := expireUserSubscriptionIfQuotaExhaustedWithTx(tx, operation.FundingRefID, now); err != nil {
				return err
			}
		}
		if err := tx.Model(&BillingOutbox{}).Where("id = ?", effect.ID).Updates(map[string]interface{}{
			"status":      BillingOutboxStatusDone,
			"lease_owner": "",
			"lease_until": 0,
			"last_error":  "",
			"updated_at":  now,
		}).Error; err != nil {
			return err
		}
		return enqueueBillingOutboxEffect(tx, operation, BillingOutboxEffectInvalidateCache, effect.Sequence)
	})
}

func processBillingCacheEffect(ctx context.Context, db *gorm.DB, effectID int64, workerID string) error {
	var operation BillingOperation
	alreadyDone := false
	if err := db.Transaction(func(tx *gorm.DB) error {
		effect, loadedOperation, err := loadLeasedBillingEffect(tx, effectID, workerID)
		if err != nil {
			return err
		}
		if effect == nil {
			alreadyDone = true
			return nil
		}
		if effect.EffectType != BillingOutboxEffectInvalidateCache {
			return errors.New("billing outbox effect type mismatch")
		}
		operation = *loadedOperation
		return nil
	}); err != nil {
		return err
	}
	if alreadyDone {
		return nil
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := InvalidateUserCache(operation.UserID); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := InvalidateUserTokensCache(operation.UserID); err != nil {
		return err
	}
	now := common.GetTimestamp()
	result := db.Model(&BillingOutbox{}).
		Where("id = ? AND status = ? AND lease_owner = ?", effectID, BillingOutboxStatusProcessing, workerID).
		Updates(map[string]interface{}{
			"status":      BillingOutboxStatusDone,
			"lease_owner": "",
			"lease_until": 0,
			"last_error":  "",
			"updated_at":  now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		var effect BillingOutbox
		if err := db.Where("id = ?", effectID).First(&effect).Error; err == nil && effect.Status == BillingOutboxStatusDone {
			return nil
		}
		return ErrBillingOutboxLease
	}
	return nil
}

func loadLeasedBillingEffect(tx *gorm.DB, effectID int64, workerID string) (*BillingOutbox, *BillingOperation, error) {
	var effect BillingOutbox
	if err := lockForUpdate(tx).Where("id = ?", effectID).First(&effect).Error; err != nil {
		return nil, nil, err
	}
	if effect.Status == BillingOutboxStatusDone {
		return nil, nil, nil
	}
	if effect.Status != BillingOutboxStatusProcessing || effect.LeaseOwner != workerID || effect.LeaseUntil <= common.GetTimestamp() {
		return nil, nil, ErrBillingOutboxLease
	}
	var operation BillingOperation
	if err := lockForUpdate(tx).Where("id = ?", effect.OperationID).First(&operation).Error; err != nil {
		return nil, nil, err
	}
	return &effect, &operation, nil
}

func applyBillingFundingDelta(tx *gorm.DB, operation *BillingOperation, delta int64) error {
	switch operation.FundingSource {
	case BillingFundingSourceWallet:
		return applyBillingWalletDelta(tx, operation.UserID, delta)
	case BillingFundingSourceSubscription:
		if operation.FundingRefID <= 0 {
			return errors.New("subscription billing operation has no funding reference")
		}
		if operation.Outcome == BillingOutcomeFailure && operation.DesiredQuota == 0 {
			var record SubscriptionPreConsumeRecord
			if err := lockForUpdate(tx).Where("request_id = ?", operation.RequestID).First(&record).Error; err != nil {
				return err
			}
			if record.UserId != operation.UserID || record.UserSubscriptionId != operation.FundingRefID || record.PreConsumed != operation.BaselineQuota {
				return fmt.Errorf("%w: subscription pre-consume record does not match", ErrBillingOperationConflict)
			}
			if record.ResetEpoch > 0 && operation.FundingResetEpoch > 0 && record.ResetEpoch != operation.FundingResetEpoch {
				return fmt.Errorf("%w: subscription reset epoch does not match", ErrBillingOperationConflict)
			}
			if record.Status == "refunded" {
				if delta == 0 {
					return nil
				}
				return fmt.Errorf("%w: subscription refund was applied outside the ledger", ErrBillingOperationConflict)
			}
			if record.Status != "consumed" {
				return fmt.Errorf("%w: invalid subscription pre-consume status", ErrBillingOperationConflict)
			}
			if delta != 0 {
				if err := applyExactBillingSubscriptionDelta(tx, operation.FundingRefID, delta, operation.FundingResetEpoch, &record); err != nil {
					return err
				}
			}
			return tx.Model(&SubscriptionPreConsumeRecord{}).Where("id = ?", record.Id).Updates(map[string]interface{}{
				"status":     "refunded",
				"updated_at": common.GetTimestamp(),
			}).Error
		}
		return applyExactBillingSubscriptionDelta(tx, operation.FundingRefID, delta, operation.FundingResetEpoch, nil)
	case BillingFundingSourceImageBenefit:
		return nil
	default:
		return errors.New("unsupported billing funding source")
	}
}

func applyBillingWalletDelta(tx *gorm.DB, userID int, delta int64) error {
	if tx == nil || userID <= 0 {
		return errors.New("invalid wallet billing delta")
	}
	if delta == 0 {
		return nil
	}
	var result *gorm.DB
	if delta > 0 {
		result = tx.Unscoped().Model(&User{}).
			Where("id = ? AND quota >= ?", userID, delta).
			Update("quota", gorm.Expr("quota - ?", delta))
	} else {
		refund := -delta
		if refund > maxBillingQuota {
			return errors.New("wallet refund is out of range")
		}
		result = tx.Unscoped().Model(&User{}).
			Where("id = ? AND quota <= ?", userID, maxBillingQuota-refund).
			Update("quota", gorm.Expr("quota + ?", refund))
	}
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		if delta > 0 {
			return ErrInsufficientQuota
		}
		return errors.New("wallet user not found")
	}
	return nil
}

func applyExactBillingSubscriptionDelta(tx *gorm.DB, subscriptionID int, delta int64, resetEpoch int64, record *SubscriptionPreConsumeRecord) error {
	if tx == nil || subscriptionID <= 0 {
		return errors.New("invalid subscription billing delta")
	}
	if delta == 0 {
		return nil
	}
	if err := postConsumeUserSubscriptionDeltaWithEpochTx(tx, subscriptionID, delta, resetEpoch, record); err != nil {
		return fmt.Errorf("%w: %v", ErrBillingOperationConflict, err)
	}
	return nil
}

func applyBillingTokenDelta(tx *gorm.DB, tokenID int, userID int, delta int64) error {
	if tx == nil || tokenID <= 0 || userID <= 0 {
		return errors.New("invalid token billing delta")
	}
	if delta == 0 {
		return nil
	}
	var result *gorm.DB
	if delta > 0 {
		result = tx.Unscoped().Model(&Token{}).
			Where("id = ? AND user_id = ? AND used_quota >= 0 AND used_quota <= ? AND (unlimited_quota = ? OR remain_quota >= ?)",
				tokenID, userID, maxBillingQuota-delta, true, delta).
			Updates(map[string]interface{}{
				"remain_quota":  gorm.Expr("CASE WHEN unlimited_quota THEN remain_quota ELSE remain_quota - ? END", delta),
				"used_quota":    gorm.Expr("used_quota + ?", delta),
				"accessed_time": common.GetTimestamp(),
			})
	} else {
		refund := -delta
		result = tx.Unscoped().Model(&Token{}).
			Where("id = ? AND user_id = ? AND used_quota >= ? AND (unlimited_quota = ? OR remain_quota <= ?)",
				tokenID, userID, refund, true, maxBillingQuota-refund).
			Updates(map[string]interface{}{
				"remain_quota":  gorm.Expr("CASE WHEN unlimited_quota THEN remain_quota ELSE remain_quota + ? END", refund),
				"used_quota":    gorm.Expr("used_quota - ?", refund),
				"accessed_time": common.GetTimestamp(),
			})
	}
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("token quota is not enough or token state is inconsistent")
	}
	return nil
}

func markBillingOutboxFailure(db *gorm.DB, effectID int64, workerID string) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var effect BillingOutbox
		if err := lockForUpdate(tx).Where("id = ?", effectID).First(&effect).Error; err != nil {
			return err
		}
		if effect.Status == BillingOutboxStatusDone {
			return nil
		}
		if effect.Status != BillingOutboxStatusProcessing || effect.LeaseOwner != workerID {
			return ErrBillingOutboxLease
		}
		status := BillingOutboxStatusPending
		if effect.EffectType != BillingOutboxEffectApplyBalances && effect.EffectType != BillingOutboxEffectInvalidateCache && effect.Attempts >= billingOutboxMaxAttempts {
			status = BillingOutboxStatusDead
		}
		backoffExponent := effect.Attempts
		if backoffExponent > 8 {
			backoffExponent = 8
		}
		backoff := int64(1 << backoffExponent)
		now := common.GetTimestamp()
		return tx.Model(&BillingOutbox{}).Where("id = ?", effect.ID).Updates(map[string]interface{}{
			"status":       status,
			"available_at": now + backoff,
			"lease_owner":  "",
			"lease_until":  0,
			"last_error":   "billing_effect_failed",
			"updated_at":   now,
		}).Error
	})
}

func RequeueExpiredBillingOutboxLeases(now int64) (int64, error) {
	return RequeueExpiredBillingOutboxLeasesWithContext(context.Background(), now)
}

func RequeueExpiredBillingOutboxLeasesWithContext(ctx context.Context, now int64) (int64, error) {
	if DB == nil {
		return 0, errors.New("database is not initialized")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return 0, err
	}
	if now <= 0 {
		now = common.GetTimestamp()
	}
	result := DB.WithContext(ctx).Model(&BillingOutbox{}).
		Where("status = ? AND lease_until > 0 AND lease_until <= ?", BillingOutboxStatusProcessing, now).
		Updates(map[string]interface{}{
			"status":       BillingOutboxStatusPending,
			"available_at": now,
			"lease_owner":  "",
			"lease_until":  0,
			"last_error":   "lease_expired",
			"updated_at":   now,
		})
	return result.RowsAffected, result.Error
}

func validateBillingWorkerID(workerID string) error {
	if workerID == "" || strings.TrimSpace(workerID) != workerID || len(workerID) > 128 {
		return errors.New("invalid billing worker id")
	}
	for index := 0; index < len(workerID); index++ {
		if workerID[index] < 0x21 || workerID[index] > 0x7e {
			return errors.New("billing worker id must contain visible ASCII only")
		}
	}
	return nil
}
