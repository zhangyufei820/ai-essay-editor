package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
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

func TestUserAuthRequiresMatchingSessionAndHeader(t *testing.T) {
	t.Run("matching account", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/protected", nil)
		request.Header.Set("New-Api-User", "607")
		userAuthTestRouter(607).ServeHTTP(recorder, request)
		if recorder.Code != http.StatusOK {
			t.Fatalf("matching account status=%d, want %d", recorder.Code, http.StatusOK)
		}
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
