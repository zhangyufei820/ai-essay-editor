package service

import (
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withLiveChannelSelectionDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	previousDB := model.DB
	model.DB = db
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() {
		model.DB = previousDB
		_ = sqlDB.Close()
	})
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}))
	return db
}

func addSelectionChannel(t *testing.T, db *gorm.DB, id int, group, modelName string, priority int64, enabled bool) {
	t.Helper()
	require.NoError(t, db.Create(&model.Channel{
		Id:       id,
		Name:     "test provider",
		Status:   common.ChannelStatusEnabled,
		Group:    group,
		Models:   modelName,
		Priority: &priority,
	}).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group: group, Model: modelName, ChannelId: id, Priority: &priority, Enabled: enabled,
	}).Error)
}

func TestModelAbilityCircuitSkipsDisabledPrimary(t *testing.T) {
	for _, group := range []string{"default", PlusPricingGroupName, ClaudeKiroPricingGroupName} {
		t.Run(group, func(t *testing.T) {
			assertLiveAbilityCircuitSkipsDisabledPrimary(t, group)
		})
	}
}

func TestSpecialModelAbilityCircuitSkipsDisabledPrimary(t *testing.T) {
	assertLiveAbilityCircuitSkipsDisabledPrimary(t, SpecialPricingGroupName)
}

func assertLiveAbilityCircuitSkipsDisabledPrimary(t *testing.T, group string) {
	t.Helper()
	db := withLiveChannelSelectionDB(t)
	const modelName = "test-text-model"
	const primaryID = 101
	const secondaryID = 102
	addSelectionChannel(t, db, primaryID, group, modelName, 30, false)
	addSelectionChannel(t, db, secondaryID, group, modelName, 30, true)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	param := &RetryParam{Ctx: c, TokenGroup: group, ModelName: modelName, RequestPath: c.Request.URL.Path}
	selected, _, err := CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.NotNil(t, selected)
	require.Equal(t, secondaryID, selected.Id)
	require.False(t, PreferredChannelEligible(c, group, modelName, &model.Channel{Id: primaryID}))

	require.NoError(t, db.Model(&model.Ability{}).Where("channel_id = ?", secondaryID).Update("enabled", false).Error)
	selected, _, err = CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.Nil(t, selected)
}

func TestCacheGetRandomSatisfiedChannelMovesToNextGroupOnlyAfterPrioritiesAreExhausted(t *testing.T) {
	db := withLiveChannelSelectionDB(t)
	const modelName = "test-claude-model"
	addSelectionChannel(t, db, 21, "default", modelName, 40, true)
	addSelectionChannel(t, db, 22, "default", modelName, 20, true)
	addSelectionChannel(t, db, 23, DiscountPricingGroupName, modelName, 30, true)
	addSelectionChannel(t, db, 24, DiscountPricingGroupName, modelName, 10, true)
	addSelectionChannel(t, db, 25, PlusPricingGroupName, modelName, 10, true)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/messages", nil)
	SetTokenGroupChain(c, []string{"default", DiscountPricingGroupName, PlusPricingGroupName})
	param := &RetryParam{Ctx: c, TokenGroup: "default", ModelName: modelName, RequestPath: c.Request.URL.Path}
	var tried []string
	for index, want := range []struct {
		id    int
		group string
	}{{21, "default"}, {22, "default"}, {23, DiscountPricingGroupName}, {24, DiscountPricingGroupName}, {25, PlusPricingGroupName}} {
		param.SetRetry(index)
		selected, group, err := CacheGetRandomSatisfiedChannel(param)
		require.NoError(t, err)
		require.NotNil(t, selected)
		require.Equal(t, want.id, selected.Id)
		require.Equal(t, want.group, group)
		tried = append(tried, strconv.Itoa(selected.Id))
		c.Set("use_channel", tried)
	}

	param.SetRetry(5)
	selected, _, err := CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.Nil(t, selected)
}

func TestCacheGetRandomSatisfiedChannelFallsThroughMissingPrimaryGroup(t *testing.T) {
	db := withLiveChannelSelectionDB(t)
	const modelName = "test-fallback-model"
	addSelectionChannel(t, db, 23, DiscountPricingGroupName, modelName, 10, true)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	SetTokenGroupChain(c, []string{"default", DiscountPricingGroupName})
	param := &RetryParam{Ctx: c, TokenGroup: "default", ModelName: modelName, RequestPath: c.Request.URL.Path}

	selected, group, err := CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.NotNil(t, selected)
	require.Equal(t, 23, selected.Id)
	require.Equal(t, DiscountPricingGroupName, group)
}
