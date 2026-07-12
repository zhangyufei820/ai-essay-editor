package model

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type BillingLedgerMode string

const (
	BillingLedgerModeOff    BillingLedgerMode = "off"
	BillingLedgerModeShadow BillingLedgerMode = "shadow"
	BillingLedgerModeActive BillingLedgerMode = "active"
)

type BillingOutcome string

const (
	BillingOutcomeOpen    BillingOutcome = "open"
	BillingOutcomeSuccess BillingOutcome = "success"
	BillingOutcomeFailure BillingOutcome = "failure"
)

const (
	BillingOperationKindRequest = "request"
	BillingOperationKindTask    = "task"

	BillingFundingSourceWallet             = "wallet"
	BillingFundingSourceSubscription       = "subscription"
	BillingFundingSourceImageBenefit       = "image_benefit"
	maxBillingQuota                  int64 = 1<<31 - 1
	maxBillingStoredQuota            int64 = 1<<63 - 1
)

var (
	ErrBillingOperationConflict = errors.New("billing operation conflict")
	ErrBillingOperationNotFound = errors.New("billing operation not found")
)

type BillingSubscriptionMetadata struct {
	UserSubscriptionID      int
	PreConsumed             int64
	ResetEpoch              int64
	AmountTotal             int64
	AmountUsedBefore        int64
	AmountUsedAfter         int64
	MonthlyAmountTotal      int64
	MonthlyAmountUsedBefore int64
	MonthlyAmountUsedAfter  int64
	PlanID                  int
	PlanTitle               string
	ConcurrencyLimit        int
}

type BillingOperation struct {
	ID                int64                        `json:"id" gorm:"primaryKey"`
	OperationKey      string                       `json:"operation_key" gorm:"type:varchar(191);not null;uniqueIndex"`
	RequestID         string                       `json:"request_id" gorm:"type:varchar(191);index"`
	TaskID            int64                        `json:"task_id" gorm:"index"`
	Kind              string                       `json:"kind" gorm:"type:varchar(16);not null;index"`
	UserID            int                          `json:"user_id" gorm:"not null;index"`
	TokenID           int                          `json:"token_id" gorm:"not null;default:0;index"`
	FundingSource     string                       `json:"funding_source" gorm:"type:varchar(32);not null;index"`
	FundingRefID      int                          `json:"funding_ref_id" gorm:"not null;default:0;index"`
	FundingResetEpoch int64                        `json:"funding_reset_epoch" gorm:"type:bigint;not null;default:0"`
	ChargeToken       bool                         `json:"charge_token" gorm:"not null"`
	BaselineQuota     int64                        `json:"baseline_quota" gorm:"type:bigint;not null;default:0"`
	ReservedQuota     int64                        `json:"reserved_quota" gorm:"type:bigint;not null;default:0"`
	DesiredQuota      int64                        `json:"desired_quota" gorm:"type:bigint;not null;default:0"`
	AppliedQuota      int64                        `json:"applied_quota" gorm:"type:bigint;not null;default:0"`
	LedgerMode        BillingLedgerMode            `json:"ledger_mode" gorm:"type:varchar(16);not null;index"`
	Outcome           BillingOutcome               `json:"outcome" gorm:"type:varchar(16);not null;index"`
	ErrorMessage      string                       `json:"error_message" gorm:"type:varchar(64);not null;default:''"`
	EffectSequence    int64                        `json:"effect_sequence" gorm:"type:bigint;not null;default:0"`
	CreatedAt         int64                        `json:"created_at" gorm:"type:bigint;not null;index"`
	UpdatedAt         int64                        `json:"updated_at" gorm:"type:bigint;not null;index"`
	Subscription      *BillingSubscriptionMetadata `json:"-" gorm:"-"`
}

func (BillingOperation) TableName() string {
	return "billing_operations"
}

type BillingOperationBaseline struct {
	OperationKey             string
	RequestID                string
	TaskID                   int64
	Kind                     string
	UserID                   int
	TokenID                  int
	FundingSource            string
	FundingRefID             int
	FundingResetEpoch        int64
	ChargeToken              bool
	ReservedQuota            int64
	LedgerMode               BillingLedgerMode
	SubscriptionModelName    string
	SubscriptionQuotaType    int
	SubscriptionTargetPlanID int
}

type BillingReservationIntent struct {
	OperationKey string
	TargetQuota  int64
}

type BillingOutcomeIntent struct {
	OperationKey string
	Outcome      BillingOutcome
	DesiredQuota int64
	ErrorMessage string
}

func NormalizeBillingLedgerMode(raw string) BillingLedgerMode {
	switch BillingLedgerMode(strings.ToLower(strings.TrimSpace(raw))) {
	case BillingLedgerModeShadow:
		return BillingLedgerModeShadow
	case BillingLedgerModeActive:
		return BillingLedgerModeActive
	default:
		return BillingLedgerModeOff
	}
}

func GetBillingLedgerMode() BillingLedgerMode {
	raw := os.Getenv("BILLING_LEDGER_MODE")
	mode := NormalizeBillingLedgerMode(raw)
	trimmed := strings.TrimSpace(raw)
	if trimmed != "" && mode == BillingLedgerModeOff && !strings.EqualFold(trimmed, string(BillingLedgerModeOff)) {
		common.SysLog("invalid BILLING_LEDGER_MODE; defaulting to off policy with durable billing enabled")
	}
	return mode
}

func RequestBillingOperationKey(requestID string) (string, error) {
	return makeBillingOperationKey("req:", requestID)
}

func TaskBillingOperationKey(taskID string) (string, error) {
	return makeBillingOperationKey("task:", taskID)
}

func BillingOperationExistsWithContext(ctx context.Context, operationKey string) (bool, error) {
	if DB == nil {
		return false, errors.New("database is not initialized")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return false, err
	}
	var count int64
	err := DB.WithContext(ctx).Model(&BillingOperation{}).
		Where("operation_key = ?", operationKey).
		Limit(1).
		Count(&count).Error
	return count > 0, err
}

func makeBillingOperationKey(prefix string, identifier string) (string, error) {
	if identifier == "" || strings.TrimSpace(identifier) != identifier {
		return "", errors.New("billing operation identifier is empty or has surrounding whitespace")
	}
	for index := 0; index < len(identifier); index++ {
		if identifier[index] < 0x21 || identifier[index] > 0x7e {
			return "", errors.New("billing operation identifier must contain visible ASCII only")
		}
	}
	key := prefix + identifier
	if len(key) > 191 {
		return "", errors.New("billing operation key is too long")
	}
	return key, nil
}

func EnsureBillingOperationBaseline(input BillingOperationBaseline) (*BillingOperation, error) {
	if DB == nil {
		return nil, errors.New("database is not initialized")
	}
	var operation *BillingOperation
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		operation, err = EnsureBillingOperationBaselineWithTx(tx, input)
		return err
	})
	return operation, err
}

func EnsureBillingOperationBaselineWithTx(tx *gorm.DB, input BillingOperationBaseline) (*BillingOperation, error) {
	if tx == nil {
		return nil, errors.New("transaction is nil")
	}
	if err := validateBillingOperationBaseline(input); err != nil {
		return nil, err
	}
	now := common.GetTimestamp()
	appliedQuota := int64(0)
	operation := &BillingOperation{
		OperationKey:      input.OperationKey,
		RequestID:         input.RequestID,
		TaskID:            input.TaskID,
		Kind:              input.Kind,
		UserID:            input.UserID,
		TokenID:           input.TokenID,
		FundingSource:     input.FundingSource,
		FundingRefID:      input.FundingRefID,
		FundingResetEpoch: input.FundingResetEpoch,
		ChargeToken:       input.ChargeToken,
		BaselineQuota:     input.ReservedQuota,
		ReservedQuota:     input.ReservedQuota,
		DesiredQuota:      input.ReservedQuota,
		AppliedQuota:      appliedQuota,
		LedgerMode:        input.LedgerMode,
		Outcome:           BillingOutcomeOpen,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	created := tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "operation_key"}},
		DoNothing: true,
	}).Create(operation)
	if created.Error != nil {
		return nil, created.Error
	}
	if created.RowsAffected == 0 || operation.ID == 0 {
		var existing BillingOperation
		if err := lockForUpdate(tx).Where("operation_key = ?", input.OperationKey).First(&existing).Error; err != nil {
			return nil, err
		}
		if err := validateExistingBillingOperation(&existing, input); err != nil {
			return nil, err
		}
		if existing.Outcome != BillingOutcomeOpen {
			return &existing, nil
		}
		updates := map[string]interface{}{}
		if existing.TaskID == 0 && input.TaskID > 0 {
			updates["task_id"] = input.TaskID
			existing.TaskID = input.TaskID
		}
		if existing.FundingRefID == 0 && input.FundingRefID > 0 {
			updates["funding_ref_id"] = input.FundingRefID
			existing.FundingRefID = input.FundingRefID
		}
		if existing.FundingResetEpoch == 0 && input.FundingResetEpoch > 0 {
			updates["funding_reset_epoch"] = input.FundingResetEpoch
			existing.FundingResetEpoch = input.FundingResetEpoch
		}
		if len(updates) > 0 {
			updates["updated_at"] = now
			if err := tx.Model(&BillingOperation{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
				return nil, err
			}
			existing.UpdatedAt = now
		}
		if existing.FundingSource == BillingFundingSourceSubscription && existing.FundingRefID > 0 {
			var err error
			existing.Subscription, err = loadBillingSubscriptionMetadata(tx, &existing)
			if err != nil {
				return nil, err
			}
			if existing.FundingResetEpoch == 0 && existing.Subscription.ResetEpoch > 0 {
				existing.FundingResetEpoch = existing.Subscription.ResetEpoch
				if err := tx.Model(&BillingOperation{}).Where("id = ?", existing.ID).Updates(map[string]interface{}{
					"funding_reset_epoch": existing.FundingResetEpoch,
					"updated_at":          now,
				}).Error; err != nil {
					return nil, err
				}
			}
		}
		if err := attachExistingTaskBillingBaselineWithTx(tx, &existing); err != nil {
			return nil, err
		}
		return &existing, nil
	}

	metadata, err := applyBillingBaseline(tx, operation, input)
	if err != nil {
		return nil, err
	}
	operation.Subscription = metadata
	if metadata != nil {
		operation.FundingResetEpoch = metadata.ResetEpoch
	}
	operation.AppliedQuota = input.ReservedQuota
	operation.EffectSequence = 1
	operation.UpdatedAt = now
	if err := tx.Model(&BillingOperation{}).Where("id = ?", operation.ID).Updates(map[string]interface{}{
		"funding_ref_id":      operation.FundingRefID,
		"funding_reset_epoch": operation.FundingResetEpoch,
		"applied_quota":       operation.AppliedQuota,
		"effect_sequence":     operation.EffectSequence,
		"updated_at":          now,
	}).Error; err != nil {
		return nil, err
	}
	if input.ReservedQuota > 0 {
		if err := enqueueBillingOutboxEffect(tx, operation, BillingOutboxEffectInvalidateCache, operation.EffectSequence); err != nil {
			return nil, err
		}
	}
	if err := attachExistingTaskBillingBaselineWithTx(tx, operation); err != nil {
		return nil, err
	}
	return operation, nil
}

func validateBillingOperationBaseline(input BillingOperationBaseline) error {
	if input.OperationKey == "" || len(input.OperationKey) > 191 {
		return errors.New("invalid billing operation key")
	}
	if input.Kind != BillingOperationKindRequest && input.Kind != BillingOperationKindTask {
		return errors.New("invalid billing operation kind")
	}
	prefix := "req:"
	if input.Kind == BillingOperationKindTask {
		prefix = "task:"
	}
	if !strings.HasPrefix(input.OperationKey, prefix) {
		return errors.New("billing operation key does not match kind")
	}
	validatedKey, err := makeBillingOperationKey(prefix, strings.TrimPrefix(input.OperationKey, prefix))
	if err != nil || validatedKey != input.OperationKey {
		return errors.New("invalid billing operation key")
	}
	if input.UserID <= 0 {
		return errors.New("invalid billing user id")
	}
	if input.RequestID == "" {
		return errors.New("billing request id is empty")
	}
	if input.Kind == BillingOperationKindRequest {
		expectedKey, err := RequestBillingOperationKey(input.RequestID)
		if err != nil || expectedKey != input.OperationKey {
			return errors.New("request billing key does not match request id")
		}
	}
	if err := validateBillingQuota(input.ReservedQuota); err != nil {
		return err
	}
	switch input.LedgerMode {
	case BillingLedgerModeOff, BillingLedgerModeShadow, BillingLedgerModeActive:
	default:
		return errors.New("invalid billing operation mode")
	}
	switch input.FundingSource {
	case BillingFundingSourceWallet, BillingFundingSourceSubscription, BillingFundingSourceImageBenefit:
	default:
		return errors.New("invalid billing funding source")
	}
	if input.ChargeToken && input.TokenID <= 0 {
		return errors.New("token charging requires a token id")
	}
	if input.FundingSource == BillingFundingSourceImageBenefit && !input.ChargeToken {
		return errors.New("image benefit billing requires token charging")
	}
	if input.FundingSource == BillingFundingSourceSubscription {
		if input.RequestID == "" {
			return errors.New("subscription billing requires a request id")
		}
		if input.ReservedQuota <= 0 {
			return errors.New("subscription billing requires positive reserved quota")
		}
		if len(input.RequestID) > 64 {
			return errors.New("subscription billing request id is too long")
		}
	}
	if len(input.RequestID) > 191 {
		return errors.New("billing request id is too long")
	}
	return nil
}

func validateExistingBillingOperation(operation *BillingOperation, input BillingOperationBaseline) error {
	if operation == nil {
		return ErrBillingOperationNotFound
	}
	if operation.RequestID != input.RequestID || operation.Kind != input.Kind || operation.UserID != input.UserID ||
		operation.TokenID != input.TokenID || operation.FundingSource != input.FundingSource ||
		operation.ChargeToken != input.ChargeToken || operation.BaselineQuota != input.ReservedQuota ||
		operation.LedgerMode != input.LedgerMode {
		return fmt.Errorf("%w: baseline does not match", ErrBillingOperationConflict)
	}
	if input.TaskID > 0 && operation.TaskID > 0 && operation.TaskID != input.TaskID {
		return fmt.Errorf("%w: task id does not match", ErrBillingOperationConflict)
	}
	if input.FundingRefID > 0 && operation.FundingRefID > 0 && operation.FundingRefID != input.FundingRefID {
		return fmt.Errorf("%w: funding reference does not match", ErrBillingOperationConflict)
	}
	if input.FundingResetEpoch > 0 && operation.FundingResetEpoch > 0 && operation.FundingResetEpoch != input.FundingResetEpoch {
		return fmt.Errorf("%w: funding reset epoch does not match", ErrBillingOperationConflict)
	}
	return nil
}

func RecordBillingOperationReservation(input BillingReservationIntent) (*BillingOperation, error) {
	if DB == nil {
		return nil, errors.New("database is not initialized")
	}
	var operation *BillingOperation
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		operation, err = RecordBillingOperationReservationWithTx(tx, input)
		return err
	})
	return operation, err
}

func RecordBillingOperationReservationWithTx(tx *gorm.DB, input BillingReservationIntent) (*BillingOperation, error) {
	if tx == nil {
		return nil, errors.New("transaction is nil")
	}
	if err := validateBillingQuota(input.TargetQuota); err != nil {
		return nil, err
	}
	var operation BillingOperation
	if err := lockForUpdate(tx).Where("operation_key = ?", input.OperationKey).First(&operation).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBillingOperationNotFound
		}
		return nil, err
	}
	if operation.Outcome != BillingOutcomeOpen {
		return nil, fmt.Errorf("%w: cannot reserve a terminal operation", ErrBillingOperationConflict)
	}
	if input.TargetQuota == operation.ReservedQuota {
		return &operation, nil
	}
	now := common.GetTimestamp()
	updates := map[string]interface{}{
		"reserved_quota": input.TargetQuota,
		"desired_quota":  input.TargetQuota,
		"updated_at":     now,
	}
	operation.ReservedQuota = input.TargetQuota
	operation.DesiredQuota = input.TargetQuota
	operation.UpdatedAt = now
	switch operation.LedgerMode {
	case BillingLedgerModeOff, BillingLedgerModeShadow, BillingLedgerModeActive:
		operation.EffectSequence++
		updates["effect_sequence"] = operation.EffectSequence
	default:
		return nil, fmt.Errorf("%w: invalid operation mode", ErrBillingOperationConflict)
	}
	if err := tx.Model(&BillingOperation{}).Where("id = ?", operation.ID).Updates(updates).Error; err != nil {
		return nil, err
	}
	if err := enqueueBillingOutboxEffect(tx, &operation, BillingOutboxEffectApplyBalances, operation.EffectSequence); err != nil {
		return nil, err
	}
	if err := attachExistingTaskBillingBaselineWithTx(tx, &operation); err != nil {
		return nil, err
	}
	return &operation, nil
}

func RecordBillingOperationOutcome(input BillingOutcomeIntent) (*BillingOperation, error) {
	if DB == nil {
		return nil, errors.New("database is not initialized")
	}
	var operation *BillingOperation
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		operation, err = RecordBillingOperationOutcomeWithTx(tx, input)
		return err
	})
	return operation, err
}

func RecordBillingOperationOutcomeWithTx(tx *gorm.DB, input BillingOutcomeIntent) (*BillingOperation, error) {
	return recordBillingOperationOutcomeWithTx(tx, input, "")
}

func RecordShadowBillingOperationOutcome(input BillingOutcomeIntent) (*BillingOperation, error) {
	if DB == nil {
		return nil, errors.New("database is not initialized")
	}
	var operation *BillingOperation
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		operation, err = RecordShadowBillingOperationOutcomeWithTx(tx, input)
		return err
	})
	return operation, err
}

func RecordShadowBillingOperationOutcomeWithTx(tx *gorm.DB, input BillingOutcomeIntent) (*BillingOperation, error) {
	return recordBillingOperationOutcomeWithTx(tx, input, BillingLedgerModeShadow)
}

func recordBillingOperationOutcomeWithTx(tx *gorm.DB, input BillingOutcomeIntent, expectedMode BillingLedgerMode) (*BillingOperation, error) {
	if tx == nil {
		return nil, errors.New("transaction is nil")
	}
	if input.Outcome != BillingOutcomeSuccess && input.Outcome != BillingOutcomeFailure {
		return nil, errors.New("billing outcome must be success or failure")
	}
	if err := validateBillingQuota(input.DesiredQuota); err != nil {
		return nil, err
	}
	if input.Outcome == BillingOutcomeFailure && input.DesiredQuota != 0 {
		return nil, errors.New("failed billing outcome must have zero desired quota")
	}
	var operation BillingOperation
	if err := lockForUpdate(tx).Where("operation_key = ?", input.OperationKey).First(&operation).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBillingOperationNotFound
		}
		return nil, err
	}
	if expectedMode != "" && operation.LedgerMode != expectedMode {
		return nil, fmt.Errorf("%w: ledger mode does not match", ErrBillingOperationConflict)
	}
	if operation.Outcome != BillingOutcomeOpen {
		if operation.Outcome == input.Outcome && operation.DesiredQuota == input.DesiredQuota {
			return &operation, nil
		}
		return nil, fmt.Errorf("%w: terminal outcome already recorded", ErrBillingOperationConflict)
	}
	now := common.GetTimestamp()
	operation.Outcome = input.Outcome
	operation.DesiredQuota = input.DesiredQuota
	operation.ErrorMessage = sanitizeBillingErrorMessage(input.ErrorMessage)
	operation.UpdatedAt = now
	updates := map[string]interface{}{
		"outcome":       operation.Outcome,
		"desired_quota": operation.DesiredQuota,
		"error_message": operation.ErrorMessage,
		"updated_at":    now,
	}
	operation.EffectSequence++
	updates["effect_sequence"] = operation.EffectSequence
	if err := tx.Model(&BillingOperation{}).Where("id = ?", operation.ID).Updates(updates).Error; err != nil {
		return nil, err
	}
	if err := enqueueBillingOutboxEffect(tx, &operation, BillingOutboxEffectApplyBalances, operation.EffectSequence); err != nil {
		return nil, err
	}
	return &operation, nil
}

func RecoverStaleOpenBillingOperations(now int64, limit int) (int64, error) {
	return RecoverStaleOpenBillingOperationsWithContext(context.Background(), now, limit)
}

func RecoverStaleOpenBillingOperationsWithContext(ctx context.Context, now int64, limit int) (int64, error) {
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
	if limit <= 0 {
		limit = 100
	}
	taskCutoff := now - 15*60
	requestCutoff := now - 2*60*60
	db := DB.WithContext(ctx)
	var candidates []BillingOperation
	if err := db.Where("outcome = ?", BillingOutcomeOpen).
		Where("(kind = ? AND updated_at <= ?) OR (kind = ? AND updated_at <= ?)",
			BillingOperationKindTask, taskCutoff, BillingOperationKindRequest, requestCutoff).
		Order("id asc").Limit(limit).Find(&candidates).Error; err != nil {
		return 0, err
	}
	var recovered int64
	var firstError error
	for _, candidate := range candidates {
		if err := ctx.Err(); err != nil {
			return recovered, err
		}
		recoveredThisOperation := false
		err := db.Transaction(func(tx *gorm.DB) error {
			var operation BillingOperation
			cutoff := requestCutoff
			if candidate.Kind == BillingOperationKindTask {
				cutoff = taskCutoff
			}
			query := lockForUpdate(tx).Where("id = ? AND outcome = ? AND updated_at <= ?", candidate.ID, BillingOutcomeOpen, cutoff).First(&operation)
			if errors.Is(query.Error, gorm.ErrRecordNotFound) {
				return nil
			}
			if query.Error != nil {
				return query.Error
			}
			operationWasUnattached := operation.TaskID == 0
			if operation.Kind == BillingOperationKindTask {
				var task Task
				var taskQuery *gorm.DB
				if operation.TaskID > 0 {
					taskQuery = lockForUpdate(tx).Where("id = ?", operation.TaskID).Limit(1).Find(&task)
				} else {
					publicTaskID := strings.TrimPrefix(operation.OperationKey, "task:")
					if publicTaskID == operation.OperationKey || publicTaskID == "" {
						return fmt.Errorf("%w: invalid task operation key", ErrBillingOperationConflict)
					}
					taskQuery = lockForUpdate(tx).Where("task_id = ?", publicTaskID).Limit(1).Find(&task)
				}
				if taskQuery.Error != nil {
					return taskQuery.Error
				}
				if taskQuery.RowsAffected > 0 {
					if err := validateRecoveredTaskBillingIdentity(&task, &operation); err != nil {
						common.SysError(fmt.Sprintf("billing recovery task identity conflict: operation_id=%d", operation.ID))
						_, outcomeErr := RecordBillingOperationOutcomeWithTx(tx, BillingOutcomeIntent{
							OperationKey: operation.OperationKey,
							Outcome:      BillingOutcomeFailure,
							DesiredQuota: 0,
							ErrorMessage: "task_identity_conflict",
						})
						if outcomeErr == nil {
							recoveredThisOperation = true
						}
						return outcomeErr
					}
					if operation.TaskID == 0 {
						if err := tx.Model(&BillingOperation{}).Where("id = ?", operation.ID).Updates(map[string]interface{}{
							"task_id":    task.ID,
							"updated_at": now,
						}).Error; err != nil {
							return err
						}
						operation.TaskID = task.ID
						operation.UpdatedAt = now
					}
					if task.Status == TaskStatusSuccess || task.Status == TaskStatusFailure {
						outcome := BillingOutcomeSuccess
						desiredQuota := int64(task.Quota)
						errorMessage := ""
						if task.Status == TaskStatusFailure {
							outcome = BillingOutcomeFailure
							desiredQuota = 0
							errorMessage = "task_failed"
						}
						_, err := RecordBillingOperationOutcomeWithTx(tx, BillingOutcomeIntent{
							OperationKey: operation.OperationKey,
							Outcome:      outcome,
							DesiredQuota: desiredQuota,
							ErrorMessage: errorMessage,
						})
						if err == nil {
							recoveredThisOperation = true
						}
						return err
					}
					if operationWasUnattached {
						return attachExistingTaskBillingBaselineWithTx(tx, &operation)
					}
					return tx.Model(&BillingOperation{}).Where("id = ?", operation.ID).Update("updated_at", now).Error
				}
			}
			errorMessage := "request_failed"
			if operation.Kind == BillingOperationKindTask {
				errorMessage = "task_insert_missing"
				common.SysError(fmt.Sprintf("billing recovery task record missing: operation_id=%d task_id=%d", operation.ID, operation.TaskID))
			}
			_, err := RecordBillingOperationOutcomeWithTx(tx, BillingOutcomeIntent{
				OperationKey: operation.OperationKey,
				Outcome:      BillingOutcomeFailure,
				DesiredQuota: 0,
				ErrorMessage: errorMessage,
			})
			if err == nil {
				recoveredThisOperation = true
			}
			return err
		})
		if err != nil {
			if firstError == nil {
				firstError = err
			}
			continue
		}
		if recoveredThisOperation {
			recovered++
		}
	}
	return recovered, firstError
}

func validateRecoveredTaskBillingIdentity(task *Task, operation *BillingOperation) error {
	if task == nil || operation == nil {
		return fmt.Errorf("%w: recovered task billing identity is missing", ErrBillingOperationConflict)
	}
	privateData := task.PrivateData
	if task.UserId != operation.UserID || privateData.BillingOperationKey != operation.OperationKey ||
		privateData.BillingLedgerMode != operation.LedgerMode || privateData.BillingRequestID != operation.RequestID ||
		privateData.BillingSource != operation.FundingSource || privateData.TokenId != operation.TokenID ||
		!privateData.BillingChargeTokenSet || privateData.BillingChargeToken != operation.ChargeToken {
		return fmt.Errorf("%w: recovered task billing identity does not match", ErrBillingOperationConflict)
	}
	if operation.FundingSource == BillingFundingSourceSubscription &&
		(privateData.SubscriptionId != operation.FundingRefID || privateData.SubscriptionResetEpoch != operation.FundingResetEpoch) {
		return fmt.Errorf("%w: recovered task subscription identity does not match", ErrBillingOperationConflict)
	}
	return nil
}

func validateBillingQuota(quota int64) error {
	if quota < 0 || quota > maxBillingQuota {
		return errors.New("billing quota is out of range")
	}
	return nil
}

func sanitizeBillingErrorMessage(message string) string {
	category := strings.ToLower(strings.TrimSpace(message))
	switch category {
	case "", "failed", "task_failed", "request_failed", "timeout", "cancelled", "billing_failure", "task_insert_missing", "task_identity_conflict":
		return category
	default:
		return "billing_failure"
	}
}
