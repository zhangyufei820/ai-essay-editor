package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestMain(m *testing.M) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		panic("failed to open test db: " + err.Error())
	}
	sqlDB, err := db.DB()
	if err != nil {
		panic("failed to get sql.DB: " + err.Error())
	}
	sqlDB.SetMaxOpenConns(1)

	model.DB = db
	model.LOG_DB = db

	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	common.BatchUpdateEnabled = false
	common.LogConsumeEnabled = true

	if err := db.AutoMigrate(
		&model.Task{},
		&model.User{},
		&model.Token{},
		&model.Log{},
		&model.Channel{},
		&model.TopUp{},
		&model.SubscriptionPlan{},
		&model.UserSubscription{},
		&model.SubscriptionPreConsumeRecord{},
		&model.SystemTask{},
		&model.SystemTaskLock{},
		&model.BillingOperation{},
		&model.BillingOutbox{},
	); err != nil {
		panic("failed to migrate: " + err.Error())
	}

	os.Exit(m.Run())
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

func truncate(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		model.DB.Exec("DELETE FROM billing_outbox")
		model.DB.Exec("DELETE FROM billing_operations")
		model.DB.Exec("DELETE FROM tasks")
		model.DB.Exec("DELETE FROM users")
		model.DB.Exec("DELETE FROM tokens")
		model.DB.Exec("DELETE FROM logs")
		model.DB.Exec("DELETE FROM channels")
		model.DB.Exec("DELETE FROM top_ups")
		model.DB.Exec("DELETE FROM subscription_pre_consume_records")
		model.DB.Exec("DELETE FROM user_subscriptions")
		model.DB.Exec("DELETE FROM subscription_plans")
		model.DB.Exec("DELETE FROM system_task_locks")
		model.DB.Exec("DELETE FROM system_tasks")
	})
}

func seedUser(t *testing.T, id int, quota int) {
	t.Helper()
	user := &model.User{Id: id, Username: "test_user", Quota: quota, Status: common.UserStatusEnabled}
	require.NoError(t, model.DB.Create(user).Error)
}

func seedToken(t *testing.T, id int, userId int, key string, remainQuota int) {
	t.Helper()
	token := &model.Token{
		Id:          id,
		UserId:      userId,
		Key:         key,
		Name:        "test_token",
		Status:      common.TokenStatusEnabled,
		RemainQuota: remainQuota,
		UsedQuota:   0,
	}
	require.NoError(t, model.DB.Create(token).Error)
}

func seedSubscription(t *testing.T, id int, userId int, amountTotal int64, amountUsed int64) {
	t.Helper()
	sub := &model.UserSubscription{
		Id:          id,
		UserId:      userId,
		AmountTotal: amountTotal,
		AmountUsed:  amountUsed,
		Status:      "active",
		StartTime:   time.Now().Unix(),
		EndTime:     time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	require.NoError(t, model.DB.Create(sub).Error)
}

func seedChannel(t *testing.T, id int) {
	t.Helper()
	ch := &model.Channel{Id: id, Name: "test_channel", Key: "sk-test", Status: common.ChannelStatusEnabled}
	require.NoError(t, model.DB.Create(ch).Error)
}

func makeTask(userId, channelId, quota, tokenId int, billingSource string, subscriptionId int) *model.Task {
	resetEpoch := int64(0)
	if billingSource == BillingSourceSubscription {
		resetEpoch = time.Now().Unix()
	}
	return &model.Task{
		TaskID:    "task_" + time.Now().Format("150405.000"),
		UserId:    userId,
		ChannelId: channelId,
		Quota:     quota,
		Status:    model.TaskStatus(model.TaskStatusInProgress),
		Group:     "default",
		Data:      json.RawMessage(`{}`),
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
		Properties: model.Properties{
			OriginModelName: "test-model",
		},
		PrivateData: model.TaskPrivateData{
			BillingSource:          billingSource,
			SubscriptionId:         subscriptionId,
			SubscriptionResetEpoch: resetEpoch,
			TokenId:                tokenId,
			BillingContext: &model.TaskBillingContext{
				ModelPrice:      0.02,
				GroupRatio:      1.0,
				OriginModelName: "test-model",
			},
		},
	}
}

// ---------------------------------------------------------------------------
// Read-back helpers
// ---------------------------------------------------------------------------

func getUserQuota(t *testing.T, id int) int {
	t.Helper()
	var user model.User
	require.NoError(t, model.DB.Select("quota").Where("id = ?", id).First(&user).Error)
	return user.Quota
}

func getUserUsedQuota(t *testing.T, id int) int {
	t.Helper()
	var user model.User
	require.NoError(t, model.DB.Select("used_quota").Where("id = ?", id).First(&user).Error)
	return user.UsedQuota
}

func getTokenRemainQuota(t *testing.T, id int) int {
	t.Helper()
	var token model.Token
	require.NoError(t, model.DB.Select("remain_quota").Where("id = ?", id).First(&token).Error)
	return token.RemainQuota
}

func getTokenUsedQuota(t *testing.T, id int) int {
	t.Helper()
	var token model.Token
	require.NoError(t, model.DB.Select("used_quota").Where("id = ?", id).First(&token).Error)
	return token.UsedQuota
}

func getSubscriptionUsed(t *testing.T, id int) int64 {
	t.Helper()
	var sub model.UserSubscription
	require.NoError(t, model.DB.Select("amount_used").Where("id = ?", id).First(&sub).Error)
	return sub.AmountUsed
}

func getSubscriptionStatus(t *testing.T, id int) string {
	t.Helper()
	var sub model.UserSubscription
	require.NoError(t, model.DB.Select("status").Where("id = ?", id).First(&sub).Error)
	return sub.Status
}

func getLastLog(t *testing.T) *model.Log {
	t.Helper()
	var log model.Log
	err := model.LOG_DB.Order("id desc").First(&log).Error
	if err != nil {
		return nil
	}
	return &log
}

func getLastLogOther(t *testing.T) map[string]interface{} {
	t.Helper()
	log := getLastLog(t)
	require.NotNil(t, log)
	var other map[string]interface{}
	require.NoError(t, json.Unmarshal([]byte(log.Other), &other))
	return other
}

func countLogs(t *testing.T) int64 {
	t.Helper()
	var count int64
	model.LOG_DB.Model(&model.Log{}).Count(&count)
	return count
}

// ===========================================================================
// RefundTaskQuota tests
// ===========================================================================

func TestRefundTaskQuota_Wallet(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 1, 1, 1
	const initQuota, preConsumed = 10000, 3000
	const tokenRemain = 5000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-test-key", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)

	RefundTaskQuota(ctx, task, "task failed: upstream error")

	// User quota should increase by preConsumed
	assert.Equal(t, initQuota+preConsumed, getUserQuota(t, userID))

	// Token remain_quota should increase, used_quota should decrease
	assert.Equal(t, tokenRemain+preConsumed, getTokenRemainQuota(t, tokenID))
	assert.Equal(t, -preConsumed, getTokenUsedQuota(t, tokenID))

	// A refund log should be created
	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
	assert.Equal(t, preConsumed, log.Quota)
	assert.Equal(t, "test-model", log.ModelName)
}

func TestRefundTaskQuotaRecordsOriginNodeUnderAdminInfo(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, channelID = 112, 112
	seedUser(t, userID, 10000)
	seedChannel(t, channelID)
	task := makeTask(userID, channelID, 1200, 0, BillingSourceWallet, 0)
	task.PrivateData.NodeName = "origin-node-a"

	RefundTaskQuota(ctx, task, "upstream task failed")

	other := getLastLogOther(t)
	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, "origin-node-a", adminInfo["node_name"])
}

func TestRefundTaskQuota_Subscription(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID, subID = 2, 2, 2, 1
	const preConsumed = 2000
	const subTotal, subUsed int64 = 100000, 50000
	const tokenRemain = 8000

	seedUser(t, userID, 0)
	seedToken(t, tokenID, userID, "sk-sub-key", tokenRemain)
	seedChannel(t, channelID)
	seedSubscription(t, subID, userID, subTotal, subUsed)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceSubscription, subID)

	RefundTaskQuota(ctx, task, "subscription task failed")

	// Subscription used should decrease by preConsumed
	assert.Equal(t, subUsed-int64(preConsumed), getSubscriptionUsed(t, subID))

	// Token should also be refunded
	assert.Equal(t, tokenRemain+preConsumed, getTokenRemainQuota(t, tokenID))

	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
}

func TestRefundTaskQuota_ZeroQuota(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID = 3
	seedUser(t, userID, 5000)

	task := makeTask(userID, 0, 0, 0, BillingSourceWallet, 0)

	RefundTaskQuota(ctx, task, "zero quota task")

	// No change to user quota
	assert.Equal(t, 5000, getUserQuota(t, userID))

	// No log created
	assert.Equal(t, int64(0), countLogs(t))
}

func TestRefundTaskQuotaDiscountImage2UsesPublicLogName(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 30, 30, 30
	const initQuota, preConsumed = 10000, 3000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-discount-refund", 5000)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	task.Properties.OriginModelName = InternalDiscountImage2ModelName
	task.Properties.UpstreamModelName = "gpt-image-2"
	task.PrivateData.BillingContext.OriginModelName = InternalDiscountImage2ModelName

	RefundTaskQuota(ctx, task, "task failed")

	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
	assert.Equal(t, PublicDiscountImage2ModelName, log.ModelName)
	other := getLastLogOther(t)
	assert.NotContains(t, other, "is_model_mapped")
	assert.NotContains(t, other, "upstream_model_name")
}

func TestLogTaskConsumptionDiscountImage2UsesPublicLogName(t *testing.T) {
	truncate(t)
	gin.SetMode(gin.TestMode)

	const userID, tokenID, channelID = 31, 31, 31
	seedUser(t, userID, 10000)
	seedToken(t, tokenID, userID, "sk-discount-task", 5000)
	seedChannel(t, channelID)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/pg/images/tasks/generations", nil)
	c.Set("token_name", "system-image-token")
	c.Set("public_image_model_alias", PublicDiscountImage2ModelName)

	LogTaskConsumption(c, &relaycommon.RelayInfo{
		UserId:          userID,
		TokenId:         tokenID,
		OriginModelName: InternalDiscountImage2ModelName,
		UsingGroup:      "default",
		PriceData: types.PriceData{
			ModelPrice:     0.03,
			Quota:          2055,
			GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1},
		},
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelId:         channelID,
			UpstreamModelName: "gpt-image-2",
			IsModelMapped:     true,
		},
		TaskRelayInfo: &relaycommon.TaskRelayInfo{
			Action: "images.generations",
		},
	})

	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeConsume, log.Type)
	assert.Equal(t, PublicDiscountImage2ModelName, log.ModelName)
	other := getLastLogOther(t)
	assert.NotContains(t, other, "is_model_mapped")
	assert.NotContains(t, other, "upstream_model_name")
}

func TestPostTextConsumeQuotaDiscountImage2UsesPublicLogName(t *testing.T) {
	truncate(t)
	gin.SetMode(gin.TestMode)

	const userID, tokenID, channelID = 32, 32, 32
	seedUser(t, userID, 10000)
	seedToken(t, tokenID, userID, "sk-discount-text", 5000)
	seedChannel(t, channelID)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/pg/images/tasks/generations", nil)
	c.Set("token_name", "system-image-token")
	c.Set("public_image_model_alias", PublicDiscountImage2ModelName)

	PostTextConsumeQuota(c, &relaycommon.RelayInfo{
		UserId:            userID,
		TokenId:           tokenID,
		OriginModelName:   InternalDiscountImage2ModelName,
		StartTime:         time.Now().Add(-time.Second),
		FirstResponseTime: time.Now(),
		UsingGroup:        "default",
		PriceData: types.PriceData{
			UsePrice:       true,
			ModelPrice:     0.03,
			GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1},
		},
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelId:         channelID,
			UpstreamModelName: "gpt-image-2",
			IsModelMapped:     true,
		},
	}, &dto.Usage{
		PromptTokens:     1,
		CompletionTokens: 0,
		TotalTokens:      1,
	}, nil)

	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeConsume, log.Type)
	assert.Equal(t, PublicDiscountImage2ModelName, log.ModelName)
	other := getLastLogOther(t)
	assert.NotContains(t, other, "is_model_mapped")
	assert.NotContains(t, other, "upstream_model_name")
}

func TestImageBenefitPlaygroundTokenPreConsume(t *testing.T) {
	truncate(t)

	const userID, tokenID = 31, 31
	const quota = 120
	seedUser(t, userID, 0)
	seedToken(t, tokenID, userID, "benefit-playground-key", 1000)

	relayInfo := &relaycommon.RelayInfo{
		UserId:        userID,
		TokenId:       tokenID,
		TokenKey:      "benefit-playground-key",
		IsPlayground:  true,
		BillingSource: BillingSourceImageBenefit,
	}

	require.NoError(t, PreConsumeTokenQuota(relayInfo, quota))
	assert.Equal(t, 1000-quota, getTokenRemainQuota(t, tokenID))
}

func TestImageBenefitPlaygroundBillingSessionRefundsTokenQuota(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeOff))

	const userID, tokenID = 32, 32
	const quota = 90
	seedUser(t, userID, 0)
	seedToken(t, tokenID, userID, "benefit-session-key", 1000)

	relayInfo := &relaycommon.RelayInfo{
		UserId:          userID,
		TokenId:         tokenID,
		TokenKey:        "benefit-session-key",
		RequestId:       "benefit-session-refund",
		IsPlayground:    true,
		OriginModelName: model.ImageBenefitModelName,
		BillingSource:   BillingSourceImageBenefit,
	}
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Set("image_benefit_token", true)
	session, apiErr := NewBillingSession(context, relayInfo, quota)
	require.Nil(t, apiErr)
	assert.Equal(t, 1000-quota, getTokenRemainQuota(t, tokenID))

	session.Refund(nil)
	assert.Equal(t, 1000, getTokenRemainQuota(t, tokenID))
}

func TestPlaygroundWalletBillingSessionRefundsUserQuotaWithoutTokenQuota(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeOff))

	const userID = 33
	const initQuota = 1000
	const quota = 90
	seedUser(t, userID, initQuota)

	relayInfo := &relaycommon.RelayInfo{
		UserId:          userID,
		RequestId:       "playground-wallet-refund",
		OriginModelName: "gpt-ledger-test",
		IsPlayground:    true,
		UserSetting: dto.UserSetting{
			BillingPreference: "wallet_only",
		},
	}
	session, apiErr := NewBillingSession(newBillingLedgerTestContext(), relayInfo, quota)
	require.Nil(t, apiErr)
	assert.Equal(t, initQuota-quota, getUserQuota(t, userID))
	assert.True(t, session.NeedsRefund())

	session.Refund(nil)
	assert.Equal(t, initQuota, getUserQuota(t, userID))
}

func TestBillingSessionActiveBaselineAtomicallyRejectsConcurrentWalletOverdraft(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))

	const userID = 35
	const initialQuota = 100
	const reserveTarget = 80
	seedUser(t, userID, initialQuota)

	results := make(chan *types.NewAPIError, 2)
	var waitGroup sync.WaitGroup
	for index := 0; index < 2; index++ {
		waitGroup.Add(1)
		go func(requestIndex int) {
			defer waitGroup.Done()
			_, apiErr := NewBillingSession(newBillingLedgerTestContext(), &relaycommon.RelayInfo{
				UserId:          userID,
				RequestId:       fmt.Sprintf("concurrent-wallet-%d", requestIndex),
				IsPlayground:    true,
				OriginModelName: "gpt-ledger-test",
				UserSetting: dto.UserSetting{
					BillingPreference: "wallet_only",
				},
			}, reserveTarget)
			results <- apiErr
		}(index)
	}
	waitGroup.Wait()
	close(results)

	successes := 0
	insufficient := 0
	for apiErr := range results {
		if apiErr == nil {
			successes++
			continue
		}
		assert.Equal(t, types.ErrorCodeInsufficientUserQuota, apiErr.GetErrorCode())
		assert.Equal(t, http.StatusForbidden, apiErr.StatusCode)
		insufficient++
	}

	assert.Equal(t, 1, successes)
	assert.Equal(t, 1, insufficient)
	assert.Equal(t, initialQuota-reserveTarget, getUserQuota(t, userID))
}

func TestBillingSessionActiveBaselineAtomicallyRejectsConcurrentSubscriptionOverdraft(t *testing.T) {
	truncate(t)
	t.Setenv("BILLING_LEDGER_MODE", string(model.BillingLedgerModeActive))

	const userID = 36
	const planID = 36
	const subscriptionID = 36
	const totalQuota = 100
	const reserveTarget = 80
	seedUser(t, userID, 0)
	require.NoError(t, model.DB.Create(&model.SubscriptionPlan{
		Id:                 planID,
		Title:              "test subscription",
		Currency:           "CNY",
		Enabled:            true,
		TotalAmount:        totalQuota,
		MonthlyAmountTotal: totalQuota,
	}).Error)
	require.NoError(t, model.DB.Create(&model.UserSubscription{
		Id:                 subscriptionID,
		UserId:             userID,
		PlanId:             planID,
		AmountTotal:        totalQuota,
		MonthlyAmountTotal: totalQuota,
		Status:             "active",
		StartTime:          time.Now().Unix(),
		EndTime:            time.Now().Add(30 * 24 * time.Hour).Unix(),
	}).Error)

	results := make(chan *types.NewAPIError, 2)
	var waitGroup sync.WaitGroup
	for index := 0; index < 2; index++ {
		waitGroup.Add(1)
		go func(requestIndex int) {
			defer waitGroup.Done()
			_, apiErr := NewBillingSession(newBillingLedgerTestContext(), &relaycommon.RelayInfo{
				UserId:          userID,
				RequestId:       fmt.Sprintf("concurrent-subscription-%d", requestIndex),
				IsPlayground:    true,
				OriginModelName: "gpt-ledger-test",
				UserSetting: dto.UserSetting{
					BillingPreference: "subscription_only",
				},
			}, reserveTarget)
			results <- apiErr
		}(index)
	}
	waitGroup.Wait()
	close(results)

	successes := 0
	insufficient := 0
	for apiErr := range results {
		if apiErr == nil {
			successes++
			continue
		}
		assert.Equal(t, types.ErrorCodeInsufficientUserQuota, apiErr.GetErrorCode())
		assert.Equal(t, http.StatusForbidden, apiErr.StatusCode)
		insufficient++
	}

	assert.Equal(t, 1, successes)
	assert.Equal(t, 1, insufficient)
	var subscription model.UserSubscription
	require.NoError(t, model.DB.First(&subscription, subscriptionID).Error)
	assert.Equal(t, int64(reserveTarget), subscription.AmountUsed)
	assert.Equal(t, int64(reserveTarget), subscription.MonthlyAmountUsed)
}

func TestRefundSubscriptionPreConsumeRollsBackQuotaWhenRecordUpdateFails(t *testing.T) {
	epoch := time.Now().Add(-time.Minute).Unix()
	isolationDB, err := gorm.Open(
		sqlite.Open("file:refund_subscription_atomicity?mode=memory&cache=shared"),
		&gorm.Config{},
	)
	require.NoError(t, err)
	sqlDB, err := isolationDB.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(2)

	originalDB := model.DB
	model.DB = isolationDB
	t.Cleanup(func() {
		model.DB = originalDB
		require.NoError(t, sqlDB.Close())
	})

	require.NoError(t, isolationDB.AutoMigrate(
		&model.UserSubscription{},
		&model.SubscriptionPreConsumeRecord{},
	))
	require.NoError(t, isolationDB.Create(&model.UserSubscription{
		Id:                 37,
		UserId:             37,
		AmountTotal:        100,
		AmountUsed:         80,
		MonthlyAmountTotal: 100,
		MonthlyAmountUsed:  80,
		Status:             "active",
		StartTime:          epoch,
		EndTime:            time.Now().Add(30 * 24 * time.Hour).Unix(),
	}).Error)
	require.NoError(t, isolationDB.Create(&model.SubscriptionPreConsumeRecord{
		RequestId:          "refund-atomicity",
		UserId:             37,
		UserSubscriptionId: 37,
		PreConsumed:        40,
		ResetEpoch:         epoch,
		Status:             "consumed",
	}).Error)
	require.NoError(t, isolationDB.Exec(`
		CREATE TRIGGER fail_subscription_refund_record_update
		BEFORE UPDATE OF status ON subscription_pre_consume_records
		WHEN NEW.status = 'refunded'
		BEGIN
			SELECT RAISE(ABORT, 'forced refund record update failure');
		END;
	`).Error)

	require.Error(t, model.RefundSubscriptionPreConsume("refund-atomicity"))

	var subscription model.UserSubscription
	require.NoError(t, isolationDB.First(&subscription, 37).Error)
	assert.Equal(t, int64(80), subscription.AmountUsed)
	assert.Equal(t, int64(80), subscription.MonthlyAmountUsed)
	var record model.SubscriptionPreConsumeRecord
	require.NoError(t, isolationDB.Where("request_id = ?", "refund-atomicity").First(&record).Error)
	assert.Equal(t, "consumed", record.Status)
}

func TestBillingSessionSettlementRejectsMissingDurableOperation(t *testing.T) {
	session := &BillingSession{
		relayInfo:        &relaycommon.RelayInfo{UserId: 34},
		funding:          &WalletFunding{userId: 34},
		preConsumedQuota: 10,
	}

	require.EqualError(t, session.Settle(10), "durable billing operation is required for settlement")
}

func TestRefundTaskQuota_NoToken(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, channelID = 4, 4
	const initQuota, preConsumed = 10000, 1500

	seedUser(t, userID, initQuota)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, 0, BillingSourceWallet, 0) // TokenId=0

	RefundTaskQuota(ctx, task, "no token task failed")

	// User quota refunded
	assert.Equal(t, initQuota+preConsumed, getUserQuota(t, userID))

	// Log created
	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
}

// ===========================================================================
// RecalculateTaskQuota tests
// ===========================================================================

func TestRecalculate_PositiveDelta(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 10, 10, 10
	const initQuota, preConsumed = 10000, 2000
	const actualQuota = 3000 // under-charged by 1000
	const tokenRemain = 5000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-recalc-pos", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)

	RecalculateTaskQuota(ctx, task, actualQuota, "adaptor adjustment")

	// User quota should decrease by the delta (1000 additional charge)
	assert.Equal(t, initQuota-(actualQuota-preConsumed), getUserQuota(t, userID))

	// Token should also be charged the delta
	assert.Equal(t, tokenRemain-(actualQuota-preConsumed), getTokenRemainQuota(t, tokenID))

	// task.Quota should be updated to actualQuota
	assert.Equal(t, actualQuota, task.Quota)

	// Log type should be Consume (additional charge)
	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeConsume, log.Type)
	assert.Equal(t, actualQuota-preConsumed, log.Quota)
}

func TestRecalculate_PersistsQuotaBeforeFollowUpAccounting(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 110, 110, 110
	const initQuota, preConsumed, actualQuota = 10000, 2000, 3000
	const tokenRemain = 5000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-recalc-persist", tokenRemain)
	seedChannel(t, channelID)
	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	require.NoError(t, model.DB.Create(task).Error)

	RecalculateTaskQuota(ctx, task, actualQuota, "persist adjustment")

	var persisted model.Task
	require.NoError(t, model.DB.First(&persisted, task.ID).Error)
	require.Equal(t, actualQuota, persisted.Quota)
	require.Equal(t, initQuota-(actualQuota-preConsumed), getUserQuota(t, userID))
	require.Equal(t, tokenRemain-(actualQuota-preConsumed), getTokenRemainQuota(t, tokenID))

	RecalculateTaskQuota(ctx, &persisted, actualQuota, "idempotent replay")
	require.Equal(t, initQuota-(actualQuota-preConsumed), getUserQuota(t, userID))
	require.Equal(t, tokenRemain-(actualQuota-preConsumed), getTokenRemainQuota(t, tokenID))
}

func TestRecalculate_RecordsQuotaClampUnderAdminInfo(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, channelID = 111, 111
	seedUser(t, userID, common.MaxQuota)
	seedChannel(t, channelID)
	task := makeTask(userID, channelID, 1, 0, BillingSourceImageBenefit, 0)
	task.PrivateData.NodeName = "origin-node-b"
	clamp := &common.QuotaClamp{
		Op:       "QuotaFromFloat",
		Kind:     common.QuotaClampOverflow,
		Original: 1e30,
		Clamped:  common.MaxQuota,
	}

	RecalculateTaskQuota(ctx, task, common.MaxQuota, "saturated", clamp)

	other := getLastLogOther(t)
	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, "origin-node-b", adminInfo["node_name"])
	saturation, ok := adminInfo["quota_saturation"].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, common.QuotaClampOverflow, saturation["kind"])
}

func TestRecalculate_NegativeDelta(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 11, 11, 11
	const initQuota, preConsumed = 10000, 5000
	const actualQuota = 3000 // over-charged by 2000
	const tokenRemain = 5000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-recalc-neg", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)

	RecalculateTaskQuota(ctx, task, actualQuota, "adaptor adjustment")

	// User quota should increase by abs(delta) = 2000 (refund overpayment)
	assert.Equal(t, initQuota+(preConsumed-actualQuota), getUserQuota(t, userID))

	// Token should be refunded the difference
	assert.Equal(t, tokenRemain+(preConsumed-actualQuota), getTokenRemainQuota(t, tokenID))

	// task.Quota updated
	assert.Equal(t, actualQuota, task.Quota)

	// Log type should be Refund
	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
	assert.Equal(t, preConsumed-actualQuota, log.Quota)
}

func TestRecalculate_ZeroDelta(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID = 12
	const initQuota, preConsumed = 10000, 3000

	seedUser(t, userID, initQuota)

	task := makeTask(userID, 0, preConsumed, 0, BillingSourceWallet, 0)

	RecalculateTaskQuota(ctx, task, preConsumed, "exact match")

	// No change to user quota
	assert.Equal(t, initQuota, getUserQuota(t, userID))

	// No log created (delta is zero)
	assert.Equal(t, int64(0), countLogs(t))
}

func TestRecalculate_ActualQuotaZero(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID = 13
	const initQuota = 10000

	seedUser(t, userID, initQuota)

	task := makeTask(userID, 0, 5000, 0, BillingSourceWallet, 0)

	RecalculateTaskQuota(ctx, task, 0, "zero actual")

	// No change (early return)
	assert.Equal(t, initQuota, getUserQuota(t, userID))
	assert.Equal(t, int64(0), countLogs(t))
}

func TestRecalculate_Subscription_NegativeDelta(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID, subID = 14, 14, 14, 2
	const preConsumed = 5000
	const actualQuota = 2000 // over-charged by 3000
	const subTotal, subUsed int64 = 100000, 50000
	const tokenRemain = 8000

	seedUser(t, userID, 0)
	seedToken(t, tokenID, userID, "sk-sub-recalc", tokenRemain)
	seedChannel(t, channelID)
	seedSubscription(t, subID, userID, subTotal, subUsed)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceSubscription, subID)

	RecalculateTaskQuota(ctx, task, actualQuota, "subscription over-charge")

	// Subscription used should decrease by delta (refund 3000)
	assert.Equal(t, subUsed-int64(preConsumed-actualQuota), getSubscriptionUsed(t, subID))

	// Token refunded
	assert.Equal(t, tokenRemain+(preConsumed-actualQuota), getTokenRemainQuota(t, tokenID))

	assert.Equal(t, actualQuota, task.Quota)

	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
}

// ===========================================================================
// CAS + Billing integration tests
// Simulates the flow in updateVideoSingleTask (service/task_polling.go)
// ===========================================================================

// simulatePollBilling reproduces the CAS + billing logic from updateVideoSingleTask.
// It takes a persisted task (already in DB), applies the new status, and performs
// the conditional update + billing exactly as the polling loop does.
func simulatePollBilling(ctx context.Context, task *model.Task, newStatus model.TaskStatus, actualQuota int) {
	snap := task.Snapshot()

	shouldRefund := false
	shouldSettle := false
	quota := task.Quota

	task.Status = newStatus
	switch string(newStatus) {
	case model.TaskStatusSuccess:
		task.Progress = "100%"
		task.FinishTime = 9999
		shouldSettle = true
	case model.TaskStatusFailure:
		task.Progress = "100%"
		task.FinishTime = 9999
		task.FailReason = "upstream error"
		if quota != 0 {
			shouldRefund = true
		}
	default:
		task.Progress = "50%"
	}

	isDone := task.Status == model.TaskStatus(model.TaskStatusSuccess) || task.Status == model.TaskStatus(model.TaskStatusFailure)
	if isDone && snap.Status != task.Status {
		won, err := task.UpdateWithStatus(snap.Status)
		if err != nil {
			shouldRefund = false
			shouldSettle = false
		} else if !won {
			shouldRefund = false
			shouldSettle = false
		}
	} else if !snap.Equal(task.Snapshot()) {
		_, _ = task.UpdateWithStatus(snap.Status)
	}

	if shouldSettle && actualQuota > 0 {
		RecalculateTaskQuota(ctx, task, actualQuota, "test settle")
	}
	if shouldRefund {
		RefundTaskQuota(ctx, task, task.FailReason)
	}
}

func TestCASGuardedRefund_Win(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 20, 20, 20
	const initQuota, preConsumed = 10000, 4000
	const tokenRemain = 6000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-cas-refund-win", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	task.Status = model.TaskStatus(model.TaskStatusInProgress)
	require.NoError(t, model.DB.Create(task).Error)

	simulatePollBilling(ctx, task, model.TaskStatus(model.TaskStatusFailure), 0)

	// CAS wins: task in DB should now be FAILURE
	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	assert.EqualValues(t, model.TaskStatusFailure, reloaded.Status)

	// Refund should have happened
	assert.Equal(t, initQuota+preConsumed, getUserQuota(t, userID))
	assert.Equal(t, tokenRemain+preConsumed, getTokenRemainQuota(t, tokenID))

	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
}

func TestCASGuardedRefund_Lose(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 21, 21, 21
	const initQuota, preConsumed = 10000, 4000
	const tokenRemain = 6000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-cas-refund-lose", tokenRemain)
	seedChannel(t, channelID)

	// Create task with IN_PROGRESS in DB
	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	task.Status = model.TaskStatus(model.TaskStatusInProgress)
	require.NoError(t, model.DB.Create(task).Error)

	// Simulate another process already transitioning to FAILURE
	model.DB.Model(&model.Task{}).Where("id = ?", task.ID).Update("status", model.TaskStatusFailure)

	// Our process still has the old in-memory state (IN_PROGRESS) and tries to transition
	// task.Status is still IN_PROGRESS in the snapshot
	simulatePollBilling(ctx, task, model.TaskStatus(model.TaskStatusFailure), 0)

	// CAS lost: user quota should NOT change (no double refund)
	assert.Equal(t, initQuota, getUserQuota(t, userID))
	assert.Equal(t, tokenRemain, getTokenRemainQuota(t, tokenID))

	// No billing log should be created
	assert.Equal(t, int64(0), countLogs(t))
}

func TestCASGuardedSettle_Win(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 22, 22, 22
	const initQuota, preConsumed = 10000, 5000
	const actualQuota = 3000 // over-charged, should get partial refund
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-cas-settle-win", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	task.Status = model.TaskStatus(model.TaskStatusInProgress)
	require.NoError(t, model.DB.Create(task).Error)

	simulatePollBilling(ctx, task, model.TaskStatus(model.TaskStatusSuccess), actualQuota)

	// CAS wins: task should be SUCCESS
	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	assert.EqualValues(t, model.TaskStatusSuccess, reloaded.Status)

	// Settlement should refund the over-charge (5000 - 3000 = 2000 back to user)
	assert.Equal(t, initQuota+(preConsumed-actualQuota), getUserQuota(t, userID))
	assert.Equal(t, tokenRemain+(preConsumed-actualQuota), getTokenRemainQuota(t, tokenID))

	// task.Quota should be updated to actualQuota
	assert.Equal(t, actualQuota, task.Quota)
}

func TestNonTerminalUpdate_NoBilling(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, channelID = 23, 23
	const initQuota, preConsumed = 10000, 3000

	seedUser(t, userID, initQuota)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, 0, BillingSourceWallet, 0)
	task.Status = model.TaskStatus(model.TaskStatusInProgress)
	task.Progress = "20%"
	require.NoError(t, model.DB.Create(task).Error)

	// Simulate a non-terminal poll update (still IN_PROGRESS, progress changed)
	simulatePollBilling(ctx, task, model.TaskStatus(model.TaskStatusInProgress), 0)

	// User quota should NOT change
	assert.Equal(t, initQuota, getUserQuota(t, userID))

	// No billing log
	assert.Equal(t, int64(0), countLogs(t))

	// Task progress should be updated in DB
	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	assert.Equal(t, "50%", reloaded.Progress)
}

// ===========================================================================
// Mock adaptor for settleTaskBillingOnComplete tests
// ===========================================================================

type mockAdaptor struct {
	adjustReturn int
}

func (m *mockAdaptor) Init(_ *relaycommon.RelayInfo) {}
func (m *mockAdaptor) FetchTask(string, string, map[string]any, string) (*http.Response, error) {
	return nil, nil
}
func (m *mockAdaptor) FetchTaskWithContext(context.Context, string, string, map[string]any, string) (*http.Response, error) {
	return nil, nil
}
func (m *mockAdaptor) ParseTaskResult([]byte) (*relaycommon.TaskInfo, error) { return nil, nil }
func (m *mockAdaptor) AdjustBillingOnComplete(_ *model.Task, _ *relaycommon.TaskInfo) int {
	return m.adjustReturn
}

// ===========================================================================
// PerCallBilling tests — settleTaskBillingOnComplete
// ===========================================================================

func TestSettle_PerCallBilling_SkipsAdaptorAdjust(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 30, 30, 30
	const initQuota, preConsumed = 10000, 5000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-percall-adaptor", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	task.PrivateData.BillingContext.PerCallBilling = true

	adaptor := &mockAdaptor{adjustReturn: 2000}
	taskResult := &relaycommon.TaskInfo{Status: model.TaskStatusSuccess}

	settleTaskBillingOnComplete(ctx, adaptor, task, taskResult)

	// Per-call: no adjustment despite adaptor returning 2000
	assert.Equal(t, initQuota, getUserQuota(t, userID))
	assert.Equal(t, tokenRemain, getTokenRemainQuota(t, tokenID))
	assert.Equal(t, preConsumed, task.Quota)
	assert.Equal(t, int64(0), countLogs(t))
}

func TestSettle_PerCallBilling_SkipsTotalTokens(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 31, 31, 31
	const initQuota, preConsumed = 10000, 4000
	const tokenRemain = 7000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-percall-tokens", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	task.PrivateData.BillingContext.PerCallBilling = true

	adaptor := &mockAdaptor{adjustReturn: 0}
	taskResult := &relaycommon.TaskInfo{Status: model.TaskStatusSuccess, TotalTokens: 9999}

	settleTaskBillingOnComplete(ctx, adaptor, task, taskResult)

	// Per-call: no recalculation by tokens
	assert.Equal(t, initQuota, getUserQuota(t, userID))
	assert.Equal(t, tokenRemain, getTokenRemainQuota(t, tokenID))
	assert.Equal(t, preConsumed, task.Quota)
	assert.Equal(t, int64(0), countLogs(t))
}

func TestSettle_NonPerCall_AdaptorAdjustWorks(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 32, 32, 32
	const initQuota, preConsumed = 10000, 5000
	const adaptorQuota = 3000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-nonpercall-adj", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	// PerCallBilling defaults to false

	adaptor := &mockAdaptor{adjustReturn: adaptorQuota}
	taskResult := &relaycommon.TaskInfo{Status: model.TaskStatusSuccess}

	settleTaskBillingOnComplete(ctx, adaptor, task, taskResult)

	// Non-per-call: adaptor adjustment applies (refund 2000)
	assert.Equal(t, initQuota+(preConsumed-adaptorQuota), getUserQuota(t, userID))
	assert.Equal(t, tokenRemain+(preConsumed-adaptorQuota), getTokenRemainQuota(t, tokenID))
	assert.Equal(t, adaptorQuota, task.Quota)

	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
}

func TestCalculateTaskSuccessBillingIsSideEffectFree(t *testing.T) {
	truncate(t)
	const userID, tokenID, channelID = 40, 40, 40
	const currentUserQuota, currentTokenQuota = 7000, 6000
	const reservedQuota, desiredQuota = 5000, 3000
	seedUser(t, userID, currentUserQuota)
	seedToken(t, tokenID, userID, "sk-pure-task-billing", currentTokenQuota)
	seedChannel(t, channelID)
	task := makeTask(userID, channelID, reservedQuota, tokenID, BillingSourceWallet, 0)

	decision := calculateTaskSuccessBilling(
		&mockAdaptor{adjustReturn: desiredQuota},
		task,
		&relaycommon.TaskInfo{Status: model.TaskStatusSuccess},
	)

	require.Equal(t, desiredQuota, decision.DesiredQuota)
	require.Equal(t, reservedQuota, task.Quota)
	require.Equal(t, currentUserQuota, getUserQuota(t, userID))
	require.Equal(t, currentTokenQuota, getTokenRemainQuota(t, tokenID))
	require.Zero(t, countLogs(t))
}

func TestTaskBillingContextOverridesAreExplicit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())

	_, exists := ResolveTaskBillingOperationOverride(ctx)
	require.False(t, exists)
	_, exists = ResolveTaskBillingChargeDecision(ctx)
	require.False(t, exists)

	require.Error(t, SetTaskBillingOperationOverride(ctx, "", model.BillingLedgerModeActive, 123))
	require.Error(t, SetTaskBillingOperationOverride(ctx, " task:task_override", model.BillingLedgerModeActive, 123))
	require.Error(t, SetTaskBillingOperationOverride(ctx, "task:task_override", model.BillingLedgerModeActive, 0))
	require.NoError(t, SetTaskBillingOperationOverride(ctx, "task:task_override", model.BillingLedgerModeActive, 123))
	override, exists := ResolveTaskBillingOperationOverride(ctx)
	require.True(t, exists)
	require.Equal(t, "task:task_override", override.OperationKey)
	require.Equal(t, model.BillingLedgerModeActive, override.LedgerMode)
	require.Equal(t, int64(123), override.TaskRecordID)

	SetTaskBillingChargeDecision(ctx, false)
	chargeDecision, exists := ResolveTaskBillingChargeDecision(ctx)
	require.True(t, exists)
	require.False(t, chargeDecision)
}

func TestTaskBillingMetadataFailsClosedWhenInvalid(t *testing.T) {
	_, err := taskBillingOperationKey(&model.Task{
		TaskID: "task_expected",
		PrivateData: model.TaskPrivateData{
			BillingOperationKey: "task:task_other",
		},
	})
	require.Error(t, err)

	truncate(t)
	task := makeTask(49, 0, 0, 0, BillingSourceWallet, 0)
	task.TaskID = "task_invalid_ledger_mode"
	task.PrivateData.BillingOperationKey = "task:" + task.TaskID
	task.PrivateData.BillingLedgerMode = model.BillingLedgerMode("invalid")
	require.NoError(t, model.DB.Create(task).Error)
	task.Status = model.TaskStatusFailure
	won, err := PersistTaskTerminalFailure(
		context.Background(), task, model.TaskStatusInProgress, "public failure", "media_task_failed", true,
	)
	require.Error(t, err)
	require.False(t, won)
	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusInProgress), reloaded.Status)
}

func TestTaskBillingMissingOperationKeyFailsClosedForPartialDurableMetadata(t *testing.T) {
	testCases := []struct {
		name   string
		mutate func(*model.Task)
	}{
		{
			name: "ledger mode",
			mutate: func(task *model.Task) {
				task.PrivateData.BillingLedgerMode = model.BillingLedgerModeActive
			},
		},
		{
			name: "request id",
			mutate: func(task *model.Task) {
				task.PrivateData.BillingRequestID = "request-partial-metadata"
			},
		},
		{
			name: "charge token decision",
			mutate: func(task *model.Task) {
				task.PrivateData.BillingChargeTokenSet = true
			},
		},
	}

	for index, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			truncate(t)
			task := makeTask(60+index, 0, 0, 0, BillingSourceWallet, 0)
			task.TaskID = fmt.Sprintf("task_partial_metadata_%d", index)
			testCase.mutate(task)
			require.NoError(t, model.DB.Create(task).Error)
			task.Status = model.TaskStatusFailure

			won, err := PersistTaskTerminalFailure(
				context.Background(), task, model.TaskStatusInProgress, "public failure", "media_task_failed", true,
			)
			require.Error(t, err)
			require.False(t, won)
			var reloaded model.Task
			require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
			require.Equal(t, model.TaskStatus(model.TaskStatusInProgress), reloaded.Status)
		})
	}
}

func TestTaskBillingMissingOperationKeyFailsClosedWhenOperationExists(t *testing.T) {
	truncate(t)
	const userID = 63
	seedUser(t, userID, 1000)
	task := makeTask(userID, 0, 100, 0, BillingSourceWallet, 0)
	task.TaskID = "task_missing_operation_key"
	operationKey := prepareActiveTaskBillingOperation(t, task, false)

	task.PrivateData.BillingOperationKey = ""
	task.PrivateData.BillingLedgerMode = ""
	task.PrivateData.BillingRequestID = ""
	task.PrivateData.BillingChargeTokenSet = false
	require.NoError(t, model.DB.Model(task).Select("private_data").Updates(task).Error)
	task.Status = model.TaskStatusFailure

	won, err := PersistTaskTerminalFailure(
		context.Background(), task, model.TaskStatusInProgress, "public failure", "media_task_failed", true,
	)
	require.Error(t, err)
	require.Contains(t, err.Error(), "operation exists")
	require.False(t, won)
	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusInProgress), reloaded.Status)
	var operation model.BillingOperation
	require.NoError(t, model.DB.Where("operation_key = ?", operationKey).First(&operation).Error)
	require.Equal(t, model.BillingOutcomeOpen, operation.Outcome)
}

func prepareActiveTaskBillingOperation(t *testing.T, task *model.Task, chargeToken bool) string {
	t.Helper()
	operationKey, err := model.TaskBillingOperationKey(task.TaskID)
	require.NoError(t, err)
	task.PrivateData.BillingOperationKey = operationKey
	task.PrivateData.BillingLedgerMode = model.BillingLedgerModeActive
	task.PrivateData.BillingRequestID = "request-" + task.TaskID
	task.PrivateData.BillingChargeToken = chargeToken
	task.PrivateData.BillingChargeTokenSet = true
	require.NoError(t, model.DB.Create(task).Error)
	_, err = model.EnsureBillingOperationBaseline(model.BillingOperationBaseline{
		OperationKey:  operationKey,
		RequestID:     task.PrivateData.BillingRequestID,
		TaskID:        task.ID,
		Kind:          model.BillingOperationKindTask,
		UserID:        task.UserId,
		TokenID:       task.PrivateData.TokenId,
		FundingSource: task.PrivateData.BillingSource,
		FundingRefID:  task.PrivateData.SubscriptionId,
		ChargeToken:   chargeToken,
		ReservedQuota: int64(task.Quota),
		LedgerMode:    model.BillingLedgerModeActive,
	})
	require.NoError(t, err)
	return operationKey
}

func TestActiveUntrackedFreeTaskTransitionsWithoutLedger(t *testing.T) {
	truncate(t)
	task := makeTask(46, 0, 0, 0, BillingSourceWallet, 0)
	task.TaskID = "task_active_free_untracked"
	task.PrivateData.BillingOperationKey = "task:" + task.TaskID
	task.PrivateData.BillingLedgerMode = model.BillingLedgerModeActive
	require.NoError(t, model.DB.Create(task).Error)
	task.Status = model.TaskStatusFailure
	task.Progress = "100%"
	task.FailReason = "public failure"

	won, err := PersistTaskTerminalFailure(
		context.Background(),
		task,
		model.TaskStatusInProgress,
		task.FailReason,
		"media_task_failed",
		true,
	)
	require.NoError(t, err)
	require.True(t, won)
	require.Zero(t, countLogs(t))
	var operationCount int64
	require.NoError(t, model.DB.Model(&model.BillingOperation{}).Count(&operationCount).Error)
	require.Zero(t, operationCount)
	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusFailure), reloaded.Status)
	require.Zero(t, reloaded.Quota)
}

func TestActiveZeroTaskWithUnexpectedLedgerFailsClosed(t *testing.T) {
	truncate(t)
	const userID = 48
	seedUser(t, userID, 1000)
	task := makeTask(userID, 0, 0, 0, BillingSourceWallet, 0)
	task.TaskID = "task_active_zero_unexpected_ledger"
	task.PrivateData.BillingOperationKey = "task:" + task.TaskID
	task.PrivateData.BillingLedgerMode = model.BillingLedgerModeActive
	task.PrivateData.BillingRequestID = "request-" + task.TaskID
	require.NoError(t, model.DB.Create(task).Error)
	_, err := model.EnsureBillingOperationBaseline(model.BillingOperationBaseline{
		OperationKey:  task.PrivateData.BillingOperationKey,
		RequestID:     task.PrivateData.BillingRequestID,
		TaskID:        task.ID,
		Kind:          model.BillingOperationKindTask,
		UserID:        task.UserId,
		FundingSource: BillingSourceWallet,
		ReservedQuota: 0,
		LedgerMode:    model.BillingLedgerModeActive,
	})
	require.NoError(t, err)
	task.Status = model.TaskStatusFailure
	task.Progress = "100%"

	won, err := PersistTaskTerminalFailure(
		context.Background(),
		task,
		model.TaskStatusInProgress,
		"public failure",
		"media_task_failed",
		true,
	)
	require.Error(t, err)
	require.False(t, won)
	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusInProgress), reloaded.Status)
}

func TestActiveTrackedTaskWithoutChargeDecisionFailsClosed(t *testing.T) {
	truncate(t)
	task := makeTask(47, 0, 100, 0, BillingSourceWallet, 0)
	task.TaskID = "task_active_missing_charge_decision"
	task.PrivateData.BillingOperationKey = "task:" + task.TaskID
	task.PrivateData.BillingLedgerMode = model.BillingLedgerModeActive
	require.NoError(t, model.DB.Create(task).Error)
	task.Status = model.TaskStatusFailure
	task.Progress = "100%"

	won, err := PersistTaskTerminalFailure(
		context.Background(),
		task,
		model.TaskStatusInProgress,
		"public failure",
		"media_task_failed",
		true,
	)
	require.Error(t, err)
	require.False(t, won)
	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusInProgress), reloaded.Status)
	require.Equal(t, 100, reloaded.Quota)
}

func TestActiveTaskFailureCrashWindowReplaysFromOutbox(t *testing.T) {
	truncate(t)
	const userID, tokenID, channelID = 41, 41, 41
	const currentUserQuota, currentTokenQuota, reservedQuota = 7000, 6000, 4000
	seedUser(t, userID, currentUserQuota+reservedQuota)
	seedToken(t, tokenID, userID, "sk-active-failure-crash", currentTokenQuota+reservedQuota)
	seedChannel(t, channelID)
	task := makeTask(userID, channelID, reservedQuota, tokenID, BillingSourceWallet, 0)
	task.TaskID = "task_active_failure_crash"
	operationKey := prepareActiveTaskBillingOperation(t, task, true)
	task.Status = model.TaskStatusFailure
	task.Progress = "100%"
	task.FailReason = "public failure"

	persisted, err := persistTaskTerminalBillingStatus(
		context.Background(),
		task,
		model.TaskStatusInProgress,
		model.BillingOutcomeFailure,
		0,
		"media_task_failed",
	)
	require.NoError(t, err)
	require.True(t, persisted.Won)
	require.Equal(t, model.BillingLedgerModeActive, persisted.LedgerMode)
	require.Equal(t, currentUserQuota, getUserQuota(t, userID))
	require.Equal(t, currentTokenQuota, getTokenRemainQuota(t, tokenID))

	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusFailure), reloaded.Status)
	require.Equal(t, reservedQuota, reloaded.Quota)

	require.NoError(t, model.ProcessBillingOperationInline(operationKey))
	require.Equal(t, currentUserQuota+reservedQuota, getUserQuota(t, userID))
	require.Equal(t, currentTokenQuota+reservedQuota, getTokenRemainQuota(t, tokenID))
	require.NoError(t, model.ProcessBillingOperationInline(operationKey))
	require.Equal(t, currentUserQuota+reservedQuota, getUserQuota(t, userID))
	require.Equal(t, currentTokenQuota+reservedQuota, getTokenRemainQuota(t, tokenID))
}

func TestActiveTaskFailureSettlesOnceAndRecordsRefundIntent(t *testing.T) {
	truncate(t)
	const userID, tokenID, channelID = 44, 44, 44
	const currentUserQuota, currentTokenQuota, reservedQuota = 7000, 6000, 4000
	seedUser(t, userID, currentUserQuota+reservedQuota)
	seedToken(t, tokenID, userID, "sk-active-failure-log", currentTokenQuota+reservedQuota)
	seedChannel(t, channelID)
	task := makeTask(userID, channelID, reservedQuota, tokenID, BillingSourceWallet, 0)
	task.TaskID = "task_active_failure_log"
	operationKey := prepareActiveTaskBillingOperation(t, task, true)
	task.Status = model.TaskStatusFailure
	task.Progress = "100%"
	task.FailReason = "public failure"

	won, err := PersistTaskTerminalFailure(
		context.Background(),
		task,
		model.TaskStatusInProgress,
		task.FailReason,
		"media_task_failed",
		true,
	)
	require.NoError(t, err)
	require.True(t, won)
	require.Equal(t, currentUserQuota+reservedQuota, getUserQuota(t, userID))
	require.Equal(t, currentTokenQuota+reservedQuota, getTokenRemainQuota(t, tokenID))
	require.Equal(t, int64(1), countLogs(t))

	logEntry := getLastLog(t)
	require.NotNil(t, logEntry)
	require.Equal(t, model.LogTypeRefund, logEntry.Type)
	require.Equal(t, reservedQuota, logEntry.Quota)
	other := getLastLogOther(t)
	require.Equal(t, "ledger_outbox", other["billing_settlement"])
	require.Equal(t, "refund_intent", other["billing_effect"])
	require.Equal(t, operationKey, other["billing_operation_key"])

	require.NoError(t, model.ProcessBillingOperationInline(operationKey))
	require.Equal(t, currentUserQuota+reservedQuota, getUserQuota(t, userID))
	require.Equal(t, currentTokenQuota+reservedQuota, getTokenRemainQuota(t, tokenID))
	require.Equal(t, int64(1), countLogs(t))

	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	require.Equal(t, reservedQuota, reloaded.Quota)
}

func TestPersistTaskTerminalRejectsLegacyTerminalReplayBeforeRefund(t *testing.T) {
	truncate(t)
	const userID, quota = 66, 100
	seedUser(t, userID, 1000)
	task := makeTask(userID, 0, quota, 0, BillingSourceWallet, 0)
	task.TaskID = "task_realtime_terminal_replay"
	task.Status = model.TaskStatusSuccess
	require.NoError(t, model.DB.Create(task).Error)

	candidate := *task
	candidate.Status = model.TaskStatusFailure
	won, err := PersistTaskTerminalFailure(
		context.Background(), &candidate, model.TaskStatusSuccess,
		"late upstream failure", "media_task_failed", true,
	)
	require.Error(t, err)
	require.False(t, won)
	require.Equal(t, 1000, getUserQuota(t, userID))
	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusSuccess), reloaded.Status)
}

func TestActiveTaskTerminalIntentRollsBackStatusWhenOutboxWriteFails(t *testing.T) {
	truncate(t)
	const userID, channelID, reservedQuota = 42, 42, 4000
	seedUser(t, userID, 7000)
	seedChannel(t, channelID)
	task := makeTask(userID, channelID, reservedQuota, 0, BillingSourceWallet, 0)
	task.TaskID = "task_active_outbox_rollback"
	prepareActiveTaskBillingOperation(t, task, false)
	require.NoError(t, model.DB.Exec(`
		CREATE TRIGGER fail_task_billing_outbox_insert
		BEFORE INSERT ON billing_outbox
		BEGIN
			SELECT RAISE(FAIL, 'forced outbox failure');
		END
	`).Error)
	t.Cleanup(func() { model.DB.Exec("DROP TRIGGER IF EXISTS fail_task_billing_outbox_insert") })
	task.Status = model.TaskStatusFailure
	task.Progress = "100%"

	persisted, err := persistTaskTerminalBillingStatus(
		context.Background(),
		task,
		model.TaskStatusInProgress,
		model.BillingOutcomeFailure,
		0,
		"media_task_failed",
	)
	require.Error(t, err)
	require.False(t, persisted.Won)

	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusInProgress), reloaded.Status)
	require.Equal(t, reservedQuota, reloaded.Quota)
}

func TestActiveTaskSuccessCASWinnerSettlesOnce(t *testing.T) {
	truncate(t)
	const userID, tokenID, channelID = 43, 43, 43
	const currentUserQuota, currentTokenQuota = 7000, 6000
	const reservedQuota, desiredQuota = 5000, 3000
	seedUser(t, userID, currentUserQuota+reservedQuota)
	seedToken(t, tokenID, userID, "sk-active-success-cas", currentTokenQuota+reservedQuota)
	seedChannel(t, channelID)
	task := makeTask(userID, channelID, reservedQuota, tokenID, BillingSourceWallet, 0)
	task.TaskID = "task_active_success_cas"
	prepareActiveTaskBillingOperation(t, task, true)
	staleTask := *task
	task.Status = model.TaskStatusSuccess
	task.Progress = "100%"
	staleTask.Status = model.TaskStatusSuccess
	staleTask.Progress = "100%"

	won, err := PersistTaskTerminalSuccess(
		context.Background(),
		task,
		model.TaskStatusInProgress,
		desiredQuota,
		"test success",
	)
	require.NoError(t, err)
	require.True(t, won)
	won, err = PersistTaskTerminalSuccess(
		context.Background(),
		&staleTask,
		model.TaskStatusInProgress,
		desiredQuota,
		"test success replay",
	)
	require.NoError(t, err)
	require.False(t, won)
	require.Equal(t, currentUserQuota+(reservedQuota-desiredQuota), getUserQuota(t, userID))
	require.Equal(t, currentTokenQuota+(reservedQuota-desiredQuota), getTokenRemainQuota(t, tokenID))
	require.Zero(t, getUserUsedQuota(t, userID))
	require.Equal(t, int64(1), countLogs(t))
	logEntry := getLastLog(t)
	require.NotNil(t, logEntry)
	require.Equal(t, model.LogTypeRefund, logEntry.Type)
	require.Equal(t, reservedQuota-desiredQuota, logEntry.Quota)
	other := getLastLogOther(t)
	require.Equal(t, "ledger_outbox", other["billing_settlement"])
	require.Equal(t, "settlement_intent", other["billing_effect"])
	require.Equal(t, float64(reservedQuota), other["pre_consumed_quota"])
	require.Equal(t, float64(desiredQuota), other["actual_quota"])

	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusSuccess), reloaded.Status)
	require.Equal(t, desiredQuota, reloaded.Quota)
}

func TestActiveTaskSuccessAdditionalChargeUpdatesUsageAndLogOnce(t *testing.T) {
	truncate(t)
	const userID, tokenID, channelID = 45, 45, 45
	const currentUserQuota, currentTokenQuota = 9000, 8000
	const reservedQuota, desiredQuota = 3000, 5000
	seedUser(t, userID, currentUserQuota+reservedQuota)
	seedToken(t, tokenID, userID, "sk-active-success-charge", currentTokenQuota+reservedQuota)
	seedChannel(t, channelID)
	task := makeTask(userID, channelID, reservedQuota, tokenID, BillingSourceWallet, 0)
	task.TaskID = "task_active_success_charge"
	operationKey := prepareActiveTaskBillingOperation(t, task, true)
	task.Status = model.TaskStatusSuccess
	task.Progress = "100%"
	clamp := &common.QuotaClamp{
		Op:       "QuotaFromFloat",
		Kind:     common.QuotaClampOverflow,
		Original: 1e30,
		Clamped:  desiredQuota,
	}

	won, err := PersistTaskTerminalSuccess(
		context.Background(),
		task,
		model.TaskStatusInProgress,
		desiredQuota,
		"test additional charge",
		clamp,
	)
	require.NoError(t, err)
	require.True(t, won)
	require.Equal(t, currentUserQuota-(desiredQuota-reservedQuota), getUserQuota(t, userID))
	require.Equal(t, currentTokenQuota-(desiredQuota-reservedQuota), getTokenRemainQuota(t, tokenID))
	require.Equal(t, desiredQuota-reservedQuota, getUserUsedQuota(t, userID))
	require.Equal(t, int64(1), countLogs(t))

	logEntry := getLastLog(t)
	require.NotNil(t, logEntry)
	require.Equal(t, model.LogTypeConsume, logEntry.Type)
	require.Equal(t, desiredQuota-reservedQuota, logEntry.Quota)
	other := getLastLogOther(t)
	require.Equal(t, "ledger_outbox", other["billing_settlement"])
	require.Equal(t, "settlement_intent", other["billing_effect"])
	require.Equal(t, operationKey, other["billing_operation_key"])
	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok)
	saturation, ok := adminInfo["quota_saturation"].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, common.QuotaClampOverflow, saturation["kind"])

	require.NoError(t, model.ProcessBillingOperationInline(operationKey))
	require.Equal(t, currentUserQuota-(desiredQuota-reservedQuota), getUserQuota(t, userID))
	require.Equal(t, currentTokenQuota-(desiredQuota-reservedQuota), getTokenRemainQuota(t, tokenID))
	require.Equal(t, desiredQuota-reservedQuota, getUserUsedQuota(t, userID))
	require.Equal(t, int64(1), countLogs(t))
}
