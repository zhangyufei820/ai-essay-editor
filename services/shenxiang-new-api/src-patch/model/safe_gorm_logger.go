package model

import (
	"log"
	"os"
	"time"

	gormlogger "gorm.io/gorm/logger"
)

func init() {
	gormlogger.Default = newSafeGormLogger(log.New(os.Stdout, "\r\n", log.LstdFlags))
}

func newSafeGormLogger(writer gormlogger.Writer) gormlogger.Interface {
	return gormlogger.New(writer, gormlogger.Config{
		SlowThreshold:             200 * time.Millisecond,
		LogLevel:                  gormlogger.Warn,
		IgnoreRecordNotFoundError: false,
		ParameterizedQueries:      true,
		Colorful:                  true,
	})
}
