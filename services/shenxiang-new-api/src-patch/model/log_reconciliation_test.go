package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupLogReconciliationDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Log{}))

	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	previousLogDB := LOG_DB
	previousLogDatabaseType := common.LogDatabaseType()
	LOG_DB = db
	common.SetLogDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		LOG_DB = previousLogDB
		common.SetLogDatabaseType(previousLogDatabaseType)
		require.NoError(t, sqlDB.Close())
	})
	return db
}

func TestRecordLoginLogPersistsStructuredAuditAndRequestID(t *testing.T) {
	setupLogReconciliationDB(t)

	require.Equal(t, 7, LogTypeLogin)
	RecordLoginLog(
		42,
		"login-user",
		"Logged in successfully via password",
		"203.0.113.9",
		"login",
		map[string]interface{}{"method": "password"},
		map[string]interface{}{
			"login_method": "password",
			"user_agent":   "model-log-test",
		},
	)

	var log Log
	require.NoError(t, LOG_DB.First(&log).Error)
	require.Equal(t, 42, log.UserId)
	require.Equal(t, "login-user", log.Username)
	require.Equal(t, LogTypeLogin, log.Type)
	require.Equal(t, "203.0.113.9", log.Ip)
	require.NotEmpty(t, log.RequestId)

	other, err := common.StrToMap(log.Other)
	require.NoError(t, err)
	require.Equal(t, "password", other["login_method"])
	require.Equal(t, "model-log-test", other["user_agent"])
	require.Equal(t, map[string]interface{}{
		"action": "login",
		"params": map[string]interface{}{"method": "password"},
	}, other["op"])
}

func TestFormatUserLogsRemovesAdminAndAuditDetails(t *testing.T) {
	logs := []*Log{{
		Id:          99,
		ChannelName: "private-channel",
		Other: common.MapToJsonStr(map[string]interface{}{
			"admin_info":    map[string]interface{}{"operator": "root"},
			"audit_info":    map[string]interface{}{"route": "/api/user"},
			"stream_status": "finished",
			"op":            map[string]interface{}{"action": "login"},
			"model_price":   0.004,
		}),
	}}

	formatUserLogs(logs, 40)

	require.Equal(t, 41, logs[0].Id)
	require.Empty(t, logs[0].ChannelName)
	other, err := common.StrToMap(logs[0].Other)
	require.NoError(t, err)
	require.NotContains(t, other, "admin_info")
	require.NotContains(t, other, "audit_info")
	require.NotContains(t, other, "stream_status")
	require.Contains(t, other, "op")
	require.Contains(t, other, "model_price")
}

func TestApplyExplicitLogTextFilterUsesClickHouseEscaping(t *testing.T) {
	db := setupLogReconciliationDB(t)
	common.SetLogDatabaseType(common.DatabaseTypeClickHouse)

	tx, err := applyExplicitLogTextFilter(
		db.Session(&gorm.Session{DryRun: true}).Model(&Log{}),
		"logs.model_name",
		`gpt_4\mini%`,
	)
	require.NoError(t, err)
	result := tx.Find(&[]Log{})
	require.NoError(t, result.Error)
	require.NotContains(t, result.Statement.SQL.String(), "ESCAPE '!'")
	require.Len(t, result.Statement.Vars, 1)
	require.Equal(t, `gpt\_4\\mini%`, result.Statement.Vars[0])

	_, _, err = buildLogLikeCondition("logs.model_name", "%")
	require.Error(t, err)
}

func TestGetAllLogsUsesClickHouseOrderAndDisplayIDs(t *testing.T) {
	db := setupLogReconciliationDB(t)
	require.NoError(t, db.Create(&Log{
		UserId:    7,
		CreatedAt: 1700000000,
		Content:   "request-b",
		RequestId: "request-b",
	}).Error)
	require.NoError(t, db.Create(&Log{
		UserId:    7,
		CreatedAt: 1700000000,
		Content:   "request-a",
		RequestId: "request-a",
	}).Error)
	common.SetLogDatabaseType(common.DatabaseTypeClickHouse)

	logs, total, err := GetAllLogs(
		LogTypeUnknown,
		0,
		0,
		"",
		"",
		"",
		0,
		10,
		0,
		"",
		"",
		"",
	)

	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	require.Len(t, logs, 2)
	require.Equal(t, "request-b", logs[0].Content)
	require.Equal(t, "request-a", logs[1].Content)
	require.Equal(t, []int{1, 2}, []int{logs[0].Id, logs[1].Id})
}
