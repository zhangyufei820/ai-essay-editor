package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTaskPublicIDUniqueIndexDDLIsExplicit(t *testing.T) {
	mysqlDDL, err := taskPublicIDUniqueIndexDDL("mysql")
	require.NoError(t, err)
	require.Equal(t, "CREATE UNIQUE INDEX ux_tasks_task_id ON tasks (task_id)", mysqlDDL)
}

func TestScanMySQLIndexColumnsPreservesNullableMetadata(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	rows, err := database.Raw(`SELECT 1 AS seq_in_index, 0 AS non_unique,
		'task_id' AS column_name, NULL AS sub_part`).Rows()
	require.NoError(t, err)
	defer rows.Close()

	columns, err := scanMySQLIndexColumns(rows)
	require.NoError(t, err)
	require.Len(t, columns, 1)
	require.Equal(t, 1, columns[0].SeqInIndex)
	require.Zero(t, columns[0].NonUnique)
	require.Equal(t, "task_id", columns[0].ColumnName.String)
	require.True(t, columns[0].ColumnName.Valid)
	require.False(t, columns[0].SubPart.Valid)
}

func TestPostgresIndexMetadataQuerySupportsPostgres96(t *testing.T) {
	require.NotContains(t, postgresIndexMetadataQuery, "indnkeyatts")
	for _, field := range []string{"indnatts", "indisvalid", "indisready", "indislive"} {
		require.Contains(t, postgresIndexMetadataQuery, field)
	}
}

func TestTaskPublicIDPostgresIndexRequiresLiveReadyValidUniqueDefinition(t *testing.T) {
	valid := postgresIndexMetadata{
		Found: true, Unique: true, Valid: true, Ready: true, Live: true,
		KeyCount: 1, TotalCount: 1,
		Definition: "CREATE UNIQUE INDEX ux_tasks_task_id ON public.tasks USING btree (task_id)",
	}
	require.True(t, isSafeTaskPublicIDPostgresIndex(valid))

	unsafeDefinitions := []postgresIndexMetadata{
		func() postgresIndexMetadata { value := valid; value.Unique = false; return value }(),
		func() postgresIndexMetadata { value := valid; value.Valid = false; return value }(),
		func() postgresIndexMetadata { value := valid; value.Ready = false; return value }(),
		func() postgresIndexMetadata { value := valid; value.Live = false; return value }(),
		func() postgresIndexMetadata { value := valid; value.TotalCount = 2; return value }(),
		func() postgresIndexMetadata { value := valid; value.Predicate = "task_id IS NOT NULL"; return value }(),
	}
	for _, metadata := range unsafeDefinitions {
		require.False(t, isSafeTaskPublicIDPostgresIndex(metadata))
	}
}

func TestEnsureTaskPublicIDUniqueIndexIsIdempotent(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, database.AutoMigrate(&Task{}))
	require.NoError(t, database.Create(&Task{TaskID: "task_unique_one", UserId: 1}).Error)

	require.NoError(t, EnsureTaskPublicIDUniqueIndex())
	require.NoError(t, EnsureTaskPublicIDUniqueIndex())
	require.True(t, database.Migrator().HasIndex(&Task{}, taskPublicIDUniqueIndexName))
	require.Error(t, database.Create(&Task{TaskID: "task_unique_one", UserId: 2}).Error)
}

func TestEnsureTaskPublicIDUniqueIndexRejectsDuplicates(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, database.AutoMigrate(&Task{}))
	require.NoError(t, database.Create(&Task{TaskID: "task_duplicate", UserId: 1}).Error)
	require.NoError(t, database.Create(&Task{TaskID: "task_duplicate", UserId: 2}).Error)

	err := EnsureTaskPublicIDUniqueIndex()
	require.ErrorContains(t, err, "duplicate groups")
	require.False(t, database.Migrator().HasIndex(&Task{}, taskPublicIDUniqueIndexName))
}

func TestEnsureTaskPublicIDUniqueIndexRejectsEmptyIDs(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, database.AutoMigrate(&Task{}))
	require.NoError(t, database.Create(&Task{TaskID: "", UserId: 1}).Error)

	err := EnsureTaskPublicIDUniqueIndex()
	require.ErrorContains(t, err, "empty ids")
}
