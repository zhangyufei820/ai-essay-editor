package model

import (
	"github.com/QuantumNous/new-api/constant"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"testing"
)

func TestUpscaleTasksAreExcludedBeforeGenericTaskQueryLimits(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	old := DB
	DB = db
	defer func() { DB = old }()
	require.NoError(t, db.AutoMigrate(&Task{}))
	u := Task{TaskID: "upscale", Platform: constant.TaskPlatformPlaygroundUpscale, Status: TaskStatusInProgress, Progress: "50%", SubmitTime: 1}
	require.NoError(t, db.Create(&u).Error)
	require.False(t, HasUnfinishedSyncTasks())
	require.Empty(t, GetTimedOutUnfinishedTasks(100, 1))
	require.Empty(t, GetAllUnFinishSyncTasks(1))
	v := Task{TaskID: "video", Platform: "video", Status: TaskStatusSubmitted, Progress: "5%", SubmitTime: 2}
	require.NoError(t, db.Create(&v).Error)
	require.True(t, HasUnfinishedSyncTasks())
	for _, got := range [][]*Task{GetTimedOutUnfinishedTasks(100, 1), GetAllUnFinishSyncTasks(1)} {
		require.Len(t, got, 1)
		require.Equal(t, "video", got[0].TaskID)
	}
}
