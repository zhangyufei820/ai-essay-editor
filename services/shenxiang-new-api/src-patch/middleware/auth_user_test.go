package middleware

import (
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

func userAuthTestRouter(sessionUserID int) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("user-auth-test-session-secret"))))
	router.GET(
		"/protected",
		func(c *gin.Context) {
			session := sessions.Default(c)
			session.Set("username", "auth-user")
			session.Set("role", common.RoleCommonUser)
			session.Set("id", sessionUserID)
			session.Set("status", common.UserStatusEnabled)
			session.Set("group", "default")
			c.Next()
		},
		UserAuth(),
		func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"id": c.GetInt("id")})
		},
	)
	return router
}

func withSessionAuthDB(t *testing.T, userID int, role int) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	oldDB := model.DB
	model.DB = db
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() {
		model.DB = oldDB
		_ = sqlDB.Close()
	})
	require.NoError(t, db.AutoMigrate(&model.User{}))
	require.NoError(t, db.Create(&model.User{
		Id: userID, Username: "auth-user", Role: role, Status: common.UserStatusEnabled, Group: "default",
	}).Error)
	return db
}

func TestUserAuthRequiresMatchingSessionAndHeader(t *testing.T) {
	withSessionAuthDB(t, 607, common.RoleCommonUser)
	t.Run("matching account", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/protected", nil)
		request.Header.Set("New-Api-User", "607")
		userAuthTestRouter(607).ServeHTTP(recorder, request)
		require.Equal(t, http.StatusOK, recorder.Code)
		require.JSONEq(t, `{"id":607}`, recorder.Body.String())
	})

	t.Run("mismatched account", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/protected", nil)
		request.Header.Set("New-Api-User", "608")
		userAuthTestRouter(607).ServeHTTP(recorder, request)
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("mismatched account status=%d, want %d", recorder.Code, http.StatusUnauthorized)
		}
	})
}

func TestSignedSessionUsesCurrentAccountState(t *testing.T) {
	const userID = 608
	db := withSessionAuthDB(t, userID, common.RoleAdminUser)
	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("user-auth-test-session-secret"))))
	router.GET("/issue", func(c *gin.Context) {
		session := sessions.Default(c)
		session.Set("id", userID)
		session.Set("username", "auth-user")
		session.Set("role", common.RoleAdminUser)
		session.Set("status", common.UserStatusEnabled)
		require.NoError(t, session.Save())
		c.Status(http.StatusNoContent)
	})
	router.GET("/admin", AdminAuth(), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	router.GET("/media", TokenOrUserAuth(), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	issued := httptest.NewRecorder()
	router.ServeHTTP(issued, httptest.NewRequest(http.MethodGet, "/issue", nil))
	cookies := issued.Result().Cookies()
	require.Len(t, cookies, 1)

	do := func(path string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		request.Header.Set("New-Api-User", "608")
		request.AddCookie(cookies[0])
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)
		return recorder
	}
	require.Equal(t, http.StatusNoContent, do("/admin").Code)
	require.Equal(t, http.StatusNoContent, do("/media").Code)

	require.NoError(t, db.Model(&model.User{}).Where("id = ?", userID).Update("role", common.RoleCommonUser).Error)
	denied := do("/admin")
	require.Equal(t, http.StatusOK, denied.Code)
	require.Contains(t, denied.Body.String(), `"success":false`)

	require.NoError(t, db.Model(&model.User{}).Where("id = ?", userID).Update("status", common.UserStatusDisabled).Error)
	require.Equal(t, http.StatusUnauthorized, do("/media").Code)

	require.NoError(t, db.Delete(&model.User{}, userID).Error)
	require.Equal(t, http.StatusUnauthorized, do("/admin").Code)
}
