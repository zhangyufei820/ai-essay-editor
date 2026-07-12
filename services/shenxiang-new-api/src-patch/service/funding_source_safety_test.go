package service

import (
	"errors"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestWalletFundingNeverOverdrawsUserQuota(t *testing.T) {
	previousDB := model.DB
	previousRedisEnabled := common.RedisEnabled
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedisEnabled
	})

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	model.DB = db
	common.RedisEnabled = false
	require.NoError(t, db.Create(&model.User{
		Id:       77,
		Username: "wallet-user",
		Password: "not-used-in-this-test",
		Quota:    100,
	}).Error)

	first := &WalletFunding{userId: 77}
	require.NoError(t, first.PreConsume(80))
	second := &WalletFunding{userId: 77}
	err = second.PreConsume(80)
	require.True(t, errors.Is(err, model.ErrInsufficientQuota), "unexpected error: %v", err)

	var user model.User
	require.NoError(t, db.First(&user, 77).Error)
	require.Equal(t, 20, user.Quota)
}

func TestSubscriptionFundingCloseReleasesConcurrencyOnce(t *testing.T) {
	var releaseCalls atomic.Int32
	funding := &SubscriptionFunding{
		releaseConcurrency: func() { releaseCalls.Add(1) },
	}
	var waitGroup sync.WaitGroup
	for index := 0; index < 10; index++ {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			funding.Close()
		}()
	}
	waitGroup.Wait()
	require.EqualValues(t, 1, releaseCalls.Load())
}

func TestWalletFundingSettlementNeverOverdrawsUserQuota(t *testing.T) {
	previousDB := model.DB
	previousRedisEnabled := common.RedisEnabled
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedisEnabled
	})

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	model.DB = db
	common.RedisEnabled = false
	require.NoError(t, db.Create(&model.User{
		Id:       78,
		Username: "settlement-user",
		Password: "not-used-in-this-test",
		Quota:    30,
	}).Error)

	funding := &WalletFunding{userId: 78}
	err = funding.Settle(40)
	require.True(t, errors.Is(err, model.ErrInsufficientQuota), "unexpected error: %v", err)

	var user model.User
	require.NoError(t, db.First(&user, 78).Error)
	require.Equal(t, 30, user.Quota)
}
