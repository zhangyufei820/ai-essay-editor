package model

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

const taskPublicIDUniqueIndexName = "ux_tasks_task_id"

func EnsureTaskPublicIDUniqueIndex() error {
	if DB == nil {
		return errors.New("database is not initialized")
	}
	if !DB.Migrator().HasTable(&Task{}) {
		return errors.New("tasks table is missing")
	}
	var invalidCount int64
	if err := DB.Model(&Task{}).Unscoped().Where("task_id IS NULL OR task_id = ''").Count(&invalidCount).Error; err != nil {
		return fmt.Errorf("check empty public task ids: %w", err)
	}
	if invalidCount != 0 {
		return fmt.Errorf("public task id uniqueness preflight failed: %d empty ids", invalidCount)
	}
	var duplicateGroups int64
	if err := DB.Raw(`SELECT COUNT(*) FROM (
		SELECT 1 FROM tasks GROUP BY task_id HAVING COUNT(*) > 1
	) AS duplicate_task_ids`).Scan(&duplicateGroups).Error; err != nil {
		return fmt.Errorf("check duplicate public task ids: %w", err)
	}
	if duplicateGroups != 0 {
		return fmt.Errorf("public task id uniqueness preflight failed: %d duplicate groups", duplicateGroups)
	}

	dialect := DB.Dialector.Name()
	exists, err := validateTaskPublicIDUniqueIndex(dialect)
	if err != nil {
		return err
	}
	if !exists {
		ddl, err := taskPublicIDUniqueIndexDDL(dialect)
		if err != nil {
			return err
		}
		if err := DB.Exec(ddl).Error; err != nil {
			exists, validationErr := validateTaskPublicIDUniqueIndex(dialect)
			if validationErr != nil {
				return fmt.Errorf("create public task id index %s: %w (validation failed: %v)", taskPublicIDUniqueIndexName, err, validationErr)
			}
			if !exists {
				return fmt.Errorf("create public task id index %s: %w", taskPublicIDUniqueIndexName, err)
			}
		}
	}
	exists, err = validateTaskPublicIDUniqueIndex(dialect)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("public task id index %s was not created", taskPublicIDUniqueIndexName)
	}
	return nil
}

func WaitForTaskPublicIDUniqueIndex(timeout time.Duration) error {
	if DB == nil {
		return errors.New("database is not initialized")
	}
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	deadline := time.Now().Add(timeout)
	var lastErr error
	for {
		if DB.Migrator().HasTable(&Task{}) {
			exists, err := validateTaskPublicIDUniqueIndex(DB.Dialector.Name())
			if err == nil && exists {
				return nil
			}
			if err != nil {
				lastErr = err
			}
		}
		if !time.Now().Before(deadline) {
			if lastErr != nil {
				return fmt.Errorf("wait for public task id index %s: %w", taskPublicIDUniqueIndexName, lastErr)
			}
			return fmt.Errorf("public task id index %s is not ready", taskPublicIDUniqueIndexName)
		}
		time.Sleep(time.Second)
	}
}

func taskPublicIDUniqueIndexDDL(dialect string) (string, error) {
	switch dialect {
	case "mysql":
		return "CREATE UNIQUE INDEX " + taskPublicIDUniqueIndexName + " ON tasks (task_id)", nil
	case "postgres", "sqlite":
		return "CREATE UNIQUE INDEX IF NOT EXISTS " + taskPublicIDUniqueIndexName + " ON tasks (task_id)", nil
	default:
		return "", fmt.Errorf("unsupported database dialect %q for public task id index", dialect)
	}
}

func validateTaskPublicIDUniqueIndex(dialect string) (bool, error) {
	switch dialect {
	case "mysql":
		columns, err := loadMySQLIndexColumns("tasks", taskPublicIDUniqueIndexName)
		if err != nil || len(columns) == 0 {
			return false, err
		}
		if len(columns) != 1 || columns[0].NonUnique != 0 || columns[0].SeqInIndex != 1 ||
			columns[0].SubPart.Valid || !columns[0].ColumnName.Valid ||
			!strings.EqualFold(columns[0].ColumnName.String, "task_id") {
			return false, fmt.Errorf("public task id index %s exists with an unsafe definition", taskPublicIDUniqueIndexName)
		}
		return true, nil
	case "postgres":
		metadata, err := loadPostgresIndexMetadata("tasks", taskPublicIDUniqueIndexName)
		if err != nil || !metadata.Found {
			return false, err
		}
		if !isSafeTaskPublicIDPostgresIndex(metadata) {
			return false, fmt.Errorf("public task id index %s exists with an unsafe definition", taskPublicIDUniqueIndexName)
		}
		return true, nil
	case "sqlite":
		metadata, err := loadSQLiteIndexMetadata("tasks", taskPublicIDUniqueIndexName)
		if err != nil || !metadata.Found {
			return false, err
		}
		if !metadata.Unique || metadata.Partial || len(metadata.Keys) != 1 ||
			!metadata.Keys[0].Name.Valid || metadata.Keys[0].Name.String != "task_id" {
			return false, fmt.Errorf("public task id index %s exists with an unsafe definition", taskPublicIDUniqueIndexName)
		}
		return true, nil
	default:
		return false, fmt.Errorf("unsupported database dialect %q for public task id index", dialect)
	}
}

func isSafeTaskPublicIDPostgresIndex(metadata postgresIndexMetadata) bool {
	definition := normalizeIndexDefinition(metadata.Definition)
	return metadata.Found && metadata.Unique && metadata.Valid && metadata.Ready && metadata.Live &&
		metadata.KeyCount == 1 && metadata.TotalCount == 1 && metadata.Predicate == "" &&
		strings.Contains(definition, "using btree (task_id)")
}
