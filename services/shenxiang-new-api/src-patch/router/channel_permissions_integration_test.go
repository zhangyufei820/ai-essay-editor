package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestSetApiRouterEnforcesChannelPermissions(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	oldDB, wasMaster := model.DB, common.IsMasterNode
	model.DB, common.IsMasterNode = db, true
	t.Cleanup(func() {
		model.DB, common.IsMasterNode = oldDB, wasMaster
	})
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.CasbinRule{}, &model.AuthzRole{}))
	require.NoError(t, authz.Init(db))
	const adminID = 42
	require.NoError(t, db.Create(&model.User{
		Id: adminID, Username: "operations-admin", Role: common.RoleAdminUser,
		Status: common.UserStatusEnabled, Group: "default",
	}).Error)
	require.NoError(t, authz.SetUserPermissions(adminID, authz.PermissionsMap{
		authz.ResourceChannel: {authz.ActionRead: false, authz.ActionOperate: false},
	}))

	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("channel-policy-test-session-secret"))))
	router.Use(func(c *gin.Context) {
		sessions.Default(c).Set("id", adminID)
		c.Next()
	})
	SetApiRouter(router)

	for _, route := range []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/channel/"},
		{http.MethodPost, "/api/channel/"},
		{http.MethodDelete, "/api/channel/10"},
		{http.MethodPost, "/api/channel/10/status"},
		{http.MethodPost, "/api/channel/10/codex/oauth/start"},
	} {
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			req := httptest.NewRequest(route.method, route.path, strings.NewReader("{}"))
			req.Header.Set("New-Api-User", "42")
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, req)
			require.Equal(t, http.StatusForbidden, recorder.Code, recorder.Body.String())
		})
	}
}
