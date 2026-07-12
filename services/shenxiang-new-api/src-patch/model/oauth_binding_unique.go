package model

import (
	"fmt"
	"strings"
)

const (
	userOAuthBindingBinaryIndexName        = "ux_oauth_bindings_provider_subject_binary"
	legacyUserOAuthBindingSubjectIndexName = "ux_provider_userid"
	userOAuthBindingBinaryColumnName       = "provider_user_id_binary"
)

func EnsureUserOAuthBindingBinaryUniqueIndex() error {
	if err := preflightUserOAuthBindingBinaryUniqueIndex(); err != nil {
		return err
	}

	dialect := DB.Dialector.Name()
	if dialect == "mysql" {
		if err := ensureMySQLUserOAuthBindingBinaryColumn(); err != nil {
			return err
		}
	}
	exists, err := validateUserOAuthBindingBinaryIndex(dialect)
	if err != nil {
		return err
	}
	if !exists {
		ddl, err := userOAuthBindingIndexDDL(dialect)
		if err != nil {
			return err
		}
		if err := DB.Exec(ddl).Error; err != nil {
			exists, validationErr := validateUserOAuthBindingBinaryIndex(dialect)
			if validationErr != nil || !exists {
				return fmt.Errorf("create custom OAuth identity index %s failed", userOAuthBindingBinaryIndexName)
			}
		}
	}
	exists, err = validateUserOAuthBindingBinaryIndex(dialect)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("custom OAuth identity index %s was not created", userOAuthBindingBinaryIndexName)
	}
	return dropLegacyUserOAuthBindingSubjectIndex(dialect)
}

func preflightUserOAuthBindingBinaryUniqueIndex() error {
	if DB == nil {
		return fmt.Errorf("database is not initialized")
	}
	if !DB.Migrator().HasTable(&UserOAuthBinding{}) {
		return fmt.Errorf("user_oauth_bindings table is missing")
	}
	duplicateGroups, err := countDuplicateUserOAuthBindingGroups()
	if err != nil {
		return fmt.Errorf("check custom OAuth identity duplicates: %w", err)
	}
	if duplicateGroups != 0 {
		return fmt.Errorf("custom OAuth identity uniqueness preflight failed: %d duplicate groups", duplicateGroups)
	}
	return nil
}

func countDuplicateUserOAuthBindingGroups() (int64, error) {
	groupExpression, err := oauthBinaryGroupingExpression("provider_user_id")
	if err != nil {
		return 0, err
	}
	query := fmt.Sprintf(`SELECT COUNT(*) FROM (
		SELECT 1 FROM user_oauth_bindings
		WHERE provider_user_id IS NOT NULL AND provider_user_id <> ''
		GROUP BY provider_id, %s HAVING COUNT(*) > 1
	) AS duplicate_oauth_bindings`, groupExpression)
	var duplicateGroups int64
	if err := DB.Raw(query).Scan(&duplicateGroups).Error; err != nil {
		return 0, err
	}
	return duplicateGroups, nil
}

func userOAuthBindingGeneratedColumnDDL() string {
	return "ALTER TABLE user_oauth_bindings ADD COLUMN " + userOAuthBindingBinaryColumnName +
		" VARBINARY(1024) GENERATED ALWAYS AS (NULLIF(BINARY provider_user_id, _binary'')) STORED"
}

func userOAuthBindingIndexDDL(dialect string) (string, error) {
	switch dialect {
	case "mysql":
		return "CREATE UNIQUE INDEX " + userOAuthBindingBinaryIndexName +
			" ON user_oauth_bindings (provider_id, " + userOAuthBindingBinaryColumnName + ")", nil
	case "postgres":
		return `CREATE UNIQUE INDEX IF NOT EXISTS ` + userOAuthBindingBinaryIndexName +
			` ON user_oauth_bindings (provider_id, provider_user_id COLLATE "C")`, nil
	case "sqlite":
		return "CREATE UNIQUE INDEX IF NOT EXISTS " + userOAuthBindingBinaryIndexName +
			" ON user_oauth_bindings (provider_id, provider_user_id COLLATE BINARY)", nil
	default:
		return "", fmt.Errorf("unsupported database dialect %q for custom OAuth identity index", dialect)
	}
}

func ensureMySQLUserOAuthBindingBinaryColumn() error {
	type mysqlGeneratedColumn struct {
		Extra                string `gorm:"column:extra"`
		GenerationExpression string `gorm:"column:generation_expression"`
		ColumnType           string `gorm:"column:column_type"`
	}
	load := func() (mysqlGeneratedColumn, bool, error) {
		var column mysqlGeneratedColumn
		result := DB.Raw(`SELECT extra, generation_expression, column_type
			FROM information_schema.columns
			WHERE table_schema = DATABASE() AND table_name = 'user_oauth_bindings' AND column_name = ?`, userOAuthBindingBinaryColumnName).Scan(&column)
		return column, result.RowsAffected == 1, result.Error
	}
	column, exists, err := load()
	if err != nil {
		return err
	}
	if !exists {
		if err := DB.Exec(userOAuthBindingGeneratedColumnDDL()).Error; err != nil {
			column, exists, _ = load()
			if !exists {
				return fmt.Errorf("create custom OAuth identity binary column failed")
			}
		} else {
			column, exists, err = load()
			if err != nil || !exists {
				return fmt.Errorf("custom OAuth identity binary column was not created")
			}
		}
	}
	normalizedExtra := strings.ToLower(column.Extra)
	normalizedExpression := strings.ToLower(column.GenerationExpression)
	if !strings.Contains(normalizedExtra, "stored generated") ||
		!strings.Contains(normalizedExpression, "nullif") ||
		!strings.Contains(normalizedExpression, "binary") ||
		!strings.Contains(normalizedExpression, "provider_user_id") ||
		!strings.HasPrefix(strings.ToLower(column.ColumnType), "varbinary(1024)") {
		return fmt.Errorf("custom OAuth identity binary column exists with an unsafe definition")
	}
	return nil
}

func validateUserOAuthBindingBinaryIndex(dialect string) (bool, error) {
	switch dialect {
	case "mysql":
		columns, err := loadMySQLIndexColumns("user_oauth_bindings", userOAuthBindingBinaryIndexName)
		if err != nil || len(columns) == 0 {
			return false, err
		}
		if len(columns) != 2 || columns[0].NonUnique != 0 || columns[1].NonUnique != 0 ||
			columns[0].SeqInIndex != 1 || columns[1].SeqInIndex != 2 ||
			columns[0].SubPart.Valid || columns[1].SubPart.Valid ||
			!columns[0].ColumnName.Valid || !strings.EqualFold(columns[0].ColumnName.String, "provider_id") ||
			!columns[1].ColumnName.Valid || !strings.EqualFold(columns[1].ColumnName.String, userOAuthBindingBinaryColumnName) {
			return false, fmt.Errorf("custom OAuth identity index %s exists with an unsafe definition", userOAuthBindingBinaryIndexName)
		}
		return true, nil
	case "postgres":
		metadata, err := loadPostgresIndexMetadata("user_oauth_bindings", userOAuthBindingBinaryIndexName)
		if err != nil || !metadata.Found {
			return false, err
		}
		normalizedDefinition := normalizeIndexDefinition(metadata.Definition)
		if !metadata.Unique || !metadata.Valid || !metadata.Ready || !metadata.Live ||
			metadata.KeyCount != 2 || metadata.TotalCount != 2 || metadata.Predicate != "" ||
			!strings.Contains(normalizedDefinition, `using btree (provider_id, provider_user_id collate "c")`) {
			return false, fmt.Errorf("custom OAuth identity index %s exists with an unsafe definition", userOAuthBindingBinaryIndexName)
		}
		return true, nil
	case "sqlite":
		metadata, err := loadSQLiteIndexMetadata("user_oauth_bindings", userOAuthBindingBinaryIndexName)
		if err != nil || !metadata.Found {
			return false, err
		}
		normalizedDefinition := normalizeIndexDefinition(metadata.Definition)
		if !metadata.Unique || metadata.Partial || len(metadata.Keys) != 2 ||
			!metadata.Keys[0].Name.Valid || metadata.Keys[0].Name.String != "provider_id" ||
			!metadata.Keys[1].Name.Valid || metadata.Keys[1].Name.String != "provider_user_id" ||
			!metadata.Keys[1].Collation.Valid || !strings.EqualFold(metadata.Keys[1].Collation.String, "BINARY") ||
			!strings.Contains(normalizedDefinition, "on user_oauth_bindings (provider_id, provider_user_id collate binary)") {
			return false, fmt.Errorf("custom OAuth identity index %s exists with an unsafe definition", userOAuthBindingBinaryIndexName)
		}
		return true, nil
	default:
		return false, fmt.Errorf("unsupported database dialect %q for custom OAuth identity index", dialect)
	}
}

func dropLegacyUserOAuthBindingSubjectIndex(dialect string) error {
	if !DB.Migrator().HasIndex(&UserOAuthBinding{}, legacyUserOAuthBindingSubjectIndexName) {
		return nil
	}
	var ddl string
	switch dialect {
	case "mysql":
		ddl = "DROP INDEX " + legacyUserOAuthBindingSubjectIndexName + " ON user_oauth_bindings"
	case "postgres", "sqlite":
		ddl = "DROP INDEX IF EXISTS " + legacyUserOAuthBindingSubjectIndexName
	default:
		return fmt.Errorf("unsupported database dialect %q for legacy custom OAuth index removal", dialect)
	}
	if err := DB.Exec(ddl).Error; err != nil {
		return fmt.Errorf("drop legacy custom OAuth identity index: %w", err)
	}
	if DB.Migrator().HasIndex(&UserOAuthBinding{}, legacyUserOAuthBindingSubjectIndexName) {
		return fmt.Errorf("legacy custom OAuth identity index still exists")
	}
	return nil
}
