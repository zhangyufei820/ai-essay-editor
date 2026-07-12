package controller

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

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
		consumeErr = consumeOAuthState(sessions.Default(c), c.Query("state"))
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
