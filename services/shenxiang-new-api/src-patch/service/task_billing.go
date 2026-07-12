package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// maxTaskTotalTokens caps the upstream-reported token count used for async task
// rebilling. An attacker-controlled or compromised upstream could otherwise
// return an astronomically large total_tokens; once multiplied by the model and
// group ratios the float→int conversion result is implementation-defined and can
// wrap to a negative or garbage quota. Reject anything beyond a generous sane
// bound rather than trust it.
const maxTaskTotalTokens = 1_000_000_000

const (
	taskBillingOperationOverrideContextKey = "task_billing_operation_override"
	taskBillingChargeDecisionContextKey    = "task_billing_charge_decision"
)

type TaskBillingOperationOverride struct {
	OperationKey string
	LedgerMode   model.BillingLedgerMode
	TaskRecordID int64
}

func SetTaskBillingOperationOverride(c *gin.Context, operationKey string, ledgerMode model.BillingLedgerMode, taskRecordID int64) error {
	if c == nil {
		return fmt.Errorf("billing operation override context is required")
	}
	switch ledgerMode {
	case model.BillingLedgerModeOff, model.BillingLedgerModeShadow, model.BillingLedgerModeActive:
	default:
		return fmt.Errorf("billing operation override mode is invalid")
	}
	trimmedOperationKey := strings.TrimSpace(operationKey)
	if operationKey != trimmedOperationKey {
		return fmt.Errorf("billing operation override key has surrounding whitespace")
	}
	operationKey = trimmedOperationKey
	if operationKey == "" {
		return fmt.Errorf("billing operation override key is required")
	}
	if taskRecordID <= 0 {
		return fmt.Errorf("billing operation override task record is required")
	}
	c.Set(taskBillingOperationOverrideContextKey, TaskBillingOperationOverride{
		OperationKey: operationKey,
		LedgerMode:   ledgerMode,
		TaskRecordID: taskRecordID,
	})
	return nil
}

func ResolveTaskBillingOperationOverride(c *gin.Context) (TaskBillingOperationOverride, bool) {
	if c == nil {
		return TaskBillingOperationOverride{}, false
	}
	value, exists := c.Get(taskBillingOperationOverrideContextKey)
	if !exists {
		return TaskBillingOperationOverride{}, false
	}
	override, ok := value.(TaskBillingOperationOverride)
	return override, ok
}

func SetTaskBillingChargeDecision(c *gin.Context, chargeToken bool) {
	if c != nil {
		c.Set(taskBillingChargeDecisionContextKey, chargeToken)
	}
}

func ResolveTaskBillingChargeDecision(c *gin.Context) (bool, bool) {
	if c == nil {
		return false, false
	}
	value, exists := c.Get(taskBillingChargeDecisionContextKey)
	if !exists {
		return false, false
	}
	chargeToken, ok := value.(bool)
	return chargeToken, ok
}

// LogTaskConsumption 记录任务消费日志和统计信息（仅记录，不涉及实际扣费）。
// 实际扣费已由 BillingSession（PreConsumeBilling + SettleBilling）完成。
func LogTaskConsumption(c *gin.Context, info *relaycommon.RelayInfo) {
	tokenName := c.GetString("token_name")
	logContent := fmt.Sprintf("操作 %s", info.Action)
	// 支持任务仅按次计费
	if common.StringsContains(constant.TaskPricePatches, info.OriginModelName) {
		logContent = fmt.Sprintf("%s，按次计费", logContent)
	} else {
		if otherRatios := info.PriceData.OtherRatios(); len(otherRatios) > 0 {
			var contents []string
			for key, ra := range otherRatios {
				if 1.0 != ra {
					contents = append(contents, fmt.Sprintf("%s: %.2f", key, ra))
				}
			}
			if len(contents) > 0 {
				logContent = fmt.Sprintf("%s, 计算参数：%s", logContent, strings.Join(contents, ", "))
			}
		}
	}
	other := make(map[string]interface{})
	other["is_task"] = true
	other["request_path"] = c.Request.URL.Path
	if info.TaskRelayInfo != nil && strings.TrimSpace(info.PublicTaskID) != "" {
		other["task_id"] = strings.TrimSpace(info.PublicTaskID)
		other["request_phase"] = "submitted"
		other["task_status"] = string(model.TaskStatusSubmitted)
		other["async"] = true
	}
	if c != nil && c.Request != nil && c.Request.URL != nil {
		switch strings.TrimSpace(c.Request.URL.Path) {
		case "/pg/videos", "/pg/video/generations", "/v1/videos", "/v1/video/generations":
			other["playground_video_task"] = true
			other["media_kind"] = "video"
			other["result_url"] = ""
			other["video_url"] = ""
			other["cached_url"] = ""
		}
	}
	other["model_price"] = info.PriceData.ModelPrice
	if info.PriceData.ModelRatio > 0 {
		other["model_ratio"] = info.PriceData.ModelRatio
	}
	other["group_ratio"] = info.PriceData.GroupRatioInfo.GroupRatio
	if info.PriceData.GroupRatioInfo.HasSpecialRatio {
		other["user_group_ratio"] = info.PriceData.GroupRatioInfo.GroupSpecialRatio
	}
	publicAlias := ""
	if c != nil {
		publicAlias = c.GetString("public_image_model_alias")
	}
	if info.IsModelMapped && ShouldRecordModelMapping(info.OriginModelName, info.UpstreamModelName, publicAlias) {
		other["is_model_mapped"] = true
		other["upstream_model_name"] = info.UpstreamModelName
	}
	displayModelName := PublicImageModelDisplayName(info.OriginModelName, "")
	if c != nil {
		displayModelName = PublicImageModelDisplayName(info.OriginModelName, publicAlias)
	}
	model.RecordConsumeLog(c, info.UserId, model.RecordConsumeLogParams{
		ChannelId: info.ChannelId,
		ModelName: displayModelName,
		TokenName: tokenName,
		Quota:     info.PriceData.Quota,
		Content:   logContent,
		TokenId:   info.TokenId,
		Group:     info.UsingGroup,
		Other:     other,
	})
	model.UpdateUsageStats(info.UserId, info.ChannelId, info.PriceData.Quota)
}

// ---------------------------------------------------------------------------
// 异步任务计费辅助函数
// ---------------------------------------------------------------------------

// resolveTokenKey 通过 TokenId 运行时获取令牌 Key（用于 Redis 缓存操作）。
// 如果令牌已被删除或查询失败，返回空字符串。
func resolveTokenKey(ctx context.Context, tokenId int, taskID string) string {
	token, err := model.GetTokenById(tokenId)
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("获取令牌 key 失败 (tokenId=%d, task=%s): %s", tokenId, taskID, err.Error()))
		return ""
	}
	return token.Key
}

// taskIsSubscription 判断任务是否通过订阅计费。
func taskIsSubscription(task *model.Task) bool {
	return task.PrivateData.BillingSource == BillingSourceSubscription && task.PrivateData.SubscriptionId > 0
}

func taskIsImageBenefit(task *model.Task) bool {
	return task != nil && task.PrivateData.BillingSource == BillingSourceImageBenefit
}

// taskAdjustFunding 调整任务的资金来源（钱包或订阅），delta > 0 表示扣费，delta < 0 表示退还。
func taskAdjustFunding(task *model.Task, delta int) error {
	if taskIsImageBenefit(task) {
		return nil
	}
	if taskIsSubscription(task) {
		return model.PostConsumeUserSubscriptionDeltaForEpoch(
			task.PrivateData.SubscriptionId,
			int64(delta),
			task.PrivateData.SubscriptionResetEpoch,
		)
	}
	if delta > 0 {
		return model.TryDecreaseUserQuota(task.UserId, delta)
	}
	return model.IncreaseUserQuota(task.UserId, -delta, false)
}

// taskAdjustTokenQuota 调整任务的令牌额度，delta > 0 表示扣费，delta < 0 表示退还。
// 需要通过 resolveTokenKey 运行时获取 key（不从 PrivateData 中读取）。
func taskAdjustTokenQuota(ctx context.Context, task *model.Task, delta int) {
	if task.PrivateData.TokenId <= 0 || delta == 0 {
		return
	}
	tokenKey := resolveTokenKey(ctx, task.PrivateData.TokenId, task.TaskID)
	if tokenKey == "" {
		return
	}
	var err error
	if delta > 0 {
		err = model.DecreaseTokenQuota(task.PrivateData.TokenId, tokenKey, delta)
	} else {
		err = model.IncreaseTokenQuota(task.PrivateData.TokenId, tokenKey, -delta)
	}
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("调整令牌额度失败 (delta=%d, task=%s): %s", delta, task.TaskID, err.Error()))
	}
}

// taskBillingOther 从 task 的 BillingContext 构建日志 Other 字段。
func taskBillingOther(task *model.Task) map[string]interface{} {
	other := make(map[string]interface{})
	if bc := task.PrivateData.BillingContext; bc != nil {
		other["model_price"] = bc.ModelPrice
		if bc.ModelRatio > 0 {
			other["model_ratio"] = bc.ModelRatio
		}
		other["group_ratio"] = bc.GroupRatio
		if priceData := taskBillingContextPriceData(bc); priceData != nil {
			for k, v := range priceData.OtherRatios() {
				other[k] = v
			}
		}
	}
	props := task.Properties
	if ShouldRecordModelMapping(props.OriginModelName, props.UpstreamModelName, "") {
		other["is_model_mapped"] = true
		other["upstream_model_name"] = props.UpstreamModelName
	}
	return other
}

func taskBillingContextPriceData(billingContext *model.TaskBillingContext) *types.PriceData {
	if billingContext == nil || len(billingContext.OtherRatios) == 0 {
		return nil
	}
	priceData := &types.PriceData{}
	if !priceData.ReplaceOtherRatios(billingContext.OtherRatios) {
		return nil
	}
	return priceData
}

// taskModelName 从 BillingContext 或 Properties 中获取模型名称。
func taskModelName(task *model.Task) string {
	if bc := task.PrivateData.BillingContext; bc != nil && bc.OriginModelName != "" {
		return bc.OriginModelName
	}
	return task.Properties.OriginModelName
}

func taskBillingLogModelName(task *model.Task) string {
	return PublicImageModelDisplayName(taskModelName(task), "")
}

type taskTerminalBillingPersistResult struct {
	Won           bool
	LedgerMode    model.BillingLedgerMode
	LedgerTracked bool
	OperationKey  string
	ReservedQuota int
	DesiredQuota  int
}

func taskBillingLedgerMode(task *model.Task) (model.BillingLedgerMode, error) {
	if task == nil {
		return model.BillingLedgerModeOff, nil
	}
	rawModeValue := string(task.PrivateData.BillingLedgerMode)
	rawMode := strings.TrimSpace(rawModeValue)
	if rawModeValue != rawMode {
		return model.BillingLedgerModeOff, fmt.Errorf("task billing ledger mode has surrounding whitespace")
	}
	switch model.BillingLedgerMode(rawMode) {
	case "", model.BillingLedgerModeOff:
		return model.BillingLedgerModeOff, nil
	case model.BillingLedgerModeShadow:
		return model.BillingLedgerModeShadow, nil
	case model.BillingLedgerModeActive:
		return model.BillingLedgerModeActive, nil
	default:
		return model.BillingLedgerModeOff, fmt.Errorf("task billing ledger mode is invalid")
	}
}

func taskBillingOperationKey(task *model.Task) (string, error) {
	if task == nil {
		return "", fmt.Errorf("task is required")
	}
	rawOperationKey := task.PrivateData.BillingOperationKey
	if operationKey := strings.TrimSpace(rawOperationKey); operationKey != "" {
		if rawOperationKey != operationKey {
			return "", fmt.Errorf("task billing operation key has surrounding whitespace")
		}
		expectedOperationKey, err := model.TaskBillingOperationKey(task.TaskID)
		if err != nil {
			return "", err
		}
		if operationKey != expectedOperationKey {
			return "", fmt.Errorf("task billing operation key does not match task id")
		}
		return operationKey, nil
	}
	return "", fmt.Errorf("task billing operation key is missing")
}

func persistTaskTerminalBillingStatus(
	ctx context.Context,
	task *model.Task,
	fromStatus model.TaskStatus,
	outcome model.BillingOutcome,
	desiredQuota int,
	errorMessage string,
) (taskTerminalBillingPersistResult, error) {
	result := taskTerminalBillingPersistResult{}
	if task == nil {
		return result, fmt.Errorf("task is required")
	}
	if fromStatus == model.TaskStatusSuccess || fromStatus == model.TaskStatusFailure {
		return result, fmt.Errorf("terminal task billing cannot be replayed")
	}
	if desiredQuota < 0 {
		return result, fmt.Errorf("desired quota cannot be negative")
	}
	if outcome != model.BillingOutcomeSuccess && outcome != model.BillingOutcomeFailure {
		return result, fmt.Errorf("terminal billing outcome is required")
	}
	var err error
	result.ReservedQuota = task.Quota
	result.DesiredQuota = desiredQuota
	result.LedgerMode, err = taskBillingLedgerMode(task)
	if err != nil {
		return result, err
	}
	if task.PrivateData.BillingOperationKey == "" {
		if task.PrivateData.BillingLedgerMode != "" || task.PrivateData.BillingRequestID != "" ||
			task.PrivateData.BillingChargeTokenSet || task.PrivateData.BillingChargeToken {
			return result, fmt.Errorf("task has incomplete durable billing metadata")
		}
		expectedOperationKey, keyErr := model.TaskBillingOperationKey(task.TaskID)
		if keyErr != nil {
			return result, keyErr
		}
		operationExists, lookupErr := model.BillingOperationExistsWithContext(ctx, expectedOperationKey)
		if lookupErr != nil {
			return result, lookupErr
		}
		if operationExists {
			return result, fmt.Errorf("task billing operation exists but task metadata is missing")
		}
		taskToPersist := *task
		result.Won, err = taskToPersist.UpdateWithStatusContext(ctx, fromStatus)
		return result, err
	}
	operationKey, err := taskBillingOperationKey(task)
	if err != nil {
		return result, err
	}
	result.OperationKey = operationKey
	reservedQuota := result.ReservedQuota
	if !task.PrivateData.BillingChargeTokenSet && (reservedQuota != 0 || desiredQuota != 0) {
		return result, fmt.Errorf("durable task billing charge-token decision is missing")
	}
	result.LedgerTracked = task.PrivateData.BillingChargeTokenSet
	taskToPersist := *task
	if outcome == model.BillingOutcomeSuccess {
		taskToPersist.Quota = desiredQuota
	}
	result.Won, err = taskToPersist.UpdateWithStatusAndBillingIntentContext(ctx, fromStatus, model.TaskBillingIntent{
		OperationKey:  operationKey,
		LedgerMode:    result.LedgerMode,
		Outcome:       outcome,
		ReservedQuota: int64(reservedQuota),
		DesiredQuota:  int64(desiredQuota),
		ChargeToken:   task.PrivateData.BillingChargeToken,
		ErrorMessage:  strings.TrimSpace(errorMessage),
	})
	if err != nil || !result.Won {
		return result, err
	}
	if outcome == model.BillingOutcomeSuccess {
		task.Quota = desiredQuota
	}
	return result, nil
}

func processActiveTaskBilling(ctx context.Context, task *model.Task, persisted taskTerminalBillingPersistResult) {
	if !persisted.Won || !persisted.LedgerTracked || persisted.OperationKey == "" {
		return
	}
	if err := model.ProcessBillingOperationInlineWithContext(ctx, persisted.OperationKey); err != nil {
		logger.LogError(ctx, fmt.Sprintf("inline task billing failed for task %s; outbox will retry: %s", task.TaskID, err.Error()))
	}
}

func expireSuccessfulLegacyTaskSubscription(ctx context.Context, task *model.Task) {
	if !taskIsSubscription(task) {
		return
	}
	if _, err := model.ExpireUserSubscriptionIfQuotaExhausted(task.PrivateData.SubscriptionId); err != nil {
		logger.LogError(ctx, fmt.Sprintf("failed to expire exhausted task subscription %d: %s", task.PrivateData.SubscriptionId, err.Error()))
	}
}

func activeTaskBillingLogOther(task *model.Task, persisted taskTerminalBillingPersistResult, effect string) map[string]interface{} {
	other := taskBillingOther(task)
	other["task_id"] = task.TaskID
	other["billing_settlement"] = "ledger_outbox"
	other["billing_effect"] = effect
	other["billing_operation_key"] = persisted.OperationKey
	other["pre_consumed_quota"] = persisted.ReservedQuota
	other["actual_quota"] = persisted.DesiredQuota
	return other
}

func recordActiveTaskFailureBillingIntent(task *model.Task, persisted taskTerminalBillingPersistResult, reason string) {
	if task == nil || persisted.ReservedQuota <= 0 {
		return
	}
	other := activeTaskBillingLogOther(task, persisted, "refund_intent")
	other["reason"] = reason
	model.RecordTaskBillingLog(model.RecordTaskBillingLogParams{
		UserId:    task.UserId,
		LogType:   model.LogTypeRefund,
		Content:   "",
		ChannelId: task.ChannelId,
		ModelName: taskBillingLogModelName(task),
		Quota:     persisted.ReservedQuota,
		TokenId:   task.PrivateData.TokenId,
		Group:     task.Group,
		Other:     other,
		NodeName:  task.PrivateData.NodeName,
	})
}

func recordActiveTaskSuccessBillingIntent(ctx context.Context, task *model.Task, persisted taskTerminalBillingPersistResult, reason string, clamps ...*common.QuotaClamp) {
	if task == nil {
		return
	}
	quotaDelta := persisted.DesiredQuota - persisted.ReservedQuota
	if quotaDelta == 0 {
		logger.LogInfo(ctx, fmt.Sprintf("任务 %s 预扣费准确（%s，%s）",
			task.TaskID, logger.LogQuota(persisted.DesiredQuota), reason))
		return
	}
	logType := model.LogTypeConsume
	logQuota := quotaDelta
	if quotaDelta < 0 {
		logType = model.LogTypeRefund
		logQuota = -quotaDelta
	} else {
		model.UpdateUsageStats(task.UserId, task.ChannelId, quotaDelta)
	}
	other := activeTaskBillingLogOther(task, persisted, "settlement_intent")
	for _, clamp := range clamps {
		attachQuotaSaturationToOther(other, clamp)
	}
	model.RecordTaskBillingLog(model.RecordTaskBillingLogParams{
		UserId:    task.UserId,
		LogType:   logType,
		Content:   reason,
		ChannelId: task.ChannelId,
		ModelName: taskBillingLogModelName(task),
		Quota:     logQuota,
		TokenId:   task.PrivateData.TokenId,
		Group:     task.Group,
		Other:     other,
		NodeName:  task.PrivateData.NodeName,
	})
}

func PersistTaskTerminalFailure(
	ctx context.Context,
	task *model.Task,
	fromStatus model.TaskStatus,
	reason string,
	errorMessage string,
	refundLegacy bool,
) (bool, error) {
	persisted, err := persistTaskTerminalBillingStatus(ctx, task, fromStatus, model.BillingOutcomeFailure, 0, errorMessage)
	if err != nil || !persisted.Won {
		return persisted.Won, err
	}
	if persisted.LedgerTracked {
		recordActiveTaskFailureBillingIntent(task, persisted, reason)
		processActiveTaskBilling(ctx, task, persisted)
		return true, nil
	}
	if refundLegacy && task.Quota != 0 {
		RefundTaskQuota(ctx, task, reason)
	}
	return true, nil
}

func PersistTaskTerminalSuccess(
	ctx context.Context,
	task *model.Task,
	fromStatus model.TaskStatus,
	desiredQuota int,
	reason string,
	clamps ...*common.QuotaClamp,
) (bool, error) {
	persisted, err := persistTaskTerminalBillingStatus(ctx, task, fromStatus, model.BillingOutcomeSuccess, desiredQuota, "")
	if err != nil || !persisted.Won {
		return persisted.Won, err
	}
	if persisted.LedgerTracked {
		recordActiveTaskSuccessBillingIntent(ctx, task, persisted, reason, clamps...)
		processActiveTaskBilling(ctx, task, persisted)
		return true, nil
	}
	if reason != "" {
		RecalculateTaskQuota(ctx, task, desiredQuota, reason, clamps...)
	}
	expireSuccessfulLegacyTaskSubscription(ctx, task)
	return true, nil
}

// RefundTaskQuota 统一的任务失败退款逻辑。
// 当异步任务失败时，将预扣的 quota 退还给用户（支持钱包和订阅），并退还令牌额度。
func RefundTaskQuota(ctx context.Context, task *model.Task, reason string) {
	quota := task.Quota
	if quota == 0 {
		return
	}

	// 1. 退还资金来源（钱包或订阅）
	if err := taskAdjustFunding(task, -quota); err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("退还资金来源失败 task %s: %s", task.TaskID, err.Error()))
		return
	}

	// 2. 退还令牌额度
	taskAdjustTokenQuota(ctx, task, -quota)

	// 3. 记录日志
	other := taskBillingOther(task)
	other["task_id"] = task.TaskID
	other["reason"] = reason
	model.RecordTaskBillingLog(model.RecordTaskBillingLogParams{
		UserId:    task.UserId,
		LogType:   model.LogTypeRefund,
		Content:   "",
		ChannelId: task.ChannelId,
		ModelName: taskBillingLogModelName(task),
		Quota:     quota,
		TokenId:   task.PrivateData.TokenId,
		Group:     task.Group,
		Other:     other,
		NodeName:  task.PrivateData.NodeName,
	})
}

// RecalculateTaskQuota 通用的异步差额结算。
// actualQuota 是任务完成后的实际应扣额度，与预扣额度 (task.Quota) 做差额结算。
// reason 用于日志记录（例如 "token重算" 或 "adaptor调整"）。
// clamps 可选：若计算 actualQuota 时发生额度饱和，将其记入日志 admin_info（仅管理员可见）。
func RecalculateTaskQuota(ctx context.Context, task *model.Task, actualQuota int, reason string, clamps ...*common.QuotaClamp) {
	if actualQuota <= 0 {
		return
	}
	preConsumedQuota := task.Quota
	quotaDelta := actualQuota - preConsumedQuota

	if quotaDelta == 0 {
		logger.LogInfo(ctx, fmt.Sprintf("任务 %s 预扣费准确（%s，%s）",
			task.TaskID, logger.LogQuota(actualQuota), reason))
		return
	}

	logger.LogInfo(ctx, fmt.Sprintf("任务 %s 差额结算：delta=%s（实际：%s，预扣：%s，%s）",
		task.TaskID,
		logger.LogQuota(quotaDelta),
		logger.LogQuota(actualQuota),
		logger.LogQuota(preConsumedQuota),
		reason,
	))

	// 调整资金来源
	if err := taskAdjustFunding(task, quotaDelta); err != nil {
		logger.LogError(ctx, fmt.Sprintf("差额结算资金调整失败 task %s: %s", task.TaskID, err.Error()))
		return
	}

	task.Quota = actualQuota
	if task.ID > 0 {
		if err := task.UpdateQuota(); err != nil {
			task.Quota = preConsumedQuota
			logger.LogError(ctx, fmt.Sprintf("差额结算回写 quota 失败 task %s: %s", task.TaskID, err.Error()))
			if rollbackErr := taskAdjustFunding(task, -quotaDelta); rollbackErr != nil {
				logger.LogError(ctx, fmt.Sprintf("差额结算 quota 回写失败后资金回滚失败 task %s: %s", task.TaskID, rollbackErr.Error()))
			}
			return
		}
	}

	// 调整令牌额度
	taskAdjustTokenQuota(ctx, task, quotaDelta)

	var logType int
	var logQuota int
	if quotaDelta > 0 {
		logType = model.LogTypeConsume
		logQuota = quotaDelta
		model.UpdateUsageStats(task.UserId, task.ChannelId, quotaDelta)
	} else {
		logType = model.LogTypeRefund
		logQuota = -quotaDelta
	}
	other := taskBillingOther(task)
	other["task_id"] = task.TaskID
	other["pre_consumed_quota"] = preConsumedQuota
	other["actual_quota"] = actualQuota
	for _, clamp := range clamps {
		attachQuotaSaturationToOther(other, clamp)
	}
	model.RecordTaskBillingLog(model.RecordTaskBillingLogParams{
		UserId:    task.UserId,
		LogType:   logType,
		Content:   reason,
		ChannelId: task.ChannelId,
		ModelName: taskBillingLogModelName(task),
		Quota:     logQuota,
		TokenId:   task.PrivateData.TokenId,
		Group:     task.Group,
		Other:     other,
		NodeName:  task.PrivateData.NodeName,
	})
}

// RecalculateTaskQuotaByTokens 根据实际 token 消耗重新计费（异步差额结算）。
// 当任务成功且返回了 totalTokens 时，根据模型倍率和分组倍率重新计算实际扣费额度，
// 与预扣费的差额进行补扣或退还。支持钱包和订阅计费来源。
func RecalculateTaskQuotaByTokens(ctx context.Context, task *model.Task, totalTokens int) {
	calculationTask := task
	if task != nil && task.Group == "" {
		if user, err := model.GetUserById(task.UserId, false); err == nil && user.Group != "" {
			taskCopy := *task
			taskCopy.Group = user.Group
			calculationTask = &taskCopy
		}
	}
	decision := calculateTaskQuotaByTokens(calculationTask, totalTokens)
	if decision.CalculationError != nil {
		logger.LogError(ctx, decision.CalculationError.Error())
		return
	}
	if decision.Reason == "" {
		return
	}
	RecalculateTaskQuota(ctx, task, decision.DesiredQuota, decision.Reason, decision.Clamps...)
}

type taskSuccessBillingDecision struct {
	DesiredQuota     int
	Reason           string
	Clamps           []*common.QuotaClamp
	CalculationError error
}

func calculateTaskSuccessBilling(adaptor TaskPollingAdaptor, task *model.Task, taskResult *relaycommon.TaskInfo) taskSuccessBillingDecision {
	decision := taskSuccessBillingDecision{}
	if task == nil {
		return decision
	}
	decision.DesiredQuota = task.Quota
	if billingContext := task.PrivateData.BillingContext; billingContext != nil && billingContext.PerCallBilling {
		return decision
	}
	if adaptor != nil && taskResult != nil {
		if actualQuota := adaptor.AdjustBillingOnComplete(task, taskResult); actualQuota > 0 {
			decision.DesiredQuota = actualQuota
			decision.Reason = "adaptor计费调整"
			return decision
		}
	}
	if taskResult == nil {
		return decision
	}
	return calculateTaskQuotaByTokens(task, taskResult.TotalTokens)
}

func calculateTaskQuotaByTokens(task *model.Task, totalTokens int) taskSuccessBillingDecision {
	decision := taskSuccessBillingDecision{}
	if task == nil {
		return decision
	}
	decision.DesiredQuota = task.Quota
	if totalTokens <= 0 {
		return decision
	}
	if totalTokens > maxTaskTotalTokens {
		decision.CalculationError = fmt.Errorf("任务 %s 上游返回异常 token 数 %d，超过上限 %d，跳过重新计费",
			task.TaskID, totalTokens, maxTaskTotalTokens)
		return decision
	}

	modelName := taskModelName(task)

	// 获取模型价格和倍率
	modelRatio, hasRatioSetting, _ := ratio_setting.GetModelRatio(modelName)
	// 只有配置了倍率(非固定价格)时才按 token 重新计费
	if !hasRatioSetting || modelRatio <= 0 {
		return decision
	}

	group := task.Group
	if group == "" {
		return decision
	}

	groupRatio := ratio_setting.GetGroupRatio(group)
	userGroupRatio, hasUserGroupRatio := ratio_setting.GetGroupGroupRatio(group, group)

	var finalGroupRatio float64
	if hasUserGroupRatio {
		finalGroupRatio = userGroupRatio
	} else {
		finalGroupRatio = groupRatio
	}

	// 计算 OtherRatios 乘积（视频折扣、时长等）
	otherMultiplier := 1.0
	if priceData := taskBillingContextPriceData(task.PrivateData.BillingContext); priceData != nil {
		otherMultiplier = priceData.OtherRatioMultiplier()
	}

	// 计算实际应扣费额度: totalTokens * modelRatio * groupRatio * otherMultiplier。
	actualQuota, clamp := common.QuotaFromFloatChecked(float64(totalTokens) * modelRatio * finalGroupRatio * otherMultiplier)
	if actualQuota <= 0 {
		return decision
	}

	decision.DesiredQuota = actualQuota
	decision.Reason = fmt.Sprintf("token重算：tokens=%d, modelRatio=%.2f, groupRatio=%.2f, otherMultiplier=%.4f", totalTokens, modelRatio, finalGroupRatio, otherMultiplier)
	if clamp != nil {
		decision.Clamps = append(decision.Clamps, clamp)
	}
	return decision
}
