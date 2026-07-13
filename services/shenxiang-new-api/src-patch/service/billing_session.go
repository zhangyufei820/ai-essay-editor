package service

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

// ---------------------------------------------------------------------------
// BillingSession — 统一计费会话
// ---------------------------------------------------------------------------

// BillingSession 封装单次请求的预扣费/结算/退款生命周期。
// 实现 relaycommon.BillingSettler 接口。
type BillingSession struct {
	relayInfo              *relaycommon.RelayInfo
	funding                FundingSource
	ledgerMode             model.BillingLedgerMode
	operationKey           string
	operationKind          string
	taskRecordID           int64
	ledgerTracked          bool
	taskOperation          bool
	taskOverride           bool
	taskHandoffReady       bool
	taskHandoffDone        bool
	taskHandoffTargetQuota int
	taskHandoffTargetSet   bool
	preConsumedQuota       int  // 实际预扣额度（信任用户可能为 0）
	tokenConsumed          int  // 令牌额度实际扣减量
	extraReserved          int  // 订阅初始预扣后的净调整量（补充预扣 + 后结算 delta）
	trusted                bool // 是否命中信任额度旁路
	skipTokenQuota         bool // 月卡专供通道按订阅额度扣减，不叠加普通 token 日/月限额
	settled                bool // Settle 全部完成（资金 + 令牌）
	refunded               bool // Refund 已调用
	mu                     sync.Mutex
}

type billingOperationContext struct {
	mode         model.BillingLedgerMode
	operationKey string
	kind         string
	taskRecordID int64
	isTask       bool
	isOverride   bool
}

func resolveBillingOperationContext(c *gin.Context, relayInfo *relaycommon.RelayInfo) (billingOperationContext, error) {
	resolved := billingOperationContext{mode: model.GetBillingLedgerMode(), kind: model.BillingOperationKindRequest}
	if c != nil {
		if rawOverride, exists := c.Get(taskBillingOperationOverrideContextKey); exists {
			override, ok := rawOverride.(TaskBillingOperationOverride)
			if !ok {
				return billingOperationContext{}, errors.New("billing operation override is invalid")
			}
			resolved.mode = override.LedgerMode
			resolved.operationKey = override.OperationKey
			resolved.kind = model.BillingOperationKindTask
			resolved.taskRecordID = override.TaskRecordID
			resolved.isTask = true
			resolved.isOverride = true
			switch resolved.mode {
			case model.BillingLedgerModeOff, model.BillingLedgerModeShadow, model.BillingLedgerModeActive:
			default:
				return billingOperationContext{}, errors.New("billing operation override mode is invalid")
			}
			if resolved.taskRecordID <= 0 {
				return billingOperationContext{}, errors.New("billing operation override task record is invalid")
			}
			if err := validateTaskOperationKey(resolved.operationKey); err != nil {
				return billingOperationContext{}, err
			}
			return resolved, nil
		}
	}

	if relayInfo == nil {
		return billingOperationContext{}, errors.New("relayInfo is nil")
	}
	if relayInfo.TaskRelayInfo != nil {
		resolved.kind = model.BillingOperationKindTask
		resolved.isTask = true
		publicTaskID := relayInfo.TaskRelayInfo.PublicTaskID
		if publicTaskID == "" {
			return billingOperationContext{}, errors.New("task billing public id is missing")
		}
		operationKey, err := model.TaskBillingOperationKey(publicTaskID)
		if err != nil {
			return billingOperationContext{}, err
		}
		resolved.operationKey = operationKey
		return resolved, nil
	}
	operationKey, err := model.RequestBillingOperationKey(relayInfo.RequestId)
	if err != nil {
		return billingOperationContext{}, err
	}
	resolved.operationKey = operationKey
	return resolved, nil
}

func validateTaskOperationKey(operationKey string) error {
	if !strings.HasPrefix(operationKey, "task:") {
		return errors.New("billing task operation key is invalid")
	}
	identifier := strings.TrimPrefix(operationKey, "task:")
	expected, err := model.TaskBillingOperationKey(identifier)
	if err != nil || expected != operationKey {
		return errors.New("billing task operation key is invalid")
	}
	return nil
}

func (s *BillingSession) shouldChargeTokenQuota() bool {
	if s == nil || s.relayInfo == nil {
		return false
	}
	if s.funding != nil && s.funding.Source() == BillingSourceImageBenefit {
		return true
	}
	if s.relayInfo.IsPlayground {
		return false
	}
	if s.skipTokenQuota {
		return false
	}
	return true
}

func logBillingSessionInfo(c *gin.Context, message string) {
	if c != nil {
		logger.LogInfo(c, message)
		return
	}
	common.SysLog(message)
}

func (s *BillingSession) Settle(actualQuota int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.settled || s.refunded {
		return nil
	}
	if actualQuota < 0 {
		return errors.New("billing actual quota cannot be negative")
	}
	if !s.ledgerTracked {
		return errors.New("durable billing operation is required for settlement")
	}
	return s.settleDurableLocked(actualQuota)
}

func (s *BillingSession) settleDurableLocked(actualQuota int) error {
	if s.taskOperation {
		s.taskHandoffTargetQuota = actualQuota
		s.taskHandoffTargetSet = true
		operation, err := model.RecordBillingOperationReservation(model.BillingReservationIntent{
			OperationKey: s.operationKey,
			TargetQuota:  int64(actualQuota),
		})
		if err != nil {
			s.funding.Close()
			return err
		}
		s.applyLedgerReservationLocked(operation)
		s.processBillingInlineBestEffort("task reservation")
		if s.taskOverride {
			s.settled = true
			s.funding.Close()
		}
		return nil
	}

	operation, err := model.RecordBillingOperationOutcome(model.BillingOutcomeIntent{
		OperationKey: s.operationKey,
		Outcome:      model.BillingOutcomeSuccess,
		DesiredQuota: int64(actualQuota),
	})
	if err != nil {
		s.funding.Close()
		return err
	}
	delta := int(operation.DesiredQuota) - s.preConsumedQuota
	if s.funding.Source() == BillingSourceSubscription {
		s.relayInfo.SubscriptionPostDelta += int64(delta)
	}
	s.settled = true
	s.processBillingInlineBestEffort("request settlement")
	s.funding.Close()
	return nil
}

func (s *BillingSession) applyLedgerReservationLocked(operation *model.BillingOperation) {
	if operation == nil {
		return
	}
	s.preConsumedQuota = int(operation.ReservedQuota)
	if operation.ChargeToken {
		s.tokenConsumed = s.preConsumedQuota
	} else {
		s.tokenConsumed = 0
	}
	if s.funding.Source() == BillingSourceSubscription {
		if subscription, ok := s.funding.(*SubscriptionFunding); ok {
			s.extraReserved = s.preConsumedQuota - int(subscription.preConsumed)
		}
	}
	s.syncRelayInfo()
}

func (s *BillingSession) processBillingInlineBestEffort(stage string) {
	if s.operationKey == "" {
		return
	}
	if err := model.ProcessBillingOperationInline(s.operationKey); err != nil {
		common.SysLog(fmt.Sprintf("billing ledger inline processing failed at %s; outbox will retry: %s", stage, err.Error()))
	}
}

func (s *BillingSession) ChargeAdjustment(purpose string, quota int) error {
	if s == nil || s.relayInfo == nil || s.funding == nil {
		return errors.New("billing adjustment session is unavailable")
	}
	if purpose != "violation_fee_v1" {
		return errors.New("billing adjustment purpose is invalid")
	}
	if quota <= 0 {
		return errors.New("billing adjustment quota must be positive")
	}
	s.mu.Lock()
	digest := sha256.Sum256([]byte(s.relayInfo.RequestId + "\x00" + purpose))
	requestID := fmt.Sprintf("%x", digest)
	operationKey, err := model.RequestBillingOperationKey(requestID)
	if err != nil {
		s.mu.Unlock()
		return err
	}
	baseline := model.BillingOperationBaseline{
		OperationKey:  operationKey,
		RequestID:     requestID,
		Kind:          model.BillingOperationKindRequest,
		UserID:        s.relayInfo.UserId,
		TokenID:       s.relayInfo.TokenId,
		FundingSource: s.funding.Source(),
		ChargeToken:   s.shouldChargeTokenQuota(),
		ReservedQuota: int64(quota),
		LedgerMode:    s.ledgerMode,
	}
	if subscription, ok := s.funding.(*SubscriptionFunding); ok {
		baseline.FundingRefID = subscription.subscriptionId
		baseline.SubscriptionModelName = subscription.modelName
		baseline.SubscriptionQuotaType = subscription.quotaType
		baseline.SubscriptionTargetPlanID = subscription.targetPlanId
	}
	s.mu.Unlock()

	operation, err := model.EnsureBillingOperationBaseline(baseline)
	if err != nil {
		return err
	}
	if operation.Outcome == model.BillingOutcomeFailure {
		return errors.New("billing adjustment is already failed")
	}
	if operation.Outcome == model.BillingOutcomeOpen {
		if _, err := model.RecordBillingOperationOutcome(model.BillingOutcomeIntent{
			OperationKey: operationKey,
			Outcome:      model.BillingOutcomeSuccess,
			DesiredQuota: int64(quota),
		}); err != nil {
			return err
		}
	}
	return model.ProcessBillingOperationInline(operationKey)
}

func (s *BillingSession) Refund(c *gin.Context) {
	s.mu.Lock()
	if !s.ledgerTracked {
		s.refunded = true
		s.mu.Unlock()
		common.SysError("refusing non-durable billing refund")
		if s.funding != nil {
			s.funding.Close()
		}
		return
	}
	s.refundDurableLocked(c)
	s.mu.Unlock()
}

func (s *BillingSession) refundDurableLocked(c *gin.Context) {
	if s.settled || s.refunded {
		return
	}
	if s.taskOverride {
		s.refunded = true
		s.funding.Close()
		return
	}
	logBillingSessionInfo(c, fmt.Sprintf("用户 %d 请求失败, 记录账本退款意图（operation=%s）", s.relayInfo.UserId, s.operationKey))
	err := refundWithRetry(func() error {
		_, recordErr := model.RecordBillingOperationOutcome(model.BillingOutcomeIntent{
			OperationKey: s.operationKey,
			Outcome:      model.BillingOutcomeFailure,
			DesiredQuota: 0,
			ErrorMessage: "request_failed",
		})
		return recordErr
	})
	if err != nil {
		common.SysLog("error recording durable billing refund intent: " + err.Error())
		s.funding.Close()
		return
	}
	s.processBillingInlineBestEffort("request refund")
	s.refunded = true
	s.funding.Close()
}

// NeedsRefund 返回是否存在需要退还的预扣状态。
func (s *BillingSession) NeedsRefund() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.needsRefundLocked()
}

func (s *BillingSession) needsRefundLocked() bool {
	return s.ledgerTracked && !s.settled && !s.refunded && !s.taskOverride
}

// GetPreConsumedQuota 返回实际预扣的额度。
func (s *BillingSession) GetPreConsumedQuota() int {
	return s.preConsumedQuota
}

// PrepareTaskBillingHandoff copies the immutable billing identity onto a new
// task and returns the reservation intent that must be committed atomically
// with the task insert. Existing-task overrides are already attached by the
// baseline transaction and therefore do not require another handoff.
func (s *BillingSession) PrepareTaskBillingHandoff(task *model.Task) (model.BillingReservationIntent, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.taskOperation || s.taskOverride {
		return model.BillingReservationIntent{}, false, nil
	}
	if task == nil {
		return model.BillingReservationIntent{}, false, errors.New("task billing handoff requires a task")
	}
	if s.refunded || s.taskHandoffDone {
		return model.BillingReservationIntent{}, false, errors.New("task billing handoff is already closed")
	}
	if s.relayInfo == nil || s.relayInfo.TaskRelayInfo == nil || task.TaskID != s.relayInfo.TaskRelayInfo.PublicTaskID {
		return model.BillingReservationIntent{}, false, errors.New("task billing handoff public id does not match")
	}
	if task.UserId != s.relayInfo.UserId {
		return model.BillingReservationIntent{}, false, errors.New("task billing handoff user does not match")
	}
	if !s.ledgerTracked {
		return model.BillingReservationIntent{}, false, errors.New("durable billing operation is required for task handoff")
	}
	expectedOperationKey, err := model.TaskBillingOperationKey(task.TaskID)
	if err != nil || expectedOperationKey != s.operationKey {
		return model.BillingReservationIntent{}, false, errors.New("task billing handoff operation does not match task")
	}
	task.PrivateData.BillingOperationKey = s.operationKey
	task.PrivateData.BillingLedgerMode = s.ledgerMode
	task.PrivateData.BillingRequestID = s.relayInfo.RequestId
	task.PrivateData.BillingSource = s.funding.Source()
	task.PrivateData.SubscriptionId = s.relayInfo.SubscriptionId
	if subscription, ok := s.funding.(*SubscriptionFunding); ok {
		task.PrivateData.SubscriptionResetEpoch = subscription.resetEpoch
	}
	task.PrivateData.TokenId = s.relayInfo.TokenId
	task.PrivateData.BillingChargeToken = s.shouldChargeTokenQuota()
	task.PrivateData.BillingChargeTokenSet = true
	targetQuota := s.preConsumedQuota
	if s.taskHandoffTargetSet {
		targetQuota = s.taskHandoffTargetQuota
	}
	task.Quota = targetQuota
	s.taskHandoffReady = true
	return model.BillingReservationIntent{
		OperationKey: s.operationKey,
		TargetQuota:  int64(targetQuota),
	}, true, nil
}

// CompleteTaskBillingHandoff transfers terminal ownership from the request
// session to the persisted task. It must only be called after the task insert
// and billing-operation attachment commit together.
func (s *BillingSession) CompleteTaskBillingHandoff() {
	s.mu.Lock()
	if !s.taskHandoffReady || s.taskHandoffDone || s.refunded {
		s.mu.Unlock()
		return
	}
	s.taskHandoffDone = true
	s.settled = true
	s.mu.Unlock()
	s.funding.Close()
}

func (s *BillingSession) ReleaseTaskBillingHandoffResources() {
	if s == nil || s.funding == nil {
		return
	}
	s.funding.Close()
}

func (s *BillingSession) Reserve(targetQuota int) error {
	targetQuota = EffectiveMonthlyCardTextBillingQuota(s.relayInfo, targetQuota)

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.settled || s.refunded || s.trusted {
		return nil
	}

	if !s.ledgerTracked {
		return errors.New("durable billing operation is required for reservation")
	}
	if targetQuota > s.preConsumedQuota {
		operation, err := model.RecordBillingOperationReservation(model.BillingReservationIntent{
			OperationKey: s.operationKey,
			TargetQuota:  int64(targetQuota),
		})
		if err != nil {
			return err
		}
		s.applyLedgerReservationLocked(operation)
	}
	if err := model.ProcessBillingOperationInline(s.operationKey); err != nil {
		common.SysLog("billing ledger reservation could not be confirmed: " + err.Error())
		return billingLedgerAPIError(err)
	}
	return nil
}

func (s *BillingSession) preConsumeWithLedger(c *gin.Context, quota int) *types.NewAPIError {
	if quota < 0 {
		return types.NewError(errors.New("pre-consumed quota cannot be negative"), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}
	chargeToken := s.shouldChargeTokenQuota()
	if s.taskOperation {
		SetTaskBillingChargeDecision(c, chargeToken)
	}
	return s.preConsumeDurable(c, quota, chargeToken)
}

func (s *BillingSession) preConsumeDurable(c *gin.Context, quota int, chargeToken bool) *types.NewAPIError {
	effectiveQuota := quota
	if s.shouldTrust(c) {
		s.trusted = true
		effectiveQuota = 0
		logBillingSessionInfo(c, fmt.Sprintf("用户 %d 额度充足, 账本信任旁路不预扣费 (funding=%s)", s.relayInfo.UserId, s.funding.Source()))
	} else if effectiveQuota > 0 {
		logBillingSessionInfo(c, fmt.Sprintf("用户 %d 通过账本预扣费 %s (funding=%s)", s.relayInfo.UserId, logger.FormatQuota(effectiveQuota), s.funding.Source()))
	}

	operation, err := model.EnsureBillingOperationBaseline(s.billingBaseline(effectiveQuota, chargeToken))
	if err != nil {
		return billingLedgerAPIError(err)
	}
	if operation.Outcome != model.BillingOutcomeOpen {
		s.funding.Close()
		return billingLedgerAPIError(fmt.Errorf("%w: billing operation is already terminal", model.ErrBillingOperationConflict))
	}
	if operation.AppliedQuota != operation.ReservedQuota {
		ctx := context.Background()
		if c != nil && c.Request != nil {
			ctx = c.Request.Context()
		}
		if err := model.ProcessBillingOperationInlineWithContext(ctx, operation.OperationKey); err != nil {
			s.funding.Close()
			return billingLedgerAPIError(err)
		}
		operation, err = model.EnsureBillingOperationBaseline(s.billingBaseline(effectiveQuota, chargeToken))
		if err != nil {
			s.funding.Close()
			return billingLedgerAPIError(err)
		}
		if operation.Outcome != model.BillingOutcomeOpen || operation.AppliedQuota != operation.ReservedQuota {
			s.funding.Close()
			return billingLedgerAPIError(model.ErrBillingConvergencePending)
		}
	}
	if err := s.applyDurableBillingBaseline(operation); err != nil {
		if strings.Contains(err.Error(), "concurrency limit") {
			s.failDurableBillingBaseline("subscription_concurrency")
			return subscriptionLimitAPIError(&model.SubscriptionLimitError{Reason: "concurrency"})
		}
		s.failDurableBillingBaseline("baseline_initialization")
		return billingLedgerAPIError(err)
	}
	s.processBillingInlineBestEffort("baseline")
	return nil
}

func (s *BillingSession) billingBaseline(reservedQuota int, chargeToken bool) model.BillingOperationBaseline {
	baseline := model.BillingOperationBaseline{
		OperationKey:  s.operationKey,
		RequestID:     s.relayInfo.RequestId,
		TaskID:        s.taskRecordID,
		Kind:          s.operationKind,
		UserID:        s.relayInfo.UserId,
		TokenID:       s.relayInfo.TokenId,
		FundingSource: s.funding.Source(),
		ChargeToken:   chargeToken,
		ReservedQuota: int64(reservedQuota),
		LedgerMode:    s.ledgerMode,
	}
	if subscription, ok := s.funding.(*SubscriptionFunding); ok {
		baseline.FundingRefID = subscription.subscriptionId
		baseline.FundingResetEpoch = subscription.resetEpoch
		baseline.SubscriptionModelName = subscription.modelName
		baseline.SubscriptionQuotaType = subscription.quotaType
		baseline.SubscriptionTargetPlanID = subscription.targetPlanId
	}
	return baseline
}

func (s *BillingSession) applyDurableBillingBaseline(operation *model.BillingOperation) error {
	if operation == nil {
		return errors.New("billing operation baseline is missing")
	}
	s.ledgerTracked = true
	s.preConsumedQuota = int(operation.ReservedQuota)
	if operation.ChargeToken {
		s.tokenConsumed = s.preConsumedQuota
	}
	switch funding := s.funding.(type) {
	case *WalletFunding:
		funding.consumed = s.preConsumedQuota
	case *SubscriptionFunding:
		metadata := operation.Subscription
		if metadata == nil || metadata.UserSubscriptionID <= 0 {
			return errors.New("durable subscription billing metadata is missing")
		}
		funding.subscriptionId = metadata.UserSubscriptionID
		funding.preConsumed = operation.AppliedQuota
		s.extraReserved = int(operation.ReservedQuota - operation.AppliedQuota)
		funding.resetEpoch = metadata.ResetEpoch
		funding.AmountTotal = metadata.AmountTotal
		funding.AmountUsedAfter = metadata.AmountUsedAfter
		funding.MonthlyAmountTotal = metadata.MonthlyAmountTotal
		funding.MonthlyAmountUsedAfter = metadata.MonthlyAmountUsedAfter
		funding.PlanId = metadata.PlanID
		funding.PlanTitle = metadata.PlanTitle
		funding.ConcurrencyLimit = metadata.ConcurrencyLimit
		if funding.ConcurrencyLimit > 0 {
			release, err := acquireSubscriptionConcurrency(funding.subscriptionId, funding.ConcurrencyLimit)
			if err != nil {
				return err
			}
			funding.releaseConcurrency = release
		}
	}
	s.syncRelayInfo()
	return nil
}

func (s *BillingSession) failDurableBillingBaseline(reason string) {
	if !s.ledgerTracked || s.operationKey == "" {
		return
	}
	if s.taskOverride {
		s.funding.Close()
		return
	}
	if _, err := model.RecordBillingOperationOutcome(model.BillingOutcomeIntent{
		OperationKey: s.operationKey,
		Outcome:      model.BillingOutcomeFailure,
		DesiredQuota: 0,
		ErrorMessage: reason,
	}); err != nil {
		common.SysLog("error recording failed durable billing baseline: " + err.Error())
	} else {
		s.processBillingInlineBestEffort("baseline rollback")
	}
	s.refunded = true
	s.funding.Close()
}

func billingLedgerAPIError(err error) *types.NewAPIError {
	if errors.Is(err, model.ErrInsufficientQuota) {
		return fundingAPIError(err)
	}
	if model.IsSubscriptionHardLimitError(err) {
		return subscriptionLimitAPIError(err)
	}
	errMessage := err.Error()
	if strings.Contains(errMessage, "no active subscription") || strings.Contains(errMessage, "subscription quota insufficient") {
		return types.NewErrorWithStatusCode(
			fmt.Errorf("订阅额度不足或未配置订阅: %s", errMessage),
			types.ErrorCodeInsufficientUserQuota,
			http.StatusForbidden,
			types.ErrOptionWithSkipRetry(),
			types.ErrOptionWithNoRecordErrorLog(),
		)
	}
	return types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
}

func fundingAPIError(err error) *types.NewAPIError {
	if errors.Is(err, model.ErrInsufficientQuota) {
		return types.NewErrorWithStatusCode(
			err,
			types.ErrorCodeInsufficientUserQuota,
			http.StatusForbidden,
			types.ErrOptionWithSkipRetry(),
			types.ErrOptionWithNoRecordErrorLog(),
		)
	}
	return types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
}

func subscriptionLimitAPIError(err error) *types.NewAPIError {
	var limitErr *model.SubscriptionLimitError
	if errors.As(err, &limitErr) && limitErr.Reason == "concurrency" {
		return types.NewErrorWithStatusCode(
			err,
			types.ErrorCodeSubscriptionConcurrency,
			http.StatusTooManyRequests,
			types.ErrOptionWithSkipRetry(),
			types.ErrOptionWithNoRecordErrorLog(),
		)
	}
	return types.NewErrorWithStatusCode(
		err,
		types.ErrorCodeInsufficientUserQuota,
		http.StatusForbidden,
		types.ErrOptionWithSkipRetry(),
		types.ErrOptionWithNoRecordErrorLog(),
	)
}

// shouldTrust 统一信任额度检查，适用于钱包和订阅。
func (s *BillingSession) shouldTrust(c *gin.Context) bool {
	if c == nil {
		return false
	}
	// 异步任务（ForcePreConsume=true）必须预扣全额，不允许信任旁路
	if s.relayInfo.ForcePreConsume {
		return false
	}

	trustQuota := common.GetTrustQuota()
	if trustQuota <= 0 {
		return false
	}

	// 检查令牌是否充足
	tokenTrusted := s.relayInfo.TokenUnlimited
	if !tokenTrusted {
		tokenQuota := c.GetInt("token_quota")
		tokenTrusted = tokenQuota > trustQuota
	}
	if !tokenTrusted {
		return false
	}

	switch s.funding.Source() {
	case BillingSourceWallet:
		return s.relayInfo.UserQuota > trustQuota
	case BillingSourceSubscription:
		// 订阅不能启用信任旁路。原因：
		// 1. PreConsumeUserSubscription 要求 amount>0 来创建预扣记录并锁定订阅
		// 2. SubscriptionFunding.PreConsume 忽略参数，始终用 s.amount 预扣
		// 3. 若信任旁路将 effectiveQuota 设为 0，会导致 preConsumedQuota 与实际订阅预扣不一致
		return false
	default:
		return false
	}
}

// syncRelayInfo 将 BillingSession 的状态同步到 RelayInfo 的兼容字段上。
func (s *BillingSession) syncRelayInfo() {
	info := s.relayInfo
	info.FinalPreConsumedQuota = s.preConsumedQuota
	info.BillingSource = s.funding.Source()

	if sub, ok := s.funding.(*SubscriptionFunding); ok {
		info.SubscriptionId = sub.subscriptionId
		info.SubscriptionPreConsumed = sub.preConsumed + int64(s.extraReserved)
		info.SubscriptionAmountTotal = sub.AmountTotal
		info.SubscriptionAmountUsedAfterPreConsume = sub.AmountUsedAfter + int64(s.extraReserved)
		info.SubscriptionPlanId = sub.PlanId
		info.SubscriptionPlanTitle = sub.PlanTitle
		if sub.MonthlyAmountTotal > 0 {
			info.SubscriptionAmountTotal = sub.MonthlyAmountTotal
			info.SubscriptionAmountUsedAfterPreConsume = sub.MonthlyAmountUsedAfter + int64(s.extraReserved)
		}
	} else {
		info.SubscriptionId = 0
		info.SubscriptionPreConsumed = 0
	}
}

// ---------------------------------------------------------------------------
// NewBillingSession 工厂 — 根据计费偏好创建会话并处理回退
// ---------------------------------------------------------------------------

// NewBillingSession 根据用户计费偏好创建 BillingSession，处理 subscription_first / wallet_first 的回退。
func NewBillingSession(c *gin.Context, relayInfo *relaycommon.RelayInfo, preConsumedQuota int) (*BillingSession, *types.NewAPIError) {
	if relayInfo == nil {
		return nil, types.NewError(fmt.Errorf("relayInfo is nil"), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}
	operationContext, err := resolveBillingOperationContext(c, relayInfo)
	if err != nil {
		return nil, types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}
	newSession := func(funding FundingSource, skipTokenQuota bool) *BillingSession {
		return &BillingSession{
			relayInfo:      relayInfo,
			funding:        funding,
			skipTokenQuota: skipTokenQuota,
			ledgerMode:     operationContext.mode,
			operationKey:   operationContext.operationKey,
			operationKind:  operationContext.kind,
			taskRecordID:   operationContext.taskRecordID,
			taskOperation:  operationContext.isTask,
			taskOverride:   operationContext.isOverride,
		}
	}

	pref := common.NormalizeBillingPreference(relayInfo.UserSetting.BillingPreference)
	isMonthlyCardToken := c != nil && (c.GetBool("monthly_card_token") || IsMonthlyCardTokenName(c.GetString("token_name")))
	hasMonthlyCardCached := false
	hasMonthlyCardValue := false
	getUserMonthlyCard := func() (bool, error) {
		if hasMonthlyCardCached {
			return hasMonthlyCardValue, nil
		}
		ok, err := UserHasMonthlyCard(relayInfo.UserId)
		if err != nil {
			return false, err
		}
		hasMonthlyCardValue = ok
		hasMonthlyCardCached = true
		return ok, nil
	}
	monthlyCardModelDenied := func() *types.NewAPIError {
		modelName := strings.TrimSpace(relayInfo.OriginModelName)
		if modelName == "" {
			modelName = "requested model"
		}
		return types.NewErrorWithStatusCode(
			fmt.Errorf("月卡不支持模型 %s，请切换到月卡模型或使用余额支付", modelName),
			types.ErrorCodeAccessDenied, http.StatusForbidden,
			types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
	}
	checkSubscriptionModelAllowed := func() *types.NewAPIError {
		hasMonthlyCard, err := getUserMonthlyCard()
		if err != nil {
			return types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
		}
		if !canUseSubscriptionFundingForModel(hasMonthlyCard, relayInfo.OriginModelName) {
			return monthlyCardModelDenied()
		}
		return nil
	}

	if isMonthlyCardToken {
		hasMonthlyCard, err := getUserMonthlyCard()
		if err != nil {
			return nil, types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
		}
		if !hasMonthlyCard {
			return nil, types.NewErrorWithStatusCode(
				fmt.Errorf("月卡专用 API Key 需要生效中的月卡"),
				types.ErrorCodeInsufficientUserQuota, http.StatusForbidden,
				types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
		}
		pref = "subscription_only"
	}
	if c != nil && (c.GetBool("image_benefit_token") || model.IsImageBenefitTokenName(c.GetString("token_name"))) {
		if !model.IsImageBenefitModel(relayInfo.OriginModelName) {
			return nil, types.NewErrorWithStatusCode(
				fmt.Errorf("1.5K 图像福利包 API Key 仅限模型 %s", model.ImageBenefitModelName),
				types.ErrorCodeInsufficientUserQuota, http.StatusForbidden,
				types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
		}
		session := newSession(&ImageBenefitFunding{}, false)
		if apiErr := session.preConsumeWithLedger(c, preConsumedQuota); apiErr != nil {
			return nil, apiErr
		}
		return session, nil
	}

	// 钱包路径需要先检查用户额度
	tryWallet := func() (*BillingSession, *types.NewAPIError) {
		userQuota, err := model.GetUserQuota(relayInfo.UserId, false)
		if err != nil {
			return nil, types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
		}
		if userQuota <= 0 {
			return nil, types.NewErrorWithStatusCode(
				fmt.Errorf("用户额度不足, 剩余额度: %s", logger.FormatQuota(userQuota)),
				types.ErrorCodeInsufficientUserQuota, http.StatusForbidden,
				types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
		}
		if userQuota-preConsumedQuota < 0 {
			return nil, types.NewErrorWithStatusCode(
				fmt.Errorf("预扣费额度失败, 用户剩余额度: %s, 需要预扣费额度: %s", logger.FormatQuota(userQuota), logger.FormatQuota(preConsumedQuota)),
				types.ErrorCodeInsufficientUserQuota, http.StatusForbidden,
				types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
		}
		relayInfo.UserQuota = userQuota

		session := newSession(&WalletFunding{userId: relayInfo.UserId}, false)
		if apiErr := session.preConsumeWithLedger(c, preConsumedQuota); apiErr != nil {
			return nil, apiErr
		}
		return session, nil
	}

	trySubscription := func() (*BillingSession, *types.NewAPIError) {
		if apiErr := checkSubscriptionModelAllowed(); apiErr != nil {
			return nil, apiErr
		}
		subConsume := int64(preConsumedQuota)
		quotaType := model.SubscriptionQuotaTypeDefault
		targetPlanId := 0
		if MonthlyCardTextSupportsModel(relayInfo.OriginModelName) {
			monthlyCardPlan, err := selectCurrentMonthlyCardTextPlan(
				relayInfo.UserId,
				preConsumedQuota,
				monthlyCardTextValueAppliesToModel(relayInfo),
			)
			if err != nil {
				return nil, types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
			}
			if monthlyCardPlan != nil {
				subConsume = int64(monthlyCardPlan.BilledQuota)
				quotaType = model.SubscriptionQuotaTypeMonthlyCardText
				targetPlanId = monthlyCardPlan.PlanId
			}
		}
		if subConsume <= 0 {
			subConsume = 1
		}
		skipTokenQuota := false
		hasMonthlyCard, _ := getUserMonthlyCard()
		if isMonthlyCardToken {
			skipTokenQuota = true
		} else if hasMonthlyCard && MonthlyCardChannelSupportsModel(relayInfo.OriginModelName) {
			skipTokenQuota = true
		}
		session := newSession(
			&SubscriptionFunding{
				requestId:    relayInfo.RequestId,
				userId:       relayInfo.UserId,
				modelName:    relayInfo.OriginModelName,
				quotaType:    quotaType,
				targetPlanId: targetPlanId,
				amount:       subConsume,
			},
			skipTokenQuota,
		)
		// 必须传 subConsume 而非 preConsumedQuota，保证 SubscriptionFunding.amount、
		// preConsume 参数和 FinalPreConsumedQuota 三者一致，避免订阅多扣费。
		if apiErr := session.preConsumeWithLedger(c, int(subConsume)); apiErr != nil {
			return nil, apiErr
		}
		return session, nil
	}

	switch pref {
	case "subscription_only":
		return trySubscription()
	case "wallet_only":
		return tryWallet()
	case "wallet_first":
		session, err := tryWallet()
		if err != nil {
			if err.GetErrorCode() == types.ErrorCodeInsufficientUserQuota {
				session, subErr := trySubscription()
				if subErr != nil && subErr.GetErrorCode() == types.ErrorCodeAccessDenied {
					return nil, err
				}
				return session, subErr
			}
			return nil, err
		}
		return session, nil
	case "subscription_first":
		fallthrough
	default:
		hasSub, subCheckErr := model.HasActiveUserSubscription(relayInfo.UserId)
		if subCheckErr != nil {
			return nil, types.NewError(subCheckErr, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
		}
		if !hasSub {
			return tryWallet()
		}
		session, apiErr := trySubscription()
		if apiErr != nil {
			if apiErr.GetErrorCode() == types.ErrorCodeAccessDenied {
				return tryWallet()
			}
			if model.IsSubscriptionHardLimitError(apiErr) || model.IsSubscriptionHardLimitError(apiErr.Err) {
				return nil, apiErr
			}
			if apiErr.GetErrorCode() == types.ErrorCodeInsufficientUserQuota {
				allowOverflow, overflowErr := model.UserActiveSubscriptionsAllowWalletOverflow(relayInfo.UserId)
				if overflowErr != nil {
					return nil, types.NewError(overflowErr, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
				}
				if !allowOverflow {
					return nil, apiErr
				}
				return tryWallet()
			}
			return nil, apiErr
		}
		return session, nil
	}
}
