package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupSystemTokenControllerTestDB(t *testing.T) {
	t.Helper()
	originalDB := model.DB
	originalRedisEnabled := common.RedisEnabled
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}))
	model.DB = db
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB = originalDB
		common.RedisEnabled = originalRedisEnabled
	})
}

func TestGetAllTokensWithSystemSyncCreatesPublicTokensBeforeListing(t *testing.T) {
	setupSystemTokenControllerTestDB(t)
	userID := service.AdminSystemTokenUserID + 400
	require.NoError(t, model.DB.Create(&model.User{
		Id:       userID,
		Username: "token-list-sync-user",
		AffCode:  "token-list-sync-user-aff",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/token/?p=0&page_size=10", nil)
	ctx.Set("id", userID)

	GetAllTokensWithSystemSync(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var tokenCount int64
	require.NoError(t, model.DB.Model(&model.Token{}).Where("user_id = ?", userID).Count(&tokenCount).Error)
	require.EqualValues(t, 4, tokenCount)
	var grokTokenCount int64
	require.NoError(t, model.DB.Model(&model.Token{}).Where("user_id = ? AND name = ?", userID, service.Grok45AdminTokenName).Count(&grokTokenCount).Error)
	require.Zero(t, grokTokenCount)
}
