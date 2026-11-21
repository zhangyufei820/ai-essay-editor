package controller

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type seedreamReservationTestTransport func(*http.Request) (*http.Response, error)

func (f seedreamReservationTestTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestSeedreamImageTaskReservesSelectedChannelBeforeDispatch(t *testing.T) {
	oldDB, oldMemoryCache := model.DB, common.MemoryCacheEnabled
	t.Cleanup(func() {
		common.MemoryCacheEnabled = oldMemoryCache
		if oldMemoryCache && oldDB != nil {
			model.InitChannelCache()
		}
	})
	db := setupSeedreamReconcileTest(t)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}))
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", t.TempDir())

	const userID, channelID, initialQuota = 81, 37, 100_000
	user := model.User{Id: userID, Username: "seedream-owner", Status: common.UserStatusEnabled,
		Role: common.RoleCommonUser, Quota: initialQuota, Group: "default", Setting: `{"billing_preference":"wallet_only"}`}
	require.NoError(t, db.Create(&user).Error)
	channel := model.Channel{Id: channelID, Status: common.ChannelStatusEnabled, Type: constant.ChannelTypeOpenAI,
		Name: "seedream-test", BaseURL: common.GetPointer("https://provider.example"), Key: "test-key",
		Models: dto.Seedream55Model, Group: user.Group, Priority: common.GetPointer(int64(1))}
	require.NoError(t, db.Create(&channel).Error)
	require.NoError(t, channel.AddAbilities(nil))
	common.MemoryCacheEnabled = true
	model.InitChannelCache()

	body := `{"model":"` + dto.Seedream55Model + `","prompt":"test image","size":"1K"}`
	requestFile := filepath.Join(t.TempDir(), "request.json")
	require.NoError(t, os.WriteFile(requestFile, []byte(body), 0o600))
	payload := playgroundImageTaskPayload{Model: dto.Seedream55Model, RequestID: "seedream-relay-reservation",
		RequestFile: requestFile, RequestPath: "/pg/images/generations", ContentType: "application/json"}
	task := model.Task{TaskID: "test-seedream-relay-reservation", UserId: userID,
		Platform: constant.TaskPlatformPlaygroundImage, Status: model.TaskStatusSubmitted, SubmitTime: time.Now().Unix(), Group: user.Group}
	task.SetData(payload)
	require.NoError(t, db.Create(&task).Error)

	var imageBytes bytes.Buffer
	require.NoError(t, png.Encode(&imageBytes, image.NewRGBA(image.Rect(0, 0, 1, 1))))
	providerBody := `{"data":[{"b64_json":"` + base64.StdEncoding.EncodeToString(imageBytes.Bytes()) + `"}]}`
	client := service.GetHttpClient()
	if client == nil {
		client = http.DefaultClient
	}
	previousTransport := client.Transport
	t.Cleanup(func() { client.Transport = previousTransport })
	calls := 0
	client.Transport = seedreamReservationTestTransport(func(req *http.Request) (*http.Response, error) {
		calls++
		require.Equal(t, "/v1/images/generations", req.URL.Path)
		var stored model.Task
		require.NoError(t, db.First(&stored, task.ID).Error)
		require.Equal(t, channelID, stored.ChannelId)
		require.Equal(t, service.BillingSourceWallet, stored.PrivateData.BillingSource)
		require.Positive(t, stored.Quota)
		var owner model.User
		require.NoError(t, db.First(&owner, userID).Error)
		require.Equal(t, initialQuota-stored.Quota, owner.Quota)
		return &http.Response{
			StatusCode: http.StatusOK, Header: http.Header{"Content-Type": {"application/json"}},
			Body: io.NopCloser(strings.NewReader(providerBody)),
		}, nil
	})

	runPlaygroundImageTask(task.TaskID, userID, user.Username, user.Role, user.Group, user.Group, "")
	require.Equal(t, 1, calls)
	require.NoError(t, db.First(&task, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusSuccess), task.Status, task.FailReason)
	require.NotEmpty(t, task.PrivateData.ResultURL)
	require.Positive(t, task.Quota)
	require.NoError(t, db.First(&user, userID).Error)
	require.Equal(t, initialQuota-task.Quota, user.Quota)
	require.Equal(t, 1, user.RequestCount)
}

func setupSeedreamReconcileTest(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "tasks.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Task{}, &model.User{}, &model.Token{}, &model.Log{}))
	sqlDB, err := db.DB()
	require.NoError(t, err)
	oldDB, oldLogDB, oldRedisEnabled := model.DB, model.LOG_DB, common.RedisEnabled
	model.DB, model.LOG_DB, common.RedisEnabled = db, db, false
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.RedisEnabled = oldDB, oldLogDB, oldRedisEnabled
		_ = sqlDB.Close()
	})
	return db
}

func createSeedreamReconcileTask(t *testing.T, db *gorm.DB, status model.TaskStatus, quota int) *model.Task {
	t.Helper()
	task := &model.Task{
		TaskID: "task-seedream-reconciliation", Platform: constant.TaskPlatformPlaygroundImage,
		UserId: 81, Action: constant.TaskActionImageGenerate, Status: status, Progress: "50%",
		ChannelId: 15, Quota: quota, Properties: model.Properties{OriginModelName: dto.Seedream55Model},
		PrivateData: model.TaskPrivateData{BillingSource: "wallet", TokenId: 55},
	}
	task.SetData(playgroundImageTaskPayload{Model: dto.Seedream55Model, RequestID: "seedream-reconcile"})
	require.NoError(t, db.Create(task).Error)
	return task
}

func TestSeedreamPendingMarkerPreservesPersistedReservation(t *testing.T) {
	db := setupSeedreamReconcileTest(t)
	task := createSeedreamReconcileTask(t, db, model.TaskStatusInProgress, 0)
	staleWorkerTask := *task
	persistedBilling := task.PrivateData
	persistedBilling.TokenId = 73
	require.NoError(t, db.Model(task).Updates(map[string]any{
		"quota": 600, "channel_id": 19, "private_data": persistedBilling,
	}).Error)

	require.True(t, markSeedreamImageTaskPending(&staleWorkerTask))
	var after model.Task
	require.NoError(t, db.First(&after, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusUnknown), after.Status)
	require.Equal(t, 600, after.Quota)
	require.Equal(t, 19, after.ChannelId)
	require.Equal(t, persistedBilling, after.PrivateData)
	require.Equal(t, seedreamPendingMessage, after.FailReason)
	require.False(t, markSeedreamImageTaskPending(&staleWorkerTask))
}

func TestSeedreamConfirmedUndeliverableRefundsReservationOnce(t *testing.T) {
	db := setupSeedreamReconcileTest(t)
	const reserved = 600
	task := createSeedreamReconcileTask(t, db, model.TaskStatusUnknown, reserved)
	user := &model.User{Id: task.UserId, Username: "seedream-owner", Quota: 1000}
	token := &model.Token{Id: task.PrivateData.TokenId, UserId: task.UserId, Key: "synthetic-task-token", RemainQuota: 200, UsedQuota: reserved}
	require.NoError(t, db.Create(user).Error)
	require.NoError(t, db.Create(token).Error)

	router := gin.New()
	router.POST("/api/task/seedream/:task_id/resolve-refund", func(c *gin.Context) {
		c.Set("id", 1)
		ResolveSeedreamImageTaskRefund(c)
	})
	resolve := func(body string) bool {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, "/api/task/seedream/"+task.TaskID+"/resolve-refund", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, req)
		require.Equal(t, http.StatusOK, recorder.Code)
		var result struct {
			Success bool `json:"success"`
		}
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &result))
		return result.Success
	}
	checkBalances := func(quota, remain, used int, refundCount int64) {
		t.Helper()
		require.NoError(t, db.First(user, user.Id).Error)
		require.NoError(t, db.First(token, token.Id).Error)
		require.Equal(t, quota, user.Quota)
		require.Equal(t, remain, token.RemainQuota)
		require.Equal(t, used, token.UsedQuota)
		var refunds int64
		require.NoError(t, db.Model(&model.Log{}).Where("type = ? AND user_id = ?", model.LogTypeRefund, user.Id).Count(&refunds).Error)
		require.Equal(t, refundCount, refunds)
	}

	require.False(t, resolve("{\"confirmed_undeliverable\":false}"))
	checkBalances(1000, 200, reserved, 0)

	require.True(t, resolve("{\"confirmed_undeliverable\":true}"))
	require.False(t, resolve("{\"confirmed_undeliverable\":true}"))
	checkBalances(1600, 800, 0, 1)
	var after model.Task
	require.NoError(t, db.First(&after, task.ID).Error)
	require.Equal(t, model.TaskStatus(model.TaskStatusFailure), after.Status)
	require.Zero(t, after.Quota)
	require.NotNil(t, after.PrivateData.BillingAdjustment)
	require.True(t, after.PrivateData.BillingAdjustment.Applied)
	require.True(t, after.PrivateData.BillingAdjustment.Logged)
}
