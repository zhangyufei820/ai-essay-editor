package model

import (
	"errors"
	"fmt"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUserOAuthBindingBinaryIndexDDLIsDialectSpecific(t *testing.T) {
	generatedColumnDDL := userOAuthBindingGeneratedColumnDDL()
	require.Contains(t, generatedColumnDDL, "VARBINARY(1024)")
	require.Contains(t, generatedColumnDDL, "NULLIF(BINARY provider_user_id, _binary'')")

	mysqlDDL, err := userOAuthBindingIndexDDL("mysql")
	require.NoError(t, err)
	require.Equal(t, "CREATE UNIQUE INDEX ux_oauth_bindings_provider_subject_binary ON user_oauth_bindings (provider_id, provider_user_id_binary)", mysqlDDL)
	predicate, err := oauthBinaryEqualityPredicateForDialect("mysql", "provider_user_id", userOAuthBindingBinaryColumnName)
	require.NoError(t, err)
	require.Equal(t, "provider_user_id_binary = BINARY ?", predicate)
	sqliteDDL, err := userOAuthBindingIndexDDL("sqlite")
	require.NoError(t, err)
	require.Contains(t, sqliteDDL, "provider_user_id COLLATE BINARY")
	postgresDDL, err := userOAuthBindingIndexDDL("postgres")
	require.NoError(t, err)
	require.Contains(t, postgresDDL, `provider_user_id COLLATE "C"`)
}

func TestEnsureUserOAuthBindingBinaryUniqueIndexReplacesLegacyIndex(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, database.Exec(`CREATE UNIQUE INDEX ux_provider_userid
		ON user_oauth_bindings (provider_id, provider_user_id COLLATE NOCASE)`).Error)
	require.True(t, database.Migrator().HasIndex(&UserOAuthBinding{}, legacyUserOAuthBindingSubjectIndexName))

	require.NoError(t, EnsureUserOAuthIdentityUniqueIndexes())
	require.True(t, database.Migrator().HasIndex(&UserOAuthBinding{}, userOAuthBindingBinaryIndexName))
	require.False(t, database.Migrator().HasIndex(&UserOAuthBinding{}, legacyUserOAuthBindingSubjectIndexName))
}

func TestEnsureUserOAuthBindingBinaryUniqueIndexRejectsDuplicatesWithoutLeakingSubject(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	first := createOAuthIdentityTestUser(t, database, 8290, "generic-duplicate-1")
	second := createOAuthIdentityTestUser(t, database, 8291, "generic-duplicate-2")
	for _, userID := range []int{first.Id, second.Id} {
		require.NoError(t, database.Create(&UserOAuthBinding{
			UserId: userID, ProviderId: 500, ProviderUserId: "sensitive-duplicate-subject",
		}).Error)
	}

	err := EnsureUserOAuthIdentityUniqueIndexes()
	require.ErrorContains(t, err, "duplicate groups")
	require.NotContains(t, err.Error(), "sensitive-duplicate-subject")
	require.False(t, database.Migrator().HasIndex(&User{}, "ux_users_github_id_nonempty"))
}

func TestUserOAuthBindingSubjectsUseBinaryCaseSensitiveSemantics(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, EnsureUserOAuthIdentityUniqueIndexes())
	upper := createOAuthIdentityTestUser(t, database, 8300, "generic-oauth-upper")
	lower := createOAuthIdentityTestUser(t, database, 8301, "generic-oauth-lower")
	otherProvider := createOAuthIdentityTestUser(t, database, 8302, "generic-oauth-other-provider")

	require.NoError(t, CreateUserOAuthBinding(&UserOAuthBinding{
		UserId: upper.Id, ProviderId: 501, ProviderUserId: "GenericSubject",
	}))
	require.NoError(t, CreateUserOAuthBinding(&UserOAuthBinding{
		UserId: lower.Id, ProviderId: 501, ProviderUserId: "genericsubject",
	}))
	require.NoError(t, CreateUserOAuthBinding(&UserOAuthBinding{
		UserId: otherProvider.Id, ProviderId: 599, ProviderUserId: "GenericSubject",
	}))

	foundUpper, exists, err := LookupUserByOAuthBinding(501, "GenericSubject")
	require.NoError(t, err)
	require.True(t, exists)
	require.Equal(t, upper.Id, foundUpper.Id)
	foundLower, exists, err := LookupUserByOAuthBinding(501, "genericsubject")
	require.NoError(t, err)
	require.True(t, exists)
	require.Equal(t, lower.Id, foundLower.Id)
}

func TestUserOAuthBindingLookupKeepsSoftDeletedIdentityOccupied(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, EnsureUserOAuthIdentityUniqueIndexes())
	owner := createOAuthIdentityTestUser(t, database, 8310, "generic-oauth-deleted")
	require.NoError(t, CreateUserOAuthBinding(&UserOAuthBinding{
		UserId: owner.Id, ProviderId: 502, ProviderUserId: "deleted-generic-subject",
	}))
	require.NoError(t, database.Delete(&owner).Error)

	found, exists, err := LookupUserByOAuthBinding(502, "deleted-generic-subject")
	require.NoError(t, err)
	require.True(t, exists)
	require.True(t, found.DeletedAt.Valid)
	require.True(t, IsProviderUserIdTaken(502, "deleted-generic-subject"))
}

func TestUserOAuthBindingLookupFailsClosedOnDatabaseError(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	sqlDB, err := database.DB()
	require.NoError(t, err)
	require.NoError(t, sqlDB.Close())

	_, _, err = LookupUserByOAuthBinding(503, "database-error-generic-subject")
	require.Error(t, err)
	require.True(t, IsProviderUserIdTaken(503, "database-error-generic-subject"))
}

func TestConcurrentUserOAuthBindingAllowsExactlyOneOwner(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, EnsureUserOAuthIdentityUniqueIndexes())
	first := createOAuthIdentityTestUser(t, database, 8320, "generic-bind-race-1")
	second := createOAuthIdentityTestUser(t, database, 8321, "generic-bind-race-2")

	start := make(chan struct{})
	results := make(chan error, 2)
	var waitGroup sync.WaitGroup
	for _, userID := range []int{first.Id, second.Id} {
		waitGroup.Add(1)
		go func(id int) {
			defer waitGroup.Done()
			<-start
			results <- CreateUserOAuthBinding(&UserOAuthBinding{
				UserId: id, ProviderId: 504, ProviderUserId: "shared-generic-subject",
			})
		}(userID)
	}
	close(start)
	waitGroup.Wait()
	close(results)

	successes := 0
	conflicts := 0
	for result := range results {
		switch {
		case result == nil:
			successes++
		case errors.Is(result, ErrUserOAuthIdentityAlreadyBound):
			conflicts++
		default:
			t.Fatalf("unexpected generic OAuth binding error: %v", result)
		}
	}
	require.Equal(t, 1, successes)
	require.Equal(t, 1, conflicts)
}

func TestEnsureUserOAuthBindingBinaryUniqueIndexRejectsDangerousSameNameIndex(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, database.Exec(fmt.Sprintf(`CREATE UNIQUE INDEX %s
		ON user_oauth_bindings (provider_id, provider_user_id COLLATE NOCASE)`, userOAuthBindingBinaryIndexName)).Error)

	err := EnsureUserOAuthIdentityUniqueIndexes()
	require.ErrorContains(t, err, "unsafe definition")
	require.False(t, database.Migrator().HasIndex(&User{}, "ux_users_github_id_nonempty"))
}
