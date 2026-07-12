package model

import (
	"bytes"
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	commonRelay "github.com/QuantumNous/new-api/relay/common"
	"gorm.io/gorm"
)

type TaskStatus string

func (t TaskStatus) ToVideoStatus() string {
	var status string
	switch t {
	case TaskStatusQueued, TaskStatusSubmitted:
		status = dto.VideoStatusQueued
	case TaskStatusInProgress:
		status = dto.VideoStatusInProgress
	case TaskStatusSuccess:
		status = dto.VideoStatusCompleted
	case TaskStatusFailure:
		status = dto.VideoStatusFailed
	default:
		status = dto.VideoStatusUnknown // Default fallback
	}
	return status
}

const (
	TaskStatusNotStart   TaskStatus = "NOT_START"
	TaskStatusSubmitted             = "SUBMITTED"
	TaskStatusQueued                = "QUEUED"
	TaskStatusInProgress            = "IN_PROGRESS"
	TaskStatusFailure               = "FAILURE"
	TaskStatusSuccess               = "SUCCESS"
	TaskStatusUnknown               = "UNKNOWN"
)

type Task struct {
	ID         int64                 `json:"id" gorm:"primary_key;AUTO_INCREMENT"`
	CreatedAt  int64                 `json:"created_at" gorm:"index"`
	UpdatedAt  int64                 `json:"updated_at"`
	TaskID     string                `json:"task_id" gorm:"type:varchar(191);index"` // 第三方id，不一定有/ song id\ Task id
	Platform   constant.TaskPlatform `json:"platform" gorm:"type:varchar(30);index"` // 平台
	UserId     int                   `json:"user_id" gorm:"index"`
	Group      string                `json:"group" gorm:"type:varchar(50)"` // 修正计费用
	ChannelId  int                   `json:"channel_id" gorm:"index"`
	Quota      int                   `json:"quota"`
	Action     string                `json:"action" gorm:"type:varchar(40);index"` // 任务类型, song, lyrics, description-mode
	Status     TaskStatus            `json:"status" gorm:"type:varchar(20);index"` // 任务状态
	FailReason string                `json:"fail_reason"`
	SubmitTime int64                 `json:"submit_time" gorm:"index"`
	StartTime  int64                 `json:"start_time" gorm:"index"`
	FinishTime int64                 `json:"finish_time" gorm:"index"`
	Progress   string                `json:"progress" gorm:"type:varchar(20);index"`
	Properties Properties            `json:"properties" gorm:"type:json"`
	Username   string                `json:"username,omitempty" gorm:"-"`
	// 禁止返回给用户，内部可能包含key等隐私信息
	PrivateData TaskPrivateData `json:"-" gorm:"column:private_data;type:json"`
	Data        json.RawMessage `json:"data" gorm:"type:json"`
}

func (t *Task) SetData(data any) {
	b, _ := common.Marshal(data)
	t.Data = json.RawMessage(b)
}

func (t *Task) GetData(v any) error {
	return common.Unmarshal(t.Data, &v)
}

type Properties struct {
	Input             string `json:"input"`
	UpstreamModelName string `json:"upstream_model_name,omitempty"`
	OriginModelName   string `json:"origin_model_name,omitempty"`
}

func (m Properties) MarshalJSON() ([]byte, error) {
	type publicProperties struct {
		Input           string `json:"input"`
		OriginModelName string `json:"origin_model_name,omitempty"`
	}
	return json.Marshal(publicProperties{
		Input:           m.Input,
		OriginModelName: m.OriginModelName,
	})
}

func (m *Properties) Scan(val interface{}) error {
	bytesValue, _ := val.([]byte)
	if len(bytesValue) == 0 {
		*m = Properties{}
		return nil
	}
	return common.Unmarshal(bytesValue, m)
}

func (m Properties) Value() (driver.Value, error) {
	if m == (Properties{}) {
		return nil, nil
	}
	type persistedProperties Properties
	return common.Marshal(persistedProperties(m))
}

type TaskPrivateData struct {
	Key            string `json:"key,omitempty"`
	UpstreamTaskID string `json:"upstream_task_id,omitempty"` // 上游真实 task ID
	ResultURL      string `json:"result_url,omitempty"`       // 任务成功后的结果 URL（视频地址等）
	// 计费上下文：用于异步退款/差额结算（轮询阶段读取）
	BillingSource          string              `json:"billing_source,omitempty"`  // "wallet" 或 "subscription"
	SubscriptionId         int                 `json:"subscription_id,omitempty"` // 订阅 ID，用于订阅退款
	SubscriptionResetEpoch int64               `json:"subscription_reset_epoch,omitempty"`
	TokenId                int                 `json:"token_id,omitempty"` // 令牌 ID，用于令牌额度退款
	BillingOperationKey    string              `json:"billing_operation_key,omitempty"`
	BillingLedgerMode      BillingLedgerMode   `json:"billing_ledger_mode,omitempty"`
	BillingRequestID       string              `json:"billing_request_id,omitempty"`
	BillingChargeToken     bool                `json:"billing_charge_token,omitempty"`
	BillingChargeTokenSet  bool                `json:"billing_charge_token_set,omitempty"`
	NodeName               string              `json:"node_name,omitempty"`       // 发起任务的节点名，轮询结算阶段据此归属日志而非最后查询节点
	BillingContext         *TaskBillingContext `json:"billing_context,omitempty"` // 计费参数快照（用于轮询阶段重新计算）
}

// TaskBillingContext 记录任务提交时的计费参数，以便轮询阶段可以重新计算额度。
type TaskBillingContext struct {
	ModelPrice      float64            `json:"model_price,omitempty"`       // 模型单价
	GroupRatio      float64            `json:"group_ratio,omitempty"`       // 分组倍率
	ModelRatio      float64            `json:"model_ratio,omitempty"`       // 模型倍率
	OtherRatios     map[string]float64 `json:"other_ratios,omitempty"`      // 附加倍率（时长、分辨率等）
	OriginModelName string             `json:"origin_model_name,omitempty"` // 模型名称，必须为OriginModelName
	PerCallBilling  bool               `json:"per_call_billing,omitempty"`  // 按次计费：跳过轮询阶段的差额结算
}

// GetUpstreamTaskID 获取上游真实 task ID（用于与 provider 通信）
// 旧数据没有 UpstreamTaskID 时，TaskID 本身就是上游 ID
func (t *Task) GetUpstreamTaskID() string {
	if t.PrivateData.UpstreamTaskID != "" {
		return t.PrivateData.UpstreamTaskID
	}
	return t.TaskID
}

// GetResultURL 获取任务结果 URL（视频地址等）
// 新数据存在 PrivateData.ResultURL 中；旧数据回退到 FailReason（历史兼容）
func (t *Task) GetResultURL() string {
	if t.PrivateData.ResultURL != "" {
		return t.PrivateData.ResultURL
	}
	return t.FailReason
}

// GenerateTaskID 生成对外暴露的 task_xxxx 格式 ID
func GenerateTaskID() string {
	key, _ := common.GenerateRandomCharsKey(32)
	return "task_" + key
}

func (p *TaskPrivateData) Scan(val interface{}) error {
	bytesValue, _ := val.([]byte)
	if len(bytesValue) == 0 {
		return nil
	}
	return common.Unmarshal(bytesValue, p)
}

func (p TaskPrivateData) Value() (driver.Value, error) {
	if (p == TaskPrivateData{}) {
		return nil, nil
	}
	return common.Marshal(p)
}

// SyncTaskQueryParams 用于包含所有搜索条件的结构体，可以根据需求添加更多字段
type SyncTaskQueryParams struct {
	Platform       constant.TaskPlatform
	ChannelID      string
	TaskID         string
	UserID         string
	Action         string
	Status         string
	StartTimestamp int64
	EndTimestamp   int64
	UserIDs        []int
}

func InitTask(platform constant.TaskPlatform, relayInfo *commonRelay.RelayInfo) *Task {
	properties := Properties{}
	privateData := TaskPrivateData{}
	if relayInfo != nil && relayInfo.ChannelMeta != nil {
		if relayInfo.ChannelMeta.ChannelType == constant.ChannelTypeGemini ||
			relayInfo.ChannelMeta.ChannelType == constant.ChannelTypeVertexAi {
			privateData.Key = relayInfo.ChannelMeta.ApiKey
		}
		if relayInfo.UpstreamModelName != "" {
			properties.UpstreamModelName = relayInfo.UpstreamModelName
		}
		if relayInfo.OriginModelName != "" {
			properties.OriginModelName = relayInfo.OriginModelName
		}
	}

	// 使用预生成的公开 ID（如果有），否则新生成
	taskID := ""
	if relayInfo.TaskRelayInfo != nil && relayInfo.TaskRelayInfo.PublicTaskID != "" {
		taskID = relayInfo.TaskRelayInfo.PublicTaskID
	} else {
		taskID = GenerateTaskID()
	}
	ledgerMode := GetBillingLedgerMode()
	if operationKey, err := TaskBillingOperationKey(taskID); err == nil {
		privateData.BillingOperationKey = operationKey
		privateData.BillingLedgerMode = ledgerMode
		privateData.BillingRequestID = relayInfo.RequestId
	}

	t := &Task{
		TaskID:      taskID,
		UserId:      relayInfo.UserId,
		Group:       relayInfo.UsingGroup,
		SubmitTime:  time.Now().Unix(),
		Status:      TaskStatusNotStart,
		Progress:    "0%",
		ChannelId:   relayInfo.ChannelId,
		Platform:    platform,
		Properties:  properties,
		PrivateData: privateData,
	}
	return t
}

func TaskGetAllUserTask(userId int, startIdx int, num int, queryParams SyncTaskQueryParams) []*Task {
	var tasks []*Task
	var err error

	// 初始化查询构建器
	query := DB.Where("user_id = ?", userId)

	if queryParams.TaskID != "" {
		query = query.Where("task_id = ?", queryParams.TaskID)
	}
	if queryParams.Action != "" {
		query = query.Where("action = ?", queryParams.Action)
	}
	if queryParams.Status != "" {
		query = query.Where("status = ?", queryParams.Status)
	}
	if queryParams.Platform != "" {
		query = query.Where("platform = ?", queryParams.Platform)
	}
	if queryParams.StartTimestamp != 0 {
		// 假设您已将前端传来的时间戳转换为数据库所需的时间格式，并处理了时间戳的验证和解析
		query = query.Where("submit_time >= ?", queryParams.StartTimestamp)
	}
	if queryParams.EndTimestamp != 0 {
		query = query.Where("submit_time <= ?", queryParams.EndTimestamp)
	}

	// 获取数据
	err = query.Omit("channel_id").Order("id desc").Limit(num).Offset(startIdx).Find(&tasks).Error
	if err != nil {
		return nil
	}

	return tasks
}

func TaskGetAllTasks(startIdx int, num int, queryParams SyncTaskQueryParams) []*Task {
	var tasks []*Task
	var err error

	// 初始化查询构建器
	query := DB

	// 添加过滤条件
	if queryParams.ChannelID != "" {
		query = query.Where("channel_id = ?", queryParams.ChannelID)
	}
	if queryParams.Platform != "" {
		query = query.Where("platform = ?", queryParams.Platform)
	}
	if queryParams.UserID != "" {
		query = query.Where("user_id = ?", queryParams.UserID)
	}
	if len(queryParams.UserIDs) != 0 {
		query = query.Where("user_id in (?)", queryParams.UserIDs)
	}
	if queryParams.TaskID != "" {
		query = query.Where("task_id = ?", queryParams.TaskID)
	}
	if queryParams.Action != "" {
		query = query.Where("action = ?", queryParams.Action)
	}
	if queryParams.Status != "" {
		query = query.Where("status = ?", queryParams.Status)
	}
	if queryParams.StartTimestamp != 0 {
		query = query.Where("submit_time >= ?", queryParams.StartTimestamp)
	}
	if queryParams.EndTimestamp != 0 {
		query = query.Where("submit_time <= ?", queryParams.EndTimestamp)
	}

	// 获取数据
	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&tasks).Error
	if err != nil {
		return nil
	}

	return tasks
}

func GetTimedOutUnfinishedTasks(cutoffUnix int64, limit int) []*Task {
	tasks, _ := GetTimedOutUnfinishedTasksWithContext(context.Background(), cutoffUnix, limit)
	return tasks
}

func GetTimedOutUnfinishedTasksWithContext(ctx context.Context, cutoffUnix int64, limit int) ([]*Task, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	var tasks []*Task
	err := DB.WithContext(ctx).Where("progress != ?", "100%").
		Where("status NOT IN ?", []string{TaskStatusFailure, TaskStatusSuccess}).
		Where("submit_time < ?", cutoffUnix).
		Order("submit_time").
		Limit(limit).
		Find(&tasks).Error
	if err != nil {
		return nil, err
	}
	return tasks, nil
}

func GetAllUnFinishSyncTasks(limit int) []*Task {
	tasks, _ := GetAllUnFinishSyncTasksWithContext(context.Background(), limit)
	return tasks
}

func GetAllUnFinishSyncTasksWithContext(ctx context.Context, limit int) ([]*Task, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	var tasks []*Task
	// get all tasks progress is not 100%
	err := DB.WithContext(ctx).Where("progress != ?", "100%").Where("status != ?", TaskStatusFailure).Where("status != ?", TaskStatusSuccess).Limit(limit).Order("id").Find(&tasks).Error
	if err != nil {
		return nil, err
	}
	return tasks, nil
}

// HasUnfinishedSyncTasks reports whether at least one async (Suno/video) task is
// still in progress. It is a cheap existence check (LIMIT 1) used to decide
// whether the async_task_poll system task needs to run; when no task is pending
// the scheduler skips creating a row entirely.
func HasUnfinishedSyncTasks() bool {
	var id int64
	err := DB.Model(&Task{}).
		Where("progress != ?", "100%").
		Where("status != ?", TaskStatusFailure).
		Where("status != ?", TaskStatusSuccess).
		Limit(1).
		Pluck("id", &id).Error
	return err == nil && id != 0
}

func GetByOnlyTaskId(taskId string) (*Task, bool, error) {
	return GetByOnlyTaskIdWithContext(context.Background(), taskId)
}

func GetByOnlyTaskIdWithContext(ctx context.Context, taskId string) (*Task, bool, error) {
	if taskId == "" {
		return nil, false, nil
	}
	var task *Task
	var err error
	if ctx == nil {
		ctx = context.Background()
	}
	err = DB.WithContext(ctx).Where("task_id = ?", taskId).First(&task).Error
	exist, err := RecordExist(err)
	if err != nil {
		return nil, false, err
	}
	return task, exist, err
}

func GetByTaskId(userId int, taskId string) (*Task, bool, error) {
	if taskId == "" {
		return nil, false, nil
	}
	var task *Task
	var err error
	err = DB.Where("user_id = ? and task_id = ?", userId, taskId).
		First(&task).Error
	exist, err := RecordExist(err)
	if err != nil {
		return nil, false, err
	}
	return task, exist, err
}

func GetByTaskIds(userId int, taskIds []any) ([]*Task, error) {
	if len(taskIds) == 0 {
		return nil, nil
	}
	var task []*Task
	var err error
	err = DB.Where("user_id = ? and task_id in (?)", userId, taskIds).
		Find(&task).Error
	if err != nil {
		return nil, err
	}
	return task, nil
}

func (Task *Task) Insert() error {
	var err error
	err = DB.Create(Task).Error
	return err
}

func (t *Task) InsertWithBillingReservationIntent(intent BillingReservationIntent) error {
	if t == nil {
		return errors.New("task is nil")
	}
	if t.PrivateData.BillingLedgerMode == "" {
		return t.Insert()
	}
	if t.PrivateData.BillingOperationKey == "" || t.PrivateData.BillingOperationKey != intent.OperationKey {
		return errors.New("task billing operation key does not match reservation")
	}
	if !t.PrivateData.BillingChargeTokenSet {
		return errors.New("durable task billing must persist charge-token semantics")
	}
	if DB == nil {
		return errors.New("database is not initialized")
	}
	originalID := t.ID
	err := DB.Transaction(func(tx *gorm.DB) error {
		operation, err := RecordBillingOperationReservationWithTx(tx, intent)
		if err != nil {
			return err
		}
		if err := validateTaskBillingOperation(t, operation, t.PrivateData.BillingChargeToken); err != nil {
			return err
		}
		if operation.TaskID > 0 {
			return fmt.Errorf("%w: billing operation already has a task", ErrBillingOperationConflict)
		}
		var duplicateCount int64
		if err := tx.Model(&Task{}).Where("task_id = ?", t.TaskID).Count(&duplicateCount).Error; err != nil {
			return err
		}
		if duplicateCount > 0 {
			return fmt.Errorf("%w: task id already exists", ErrBillingOperationConflict)
		}
		if err := tx.Create(t).Error; err != nil {
			return err
		}
		result := tx.Model(&BillingOperation{}).
			Where("id = ? AND task_id = 0", operation.ID).
			Updates(map[string]interface{}{
				"task_id":    t.ID,
				"updated_at": common.GetTimestamp(),
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return fmt.Errorf("%w: failed to attach task to billing operation", ErrBillingOperationConflict)
		}
		return nil
	})
	if err != nil {
		t.ID = originalID
	}
	return err
}

type taskSnapshot struct {
	Status     TaskStatus
	Progress   string
	StartTime  int64
	FinishTime int64
	FailReason string
	ResultURL  string
	Data       json.RawMessage
}

func (s taskSnapshot) Equal(other taskSnapshot) bool {
	return s.Status == other.Status &&
		s.Progress == other.Progress &&
		s.StartTime == other.StartTime &&
		s.FinishTime == other.FinishTime &&
		s.FailReason == other.FailReason &&
		s.ResultURL == other.ResultURL &&
		bytes.Equal(s.Data, other.Data)
}

func (t *Task) Snapshot() taskSnapshot {
	return taskSnapshot{
		Status:     t.Status,
		Progress:   t.Progress,
		StartTime:  t.StartTime,
		FinishTime: t.FinishTime,
		FailReason: t.FailReason,
		ResultURL:  t.PrivateData.ResultURL,
		Data:       t.Data,
	}
}

func (Task *Task) Update() error {
	var err error
	err = DB.Save(Task).Error
	return err
}

func (t *Task) UpdateQuota() error {
	return DB.Model(t).Update("quota", t.Quota).Error
}

// UpdateWithStatus performs a conditional UPDATE guarded by fromStatus (CAS).
// Returns (true, nil) if this caller won the update, (false, nil) if
// another process already moved the task out of fromStatus.
//
// Uses Model().Select("*").Updates() instead of Save() because GORM's Save
// falls back to INSERT ON CONFLICT when the WHERE-guarded UPDATE matches
// zero rows, which silently bypasses the CAS guard.
func (t *Task) UpdateWithStatus(fromStatus TaskStatus) (bool, error) {
	return t.UpdateWithStatusContext(context.Background(), fromStatus)
}

func (t *Task) UpdateWithStatusContext(ctx context.Context, fromStatus TaskStatus) (bool, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	result := DB.WithContext(ctx).Model(t).Where("status = ?", fromStatus).Select("*").Updates(t)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

type TaskBillingIntent struct {
	OperationKey  string
	LedgerMode    BillingLedgerMode
	Outcome       BillingOutcome
	ReservedQuota int64
	DesiredQuota  int64
	ChargeToken   bool
	ErrorMessage  string
}

func (t *Task) UpdateWithStatusAndBillingIntent(fromStatus TaskStatus, intent TaskBillingIntent) (bool, error) {
	return t.UpdateWithStatusAndBillingIntentContext(context.Background(), fromStatus, intent)
}

func (t *Task) UpdateWithStatusAndBillingIntentContext(ctx context.Context, fromStatus TaskStatus, intent TaskBillingIntent) (bool, error) {
	if t == nil {
		return false, errors.New("task is nil")
	}
	if DB == nil {
		return false, errors.New("database is not initialized")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return false, err
	}
	db := DB.WithContext(ctx)
	if intent.LedgerMode != BillingLedgerModeOff && intent.LedgerMode != BillingLedgerModeActive && intent.LedgerMode != BillingLedgerModeShadow {
		return false, errors.New("invalid task billing ledger mode")
	}
	if intent.Outcome != BillingOutcomeSuccess && intent.Outcome != BillingOutcomeFailure {
		return false, errors.New("invalid task billing outcome")
	}
	if intent.Outcome == BillingOutcomeFailure && intent.DesiredQuota != 0 {
		return false, errors.New("failed task billing outcome must have zero desired quota")
	}
	if intent.OperationKey == "" || intent.OperationKey != t.PrivateData.BillingOperationKey || intent.LedgerMode != t.PrivateData.BillingLedgerMode {
		return false, errors.New("task billing intent does not match persisted task metadata")
	}
	if !t.PrivateData.BillingChargeTokenSet {
		if intent.ReservedQuota != 0 || intent.DesiredQuota != 0 || intent.ChargeToken {
			return false, errors.New("durable task billing charge-token semantics are missing")
		}
		if (intent.Outcome == BillingOutcomeSuccess && t.Status != TaskStatusSuccess) ||
			(intent.Outcome == BillingOutcomeFailure && t.Status != TaskStatusFailure) {
			return false, errors.New("task terminal status does not match billing outcome")
		}
		won := false
		err := db.Transaction(func(tx *gorm.DB) error {
			var operation BillingOperation
			operationQuery := lockForUpdate(tx).Where("operation_key = ?", intent.OperationKey).Limit(1).Find(&operation)
			if operationQuery.Error != nil {
				return operationQuery.Error
			}
			if operationQuery.RowsAffected > 0 {
				return fmt.Errorf("%w: tracked operation is missing charge-token metadata", ErrBillingOperationConflict)
			}
			var persisted Task
			query := lockForUpdate(tx).Where("id = ? AND status = ?", t.ID, fromStatus).First(&persisted)
			if errors.Is(query.Error, gorm.ErrRecordNotFound) {
				return nil
			}
			if query.Error != nil {
				return query.Error
			}
			result := tx.Model(t).Where("status = ?", fromStatus).Select("*").Updates(t)
			if result.Error != nil {
				return result.Error
			}
			won = result.RowsAffected > 0
			return nil
		})
		return won, err
	}
	if t.PrivateData.BillingChargeTokenSet && intent.ChargeToken != t.PrivateData.BillingChargeToken {
		return false, errors.New("task billing charge-token semantics do not match")
	}
	if (intent.Outcome == BillingOutcomeSuccess && t.Status != TaskStatusSuccess) ||
		(intent.Outcome == BillingOutcomeFailure && t.Status != TaskStatusFailure) {
		return false, errors.New("task terminal status does not match billing outcome")
	}
	if err := validateBillingQuota(intent.ReservedQuota); err != nil {
		return false, err
	}
	if err := validateBillingQuota(intent.DesiredQuota); err != nil {
		return false, err
	}
	originalQuota := t.Quota
	if intent.Outcome == BillingOutcomeSuccess {
		t.Quota = int(intent.DesiredQuota)
	}
	won := false
	err := db.Transaction(func(tx *gorm.DB) error {
		var operation BillingOperation
		query := lockForUpdate(tx).Where("operation_key = ?", intent.OperationKey).Limit(1).Find(&operation)
		if query.Error != nil {
			return query.Error
		}
		if query.RowsAffected == 0 {
			return ErrBillingOperationNotFound
		}
		if err := validateTaskBillingOperation(t, &operation, intent.ChargeToken); err != nil {
			return err
		}
		if operation.ReservedQuota != intent.ReservedQuota {
			return fmt.Errorf("%w: task reserved quota does not match", ErrBillingOperationConflict)
		}
		result := tx.Model(t).Where("status = ?", fromStatus).Select("*").Updates(t)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return nil
		}
		won = true
		outcome := BillingOutcomeIntent{
			OperationKey: intent.OperationKey,
			Outcome:      intent.Outcome,
			DesiredQuota: intent.DesiredQuota,
			ErrorMessage: intent.ErrorMessage,
		}
		_, err := RecordBillingOperationOutcomeWithTx(tx, outcome)
		return err
	})
	if err != nil {
		t.Quota = originalQuota
		return false, err
	}
	return won, nil
}

func validateTaskBillingOperation(task *Task, operation *BillingOperation, chargeToken bool) error {
	if task == nil || operation == nil {
		return errors.New("task billing operation is missing")
	}
	expectedKey, err := TaskBillingOperationKey(task.TaskID)
	if err != nil || expectedKey != operation.OperationKey {
		return fmt.Errorf("%w: task id does not match billing operation key", ErrBillingOperationConflict)
	}
	if operation.Kind != BillingOperationKindTask || operation.OperationKey != task.PrivateData.BillingOperationKey ||
		operation.UserID != task.UserId || operation.FundingSource != task.PrivateData.BillingSource ||
		operation.TokenID != task.PrivateData.TokenId || operation.ChargeToken != chargeToken ||
		operation.LedgerMode != task.PrivateData.BillingLedgerMode {
		return fmt.Errorf("%w: task billing operation does not match", ErrBillingOperationConflict)
	}
	if operation.RequestID != task.PrivateData.BillingRequestID {
		return fmt.Errorf("%w: task billing request id does not match", ErrBillingOperationConflict)
	}
	if task.ID > 0 && operation.TaskID != task.ID {
		return fmt.Errorf("%w: billing operation is attached to another task", ErrBillingOperationConflict)
	}
	if operation.FundingSource == BillingFundingSourceSubscription && operation.FundingRefID != task.PrivateData.SubscriptionId {
		return fmt.Errorf("%w: task subscription does not match", ErrBillingOperationConflict)
	}
	if operation.FundingSource == BillingFundingSourceSubscription && operation.FundingResetEpoch != task.PrivateData.SubscriptionResetEpoch {
		return fmt.Errorf("%w: task subscription reset epoch does not match", ErrBillingOperationConflict)
	}
	return nil
}

func attachExistingTaskBillingBaselineWithTx(tx *gorm.DB, operation *BillingOperation) error {
	if tx == nil || operation == nil || operation.TaskID <= 0 {
		return nil
	}
	if operation.Outcome != BillingOutcomeOpen {
		return fmt.Errorf("%w: cannot attach a terminal billing operation", ErrBillingOperationConflict)
	}
	var task Task
	if err := lockForUpdate(tx).Where("id = ?", operation.TaskID).First(&task).Error; err != nil {
		return err
	}
	if task.Status == TaskStatusSuccess || task.Status == TaskStatusFailure {
		return fmt.Errorf("%w: cannot attach billing to a terminal task", ErrBillingOperationConflict)
	}
	expectedKey, err := TaskBillingOperationKey(task.TaskID)
	if err != nil || expectedKey != operation.OperationKey || task.UserId != operation.UserID {
		return fmt.Errorf("%w: existing task does not match billing operation", ErrBillingOperationConflict)
	}
	if task.PrivateData.BillingOperationKey != "" && task.PrivateData.BillingOperationKey != operation.OperationKey {
		return fmt.Errorf("%w: task already has another billing operation", ErrBillingOperationConflict)
	}
	if task.PrivateData.BillingLedgerMode != "" && task.PrivateData.BillingLedgerMode != operation.LedgerMode {
		return fmt.Errorf("%w: task already has another billing mode", ErrBillingOperationConflict)
	}
	if task.PrivateData.BillingRequestID != "" && task.PrivateData.BillingRequestID != operation.RequestID {
		return fmt.Errorf("%w: task already has another billing request", ErrBillingOperationConflict)
	}
	if task.PrivateData.BillingSource != "" && task.PrivateData.BillingSource != operation.FundingSource {
		return fmt.Errorf("%w: task already has another funding source", ErrBillingOperationConflict)
	}
	if task.PrivateData.TokenId > 0 && task.PrivateData.TokenId != operation.TokenID {
		return fmt.Errorf("%w: task already has another token", ErrBillingOperationConflict)
	}
	if task.PrivateData.SubscriptionId > 0 && task.PrivateData.SubscriptionId != operation.FundingRefID {
		return fmt.Errorf("%w: task already has another subscription", ErrBillingOperationConflict)
	}
	if operation.FundingSource == BillingFundingSourceSubscription && task.PrivateData.SubscriptionResetEpoch > 0 &&
		task.PrivateData.SubscriptionResetEpoch != operation.FundingResetEpoch {
		return fmt.Errorf("%w: task already has another subscription reset epoch", ErrBillingOperationConflict)
	}
	if task.PrivateData.BillingChargeTokenSet && task.PrivateData.BillingChargeToken != operation.ChargeToken {
		return fmt.Errorf("%w: task already has another charge-token policy", ErrBillingOperationConflict)
	}
	task.PrivateData.BillingOperationKey = operation.OperationKey
	task.PrivateData.BillingLedgerMode = operation.LedgerMode
	task.PrivateData.BillingRequestID = operation.RequestID
	task.PrivateData.BillingSource = operation.FundingSource
	task.PrivateData.SubscriptionId = operation.FundingRefID
	task.PrivateData.SubscriptionResetEpoch = operation.FundingResetEpoch
	task.PrivateData.TokenId = operation.TokenID
	task.PrivateData.BillingChargeToken = operation.ChargeToken
	task.PrivateData.BillingChargeTokenSet = true
	task.Quota = int(operation.ReservedQuota)
	return tx.Model(&Task{}).Where("id = ?", task.ID).Updates(map[string]interface{}{
		"private_data": task.PrivateData,
		"quota":        task.Quota,
		"updated_at":   common.GetTimestamp(),
	}).Error
}

// TaskBulkUpdate performs an unconditional bulk UPDATE by upstream task_id strings.
// Same caveats as TaskBulkUpdateByID — no CAS guard.
func TaskBulkUpdate(taskIds []string, params map[string]any) error {
	if len(taskIds) == 0 {
		return nil
	}
	return DB.Model(&Task{}).
		Where("task_id in (?)", taskIds).
		Updates(params).Error
}

// TaskBulkUpdateByID performs an unconditional bulk UPDATE by primary key IDs.
// WARNING: This function has NO CAS (Compare-And-Swap) guard — it will overwrite
// any concurrent status changes. DO NOT use in billing/quota lifecycle flows
// (e.g., timeout, success, failure transitions that trigger refunds or settlements).
// For status transitions that involve billing, use Task.UpdateWithStatus() instead.
func TaskBulkUpdateByID(ids []int64, params map[string]any) error {
	if len(ids) == 0 {
		return nil
	}
	return DB.Model(&Task{}).
		Where("id in (?)", ids).
		Updates(params).Error
}

type TaskQuotaUsage struct {
	Mode  string  `json:"mode"`
	Count float64 `json:"count"`
}

// TaskCountAllTasks returns total tasks that match the given query params (admin usage)
func TaskCountAllTasks(queryParams SyncTaskQueryParams) int64 {
	var total int64
	query := DB.Model(&Task{})
	if queryParams.ChannelID != "" {
		query = query.Where("channel_id = ?", queryParams.ChannelID)
	}
	if queryParams.Platform != "" {
		query = query.Where("platform = ?", queryParams.Platform)
	}
	if queryParams.UserID != "" {
		query = query.Where("user_id = ?", queryParams.UserID)
	}
	if len(queryParams.UserIDs) != 0 {
		query = query.Where("user_id in (?)", queryParams.UserIDs)
	}
	if queryParams.TaskID != "" {
		query = query.Where("task_id = ?", queryParams.TaskID)
	}
	if queryParams.Action != "" {
		query = query.Where("action = ?", queryParams.Action)
	}
	if queryParams.Status != "" {
		query = query.Where("status = ?", queryParams.Status)
	}
	if queryParams.StartTimestamp != 0 {
		query = query.Where("submit_time >= ?", queryParams.StartTimestamp)
	}
	if queryParams.EndTimestamp != 0 {
		query = query.Where("submit_time <= ?", queryParams.EndTimestamp)
	}
	_ = query.Count(&total).Error
	return total
}

// TaskCountAllUserTask returns total tasks for given user
func TaskCountAllUserTask(userId int, queryParams SyncTaskQueryParams) int64 {
	var total int64
	query := DB.Model(&Task{}).Where("user_id = ?", userId)
	if queryParams.TaskID != "" {
		query = query.Where("task_id = ?", queryParams.TaskID)
	}
	if queryParams.Action != "" {
		query = query.Where("action = ?", queryParams.Action)
	}
	if queryParams.Status != "" {
		query = query.Where("status = ?", queryParams.Status)
	}
	if queryParams.Platform != "" {
		query = query.Where("platform = ?", queryParams.Platform)
	}
	if queryParams.StartTimestamp != 0 {
		query = query.Where("submit_time >= ?", queryParams.StartTimestamp)
	}
	if queryParams.EndTimestamp != 0 {
		query = query.Where("submit_time <= ?", queryParams.EndTimestamp)
	}
	_ = query.Count(&total).Error
	return total
}
func (t *Task) ToOpenAIVideo() *dto.OpenAIVideo {
	openAIVideo := dto.NewOpenAIVideo()
	openAIVideo.ID = t.TaskID
	openAIVideo.Status = t.Status.ToVideoStatus()
	openAIVideo.Model = t.Properties.OriginModelName
	openAIVideo.SetProgressStr(t.Progress)
	openAIVideo.CreatedAt = t.CreatedAt
	openAIVideo.CompletedAt = t.UpdatedAt
	openAIVideo.SetMetadata("url", t.GetResultURL())
	return openAIVideo
}
