package model

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"
)

type UserOAuthProvider string

const (
	UserOAuthProviderGitHub   UserOAuthProvider = "github"
	UserOAuthProviderDiscord  UserOAuthProvider = "discord"
	UserOAuthProviderOIDC     UserOAuthProvider = "oidc"
	UserOAuthProviderWeChat   UserOAuthProvider = "wechat"
	UserOAuthProviderTelegram UserOAuthProvider = "telegram"
	UserOAuthProviderLinuxDO  UserOAuthProvider = "linuxdo"
)

var ErrUserOAuthIdentityAlreadyBound = errors.New("OAuth identity is already bound")

type userOAuthIdentityDefinition struct {
	Provider         UserOAuthProvider
	Column           string
	NormalizedColumn string
	IndexName        string
}

var userOAuthIdentityDefinitions = []userOAuthIdentityDefinition{
	{Provider: UserOAuthProviderGitHub, Column: "github_id", NormalizedColumn: "github_id_binary", IndexName: "ux_users_github_id_nonempty"},
	{Provider: UserOAuthProviderDiscord, Column: "discord_id", NormalizedColumn: "discord_id_binary", IndexName: "ux_users_discord_id_nonempty"},
	{Provider: UserOAuthProviderOIDC, Column: "oidc_id", NormalizedColumn: "oidc_id_binary", IndexName: "ux_users_oidc_id_nonempty"},
	{Provider: UserOAuthProviderWeChat, Column: "wechat_id", NormalizedColumn: "wechat_id_binary", IndexName: "ux_users_wechat_id_nonempty"},
	{Provider: UserOAuthProviderTelegram, Column: "telegram_id", NormalizedColumn: "telegram_id_binary", IndexName: "ux_users_telegram_id_nonempty"},
	{Provider: UserOAuthProviderLinuxDO, Column: "linux_do_id", NormalizedColumn: "linux_do_id_binary", IndexName: "ux_users_linux_do_id_nonempty"},
}

func userOAuthIdentityDefinitionFor(provider UserOAuthProvider) (userOAuthIdentityDefinition, error) {
	for _, identity := range userOAuthIdentityDefinitions {
		if identity.Provider == provider {
			return identity, nil
		}
	}
	return userOAuthIdentityDefinition{}, fmt.Errorf("unsupported OAuth identity provider %q", provider)
}

func LookupUserByOAuthIdentity(provider UserOAuthProvider, subject string) (*User, bool, error) {
	identity, err := userOAuthIdentityDefinitionFor(provider)
	if err != nil {
		return nil, false, err
	}
	if subject == "" {
		return nil, false, nil
	}
	if DB == nil {
		return nil, false, errors.New("database is not initialized")
	}

	var users []User
	predicate, err := oauthBinaryEqualityPredicate(identity.Column, identity.NormalizedColumn)
	if err != nil {
		return nil, false, err
	}
	if err := DB.Unscoped().Where(predicate, subject).Limit(2).Find(&users).Error; err != nil {
		return nil, false, err
	}
	switch len(users) {
	case 0:
		return nil, false, nil
	case 1:
		return &users[0], true, nil
	default:
		return nil, false, fmt.Errorf("multiple users own a non-empty %s OAuth identity", identity.Provider)
	}
}

func IsUserOAuthIdentityTaken(provider UserOAuthProvider, subject string) (bool, error) {
	_, found, err := LookupUserByOAuthIdentity(provider, subject)
	return found, err
}

func SetUserOAuthIdentity(userID int, provider UserOAuthProvider, subject string) error {
	return setUserOAuthIdentityWithTx(DB, userID, provider, subject)
}

func setUserOAuthIdentityWithTx(tx *gorm.DB, userID int, provider UserOAuthProvider, subject string) error {
	if tx == nil {
		return errors.New("database is not initialized")
	}
	if userID <= 0 {
		return errors.New("user id is required")
	}
	if subject == "" {
		return errors.New("OAuth identity subject is required")
	}
	identity, err := userOAuthIdentityDefinitionFor(provider)
	if err != nil {
		return err
	}

	result := tx.Model(&User{}).Where("id = ?", userID).Update(identity.Column, subject)
	if result.Error != nil {
		return NormalizeUserOAuthIdentityError(result.Error)
	}
	if result.RowsAffected != 1 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (user *User) SetOAuthIdentity(provider UserOAuthProvider, subject string) error {
	if user == nil {
		return errors.New("user is required")
	}
	if err := SetUserOAuthIdentity(user.Id, provider, subject); err != nil {
		return err
	}
	if err := DB.First(user, user.Id).Error; err != nil {
		return err
	}
	return updateUserCache(*user)
}

func NormalizeUserOAuthIdentityError(err error) error {
	if err == nil || errors.Is(err, ErrUserOAuthIdentityAlreadyBound) {
		return err
	}
	message := strings.ToLower(err.Error())
	if !strings.Contains(message, "unique") && !strings.Contains(message, "duplicate") {
		return err
	}
	for _, identity := range userOAuthIdentityDefinitions {
		if strings.Contains(message, strings.ToLower(identity.IndexName)) ||
			strings.Contains(message, "users."+identity.Column) ||
			strings.Contains(message, "users_"+identity.Column) {
			return ErrUserOAuthIdentityAlreadyBound
		}
	}
	if strings.Contains(message, strings.ToLower(userOAuthBindingBinaryIndexName)) ||
		strings.Contains(message, strings.ToLower(legacyUserOAuthBindingSubjectIndexName)) ||
		strings.Contains(message, "ux_user_provider") ||
		strings.Contains(message, "user_oauth_bindings.provider_id") ||
		strings.Contains(message, "user_oauth_bindings.provider_user_id") {
		return ErrUserOAuthIdentityAlreadyBound
	}
	return err
}

func EnsureUserOAuthIdentityUniqueIndexes() error {
	if DB == nil {
		return errors.New("database is not initialized")
	}
	for _, identity := range userOAuthIdentityDefinitions {
		duplicateGroups, err := countDuplicateUserOAuthIdentityGroups(identity)
		if err != nil {
			return fmt.Errorf("check %s OAuth identity duplicates: %w", identity.Provider, err)
		}
		if duplicateGroups != 0 {
			return fmt.Errorf("OAuth identity uniqueness preflight failed for %s: %d duplicate groups", identity.Column, duplicateGroups)
		}
	}
	if err := preflightUserOAuthBindingBinaryUniqueIndex(); err != nil {
		return err
	}

	dialect := DB.Dialector.Name()
	for _, identity := range userOAuthIdentityDefinitions {
		if _, err := validateUserOAuthIdentityIndex(dialect, identity); err != nil {
			return err
		}
	}
	if _, err := validateUserOAuthBindingBinaryIndex(dialect); err != nil {
		return err
	}
	for _, identity := range userOAuthIdentityDefinitions {
		if dialect == "mysql" {
			if err := ensureMySQLUserOAuthIdentityNormalizedColumn(identity); err != nil {
				return err
			}
		}
		exists, err := validateUserOAuthIdentityIndex(dialect, identity)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		ddl, err := userOAuthIdentityIndexDDL(dialect, identity)
		if err != nil {
			return err
		}
		if err := DB.Exec(ddl).Error; err != nil {
			exists, validationErr := validateUserOAuthIdentityIndex(dialect, identity)
			if validationErr == nil && exists {
				continue
			}
			return fmt.Errorf("create OAuth identity index %s failed", identity.IndexName)
		}
		exists, err = validateUserOAuthIdentityIndex(dialect, identity)
		if err != nil {
			return err
		}
		if !exists {
			return fmt.Errorf("OAuth identity index %s was not created", identity.IndexName)
		}
	}
	return EnsureUserOAuthBindingBinaryUniqueIndex()
}

func countDuplicateUserOAuthIdentityGroups(identity userOAuthIdentityDefinition) (int64, error) {
	groupExpression, err := oauthBinaryGroupingExpression(identity.Column)
	if err != nil {
		return 0, err
	}
	query := fmt.Sprintf(
		"SELECT COUNT(*) FROM (SELECT 1 FROM users WHERE %s IS NOT NULL AND %s <> '' GROUP BY %s HAVING COUNT(*) > 1) AS duplicate_identities",
		identity.Column,
		identity.Column,
		groupExpression,
	)
	var duplicateGroups int64
	if err := DB.Raw(query).Scan(&duplicateGroups).Error; err != nil {
		return 0, err
	}
	return duplicateGroups, nil
}

func userOAuthIdentityIndexDDL(dialect string, identity userOAuthIdentityDefinition) (string, error) {
	switch dialect {
	case "mysql":
		return fmt.Sprintf(
			"CREATE UNIQUE INDEX %s ON users (%s)",
			identity.IndexName,
			identity.NormalizedColumn,
		), nil
	case "postgres":
		return fmt.Sprintf(
			`CREATE UNIQUE INDEX IF NOT EXISTS %s ON users (%s COLLATE "C") WHERE %s IS NOT NULL AND %s <> ''`,
			identity.IndexName,
			identity.Column,
			identity.Column,
			identity.Column,
		), nil
	case "sqlite":
		return fmt.Sprintf(
			"CREATE UNIQUE INDEX IF NOT EXISTS %s ON users (%s COLLATE BINARY) WHERE %s IS NOT NULL AND %s <> ''",
			identity.IndexName,
			identity.Column,
			identity.Column,
			identity.Column,
		), nil
	default:
		return "", fmt.Errorf("unsupported database dialect %q for OAuth identity indexes", dialect)
	}
}

func userOAuthIdentityGeneratedColumnDDL(identity userOAuthIdentityDefinition) string {
	return fmt.Sprintf(
		"ALTER TABLE users ADD COLUMN %s VARBINARY(764) GENERATED ALWAYS AS (NULLIF(BINARY %s, _binary'')) STORED",
		identity.NormalizedColumn,
		identity.Column,
	)
}

type mysqlGeneratedColumn struct {
	Extra                string
	GenerationExpression string
	ColumnType           string
}

func loadMySQLGeneratedColumn(tableName string, columnName string) (mysqlGeneratedColumn, bool, error) {
	row := DB.Raw(`SELECT extra, generation_expression, column_type
		FROM information_schema.columns
		WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, tableName, columnName).Row()
	return scanMySQLGeneratedColumn(row)
}

func scanMySQLGeneratedColumn(row *sql.Row) (mysqlGeneratedColumn, bool, error) {
	var column mysqlGeneratedColumn
	err := row.Scan(&column.Extra, &column.GenerationExpression, &column.ColumnType)
	if errors.Is(err, sql.ErrNoRows) {
		return mysqlGeneratedColumn{}, false, nil
	}
	if err != nil {
		return mysqlGeneratedColumn{}, false, err
	}
	return column, true, nil
}

func ensureMySQLUserOAuthIdentityNormalizedColumn(identity userOAuthIdentityDefinition) error {
	column, exists, err := loadMySQLGeneratedColumn("users", identity.NormalizedColumn)
	if err != nil {
		return err
	}
	if !exists {
		if err := DB.Exec(userOAuthIdentityGeneratedColumnDDL(identity)).Error; err != nil {
			column, exists, _ = loadMySQLGeneratedColumn("users", identity.NormalizedColumn)
			if !exists {
				return fmt.Errorf("create OAuth identity normalized column %s failed", identity.NormalizedColumn)
			}
		} else {
			column, exists, err = loadMySQLGeneratedColumn("users", identity.NormalizedColumn)
			if err != nil || !exists {
				return fmt.Errorf("OAuth identity normalized column %s was not created", identity.NormalizedColumn)
			}
		}
	}
	normalizedExtra := strings.ToLower(column.Extra)
	normalizedExpression := strings.ToLower(column.GenerationExpression)
	if !strings.Contains(normalizedExtra, "stored generated") ||
		!strings.Contains(normalizedExpression, "nullif") ||
		!strings.Contains(normalizedExpression, "binary") ||
		!strings.Contains(normalizedExpression, identity.Column) ||
		!strings.HasPrefix(strings.ToLower(column.ColumnType), "varbinary(764)") {
		return fmt.Errorf("OAuth identity normalized column %s exists with an unsafe definition", identity.NormalizedColumn)
	}
	return nil
}

func validateUserOAuthIdentityIndex(dialect string, identity userOAuthIdentityDefinition) (bool, error) {
	switch dialect {
	case "mysql":
		return validateMySQLUserOAuthIdentityIndex(identity)
	case "postgres":
		return validatePostgresUserOAuthIdentityIndex(identity)
	case "sqlite":
		return validateSQLiteUserOAuthIdentityIndex(identity)
	default:
		return false, fmt.Errorf("unsupported database dialect %q for OAuth identity indexes", dialect)
	}
}

func validateMySQLUserOAuthIdentityIndex(identity userOAuthIdentityDefinition) (bool, error) {
	columns, err := loadMySQLIndexColumns("users", identity.IndexName)
	if err != nil {
		return false, err
	}
	if len(columns) == 0 {
		return false, nil
	}
	if len(columns) != 1 || columns[0].NonUnique != 0 || columns[0].SeqInIndex != 1 || columns[0].SubPart.Valid {
		return false, fmt.Errorf("OAuth identity index %s exists with an unsafe definition", identity.IndexName)
	}
	if !columns[0].ColumnName.Valid || !strings.EqualFold(columns[0].ColumnName.String, identity.NormalizedColumn) {
		return false, fmt.Errorf("OAuth identity index %s exists on an unsafe column", identity.IndexName)
	}
	return true, nil
}

func validatePostgresUserOAuthIdentityIndex(identity userOAuthIdentityDefinition) (bool, error) {
	metadata, err := loadPostgresIndexMetadata("users", identity.IndexName)
	if err != nil {
		return false, err
	}
	if !metadata.Found {
		return false, nil
	}
	normalizedDefinition := normalizeIndexDefinition(metadata.Definition)
	normalizedPredicate := normalizeIndexDefinition(metadata.Predicate)
	if !metadata.Unique || !metadata.Valid || !metadata.Ready || !metadata.Live ||
		metadata.KeyCount != 1 || metadata.TotalCount != 1 ||
		!strings.Contains(normalizedDefinition, identity.Column+` collate "c"`) ||
		!strings.Contains(normalizedPredicate, identity.Column+" is not null") ||
		!strings.Contains(normalizedPredicate, identity.Column+" <> ''") ||
		strings.Contains(normalizedPredicate, "deleted_at") {
		return false, fmt.Errorf("OAuth identity index %s exists with an unsafe definition", identity.IndexName)
	}
	return true, nil
}

func validateSQLiteUserOAuthIdentityIndex(identity userOAuthIdentityDefinition) (bool, error) {
	metadata, err := loadSQLiteIndexMetadata("users", identity.IndexName)
	if err != nil {
		return false, err
	}
	if !metadata.Found {
		return false, nil
	}
	normalizedDefinition := normalizeIndexDefinition(metadata.Definition)
	if !metadata.Unique || !metadata.Partial || len(metadata.Keys) != 1 ||
		!metadata.Keys[0].Name.Valid || metadata.Keys[0].Name.String != identity.Column ||
		!metadata.Keys[0].Collation.Valid || !strings.EqualFold(metadata.Keys[0].Collation.String, "BINARY") ||
		!strings.Contains(normalizedDefinition, "on users ("+identity.Column+" collate binary)") ||
		!strings.Contains(normalizedDefinition, "where "+identity.Column+" is not null and "+identity.Column+" <> ''") ||
		strings.Contains(normalizedDefinition, "deleted_at") {
		return false, fmt.Errorf("OAuth identity index %s exists with an unsafe definition", identity.IndexName)
	}
	return true, nil
}

func oauthBinaryEqualityPredicate(column string, mysqlBinaryColumn string) (string, error) {
	return oauthBinaryEqualityPredicateForDialect(DB.Dialector.Name(), column, mysqlBinaryColumn)
}

func oauthBinaryEqualityPredicateForDialect(dialect string, column string, mysqlBinaryColumn string) (string, error) {
	switch dialect {
	case "mysql":
		return mysqlBinaryColumn + " = BINARY ?", nil
	case "postgres":
		return column + ` COLLATE "C" = ?`, nil
	case "sqlite":
		return column + " COLLATE BINARY = ?", nil
	default:
		return "", fmt.Errorf("unsupported database dialect %q for OAuth identity comparison", dialect)
	}
}

func oauthBinaryGroupingExpression(column string) (string, error) {
	switch DB.Dialector.Name() {
	case "mysql":
		return "BINARY " + column, nil
	case "postgres":
		return column + ` COLLATE "C"`, nil
	case "sqlite":
		return column + " COLLATE BINARY", nil
	default:
		return "", fmt.Errorf("unsupported database dialect %q for OAuth identity grouping", DB.Dialector.Name())
	}
}

type mysqlIndexColumn struct {
	SeqInIndex int            `gorm:"column:seq_in_index"`
	NonUnique  int            `gorm:"column:non_unique"`
	ColumnName sql.NullString `gorm:"column:column_name"`
	SubPart    sql.NullInt64  `gorm:"column:sub_part"`
}

func loadMySQLIndexColumns(tableName string, indexName string) ([]mysqlIndexColumn, error) {
	rows, err := DB.Raw(`SELECT seq_in_index, non_unique, column_name, sub_part
		FROM information_schema.statistics
		WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
		ORDER BY seq_in_index`, tableName, indexName).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMySQLIndexColumns(rows)
}

func scanMySQLIndexColumns(rows *sql.Rows) ([]mysqlIndexColumn, error) {
	columns := make([]mysqlIndexColumn, 0)
	for rows.Next() {
		var column mysqlIndexColumn
		if err := rows.Scan(&column.SeqInIndex, &column.NonUnique, &column.ColumnName, &column.SubPart); err != nil {
			return nil, err
		}
		columns = append(columns, column)
	}
	return columns, rows.Err()
}

type postgresIndexMetadata struct {
	Found      bool
	Unique     bool
	Valid      bool
	Ready      bool
	Live       bool
	KeyCount   int
	TotalCount int
	Definition string
	Predicate  string
}

const postgresIndexMetadataQuery = `SELECT i.indisunique, i.indisvalid, i.indisready, i.indislive, i.indnatts,
		pg_get_indexdef(i.indexrelid) AS index_definition,
		COALESCE(pg_get_expr(i.indpred, i.indrelid), '') AS index_predicate
		FROM pg_index i
		JOIN pg_class idx ON idx.oid = i.indexrelid
		JOIN pg_class tbl ON tbl.oid = i.indrelid
		JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
		WHERE ns.nspname = current_schema() AND tbl.relname = ? AND idx.relname = ?`

func loadPostgresIndexMetadata(tableName string, indexName string) (postgresIndexMetadata, error) {
	type postgresIndexRow struct {
		Unique     bool   `gorm:"column:indisunique"`
		Valid      bool   `gorm:"column:indisvalid"`
		Ready      bool   `gorm:"column:indisready"`
		Live       bool   `gorm:"column:indislive"`
		TotalCount int    `gorm:"column:indnatts"`
		Definition string `gorm:"column:index_definition"`
		Predicate  string `gorm:"column:index_predicate"`
	}
	var row postgresIndexRow
	result := DB.Raw(postgresIndexMetadataQuery, tableName, indexName).Scan(&row)
	if result.Error != nil {
		return postgresIndexMetadata{}, result.Error
	}
	if result.RowsAffected == 0 {
		return postgresIndexMetadata{}, nil
	}
	return postgresIndexMetadata{
		Found:      true,
		Unique:     row.Unique,
		Valid:      row.Valid,
		Ready:      row.Ready,
		Live:       row.Live,
		KeyCount:   row.TotalCount,
		TotalCount: row.TotalCount,
		Definition: row.Definition,
		Predicate:  row.Predicate,
	}, nil
}

type sqliteIndexKey struct {
	SeqNo     int            `gorm:"column:seqno"`
	Name      sql.NullString `gorm:"column:name"`
	Collation sql.NullString `gorm:"column:coll"`
	Key       int            `gorm:"column:key"`
}

type sqliteIndexMetadata struct {
	Found      bool
	Unique     bool
	Partial    bool
	Definition string
	Keys       []sqliteIndexKey
}

func loadSQLiteIndexMetadata(tableName string, indexName string) (sqliteIndexMetadata, error) {
	type sqliteIndexListRow struct {
		Name    string `gorm:"column:name"`
		Unique  int    `gorm:"column:unique"`
		Partial int    `gorm:"column:partial"`
	}
	var indexes []sqliteIndexListRow
	if err := DB.Raw(fmt.Sprintf("PRAGMA index_list('%s')", tableName)).Scan(&indexes).Error; err != nil {
		return sqliteIndexMetadata{}, err
	}
	metadata := sqliteIndexMetadata{}
	for _, index := range indexes {
		if index.Name == indexName {
			metadata.Found = true
			metadata.Unique = index.Unique == 1
			metadata.Partial = index.Partial == 1
			break
		}
	}
	if !metadata.Found {
		return metadata, nil
	}
	var allKeys []sqliteIndexKey
	if err := DB.Raw(fmt.Sprintf("PRAGMA index_xinfo('%s')", indexName)).Scan(&allKeys).Error; err != nil {
		return sqliteIndexMetadata{}, err
	}
	for _, key := range allKeys {
		if key.Key == 1 {
			metadata.Keys = append(metadata.Keys, key)
		}
	}
	var definition sql.NullString
	result := DB.Raw(`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?`, indexName).Scan(&definition)
	if result.Error != nil {
		return sqliteIndexMetadata{}, result.Error
	}
	if result.RowsAffected != 1 || !definition.Valid {
		return sqliteIndexMetadata{}, fmt.Errorf("SQLite index %s has no SQL definition", indexName)
	}
	metadata.Definition = definition.String
	return metadata, nil
}

func normalizeIndexDefinition(definition string) string {
	normalized := strings.NewReplacer("`", "", "\n", " ", "\t", " ").Replace(strings.ToLower(definition))
	return strings.Join(strings.Fields(normalized), " ")
}
