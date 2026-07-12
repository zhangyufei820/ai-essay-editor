package controller

import (
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	basecommon "github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	gosqlite "github.com/glebarez/go-sqlite"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

const (
	relayTaskBillingTestUserID       = 9101
	relayTaskBillingTestTokenID      = 9201
	relayTaskBillingTestChannelID    = 9301
	relayTaskBillingTestInitialQuota = 1_000_000
	relayTaskBillingTestModel        = "MiniMax-Hailuo-2.3"
	relayTaskBillingTestTokenKey     = "relay-task-billing-test-token"
)

var relayTaskCommitUnknownDriverSequence uint64

type commitUnknownDriver struct {
	inner              driver.Driver
	failNextCommit     *int32
	unknownCommitCount *int32
}

func (databaseDriver *commitUnknownDriver) Open(name string) (driver.Conn, error) {
	connection, err := databaseDriver.inner.Open(name)
	if err != nil {
		return nil, err
	}
	return &commitUnknownConnection{
		inner:              connection,
		failNextCommit:     databaseDriver.failNextCommit,
		unknownCommitCount: databaseDriver.unknownCommitCount,
	}, nil
}

type commitUnknownConnection struct {
	inner              driver.Conn
	failNextCommit     *int32
	unknownCommitCount *int32
}

func (connection *commitUnknownConnection) Prepare(query string) (driver.Stmt, error) {
	return connection.inner.Prepare(query)
}

func (connection *commitUnknownConnection) Close() error {
	return connection.inner.Close()
}

func (connection *commitUnknownConnection) Begin() (driver.Tx, error) {
	transaction, err := connection.inner.Begin()
	if err != nil {
		return nil, err
	}
	return &commitUnknownTransaction{
		inner:              transaction,
		failNextCommit:     connection.failNextCommit,
		unknownCommitCount: connection.unknownCommitCount,
	}, nil
}

type commitUnknownTransaction struct {
	inner              driver.Tx
	failNextCommit     *int32
	unknownCommitCount *int32
}

func (transaction *commitUnknownTransaction) Commit() error {
	if err := transaction.inner.Commit(); err != nil {
		return err
	}
	if transaction.failNextCommit != nil && atomic.CompareAndSwapInt32(transaction.failNextCommit, 1, 0) {
		if transaction.unknownCommitCount != nil {
			atomic.AddInt32(transaction.unknownCommitCount, 1)
		}
		return errors.New("simulated unknown commit result")
	}
	return nil
}

func (transaction *commitUnknownTransaction) Rollback() error {
	return transaction.inner.Rollback()
}

type recordingTaskBillingHandoff struct {
	prepareCalls  int
	completeCalls int
}

func (handoff *recordingTaskBillingHandoff) Settle(int) error         { return nil }
func (handoff *recordingTaskBillingHandoff) Refund(*gin.Context)      {}
func (handoff *recordingTaskBillingHandoff) NeedsRefund() bool        { return false }
func (handoff *recordingTaskBillingHandoff) GetPreConsumedQuota() int { return 0 }
func (handoff *recordingTaskBillingHandoff) Reserve(int) error        { return nil }
func (handoff *recordingTaskBillingHandoff) PrepareTaskBillingHandoff(*model.Task) (model.BillingReservationIntent, bool, error) {
	handoff.prepareCalls++
	return model.BillingReservationIntent{}, false, nil
}
func (handoff *recordingTaskBillingHandoff) CompleteTaskBillingHandoff() {
	handoff.completeCalls++
}

var _ relaycommon.BillingSettler = (*recordingTaskBillingHandoff)(nil)

func setupRelayTaskPersistenceTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := model.DB
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.AutoMigrate(&model.Task{}))
	model.DB = database
	require.NoError(t, model.EnsureTaskPublicIDUniqueIndex())
	t.Cleanup(func() { model.DB = previousDB })
	return database
}

func setupRelayTaskBillingIntegrationDB(t *testing.T, failNextCommit *int32, unknownCommitCount *int32) *gorm.DB {
	t.Helper()
	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousMainDatabaseType := basecommon.MainDatabaseType()
	previousLogDatabaseType := basecommon.LogDatabaseType()
	previousRedisEnabled := basecommon.RedisEnabled
	previousBatchUpdateEnabled := basecommon.BatchUpdateEnabled
	previousLogConsumeEnabled := basecommon.LogConsumeEnabled

	driverName := fmt.Sprintf("relay-task-commit-unknown-%d", atomic.AddUint64(&relayTaskCommitUnknownDriverSequence, 1))
	sql.Register(driverName, &commitUnknownDriver{
		inner:              &gosqlite.Driver{},
		failNextCommit:     failNextCommit,
		unknownCommitCount: unknownCommitCount,
	})
	database, err := gorm.Open(&sqlite.Dialector{DriverName: driverName, DSN: ":memory:"}, &gorm.Config{})
	require.NoError(t, err)
	sqlDatabase, err := database.DB()
	require.NoError(t, err)
	sqlDatabase.SetMaxOpenConns(1)

	basecommon.SetDatabaseTypes(basecommon.DatabaseTypeSQLite, basecommon.DatabaseTypeSQLite)
	basecommon.RedisEnabled = false
	basecommon.BatchUpdateEnabled = false
	basecommon.LogConsumeEnabled = true
	service.InitHttpClient()
	model.DB = database
	model.LOG_DB = database
	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		basecommon.SetDatabaseTypes(previousMainDatabaseType, previousLogDatabaseType)
		basecommon.RedisEnabled = previousRedisEnabled
		basecommon.BatchUpdateEnabled = previousBatchUpdateEnabled
		basecommon.LogConsumeEnabled = previousLogConsumeEnabled
		require.NoError(t, sqlDatabase.Close())
	})

	require.NoError(t, database.AutoMigrate(
		&model.Task{},
		&model.User{},
		&model.Token{},
		&model.Log{},
		&model.Channel{},
		&model.BillingOperation{},
		&model.BillingOutbox{},
	))
	require.NoError(t, model.EnsureTaskPublicIDUniqueIndex())
	require.NoError(t, database.Create(&model.User{
		Id:       relayTaskBillingTestUserID,
		Username: "relay_task_billing_test",
		Status:   basecommon.UserStatusEnabled,
		Group:    "default",
		Quota:    relayTaskBillingTestInitialQuota,
	}).Error)
	require.NoError(t, database.Create(&model.Token{
		Id:          relayTaskBillingTestTokenID,
		UserId:      relayTaskBillingTestUserID,
		Key:         relayTaskBillingTestTokenKey,
		Name:        "relay_task_billing_test",
		Status:      basecommon.TokenStatusEnabled,
		ExpiredTime: -1,
		RemainQuota: relayTaskBillingTestInitialQuota,
	}).Error)

	previousModelPrices := ratio_setting.ModelPrice2JSONString()
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"`+relayTaskBillingTestModel+`":0.01}`))
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(previousModelPrices))
	})
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))
	return database
}

func newRelayTaskBillingTestContext(baseURL string, requestID string) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/internal/test/task-submit",
		strings.NewReader(`{"model":"`+relayTaskBillingTestModel+`","prompt":"test prompt","duration":6}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	context.Set(basecommon.RequestIdKey, requestID)
	context.Set("relay_mode", relayconstant.RelayModeVideoSubmit)
	context.Set("token_name", "relay_task_billing_test")
	basecommon.SetContextKey(context, constant.ContextKeyUserId, relayTaskBillingTestUserID)
	basecommon.SetContextKey(context, constant.ContextKeyUserName, "relay_task_billing_test")
	basecommon.SetContextKey(context, constant.ContextKeyUserQuota, relayTaskBillingTestInitialQuota)
	basecommon.SetContextKey(context, constant.ContextKeyUserGroup, "default")
	basecommon.SetContextKey(context, constant.ContextKeyUsingGroup, "default")
	basecommon.SetContextKey(context, constant.ContextKeyUserSetting, dto.UserSetting{BillingPreference: "wallet_only"})
	basecommon.SetContextKey(context, constant.ContextKeyTokenId, relayTaskBillingTestTokenID)
	basecommon.SetContextKey(context, constant.ContextKeyTokenKey, relayTaskBillingTestTokenKey)
	basecommon.SetContextKey(context, constant.ContextKeyTokenGroup, "default")
	basecommon.SetContextKey(context, constant.ContextKeyOriginalModel, relayTaskBillingTestModel)
	basecommon.SetContextKey(context, constant.ContextKeyChannelId, relayTaskBillingTestChannelID)
	basecommon.SetContextKey(context, constant.ContextKeyChannelName, "relay_task_billing_test")
	basecommon.SetContextKey(context, constant.ContextKeyChannelType, constant.ChannelTypeMiniMax)
	basecommon.SetContextKey(context, constant.ContextKeyChannelBaseUrl, baseURL)
	basecommon.SetContextKey(context, constant.ContextKeyChannelKey, "upstream-test-key")
	return context, recorder
}

func relayTaskBillingTestTable(database *gorm.DB) string {
	if database == nil || database.Statement == nil {
		return ""
	}
	if database.Statement.Table != "" {
		return database.Statement.Table
	}
	if database.Statement.Schema != nil {
		return database.Statement.Schema.Table
	}
	return ""
}

func TestDeferredTaskResponseWriterDoesNotExposeResponseBeforeCommit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	writer := newDeferredTaskResponseWriter(context.Writer)

	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusCreated)
	_, err := writer.WriteString(`{"id":"task_123"}`)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, recorder.Code)
	require.Empty(t, recorder.Body.String())

	require.NoError(t, writer.Commit())
	require.Equal(t, http.StatusCreated, recorder.Code)
	require.JSONEq(t, `{"id":"task_123"}`, recorder.Body.String())
	require.Equal(t, "application/json", recorder.Header().Get("Content-Type"))
}

func TestDeferredTaskResponseWriterCanBeDiscardedAfterPersistenceFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	writer := newDeferredTaskResponseWriter(context.Writer)

	writer.Header().Set("X-Upstream-Task", "must-not-leak")
	_, err := writer.WriteString(`{"id":"task_untracked"}`)
	require.NoError(t, err)

	context.JSON(http.StatusInternalServerError, gin.H{"error": "task persistence failed"})
	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	require.NotContains(t, recorder.Body.String(), "task_untracked")
	require.Empty(t, recorder.Header().Get("X-Upstream-Task"))
}

func TestDeferredTaskResponseWriterCommitIsIdempotent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	writer := newDeferredTaskResponseWriter(context.Writer)

	_, err := writer.WriteString("ok")
	require.NoError(t, err)
	require.NoError(t, writer.Commit())
	require.NoError(t, writer.Commit())
	require.Equal(t, "ok", recorder.Body.String())
}

func TestValidateTaskSubmitResultRequiresUpstreamTaskID(t *testing.T) {
	require.Error(t, validateTaskSubmitResult(nil))
	require.Error(t, validateTaskSubmitResult(&relay.TaskSubmitResult{UpstreamTaskID: "  "}))
	require.NoError(t, validateTaskSubmitResult(&relay.TaskSubmitResult{UpstreamTaskID: "upstream-task"}))
}

func TestShouldRetryTaskRelayRejectsLocalBadGateway(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	taskErr := &dto.TaskError{
		StatusCode: http.StatusBadGateway,
		LocalError: true,
	}

	require.False(t, shouldRetryTaskRelay(context, 1, taskErr, 1))
}

func TestShouldRetryTaskRelayRejectsDispatchedSubmission(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Set(relay.TaskSubmitDispatchedContextKey, true)
	taskErr := &dto.TaskError{StatusCode: http.StatusBadGateway}

	require.False(t, shouldRetryTaskRelay(context, 1, taskErr, 1))
}

func TestIsVideoTaskPathCoversAllSubmitRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, path := range []string{
		"/v1/videos",
		"/v1/video/generations",
		"/pg/videos",
		"/pg/video/generations",
	} {
		t.Run(path, func(t *testing.T) {
			context, _ := gin.CreateTestContext(httptest.NewRecorder())
			context.Request = httptest.NewRequest(http.MethodPost, path, nil)
			require.True(t, isVideoTaskPath(context))
		})
	}

	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	require.False(t, isVideoTaskPath(context))
}

func TestPersistSubmittedTaskCompletesBillingHandoffAfterInsert(t *testing.T) {
	database := setupRelayTaskPersistenceTestDB(t)
	handoff := &recordingTaskBillingHandoff{}
	task := &model.Task{TaskID: "task_controller_handoff", UserId: 1, Status: model.TaskStatusSubmitted}

	require.NoError(t, persistSubmittedTask(task, handoff))
	require.Equal(t, 1, handoff.prepareCalls)
	require.Equal(t, 1, handoff.completeCalls)
	var count int64
	require.NoError(t, database.Model(&model.Task{}).Where("task_id = ?", task.TaskID).Count(&count).Error)
	require.EqualValues(t, 1, count)
}

func TestPersistSubmittedTaskDoesNotCompleteHandoffAfterInsertFailure(t *testing.T) {
	database := setupRelayTaskPersistenceTestDB(t)
	require.NoError(t, database.Exec(`
		CREATE TRIGGER fail_task_insert
		BEFORE INSERT ON tasks
		BEGIN
			SELECT RAISE(FAIL, 'forced task insert failure');
		END
	`).Error)
	handoff := &recordingTaskBillingHandoff{}
	task := &model.Task{TaskID: "task_controller_insert_failure", UserId: 1, Status: model.TaskStatusSubmitted}

	err := persistSubmittedTask(task, handoff)
	require.Error(t, err)
	require.False(t, errors.Is(err, gorm.ErrRecordNotFound))
	require.Equal(t, 1, handoff.prepareCalls)
	require.Zero(t, handoff.completeCalls)
}

func TestPersistSubmittedTaskRecoversCommittedInsertByPublicID(t *testing.T) {
	setupRelayTaskPersistenceTestDB(t)
	existing := &model.Task{
		TaskID: "task_commit_unknown", UserId: 1, Status: model.TaskStatusSubmitted,
	}
	require.NoError(t, existing.Insert())
	handoff := &recordingTaskBillingHandoff{}
	retryView := &model.Task{
		TaskID: "task_commit_unknown", UserId: 1, Status: model.TaskStatusSubmitted,
	}

	require.NoError(t, persistSubmittedTask(retryView, handoff))
	require.Equal(t, existing.ID, retryView.ID)
	require.Equal(t, 1, handoff.prepareCalls)
	require.Equal(t, 1, handoff.completeCalls)
	var count int64
	require.NoError(t, model.DB.Model(&model.Task{}).Where("task_id = ?", existing.TaskID).Count(&count).Error)
	require.EqualValues(t, 1, count)
}

func TestPersistSubmittedTaskRejectsPublicIDOwnedByAnotherSubmission(t *testing.T) {
	setupRelayTaskPersistenceTestDB(t)
	require.NoError(t, (&model.Task{
		TaskID: "task_identity_collision", UserId: 1, Status: model.TaskStatusSubmitted,
	}).Insert())
	handoff := &recordingTaskBillingHandoff{}
	colliding := &model.Task{
		TaskID: "task_identity_collision", UserId: 2, Status: model.TaskStatusSubmitted,
	}

	err := persistSubmittedTask(colliding, handoff)
	require.ErrorIs(t, err, errTaskPersistenceConflict)
	require.Equal(t, 1, handoff.prepareCalls)
	require.Zero(t, handoff.completeCalls)
}

func TestRelayTaskPersistsDispatchedTaskAndBillingIntentAfterTransientSettlementFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	database := setupRelayTaskBillingIntegrationDB(t, nil, nil)
	var settlementFailureArmed int32
	var settlementFailureCount int32
	require.NoError(t, database.Callback().Query().Before("gorm:query").Register(
		"test:relay_task_transient_settlement_failure",
		func(transaction *gorm.DB) {
			if relayTaskBillingTestTable(transaction) != "billing_operations" ||
				!atomic.CompareAndSwapInt32(&settlementFailureArmed, 1, 0) {
				return
			}
			atomic.AddInt32(&settlementFailureCount, 1)
			transaction.AddError(errors.New("simulated transient billing settlement failure"))
		},
	))

	const upstreamTaskID = "upstream-settlement-transient"
	var upstreamRequestCount int32
	upstream := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		atomic.AddInt32(&upstreamRequestCount, 1)
		atomic.StoreInt32(&settlementFailureArmed, 1)
		response.Header().Set("Content-Type", "application/json")
		response.WriteHeader(http.StatusOK)
		if _, err := response.Write([]byte(`{"task_id":"` + upstreamTaskID + `","base_resp":{"status_code":0,"status_msg":""}}`)); err != nil {
			t.Errorf("write upstream response: %v", err)
		}
	}))
	t.Cleanup(upstream.Close)

	context, recorder := newRelayTaskBillingTestContext(upstream.URL, "relay-task-transient-settlement")
	RelayTask(context)

	require.Equal(t, int32(1), atomic.LoadInt32(&upstreamRequestCount))
	require.Equal(t, int32(1), atomic.LoadInt32(&settlementFailureCount))
	require.Equal(t, http.StatusOK, recorder.Code)

	var persistedTask model.Task
	require.NoError(t, database.First(&persistedTask).Error)
	require.Equal(t, upstreamTaskID, persistedTask.GetUpstreamTaskID())
	require.NotEqual(t, upstreamTaskID, persistedTask.TaskID)
	require.Equal(t, constant.TaskPlatform(strconv.Itoa(constant.ChannelTypeMiniMax)), persistedTask.Platform)
	require.NotEmpty(t, persistedTask.PrivateData.BillingOperationKey)
	require.True(t, persistedTask.PrivateData.BillingChargeTokenSet)

	var operation model.BillingOperation
	require.NoError(t, database.Where("operation_key = ?", persistedTask.PrivateData.BillingOperationKey).First(&operation).Error)
	require.Equal(t, model.BillingOperationKindTask, operation.Kind)
	require.Equal(t, model.BillingOutcomeOpen, operation.Outcome)
	require.Equal(t, persistedTask.ID, operation.TaskID)
	require.Positive(t, operation.ReservedQuota)
	require.Equal(t, operation.ReservedQuota, operation.DesiredQuota)
	require.Equal(t, operation.ReservedQuota, operation.AppliedQuota)

	var outboxCount int64
	require.NoError(t, database.Model(&model.BillingOutbox{}).Where("operation_id = ?", operation.ID).Count(&outboxCount).Error)
	require.Positive(t, outboxCount)

	var responseBody map[string]any
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &responseBody))
	require.Equal(t, persistedTask.TaskID, responseBody["id"])
	require.NotContains(t, recorder.Body.String(), upstreamTaskID)
}

func TestRelayTaskUnknownCommitDoesNotRefundBeforeDurableReconciliation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var failNextCommit int32
	var unknownCommitCount int32
	database := setupRelayTaskBillingIntegrationDB(t, &failNextCommit, &unknownCommitCount)
	var armCommitOnTaskCreate int32
	var failInitialVerification int32
	var verificationFailureCount int32

	require.NoError(t, database.Callback().Create().After("gorm:create").Register(
		"test:relay_task_arm_unknown_commit",
		func(transaction *gorm.DB) {
			if transaction.Error != nil || relayTaskBillingTestTable(transaction) != "tasks" ||
				!atomic.CompareAndSwapInt32(&armCommitOnTaskCreate, 1, 0) {
				return
			}
			atomic.StoreInt32(&failNextCommit, 1)
		},
	))
	require.NoError(t, database.Callback().Query().Before("gorm:query").Register(
		"test:relay_task_unknown_commit_verification",
		func(transaction *gorm.DB) {
			if relayTaskBillingTestTable(transaction) != "tasks" {
				return
			}
			if _, ok := transaction.Statement.Dest.(**model.Task); !ok {
				return
			}
			if atomic.CompareAndSwapInt32(&failInitialVerification, 1, 0) {
				atomic.AddInt32(&verificationFailureCount, 1)
				transaction.AddError(errors.New("simulated task commit verification failure"))
				return
			}
		},
	))

	const upstreamTaskID = "upstream-commit-unknown"
	upstream := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		atomic.StoreInt32(&armCommitOnTaskCreate, 1)
		atomic.StoreInt32(&failInitialVerification, 1)
		response.Header().Set("Content-Type", "application/json")
		response.WriteHeader(http.StatusOK)
		if _, err := response.Write([]byte(`{"task_id":"` + upstreamTaskID + `","base_resp":{"status_code":0,"status_msg":""}}`)); err != nil {
			t.Errorf("write upstream response: %v", err)
		}
	}))
	t.Cleanup(upstream.Close)

	context, recorder := newRelayTaskBillingTestContext(upstream.URL, "relay-task-commit-unknown")
	RelayTask(context)

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	require.Equal(t, int32(1), atomic.LoadInt32(&unknownCommitCount))
	require.Equal(t, int32(1), atomic.LoadInt32(&verificationFailureCount))

	var persistedTask model.Task
	require.NoError(t, database.First(&persistedTask).Error)
	require.Equal(t, upstreamTaskID, persistedTask.GetUpstreamTaskID())
	require.NotEmpty(t, persistedTask.PrivateData.BillingOperationKey)
	require.NotContains(t, recorder.Body.String(), upstreamTaskID)
	require.NotContains(t, recorder.Body.String(), persistedTask.TaskID)

	var operation model.BillingOperation
	require.NoError(t, database.Where("operation_key = ?", persistedTask.PrivateData.BillingOperationKey).First(&operation).Error)
	require.Equal(t, model.BillingOutcomeOpen, operation.Outcome)
	require.Equal(t, persistedTask.ID, operation.TaskID)
	require.Positive(t, operation.AppliedQuota)
	require.Equal(t, operation.AppliedQuota, operation.DesiredQuota)

	var user model.User
	require.NoError(t, database.First(&user, relayTaskBillingTestUserID).Error)
	require.EqualValues(t, relayTaskBillingTestInitialQuota-operation.AppliedQuota, user.Quota)
	var token model.Token
	require.NoError(t, database.First(&token, relayTaskBillingTestTokenID).Error)
	require.EqualValues(t, relayTaskBillingTestInitialQuota-operation.AppliedQuota, token.RemainQuota)

	var outboxCount int64
	require.NoError(t, database.Model(&model.BillingOutbox{}).Where("operation_id = ?", operation.ID).Count(&outboxCount).Error)
	require.Positive(t, outboxCount)

	require.NoError(t, database.Where("id = ?", operation.ID).First(&operation).Error)
	require.Equal(t, model.BillingOutcomeOpen, operation.Outcome)
	require.Equal(t, persistedTask.ID, operation.TaskID)
}
