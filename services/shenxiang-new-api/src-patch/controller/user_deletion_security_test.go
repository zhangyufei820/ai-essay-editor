package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestManageUserDeleteReturnsSuccessWithoutUpdatingDeletedRecord(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	previousRedisEnabled := common.RedisEnabled
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedisEnabled
	})

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.CasbinRule{}, &model.UserOAuthBinding{}))
	model.DB = db
	common.RedisEnabled = false
	user := model.User{
		Id:       9101,
		Username: "delete-target",
		Password: "not-used-in-this-test",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}
	require.NoError(t, db.Create(&user).Error)

	body, err := json.Marshal(ManageRequest{Id: user.Id, Action: "delete"})
	require.NoError(t, err)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/user/manage", bytes.NewReader(body))
	context.Set("role", common.RoleAdminUser)
	context.Set("id", 1)
	context.Set("username", "admin")

	ManageUser(context)

	var response map[string]any
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, true, response["success"])
	var count int64
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Count(&count).Error)
	require.Zero(t, count)
}
