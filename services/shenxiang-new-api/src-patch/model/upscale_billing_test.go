package model

import (
	"encoding/json"
	"github.com/QuantumNous/new-api/constant"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"testing"
)

func TestUpscaleReservationAndRefundAreAtomicAndIdempotent(t *testing.T) {
	db, e := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, e)
	old, oldLog := DB, LOG_DB
	DB, LOG_DB = db, db
	defer func() { DB, LOG_DB = old, oldLog }()
	require.NoError(t, db.AutoMigrate(&User{}, &Token{}, &Task{}, &Log{}))
	u := User{Id: 1, Username: "test", Status: 1, Quota: 1000}
	require.NoError(t, db.Create(&u).Error)
	task := &Task{TaskID: "task_test", UserId: 1, Platform: constant.TaskPlatform("playground_upscale"), Quota: 100, Properties: Properties{OriginModelName: "精准放大"}, Status: TaskStatusSubmitted}
	task.SetData(map[string]interface{}{"billing_state": "reserved"})
	require.NoError(t, ReserveUpscaleTask(task, 0))
	require.ErrorIs(t, ReserveUpscaleTask(&Task{TaskID: "task_test", UserId: 1, Platform: task.Platform, Quota: 100}, 0), ErrUpscaleTaskExists)
	require.NoError(t, UpscaleTaskTransaction(task.TaskID, func(tx *gorm.DB, t *Task) error { return RefundUnacceptedUpscaleTask(t, tx) }))
	require.Error(t, UpscaleTaskTransaction(task.TaskID, func(tx *gorm.DB, t *Task) error { return RefundUnacceptedUpscaleTask(t, tx) }))
	require.NoError(t, db.First(&u, 1).Error)
	require.Equal(t, 1000, u.Quota)
	var count int64
	db.Model(&Log{}).Count(&count)
	require.Equal(t, int64(2), count)
	var stored Task
	require.NoError(t, db.First(&stored, task.ID).Error)
	var data map[string]interface{}
	require.NoError(t, json.Unmarshal(stored.Data, &data))
	require.Equal(t, "refunded", data["billing_state"])
}
