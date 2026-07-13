package model

import (
	"bytes"
	"log"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

type safeGormLoggerTestRecord struct {
	ID     int `gorm:"primaryKey"`
	Secret string
}

func TestSafeGormLoggerKeepsQueryParametersOutOfLogs(t *testing.T) {
	var output bytes.Buffer
	originalDefault := gormlogger.Default
	gormlogger.Default = newSafeGormLogger(log.New(&output, "", 0))
	t.Cleanup(func() {
		gormlogger.Default = originalDefault
	})
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&safeGormLoggerTestRecord{}))
	secret := "credential-that-must-never-appear-in-sql-logs"
	require.NoError(t, db.Create(&safeGormLoggerTestRecord{Secret: secret}).Error)
	output.Reset()

	var record safeGormLoggerTestRecord
	require.NoError(t, db.Debug().Where("secret = ?", secret).First(&record).Error)

	require.NotContains(t, output.String(), secret)
	require.Contains(t, output.String(), "secret = ?")

	missingSecret := "missing-credential-that-must-stay-redacted"
	output.Reset()
	err = db.Debug().Where("secret = ?", missingSecret).First(&record).Error
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	require.NotContains(t, output.String(), missingSecret)
	require.Contains(t, output.String(), "secret = ?")
}
