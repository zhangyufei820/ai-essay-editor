package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestV1ImageTaskQueryRoutesUseTokenAuthWithoutDistribution(t *testing.T) {
	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousRedisEnabled := common.RedisEnabled
	previousSQLitePath := common.SQLitePath
	previousMasterNode := common.IsMasterNode
	t.Setenv("SQL_DSN", "local")
	t.Setenv("LOG_SQL_DSN", "")
	common.SQLitePath = "file:route-query-test?mode=memory&cache=shared"
	common.IsMasterNode = false
	common.RedisEnabled = false
	t.Cleanup(func() {
		if model.DB != nil && model.DB != previousDB {
			if sqlDatabase, err := model.DB.DB(); err == nil {
				_ = sqlDatabase.Close()
			}
		}
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.SQLitePath = previousSQLitePath
		common.IsMasterNode = previousMasterNode
		common.RedisEnabled = previousRedisEnabled
	})
	require.NoError(t, model.InitDB())
	model.LOG_DB = model.DB
	require.NoError(t, model.DB.AutoMigrate(&model.User{}, &model.Token{}, &model.Task{}))

	const userID = 107
	const taskID = "task-route-query"
	require.NoError(t, model.DB.Create(&model.User{
		Id:       userID,
		Username: "route-query-user",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
		Quota:    1_000_000,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Token{
		UserId:         userID,
		Key:            "routequerytoken",
		Name:           "route query token",
		Status:         common.TokenStatusEnabled,
		Group:          "default",
		UnlimitedQuota: true,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Task{
		TaskID:   taskID,
		UserId:   userID,
		Platform: constant.TaskPlatformPlaygroundImage,
		Action:   constant.TaskActionImageGenerate,
		Status:   model.TaskStatusSuccess,
	}).Error)

	gin.SetMode(gin.TestMode)
	server := gin.New()
	SetRelayRouter(server)

	authorizedRequest := httptest.NewRequest(http.MethodGet, "/v1/images/tasks/"+taskID, nil)
	authorizedRequest.Header.Set("Authorization", "Bearer sk-routequerytoken")
	authorizedResponse := httptest.NewRecorder()
	server.ServeHTTP(authorizedResponse, authorizedRequest)
	require.Equal(t, http.StatusOK, authorizedResponse.Code)
	require.NotContains(t, authorizedResponse.Body.String(), "channel is nil")

	unauthorizedRequest := httptest.NewRequest(http.MethodGet, "/v1/images/tasks/"+taskID, nil)
	unauthorizedResponse := httptest.NewRecorder()
	server.ServeHTTP(unauthorizedResponse, unauthorizedRequest)
	require.Equal(t, http.StatusUnauthorized, unauthorizedResponse.Code)
}
