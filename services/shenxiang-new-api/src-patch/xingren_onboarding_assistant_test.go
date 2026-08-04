package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestXingrenCodexTokenModelLimitsAddsPublic15KImageModel(t *testing.T) {
	got := xingrenCodexTokenModelLimits("gpt-5.4-mini")
	want := "gpt-5.4-mini,image 2电商商品图快速通道(1.5K)"
	if got != want {
		t.Fatalf("xingrenCodexTokenModelLimits() = %q, want %q", got, want)
	}
}

func TestXingrenCodexTokenModelLimitsFallsBackForInvalidTextModel(t *testing.T) {
	got := xingrenCodexTokenModelLimits("image 2电商商品图快速通道(1.5K)")
	want := "gpt-5.5,image 2电商商品图快速通道(1.5K)"
	if got != want {
		t.Fatalf("xingrenCodexTokenModelLimits() = %q, want %q", got, want)
	}
}

func TestXingrenCodexModelRejectsUnknownAsciiModel(t *testing.T) {
	got := xingrenCodexModel("geek2api-image-2")
	if got != xingrenCodexDefaultModel {
		t.Fatalf("xingrenCodexModel() = %q, want %q", got, xingrenCodexDefaultModel)
	}
}

func TestXingrenCodexTokenGroupDefaultsLegacyUserGroup(t *testing.T) {
	token := buildXingrenCodexUserToken(42, "test-key", "test-token", "gpt-5.5", "internal")
	if token.Group != "default" {
		t.Fatalf("token group = %q, want default", token.Group)
	}
	if token.CrossGroupRetry {
		t.Fatal("new Codex user token must not enable cross-group retry")
	}
}

func TestBuildXingrenCodexTokenResponseIncludesOwnerMetadata(t *testing.T) {
	token := &model.Token{Id: 9001, UserId: 201, Key: "test-key-abcdefghijklmnopqrstuvwxyz", Name: "月卡专用 Key"}

	response, err := buildXingrenCodexTokenResponse(201, token, "monthly_card", "subscription_only", "gpt-5.4-mini", "https://api.aiphui.top/v1")
	if err != nil {
		t.Fatalf("buildXingrenCodexTokenResponse() error = %v", err)
	}
	if response.AccountID != 201 || response.TokenOwnerID != 201 || response.TokenID != 9001 {
		t.Fatalf("unexpected ownership metadata: %+v", response)
	}
	if response.TokenType != "monthly_card" || response.BillingMode != "subscription_only" {
		t.Fatalf("unexpected token metadata: %+v", response)
	}
	if response.Key == "" || response.MaskedKey == "" || response.Key == response.MaskedKey {
		t.Fatalf("expected full and masked keys to differ: %+v", response)
	}
}

func TestBuildXingrenCodexTokenResponseRejectsCrossUserToken(t *testing.T) {
	token := &model.Token{Id: 9002, UserId: 202, Key: "test-key-abcdefghijklmnopqrstuvwxyz", Name: "星人 Codex 文本令牌"}

	_, err := buildXingrenCodexTokenResponse(201, token, "standard", "account_preference", "gpt-5.5", "https://api.aiphui.top/v1")
	if err == nil {
		t.Fatal("expected cross-user token ownership to be rejected")
	}
}

func TestBuildXingrenCodexTokenResponseRejectsInvalidBillingMetadata(t *testing.T) {
	token := &model.Token{Id: 9003, UserId: 203, Key: "test-key-abcdefghijklmnopqrstuvwxyz", Name: "月卡专用 Key"}

	_, err := buildXingrenCodexTokenResponse(203, token, "monthly_card", "account_preference", "gpt-5.5", "https://api.aiphui.top/v1")
	if err == nil {
		t.Fatal("expected invalid monthly-card billing metadata to be rejected")
	}
}

func TestBuildXingrenCodexTokenResponseRejectsEmptyKey(t *testing.T) {
	for _, key := range []string{"", " \t\n "} {
		token := &model.Token{Id: 9004, UserId: 204, Key: key, Name: "月卡专用 Key"}
		_, err := buildXingrenCodexTokenResponse(204, token, "monthly_card", "subscription_only", "gpt-5.5", "https://api.aiphui.top/v1")
		if err == nil {
			t.Fatal("expected empty token key to be rejected")
		}
	}
}

func TestXingrenCodexTokenNameIncludesAccountID(t *testing.T) {
	name := xingrenCodexTokenName(204)
	if !strings.Contains(name, "账户204") {
		t.Fatalf("xingrenCodexTokenName() = %q, want account id", name)
	}
}

func setupXingrenCodexTokenHandlerTestDB(t *testing.T) {
	t.Helper()
	originalDB := model.DB
	originalLogDB := model.LOG_DB
	originalRedisEnabled := common.RedisEnabled
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open handler test database: %v", err)
	}
	if err := db.AutoMigrate(&model.User{}, &model.Token{}, &model.SubscriptionPlan{}, &model.UserSubscription{}); err != nil {
		t.Fatalf("migrate handler test database: %v", err)
	}
	model.DB = db
	model.LOG_DB = nil
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB = originalDB
		model.LOG_DB = originalLogDB
		common.RedisEnabled = originalRedisEnabled
	})
}

func createXingrenCodexHandlerUser(t *testing.T, userID int, planID int, subscriptionID int, planTitle string, currency string, priceAmount float64) {
	t.Helper()
	if err := model.DB.Create(&model.User{
		Id:       userID,
		Username: fmt.Sprintf("codex-handler-user-%d", userID),
		AffCode:  fmt.Sprintf("codex-handler-aff-%d", userID),
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}).Error; err != nil {
		t.Fatalf("create handler user: %v", err)
	}
	if planID <= 0 {
		return
	}
	if err := model.DB.Create(&model.SubscriptionPlan{
		Id:          planID,
		Title:       planTitle,
		PriceAmount: priceAmount,
		Currency:    currency,
		Enabled:     true,
		TotalAmount: 1_000_000,
	}).Error; err != nil {
		t.Fatalf("create handler subscription plan: %v", err)
	}
	if err := model.DB.Create(&model.UserSubscription{
		Id:                 subscriptionID,
		UserId:             userID,
		PlanId:             planID,
		Status:             "active",
		StartTime:          time.Now().Add(-time.Hour).Unix(),
		EndTime:            time.Now().Add(30 * 24 * time.Hour).Unix(),
		MonthlyAmountTotal: 1_000_000,
	}).Error; err != nil {
		t.Fatalf("create handler subscription: %v", err)
	}
}

func callXingrenCodexTokenHandler(t *testing.T, userID int) (int, xingrenCodexTokenResponse) {
	return callXingrenCodexTokenRoute(t, userID, userID)
}

func callXingrenCodexTokenRoute(t *testing.T, sessionUserID int, headerUserID int) (int, xingrenCodexTokenResponse) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	t.Setenv("XINGREN_API_ONBOARDING_ASSISTANT", "true")
	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("xingren-codex-token-test-session-secret"))))
	router.Use(func(c *gin.Context) {
		session := sessions.Default(c)
		session.Set("username", fmt.Sprintf("codex-handler-user-%d", sessionUserID))
		session.Set("role", common.RoleCommonUser)
		session.Set("id", sessionUserID)
		session.Set("status", common.UserStatusEnabled)
		session.Set("group", "default")
		c.Next()
	})
	RegisterXingrenOnboardingAssistant(router)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/xingren-onboarding-assistant/codex-token", strings.NewReader(`{"model":"gpt-5.5"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("New-Api-User", fmt.Sprintf("%d", headerUserID))
	router.ServeHTTP(recorder, request)

	var response xingrenCodexTokenResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode handler response: %v", err)
	}
	return recorder.Code, response
}

func TestXingrenOnboardingCodexTokenHandlerRouteRejectsMismatchedAccount(t *testing.T) {
	setupXingrenCodexTokenHandlerTestDB(t)
	createXingrenCodexHandlerUser(t, 804, 904, 1004, "100元月卡", "CNY", 100)

	status, response := callXingrenCodexTokenRoute(t, 804, 15)
	if status != http.StatusUnauthorized || response.Success {
		t.Fatalf("mismatched account status=%d success=%v", status, response.Success)
	}
	var count int64
	if err := model.DB.Model(&model.Token{}).Where("user_id = ?", 804).Count(&count).Error; err != nil {
		t.Fatalf("count mismatched-account tokens: %v", err)
	}
	if count != 0 {
		t.Fatalf("token handler ran for mismatched account; token count=%d", count)
	}
}

func TestXingrenOnboardingCodexTokenHandlerUsesMonthlyCardToken(t *testing.T) {
	setupXingrenCodexTokenHandlerTestDB(t)
	createXingrenCodexHandlerUser(t, 801, 901, 1001, "100元月卡", "CNY", 100)

	status, response := callXingrenCodexTokenHandler(t, 801)
	if status != http.StatusOK || !response.Success {
		t.Fatalf("monthly-card handler status=%d success=%v", status, response.Success)
	}
	if response.AccountID != 801 || response.TokenOwnerID != 801 || response.TokenType != "monthly_card" || response.BillingMode != "subscription_only" {
		t.Fatal("monthly-card handler returned invalid ownership or billing metadata")
	}
	if response.TokenID <= 0 || response.Key == "" || response.MaskedKey == "" || response.Key == response.MaskedKey {
		t.Fatal("monthly-card handler returned invalid token fields")
	}
}

func TestXingrenOnboardingCodexTokenHandlerUsesStandardTokenForHighPriceNonMonthlyPlan(t *testing.T) {
	setupXingrenCodexTokenHandlerTestDB(t)
	createXingrenCodexHandlerUser(t, 802, 902, 1002, "企业年度套餐", "CNY", 50_000)

	status, response := callXingrenCodexTokenHandler(t, 802)
	if status != http.StatusOK || !response.Success {
		t.Fatalf("standard handler status=%d success=%v", status, response.Success)
	}
	if response.AccountID != 802 || response.TokenOwnerID != 802 || response.TokenType != "standard" || response.BillingMode != "account_preference" {
		t.Fatal("standard handler returned invalid ownership or billing metadata")
	}
	if !strings.Contains(response.TokenName, "账户802") {
		t.Fatal("standard handler token name does not identify its account")
	}
}

func TestXingrenOnboardingCodexTokenHandlerRejectsDisabledMonthlyCardToken(t *testing.T) {
	setupXingrenCodexTokenHandlerTestDB(t)
	createXingrenCodexHandlerUser(t, 803, 903, 1003, "100元月卡", "CNY", 100)
	disabled := service.BuildMonthlyCardToken(803, "disabled-handler-monthly-key")
	disabled.Status = common.TokenStatusDisabled
	if err := model.DB.Create(&disabled).Error; err != nil {
		t.Fatalf("create disabled monthly-card token: %v", err)
	}

	status, response := callXingrenCodexTokenHandler(t, 803)
	if status != http.StatusConflict || response.Success {
		t.Fatalf("disabled-token handler status=%d success=%v", status, response.Success)
	}
	var count int64
	if err := model.DB.Model(&model.Token{}).Where("user_id = ?", 803).Count(&count).Error; err != nil {
		t.Fatalf("count disabled user tokens: %v", err)
	}
	if count != 1 {
		t.Fatalf("disabled monthly-card token was replaced; token count=%d", count)
	}
}

func TestXingrenCodexFrontendRejectsInvalidPayloadBeforeConfiguration(t *testing.T) {
	source, err := os.ReadFile("web/xingren-api-onboarding-assistant.js")
	if err != nil {
		t.Fatalf("read onboarding assistant source: %v", err)
	}
	text := string(source)
	for _, marker := range []string{
		"function validateCodexTokenPayload(payload, userId)",
		"return validateCodexTokenPayload(payload, userId);",
		"state.generatedKey = \"\";",
		"state.generatedKey = payload.key;",
	} {
		if !strings.Contains(text, marker) {
			t.Fatalf("onboarding assistant is missing fail-closed marker %q", marker)
		}
	}
	resetIndex := strings.Index(text, "state.generatedKey = \"\";")
	requestIndex := strings.Index(text, "createCodexToken(state.selectedModel)")
	acceptIndex := strings.Index(text, "state.generatedKey = payload.key;")
	if resetIndex < 0 || requestIndex < 0 || acceptIndex < 0 || resetIndex >= requestIndex || requestIndex >= acceptIndex {
		t.Fatal("onboarding assistant can enter configured state before payload validation")
	}
}
