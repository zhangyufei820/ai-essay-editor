package middleware

import (
	"net/http"
	"net/http/httptest"
	"strconv"
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

func TestSessionAuthRefreshesCurrentUserAuthorization(t *testing.T) {
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
		Id:       42,
		Username: "session-user",
		Password: "not-used-in-this-test",
		Role:     common.RoleAdminUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}
	require.NoError(t, db.Create(&user).Error)

	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("test-session-secret-32-bytes-long"))))
	router.GET("/login", func(c *gin.Context) {
		session := sessions.Default(c)
		session.Set("id", user.Id)
		session.Set("username", user.Username)
		session.Set("role", user.Role)
		session.Set("status", user.Status)
		session.Set("group", user.Group)
		require.NoError(t, session.Save())
		c.Status(http.StatusNoContent)
	})
	router.GET("/admin", AdminAuth(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	loginRecorder := httptest.NewRecorder()
	loginRequest := httptest.NewRequest(http.MethodGet, "/login", nil)
	router.ServeHTTP(loginRecorder, loginRequest)
	require.Equal(t, http.StatusNoContent, loginRecorder.Code)
	require.NotEmpty(t, loginRecorder.Result().Cookies())

	tests := []struct {
		name   string
		update map[string]interface{}
	}{
		{name: "disabled user", update: map[string]interface{}{"status": common.UserStatusDisabled}},
		{name: "demoted user", update: map[string]interface{}{"status": common.UserStatusEnabled, "role": common.RoleCommonUser}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Updates(test.update).Error)

			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/admin", nil)
			request.Header.Set("New-Api-User", strconv.Itoa(user.Id))
			for _, sessionCookie := range loginRecorder.Result().Cookies() {
				request.AddCookie(sessionCookie)
			}
			router.ServeHTTP(recorder, request)

			require.NotEqual(t, http.StatusNoContent, recorder.Code)
		})
	}
}
