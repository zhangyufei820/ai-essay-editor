package controller

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type oauthConsentTestProvider struct {
	existingUser *model.User
}

func (provider *oauthConsentTestProvider) GetName() string { return "ConsentTest" }
func (provider *oauthConsentTestProvider) IsEnabled() bool { return true }
func (provider *oauthConsentTestProvider) ExchangeToken(context.Context, string, *gin.Context) (*oauth.OAuthToken, error) {
	return nil, nil
}
func (provider *oauthConsentTestProvider) GetUserInfo(context.Context, *oauth.OAuthToken) (*oauth.OAuthUser, error) {
	return nil, nil
}
func (provider *oauthConsentTestProvider) IsUserIDTaken(string) bool {
	return provider.existingUser != nil
}
func (provider *oauthConsentTestProvider) FillUserByProviderID(user *model.User, _ string) error {
	*user = *provider.existingUser
	return nil
}
func (provider *oauthConsentTestProvider) SetProviderUserID(*model.User, string) {}
func (provider *oauthConsentTestProvider) GetProviderPrefix() string             { return "consent_" }

type oauthLegacyMigrationTestProvider struct {
	legacyID string
	user     *model.User
}

func (provider *oauthLegacyMigrationTestProvider) GetName() string { return "GitHub" }
func (provider *oauthLegacyMigrationTestProvider) IsEnabled() bool { return true }
func (provider *oauthLegacyMigrationTestProvider) ExchangeToken(context.Context, string, *gin.Context) (*oauth.OAuthToken, error) {
	return nil, nil
}
func (provider *oauthLegacyMigrationTestProvider) GetUserInfo(context.Context, *oauth.OAuthToken) (*oauth.OAuthUser, error) {
	return nil, nil
}
func (provider *oauthLegacyMigrationTestProvider) IsUserIDTaken(providerUserID string) bool {
	return providerUserID == provider.legacyID
}
func (provider *oauthLegacyMigrationTestProvider) FillUserByProviderID(user *model.User, _ string) error {
	*user = *provider.user
	return nil
}
func (provider *oauthLegacyMigrationTestProvider) SetProviderUserID(*model.User, string) {}
func (provider *oauthLegacyMigrationTestProvider) GetProviderPrefix() string             { return "github_" }

func TestGenerateOAuthCodeBindsRegistrationConsentToState(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		name        string
		query       string
		wantConsent bool
	}{
		{name: "explicit registration consent", query: "?registration_consent=true", wantConsent: true},
		{name: "missing registration consent fails closed", wantConsent: false},
		{name: "non canonical consent value fails closed", query: "?registration_consent=TRUE", wantConsent: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			router := gin.New()
			router.Use(sessions.Sessions("session", cookie.NewStore([]byte("oauth-consent-state-test-secret"))))
			router.GET("/state", GenerateOAuthCode)

			var claims oauthStateClaims
			var consumeErr error
			router.GET("/consume", func(c *gin.Context) {
				claims, consumeErr = consumeOAuthState(sessions.Default(c), c.Query("state"))
				c.Status(http.StatusNoContent)
			})

			stateRecorder := httptest.NewRecorder()
			router.ServeHTTP(stateRecorder, httptest.NewRequest(http.MethodGet, "/state"+test.query, nil))
			require.Equal(t, http.StatusOK, stateRecorder.Code)

			var stateResponse struct {
				Success bool   `json:"success"`
				Data    string `json:"data"`
			}
			require.NoError(t, json.Unmarshal(stateRecorder.Body.Bytes(), &stateResponse))
			require.True(t, stateResponse.Success)
			require.NotEmpty(t, stateResponse.Data)

			consumeRecorder := httptest.NewRecorder()
			consumeRequest := httptest.NewRequest(http.MethodGet, "/consume?state="+stateResponse.Data, nil)
			for _, sessionCookie := range stateRecorder.Result().Cookies() {
				consumeRequest.AddCookie(sessionCookie)
			}
			router.ServeHTTP(consumeRecorder, consumeRequest)

			require.NoError(t, consumeErr)
			require.Equal(t, test.wantConsent, claims.RegistrationConsent)
		})
	}
}

func TestOAuthRegistrationConsentIsRequiredOnlyForNewUsers(t *testing.T) {
	legalSettings := system_setting.GetLegalSettings()
	previousLegalSettings := *legalSettings
	previousRegisterEnabled := common.RegisterEnabled
	t.Cleanup(func() {
		*legalSettings = previousLegalSettings
		common.RegisterEnabled = previousRegisterEnabled
	})
	legalSettings.UserAgreement = "required"
	legalSettings.PrivacyPolicy = "required"
	common.RegisterEnabled = true

	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	oauthUser := &oauth.OAuthUser{ProviderUserID: "provider-user"}

	existing := &model.User{
		Id:       42,
		Username: "existing-oauth-user",
		Status:   common.UserStatusEnabled,
	}
	user, err := findOrCreateOAuthUser(
		context,
		&oauthConsentTestProvider{existingUser: existing},
		oauthUser,
		nil,
		oauthStateClaims{},
	)
	require.NoError(t, err)
	require.Equal(t, existing.Id, user.Id)

	_, err = findOrCreateOAuthUser(
		context,
		&oauthConsentTestProvider{},
		oauthUser,
		nil,
		oauthStateClaims{},
	)
	require.IsType(t, &OAuthConsentRequiredError{}, err)
}

func TestOAuthLegacyMutableIdentifierMigrationFailsClosed(t *testing.T) {
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	legacyUser := &model.User{Id: 77, Username: "legacy-user", GitHubId: "recycled-login"}
	provider := &oauthLegacyMigrationTestProvider{
		legacyID: "recycled-login",
		user:     legacyUser,
	}

	user, err := findOrCreateOAuthUser(
		context,
		provider,
		&oauth.OAuthUser{
			ProviderUserID: "123456789",
			Extra:          map[string]any{"legacy_id": "recycled-login"},
		},
		nil,
		oauthStateClaims{RegistrationConsent: true},
	)

	require.Nil(t, user)
	require.IsType(t, &OAuthLegacyMigrationRequiredError{}, err)
	require.Equal(t, "recycled-login", legacyUser.GitHubId)
}

func TestValidateOAuthRegistrationConsentTracksConfiguredLegalDocuments(t *testing.T) {
	legalSettings := system_setting.GetLegalSettings()
	previousLegalSettings := *legalSettings
	t.Cleanup(func() {
		*legalSettings = previousLegalSettings
	})

	legalSettings.UserAgreement = ""
	legalSettings.PrivacyPolicy = ""
	require.NoError(t, validateOAuthRegistrationConsent(oauthStateClaims{}))

	legalSettings.UserAgreement = "required"
	require.IsType(t, &OAuthConsentRequiredError{}, validateOAuthRegistrationConsent(oauthStateClaims{}))
	require.NoError(t, validateOAuthRegistrationConsent(oauthStateClaims{RegistrationConsent: true}))
}

func TestWeChatAuthRequiresConsentOnlyBeforeCreatingAnAccount(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousRedisEnabled := common.RedisEnabled
	previousWeChatAuthEnabled := common.WeChatAuthEnabled
	previousWeChatServerAddress := common.WeChatServerAddress
	previousWeChatServerToken := common.WeChatServerToken
	previousRegisterEnabled := common.RegisterEnabled
	legalSettings := system_setting.GetLegalSettings()
	previousLegalSettings := *legalSettings
	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.RedisEnabled = previousRedisEnabled
		common.WeChatAuthEnabled = previousWeChatAuthEnabled
		common.WeChatServerAddress = previousWeChatServerAddress
		common.WeChatServerToken = previousWeChatServerToken
		common.RegisterEnabled = previousRegisterEnabled
		*legalSettings = previousLegalSettings
	})

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.TwoFA{}, &model.Log{}))
	model.DB = db
	model.LOG_DB = db
	common.RedisEnabled = false
	common.WeChatAuthEnabled = true
	common.RegisterEnabled = true
	legalSettings.UserAgreement = "required"
	legalSettings.PrivacyPolicy = "required"

	wechatServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		wechatID := "new-wechat-id"
		if request.URL.Query().Get("code") == "existing" {
			wechatID = "existing-wechat-id"
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"message":"","data":"` + wechatID + `"}`))
	}))
	defer wechatServer.Close()
	common.WeChatServerAddress = wechatServer.URL
	common.WeChatServerToken = "test-token"

	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("wechat-consent-test-secret"))))
	router.GET("/seed", func(c *gin.Context) {
		session := sessions.Default(c)
		session.Set(oauthStateSessionKey, "wechat-state")
		session.Set(oauthRegistrationConsentSessionKey, false)
		require.NoError(t, session.Save())
		c.Status(http.StatusNoContent)
	})
	router.POST("/oauth/wechat", WeChatAuth)

	performWeChatAuth := func(code string) map[string]any {
		seedRecorder := httptest.NewRecorder()
		router.ServeHTTP(seedRecorder, httptest.NewRequest(http.MethodGet, "/seed", nil))
		request := httptest.NewRequest(
			http.MethodPost,
			"/oauth/wechat",
			strings.NewReader(`{"code":"`+code+`","state":"wechat-state"}`),
		)
		request.Header.Set("Content-Type", "application/json")
		for _, sessionCookie := range seedRecorder.Result().Cookies() {
			request.AddCookie(sessionCookie)
		}
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)
		require.Equal(t, http.StatusOK, recorder.Code)
		response := map[string]any{}
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
		return response
	}

	newUserResponse := performWeChatAuth("new")
	require.Equal(t, false, newUserResponse["success"])
	require.Equal(t, oauthRegistrationConsentMessage, newUserResponse["message"])
	var userCount int64
	require.NoError(t, db.Model(&model.User{}).Count(&userCount).Error)
	require.Zero(t, userCount)

	existingUser := model.User{
		Id:        43,
		Username:  "existing-wechat-user",
		Password:  "not-used-in-this-test",
		Role:      common.RoleCommonUser,
		Status:    common.UserStatusEnabled,
		Group:     "default",
		WeChatId:  "existing-wechat-id",
		AffCode:   "wx43",
		CreatedAt: 1,
	}
	require.NoError(t, db.Create(&existingUser).Error)
	existingUserResponse := performWeChatAuth("existing")
	require.Equal(t, true, existingUserResponse["success"])
	require.NotEqual(t, oauthRegistrationConsentMessage, existingUserResponse["message"])
}
