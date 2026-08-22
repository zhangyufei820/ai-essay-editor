package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRegistrationAuditParamsExcludeSensitiveFields(t *testing.T) {
	params := registrationAuditParams("new-user", "password")

	require.Equal(t, map[string]interface{}{
		"username": "new-user",
		"method":   "password",
	}, params)
	for _, forbidden := range []string{"password", "email", "verification_code", "api_key", "token"} {
		_, exists := params[forbidden]
		require.False(t, exists, "registration audit leaked %s", forbidden)
	}
}

func TestRecordRegistrationAuditUsesTrustedClientIP(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:registration-audit?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Log{}))

	originalDB := model.DB
	originalLogDB := model.LOG_DB
	originalRedisEnabled := common.RedisEnabled
	model.DB = db
	model.LOG_DB = db
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB = originalDB
		model.LOG_DB = originalLogDB
		common.RedisEnabled = originalRedisEnabled
	})
	t.Setenv("TRUSTED_IP_HEADER", "CF-Connecting-IP")

	user := model.User{Id: 42, Username: "audit-user"}
	require.NoError(t, db.Create(&user).Error)

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/register", nil)
	ctx.Request.Header.Set("CF-Connecting-IP", "203.0.113.42")
	recordRegistrationAudit(ctx, user.Id, user.Username, "password")

	var entry model.Log
	for attempt := 0; attempt < 50; attempt++ {
		if err := db.Where("user_id = ? AND type = ?", user.Id, model.LogTypeManage).Order("id DESC").First(&entry).Error; err == nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	require.Equal(t, "203.0.113.42", entry.Ip)
	require.Contains(t, entry.Other, "user.register")
}
