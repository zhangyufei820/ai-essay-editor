package router

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type restoredRouteExpectation struct {
	method  string
	path    string
	handler any
}

var restoredRouteExpectations = []restoredRouteExpectation{
	{http.MethodPost, "/api/system-task/log-cleanup", controller.CreateLogCleanupSystemTask},
	{http.MethodGet, "/api/system-task/list", controller.ListSystemTasks},
	{http.MethodGet, "/api/system-task/current", controller.GetCurrentSystemTask},
	{http.MethodGet, "/api/system-task/:task_id", controller.GetSystemTask},
	{http.MethodGet, "/api/system-info/instances", controller.ListSystemInstances},
	{http.MethodDelete, "/api/system-info/stale-instances", controller.DeleteStaleSystemInstances},
	{http.MethodDelete, "/api/system-info/instances/:node_name", controller.DeleteStaleSystemInstance},
	{http.MethodGet, "/api/data/flow", controller.GetAllFlowQuotaDates},
	{http.MethodGet, "/api/data/flow/self", controller.GetUserFlowQuotaDates},
	{http.MethodPost, "/api/subscription/admin/plans/:id/subscriptions/reset", controller.AdminResetPlanSubscriptions},
	{http.MethodPost, "/api/subscription/admin/users/:id/subscriptions/reset", controller.AdminResetUserSubscriptionsByPlan},
}

func TestRestoredAPIRoutesMatchPinnedContract(t *testing.T) {
	engine := newRouteCompletenessEngine()
	routes := make(map[string]string)
	for _, route := range engine.Routes() {
		routes[route.Method+" "+route.Path] = route.Handler
	}

	for _, expected := range restoredRouteExpectations {
		expected := expected
		t.Run(expected.method+" "+expected.path, func(t *testing.T) {
			handlerName := runtime.FuncForPC(reflect.ValueOf(expected.handler).Pointer()).Name()
			require.Equal(t, handlerName, routes[expected.method+" "+expected.path])
		})
	}
}

func TestRestoredAPIRoutesRejectAnonymousRequests(t *testing.T) {
	engine := newRouteCompletenessEngine()

	for _, expected := range restoredRouteExpectations {
		expected := expected
		t.Run(expected.method+" "+expected.path, func(t *testing.T) {
			path := strings.ReplaceAll(expected.path, ":task_id", "task-1")
			path = strings.ReplaceAll(path, ":node_name", "node-1")
			path = strings.ReplaceAll(path, ":id", "1")
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(expected.method, path, strings.NewReader("{}"))
			request.Header.Set("Content-Type", "application/json")
			engine.ServeHTTP(recorder, request)
			require.Equal(t, http.StatusUnauthorized, recorder.Code)
		})
	}
}

func TestRestoredAPIRouteAuthorizationBoundaries(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousRedisEnabled := common.RedisEnabled
	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.RedisEnabled = previousRedisEnabled
	})

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.SystemInstance{}))
	model.DB = db
	model.LOG_DB = nil
	common.RedisEnabled = false

	users := []model.User{
		{Id: 11, Username: "route-user", Password: "password-1", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AffCode: "route-user-aff"},
		{Id: 12, Username: "route-admin", Password: "password-2", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, Group: "default", AffCode: "route-admin-aff"},
		{Id: 13, Username: "route-root", Password: "password-3", Role: common.RoleRootUser, Status: common.UserStatusEnabled, Group: "default", AffCode: "route-root-aff"},
	}
	for index := range users {
		require.NoError(t, db.Create(&users[index]).Error)
	}

	engine := gin.New()
	engine.Use(sessions.Sessions("session", cookie.NewStore([]byte("route-completeness-session-secret"))))
	engine.Use(func(c *gin.Context) {
		common.SetContextKey(c, constant.ContextKeyAuditLogged, true)
		c.Next()
	})
	engine.GET("/test/session/:id", func(c *gin.Context) {
		userID, _ := strconv.Atoi(c.Param("id"))
		var user model.User
		require.NoError(t, model.DB.First(&user, "id = ?", userID).Error)
		session := sessions.Default(c)
		session.Set("id", user.Id)
		session.Set("username", user.Username)
		session.Set("role", user.Role)
		session.Set("status", user.Status)
		session.Set("group", user.Group)
		require.NoError(t, session.Save())
		c.Status(http.StatusNoContent)
	})
	SetApiRouter(engine)

	cookies := map[int][]*http.Cookie{}
	for _, user := range users {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/test/session/"+strconv.Itoa(user.Id), nil)
		engine.ServeHTTP(recorder, request)
		require.Equal(t, http.StatusNoContent, recorder.Code)
		cookies[user.Id] = recorder.Result().Cookies()
	}

	tests := []struct {
		name        string
		userID      int
		method      string
		path        string
		body        string
		wantMessage string
	}{
		{"system task rejects admin", 12, http.MethodGet, "/api/system-task/current", "", i18n.MsgAuthInsufficientPrivilege},
		{"system task accepts root", 13, http.MethodGet, "/api/system-task/current", "", "type is required"},
		{"system info rejects admin", 12, http.MethodDelete, "/api/system-info/instances/missing", "", i18n.MsgAuthInsufficientPrivilege},
		{"system info accepts root", 13, http.MethodDelete, "/api/system-info/instances/missing", "", "instance is not stale or no longer exists"},
		{"admin flow rejects user", 11, http.MethodGet, "/api/data/flow", "", i18n.MsgAuthInsufficientPrivilege},
		{"admin flow accepts admin", 12, http.MethodGet, "/api/data/flow", "", "invalid start_timestamp"},
		{"self flow accepts user", 11, http.MethodGet, "/api/data/flow/self", "", "invalid start_timestamp"},
		{"plan reset rejects user", 11, http.MethodPost, "/api/subscription/admin/plans/0/subscriptions/reset", "{}", i18n.MsgAuthInsufficientPrivilege},
		{"plan reset accepts admin", 12, http.MethodPost, "/api/subscription/admin/plans/0/subscriptions/reset", "{}", "无效的ID"},
		{"user reset rejects user", 11, http.MethodPost, "/api/subscription/admin/users/0/subscriptions/reset", "{}", i18n.MsgAuthInsufficientPrivilege},
		{"user reset accepts admin", 12, http.MethodPost, "/api/subscription/admin/users/0/subscriptions/reset", "{}", "无效的用户ID"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(test.method, test.path, strings.NewReader(test.body))
			request.Header.Set("Accept-Language", "en")
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("New-Api-User", strconv.Itoa(test.userID))
			for _, sessionCookie := range cookies[test.userID] {
				request.AddCookie(sessionCookie)
			}
			engine.ServeHTTP(recorder, request)
			require.Equal(t, http.StatusOK, recorder.Code)

			var response struct {
				Message string `json:"message"`
			}
			require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
			require.Equal(t, test.wantMessage, response.Message)
		})
	}
}

func newRouteCompletenessEngine() *gin.Engine {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(sessions.Sessions("session", cookie.NewStore([]byte("route-completeness-session-secret"))))
	SetApiRouter(engine)
	return engine
}
