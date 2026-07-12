package middleware

import (
	"bytes"
	"encoding/json"
	"errors"
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
	if err := db.AutoMigrate(&model.Task{}); err != nil {
		panic("failed to migrate test db: " + err.Error())
	}

	os.Exit(m.Run())
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

func TestDistributorUnavailableMessageNeverEchoesSelectionDetails(t *testing.T) {
	message := distributorUnavailablePublicMessage(
		"geek2api-image-2",
		"internal-premium-group",
		errors.New("selector failed with bearer sk-secret"),
	)

	for _, secret := range []string{"geek2api", "internal-premium-group", "sk-secret", "selector failed"} {
		if strings.Contains(message, secret) {
			t.Fatalf("public message %q leaks %q", message, secret)
		}
	}
}

func TestChannelSupportsRequestPathRejectsUnconfiguredAdvancedCustomPath(t *testing.T) {
	channel := &model.Channel{
		Type:          constant.ChannelTypeAdvancedCustom,
		OtherSettings: `{"advanced_custom":{"advanced_routes":[{"incoming_path":"/v1/messages"}]}}`,
	}

	if !channelSupportsRequestPath(channel, "/v1/messages") {
		t.Fatal("configured advanced custom path should be supported")
	}
	if channelSupportsRequestPath(channel, "/v1/chat/completions") {
		t.Fatal("unconfigured advanced custom path must be rejected")
	}
}

func TestChannelSupportsRequestPathAllowsStandardChannels(t *testing.T) {
	channel := &model.Channel{Type: constant.ChannelTypeOpenAI}
	if !channelSupportsRequestPath(channel, "/v1/chat/completions") {
		t.Fatal("standard channels should not be path-filtered")
	}
}
