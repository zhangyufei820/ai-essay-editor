package controller

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type oauthFailingSession struct {
	values    map[interface{}]interface{}
	saveErr   error
	saveCalls int
}

func (session *oauthFailingSession) ID() string { return "oauth-failing-session" }

func (session *oauthFailingSession) Get(key interface{}) interface{} {
	return session.values[key]
}

func (session *oauthFailingSession) Set(key interface{}, value interface{}) {
	session.values[key] = value
}

func (session *oauthFailingSession) Delete(key interface{}) {
	delete(session.values, key)
}

func (session *oauthFailingSession) Clear() {
	session.values = map[interface{}]interface{}{}
}

func (session *oauthFailingSession) AddFlash(interface{}, ...string) {}

func (session *oauthFailingSession) Flashes(...string) []interface{} { return nil }

func (session *oauthFailingSession) Options(sessions.Options) {}

func (session *oauthFailingSession) Save() error {
	session.saveCalls++
	return session.saveErr
}

func requireOAuthErrorResponseDoesNotContain(t *testing.T, recorder *httptest.ResponseRecorder, status int, sensitive string) {
	t.Helper()
	require.Equal(t, status, recorder.Code)
	require.NotContains(t, recorder.Body.String(), sensitive)
	response := map[string]any{}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, false, response["success"])
	require.NotEmpty(t, response["message"])
}

func TestGenerateOAuthCodeUsesCryptographicURLSafeState(t *testing.T) {
	gin.SetMode(gin.TestMode)
	session := &oauthFailingSession{values: map[interface{}]interface{}{}}
	seenStates := map[string]struct{}{}

	for attempt := 0; attempt < 64; attempt++ {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodGet, "/oauth/state", nil)
		context.Set(sessions.DefaultKey, session)

		GenerateOAuthCode(context)

		require.Equal(t, http.StatusOK, recorder.Code)
		response := struct {
			Success bool   `json:"success"`
			Data    string `json:"data"`
		}{}
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
		require.True(t, response.Success)
		require.Len(t, response.Data, 32)
		require.Regexp(t, `^[0-9A-Za-z]{32}$`, response.Data)
		require.Equal(t, response.Data, url.QueryEscape(response.Data))
		require.Equal(t, response.Data, session.Get(oauthStateSessionKey))
		if _, exists := seenStates[response.Data]; exists {
			t.Fatalf("OAuth state repeated after %d attempts", attempt+1)
		}
		seenStates[response.Data] = struct{}{}
	}

	require.Len(t, seenStates, 64)
	require.Equal(t, 64, session.saveCalls)
}

func TestGenerateOAuthCodeFailsClosedWhenStateGenerationFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())
	sensitive := "entropy-source-secret-details"
	session := &oauthFailingSession{values: map[interface{}]interface{}{}}
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/oauth/state?aff=should-not-persist", nil)
	context.Set(sessions.DefaultKey, session)

	generateOAuthCode(context, func() (string, error) {
		return "", errors.New(sensitive)
	})

	requireOAuthErrorResponseDoesNotContain(t, recorder, http.StatusInternalServerError, sensitive)
	require.Zero(t, session.saveCalls)
	require.Empty(t, session.values)
}

func TestGenerateOAuthCodeDoesNotExposeSessionSaveError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())
	sensitive := "session-store-password=oauth-session-secret"
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/oauth/state", nil)
	context.Set(sessions.DefaultKey, &oauthFailingSession{
		values:  map[interface{}]interface{}{},
		saveErr: errors.New(sensitive),
	})

	GenerateOAuthCode(context)

	requireOAuthErrorResponseDoesNotContain(t, recorder, http.StatusInternalServerError, sensitive)
}

func TestOAuthUserResolutionErrorDoesNotExposeDatabaseError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())
	sensitive := "duplicate key subject=private-oauth-subject"
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/oauth/github", nil)

	writeOAuthUserResolutionError(context, "GitHub", errors.New(sensitive))

	requireOAuthErrorResponseDoesNotContain(t, recorder, http.StatusInternalServerError, sensitive)
}

func TestHandleOAuthErrorDoesNotExposeProviderError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())
	sensitive := "upstream response access_token=provider-secret"
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/oauth/github", nil)
	previousErrorWriter := gin.DefaultErrorWriter
	var errorLog bytes.Buffer
	gin.DefaultErrorWriter = &errorLog
	t.Cleanup(func() {
		gin.DefaultErrorWriter = previousErrorWriter
	})

	handleOAuthError(context, "GitHub", errors.New(sensitive))

	requireOAuthErrorResponseDoesNotContain(t, recorder, http.StatusBadGateway, sensitive)
	require.NotContains(t, errorLog.String(), sensitive)
	require.Contains(t, errorLog.String(), "OAuth provider request failed")
}

func TestWriteOAuthIdentityErrorReturnsStableConflict(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/oauth/github", nil)

	handled := writeOAuthIdentityError(context, "GitHub", model.ErrUserOAuthIdentityAlreadyBound)

	require.True(t, handled)
	require.Equal(t, http.StatusConflict, recorder.Code)
	response := map[string]any{}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, false, response["success"])
	require.NotContains(t, response["message"], "ux_users_github_id_nonempty")
}

func TestNormalizeOAuthRegistrationErrorRechecksBuiltInAndGenericIdentity(t *testing.T) {
	previousDB := model.DB
	previousRedisEnabled := common.RedisEnabled
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedisEnabled
	})
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.AutoMigrate(&model.User{}, &model.UserOAuthBinding{}))
	model.DB = database
	common.RedisEnabled = false
	require.NoError(t, model.EnsureUserOAuthIdentityUniqueIndexes())

	owner := model.User{
		Id:       9050,
		Username: "oauth-registration-race-owner",
		Status:   common.UserStatusEnabled,
		Group:    "default",
		AffCode:  "or50",
		GitHubId: "github-race-subject",
	}
	require.NoError(t, database.Create(&owner).Error)
	require.NoError(t, model.CreateUserOAuthBinding(&model.UserOAuthBinding{
		UserId: owner.Id, ProviderId: 650, ProviderUserId: "generic-race-subject",
	}))

	usernameRace := errors.New("username uniqueness race")
	require.ErrorIs(t, normalizeOAuthRegistrationError(&oauth.GitHubProvider{}, "github-race-subject", usernameRace), model.ErrUserOAuthIdentityAlreadyBound)
	genericProvider := oauth.NewGenericOAuthProvider(&model.CustomOAuthProvider{Id: 650, Name: "Generic Race"})
	require.ErrorIs(t, normalizeOAuthRegistrationError(genericProvider, "generic-race-subject", usernameRace), model.ErrUserOAuthIdentityAlreadyBound)
	safeError := normalizeOAuthRegistrationError(&oauth.GitHubProvider{}, "unowned-subject", usernameRace)
	require.IsType(t, &OAuthRegistrationDatabaseError{}, safeError)
	require.NotContains(t, safeError.Error(), usernameRace.Error())
}

func TestGetEnabledOAuthBindUserRefreshesDatabaseStatus(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	previousRedisEnabled := common.RedisEnabled
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedisEnabled
	})

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	model.DB = db
	common.RedisEnabled = false

	user := model.User{
		Id:       9001,
		Username: "oauth-bind-user",
		Password: "not-used-in-this-test",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}
	require.NoError(t, db.Create(&user).Error)

	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("oauth-bind-test-secret-32-bytes"))))
	router.GET("/seed", func(c *gin.Context) {
		session := sessions.Default(c)
		session.Set("id", user.Id)
		session.Set("username", user.Username)
		require.NoError(t, session.Save())
		c.Status(http.StatusNoContent)
	})
	var bindErr error
	router.GET("/bind", func(c *gin.Context) {
		_, bindErr = getEnabledOAuthBindUser(c)
		c.Status(http.StatusNoContent)
	})

	seedRecorder := httptest.NewRecorder()
	router.ServeHTTP(seedRecorder, httptest.NewRequest(http.MethodGet, "/seed", nil))
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("status", common.UserStatusDisabled).Error)

	bindRecorder := httptest.NewRecorder()
	bindRequest := httptest.NewRequest(http.MethodGet, "/bind", nil)
	for _, sessionCookie := range seedRecorder.Result().Cookies() {
		bindRequest.AddCookie(sessionCookie)
	}
	router.ServeHTTP(bindRecorder, bindRequest)

	require.ErrorIs(t, bindErr, errOAuthBindUserDisabled)
}

func TestConsumeOAuthStateIsOneTime(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("oauth-state-test-secret-32-bytes"))))
	router.GET("/seed", func(c *gin.Context) {
		session := sessions.Default(c)
		session.Set("oauth_state", "one-time-state")
		require.NoError(t, session.Save())
		c.Status(http.StatusNoContent)
	})
	var consumeErr error
	router.GET("/consume", func(c *gin.Context) {
		_, consumeErr = consumeOAuthState(sessions.Default(c), c.Query("state"))
		c.Status(http.StatusNoContent)
	})

	seedRecorder := httptest.NewRecorder()
	router.ServeHTTP(seedRecorder, httptest.NewRequest(http.MethodGet, "/seed", nil))
	consumeRecorder := httptest.NewRecorder()
	consumeRequest := httptest.NewRequest(http.MethodGet, "/consume?state=one-time-state", nil)
	for _, sessionCookie := range seedRecorder.Result().Cookies() {
		consumeRequest.AddCookie(sessionCookie)
	}
	router.ServeHTTP(consumeRecorder, consumeRequest)
	require.NoError(t, consumeErr)

	replayRecorder := httptest.NewRecorder()
	replayRequest := httptest.NewRequest(http.MethodGet, "/consume?state=one-time-state", nil)
	for _, sessionCookie := range consumeRecorder.Result().Cookies() {
		replayRequest.AddCookie(sessionCookie)
	}
	router.ServeHTTP(replayRecorder, replayRequest)
	require.True(t, errors.Is(consumeErr, errOAuthBindSessionInvalid))
}
