package middleware

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestMain(m *testing.M) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		panic("failed to open test db: " + err.Error())
	}
	sqlDB, err := db.DB()
	if err != nil {
		panic("failed to get sql DB: " + err.Error())
	}
	sqlDB.SetMaxOpenConns(1)

	model.DB = db
	model.LOG_DB = db
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	if err := db.AutoMigrate(&model.Task{}, &model.User{}); err != nil {
		panic("failed to migrate test db: " + err.Error())
	}

	os.Exit(m.Run())
}

func TestApplyPlaygroundTextPricingPreferenceOverridesStaleClientGroup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	redisEnabled := common.RedisEnabled
	common.RedisEnabled = false
	t.Cleanup(func() { common.RedisEnabled = redisEnabled })
	user := model.User{
		Username: "middleware-pricing-sync",
		Password: "password-for-test",
		Status:   common.UserStatusEnabled,
		Group:    model.TextPricingGroupDefault,
	}
	setting := user.GetSetting()
	setting.TextPricingGroup = model.TextPricingGroupDiscount
	user.SetSetting(setting)
	if err := model.DB.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() { model.DB.Delete(&model.User{}, user.Id) })

	assertGroup := func(requestedGroup, wantGroup string) {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
		ctx.Set("id", user.Id)
		common.SetContextKey(ctx, constant.ContextKeyUsingGroup, requestedGroup)
		modelRequest := &ModelRequest{Model: "gpt-5.5", Group: requestedGroup}

		got, err := applyPlaygroundTextPricingPreference(ctx, modelRequest)
		if err != nil {
			t.Fatalf("apply preference: %v", err)
		}
		if got != wantGroup || modelRequest.Group != wantGroup {
			t.Fatalf("group = %q request group = %q, want %q", got, modelRequest.Group, wantGroup)
		}
		if usingGroup := common.GetContextKeyString(ctx, constant.ContextKeyUsingGroup); usingGroup != wantGroup {
			t.Fatalf("using group = %q, want %q", usingGroup, wantGroup)
		}
		if tokenGroup := common.GetContextKeyString(ctx, constant.ContextKeyTokenGroup); tokenGroup != wantGroup {
			t.Fatalf("token group = %q, want %q", tokenGroup, wantGroup)
		}
		if header := recorder.Header().Get("X-Aiphui-Pricing-Group"); header != wantGroup {
			t.Fatalf("pricing header = %q, want %q", header, wantGroup)
		}
	}

	assertGroup(model.TextPricingGroupDefault, model.TextPricingGroupDiscount)
	setting.TextPricingGroup = model.TextPricingGroupDefault
	if err := model.UpdateUserSetting(user.Id, setting); err != nil {
		t.Fatalf("update preference: %v", err)
	}
	assertGroup(model.TextPricingGroupDiscount, model.TextPricingGroupDefault)
}

func truncateMiddlewareTestDB(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		model.DB.Exec("DELETE FROM tasks")
	})
}

func TestNormalizeImageEndpointModelRequestMapsPlaygroundRawGPTImage2(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", bytes.NewBufferString(`{"model":"gpt-image-2"}`))
	modelRequest := &ModelRequest{Model: "gpt-image-2"}

	normalizeImageEndpointModelRequest(ctx, modelRequest)

	if modelRequest.Model != "gpt-image-2-4K" {
		t.Fatalf("model = %q, want gpt-image-2-4K", modelRequest.Model)
	}
}

func TestNormalizeImageEndpointModelRequestMapsV1GenerationRawGPTImage2(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewBufferString(`{"model":"gpt-image-2"}`))
	modelRequest := &ModelRequest{Model: "gpt-image-2"}

	normalizeImageEndpointModelRequest(ctx, modelRequest)

	if modelRequest.Model != "gpt-image-2-4K" {
		t.Fatalf("model = %q, want gpt-image-2-4K", modelRequest.Model)
	}
}

func TestNormalizeImageEndpointModelRequestMapsV1EditRawGPTImage2(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", bytes.NewBufferString(`{"model":"gpt-image-2"}`))
	modelRequest := &ModelRequest{Model: "gpt-image-2"}

	normalizeImageEndpointModelRequest(ctx, modelRequest)

	if modelRequest.Model != "gpt-image-2-4K" {
		t.Fatalf("model = %q, want gpt-image-2-4K", modelRequest.Model)
	}
}

func TestNormalizeImageEndpointModelRequestMapsDiscountImage2PublicAlias(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewBufferString(`{"model":"特价 image-2"}`))
	modelRequest := &ModelRequest{Model: "特价 image-2"}

	normalizeImageEndpointModelRequest(ctx, modelRequest)

	if modelRequest.Model != "geek2api-image-2" {
		t.Fatalf("model = %q, want geek2api-image-2", modelRequest.Model)
	}
	if publicAlias := PublicImageModelAliasForRequest(ctx); publicAlias != "特价 image-2" {
		t.Fatalf("public alias = %q, want 特价 image-2", publicAlias)
	}
}

func TestGetTaskOriginModelNameUsesPublicDiscountImage2Alias(t *testing.T) {
	truncateMiddlewareTestDB(t)
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodGet, "/v1/images/tasks/task_public_alias", nil)
	ctx.Params = gin.Params{{Key: "task_id", Value: "task_public_alias"}}
	ctx.Set("id", 1)
	common.SetContextKey(ctx, constant.ContextKeyTokenModelLimitEnabled, true)

	task := &model.Task{
		TaskID: "task_public_alias",
		UserId: 1,
		Properties: model.Properties{
			OriginModelName: "geek2api-image-2",
		},
	}
	if err := model.DB.Create(task).Error; err != nil {
		t.Fatalf("create task: %v", err)
	}

	if got := getTaskOriginModelName(ctx); got != "特价 image-2" {
		t.Fatalf("getTaskOriginModelName() = %q, want 特价 image-2", got)
	}
}

func TestGetModelRequestRejectsChatImageModelBeforeChannelSelection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewBufferString(`{"model":"gpt-image-2","messages":[]}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	_, _, err := getModelRequest(ctx)

	if err == nil {
		t.Fatal("getModelRequest() err = nil, want image model text endpoint rejection")
	}
	if !strings.Contains(err.Error(), "/v1/images/generations") || !strings.Contains(err.Error(), "/v1/images/edits") {
		t.Fatalf("error = %q, want image endpoint hints", err.Error())
	}
}

func TestGetModelRequestRejectsDiscountImage2TextEndpointWithoutSupplierLeak(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewBufferString(`{"model":"特价 image-2","messages":[]}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	_, _, err := getModelRequest(ctx)

	if err == nil {
		t.Fatal("getModelRequest() err = nil, want image model text endpoint rejection")
	}
	if strings.Contains(err.Error(), "geek2api") {
		t.Fatalf("error = %q, want no supplier model name", err.Error())
	}
	if !strings.Contains(err.Error(), "特价 image-2") {
		t.Fatalf("error = %q, want public model name", err.Error())
	}
	if !strings.Contains(err.Error(), "/v1/images/generations") || !strings.Contains(err.Error(), "/v1/images/edits") {
		t.Fatalf("error = %q, want image endpoint hints", err.Error())
	}
}

func TestGetModelRequestRejectsSupplierImageModelWithoutEchoingName(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewBufferString(`{"model":"geek2api-image-2","messages":[]}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	_, _, err := getModelRequest(ctx)

	if err == nil {
		t.Fatal("getModelRequest() err = nil, want image model text endpoint rejection")
	}
	if strings.Contains(err.Error(), "geek2api") {
		t.Fatalf("error = %q, want no supplier model name", err.Error())
	}
	if !strings.Contains(err.Error(), "/v1/images/generations") || !strings.Contains(err.Error(), "/v1/images/edits") {
		t.Fatalf("error = %q, want image endpoint hints", err.Error())
	}
}

func TestDistributeRejectsSupplierExposedModelWithoutEchoingName(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewBufferString(`{"model":"geek2api-image-2"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	Distribute()(ctx)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("response json error: %v", err)
	}
	body := recorder.Body.String()
	if strings.Contains(body, "geek2api") {
		t.Fatalf("response leaks supplier model name: %s", body)
	}
	if payload["error"] == nil {
		t.Fatalf("response missing error: %s", body)
	}
}
