package model

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUserOAuthIdentityMySQLDDLUses57CompatibleGeneratedColumns(t *testing.T) {
	identity := userOAuthIdentityDefinitions[0]
	generatedColumnDDL := userOAuthIdentityGeneratedColumnDDL(identity)
	indexDDL, err := userOAuthIdentityIndexDDL("mysql", identity)
	require.NoError(t, err)

	require.Contains(t, generatedColumnDDL, "GENERATED ALWAYS AS (NULLIF(BINARY github_id, _binary'')) STORED")
	require.Contains(t, generatedColumnDDL, "VARBINARY(764)")
	require.Equal(t, "CREATE UNIQUE INDEX ux_users_github_id_nonempty ON users (github_id_binary)", indexDDL)
	require.NotContains(t, strings.ToLower(indexDDL), "nullif")
	require.NotContains(t, indexDDL, "((")
	predicate, err := oauthBinaryEqualityPredicateForDialect("mysql", identity.Column, identity.NormalizedColumn)
	require.NoError(t, err)
	require.Equal(t, "github_id_binary = BINARY ?", predicate)
}

func TestUserOAuthIdentityPartialIndexDDLExcludesEmptyButNotSoftDeletedRows(t *testing.T) {
	identity := userOAuthIdentityDefinitions[0]
	for _, dialect := range []string{"sqlite", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			ddl, err := userOAuthIdentityIndexDDL(dialect, identity)
			require.NoError(t, err)
			require.Contains(t, ddl, "github_id IS NOT NULL AND github_id <> ''")
			if dialect == "sqlite" {
				require.Contains(t, ddl, "github_id COLLATE BINARY")
			} else {
				require.Contains(t, ddl, `github_id COLLATE "C"`)
			}
			require.NotContains(t, ddl, "deleted_at")
		})
	}
}

func setupOAuthIdentitySQLiteDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := DB
	previousRedisEnabled := common.RedisEnabled
	databasePath := filepath.Join(t.TempDir(), "oauth-identity.db")
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", databasePath)
	database, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.AutoMigrate(&User{}, &UserOAuthBinding{}))
	DB = database
	common.RedisEnabled = false
	t.Cleanup(func() {
		DB = previousDB
		common.RedisEnabled = previousRedisEnabled
		sqlDB, sqlErr := database.DB()
		if sqlErr == nil {
			_ = sqlDB.Close()
		}
	})
	return database
}

func createOAuthIdentityTestUser(t *testing.T, database *gorm.DB, id int, username string) User {
	t.Helper()
	user := User{
		Id:       id,
		Username: username,
		Status:   common.UserStatusEnabled,
		Group:    "default",
		AffCode:  fmt.Sprintf("oa%d", id),
	}
	require.NoError(t, database.Create(&user).Error)
	return user
}

func TestEnsureUserOAuthIdentityUniqueIndexesIsIdempotentAndAllowsEmptyValues(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	for index := 0; index < 3; index++ {
		createOAuthIdentityTestUser(t, database, 8200+index, fmt.Sprintf("empty-oauth-%d", index))
	}

	require.NoError(t, EnsureUserOAuthIdentityUniqueIndexes())
	require.NoError(t, EnsureUserOAuthIdentityUniqueIndexes())

	for _, identity := range userOAuthIdentityDefinitions {
		require.True(t, database.Migrator().HasIndex(&User{}, identity.IndexName), identity.IndexName)
	}
}

func TestEnsureUserOAuthIdentityUniqueIndexesRejectsExistingDuplicates(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	first := createOAuthIdentityTestUser(t, database, 8210, "duplicate-oauth-1")
	second := createOAuthIdentityTestUser(t, database, 8211, "duplicate-oauth-2")
	require.NoError(t, database.Model(&first).Update("github_id", "duplicate-subject").Error)
	require.NoError(t, database.Model(&second).Update("github_id", "duplicate-subject").Error)

	err := EnsureUserOAuthIdentityUniqueIndexes()
	require.ErrorContains(t, err, "github_id")
	require.NotContains(t, err.Error(), "duplicate-subject")
	require.False(t, database.Migrator().HasIndex(&User{}, "ux_users_github_id_nonempty"))
}

func TestUserOAuthIdentityUniqueIndexesCoverEveryBuiltInProviderAndSoftDeletes(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, EnsureUserOAuthIdentityUniqueIndexes())

	for index, identity := range userOAuthIdentityDefinitions {
		owner := createOAuthIdentityTestUser(t, database, 8230+index*2, fmt.Sprintf("identity-owner-%d", index))
		challenger := createOAuthIdentityTestUser(t, database, 8231+index*2, fmt.Sprintf("identity-challenger-%d", index))
		subject := fmt.Sprintf("provider-subject-%d", index)
		require.NoError(t, SetUserOAuthIdentity(owner.Id, identity.Provider, subject))
		require.NoError(t, database.Delete(&owner).Error)

		err := SetUserOAuthIdentity(challenger.Id, identity.Provider, subject)
		require.ErrorIs(t, err, ErrUserOAuthIdentityAlreadyBound, identity.Column)

		found, exists, lookupErr := LookupUserByOAuthIdentity(identity.Provider, subject)
		require.NoError(t, lookupErr)
		require.True(t, exists)
		require.True(t, found.DeletedAt.Valid)
		require.Equal(t, owner.Id, found.Id)
	}
}

func TestUserOAuthIdentitySubjectsUseBinaryCaseSensitiveSemantics(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, EnsureUserOAuthIdentityUniqueIndexes())
	upper := createOAuthIdentityTestUser(t, database, 8248, "binary-oauth-upper")
	lower := createOAuthIdentityTestUser(t, database, 8249, "binary-oauth-lower")

	require.NoError(t, SetUserOAuthIdentity(upper.Id, UserOAuthProviderOIDC, "CaseSensitiveSubject"))
	require.NoError(t, SetUserOAuthIdentity(lower.Id, UserOAuthProviderOIDC, "casesensitivesubject"))

	foundUpper, exists, err := LookupUserByOAuthIdentity(UserOAuthProviderOIDC, "CaseSensitiveSubject")
	require.NoError(t, err)
	require.True(t, exists)
	require.Equal(t, upper.Id, foundUpper.Id)
	foundLower, exists, err := LookupUserByOAuthIdentity(UserOAuthProviderOIDC, "casesensitivesubject")
	require.NoError(t, err)
	require.True(t, exists)
	require.Equal(t, lower.Id, foundLower.Id)
}

func TestEnsureUserOAuthIdentityUniqueIndexesRejectsDangerousSameNameIndex(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, database.Exec(`CREATE UNIQUE INDEX ux_users_github_id_nonempty
		ON users (github_id, discord_id)
		WHERE github_id IS NOT NULL AND github_id <> ''`).Error)

	err := EnsureUserOAuthIdentityUniqueIndexes()
	require.ErrorContains(t, err, "unsafe definition")
}

func TestUserOAuthIdentityLookupFailsClosedOnDatabaseError(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	sqlDB, err := database.DB()
	require.NoError(t, err)
	require.NoError(t, sqlDB.Close())

	_, _, err = LookupUserByOAuthIdentity(UserOAuthProviderGitHub, "database-error-subject")
	require.Error(t, err)
	require.True(t, IsGitHubIdAlreadyTaken("database-error-subject"))
}

func TestGenericUserUpdateCannotRestoreClearedOAuthIdentity(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, EnsureUserOAuthIdentityUniqueIndexes())
	user := createOAuthIdentityTestUser(t, database, 8250, "stale-oauth-update")
	require.NoError(t, SetUserOAuthIdentity(user.Id, UserOAuthProviderGitHub, "stale-github-subject"))
	require.NoError(t, database.First(&user, user.Id).Error)
	staleUser := user

	require.NoError(t, user.ClearBinding("github"))
	staleUser.DisplayName = "updated display name"
	require.NoError(t, staleUser.Update(false))

	var persisted User
	require.NoError(t, database.First(&persisted, user.Id).Error)
	require.Empty(t, persisted.GitHubId)
	require.Equal(t, "updated display name", persisted.DisplayName)
}

func TestConcurrentOAuthIdentityBindingAllowsExactlyOneOwner(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, EnsureUserOAuthIdentityUniqueIndexes())
	first := createOAuthIdentityTestUser(t, database, 8260, "concurrent-bind-1")
	second := createOAuthIdentityTestUser(t, database, 8261, "concurrent-bind-2")

	start := make(chan struct{})
	errorsByUser := make(chan error, 2)
	var waitGroup sync.WaitGroup
	for _, userID := range []int{first.Id, second.Id} {
		waitGroup.Add(1)
		go func(id int) {
			defer waitGroup.Done()
			<-start
			errorsByUser <- SetUserOAuthIdentity(id, UserOAuthProviderDiscord, "shared-discord-subject")
		}(userID)
	}
	close(start)
	waitGroup.Wait()
	close(errorsByUser)

	successes := 0
	conflicts := 0
	for bindErr := range errorsByUser {
		switch {
		case bindErr == nil:
			successes++
		case errors.Is(bindErr, ErrUserOAuthIdentityAlreadyBound):
			conflicts++
		default:
			t.Fatalf("unexpected bind error: %v", bindErr)
		}
	}
	require.Equal(t, 1, successes)
	require.Equal(t, 1, conflicts)
}

func TestConcurrentOAuthIdentityRegistrationAllowsExactlyOneUser(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, EnsureUserOAuthIdentityUniqueIndexes())

	start := make(chan struct{})
	registrationErrors := make(chan error, 2)
	var waitGroup sync.WaitGroup
	for index := 0; index < 2; index++ {
		waitGroup.Add(1)
		go func(candidate int) {
			defer waitGroup.Done()
			<-start
			user := User{
				Id:       8270 + candidate,
				Username: fmt.Sprintf("concurrent-register-%d", candidate),
				Status:   common.UserStatusEnabled,
				Group:    "default",
				AffCode:  fmt.Sprintf("or%d", candidate),
				GitHubId: "shared-registration-subject",
			}
			registrationErrors <- NormalizeUserOAuthIdentityError(database.Create(&user).Error)
		}(index)
	}
	close(start)
	waitGroup.Wait()
	close(registrationErrors)

	successes := 0
	conflicts := 0
	for registrationErr := range registrationErrors {
		switch {
		case registrationErr == nil:
			successes++
		case errors.Is(registrationErr, ErrUserOAuthIdentityAlreadyBound):
			conflicts++
		default:
			t.Fatalf("unexpected registration error: %v", registrationErr)
		}
	}
	require.Equal(t, 1, successes)
	require.Equal(t, 1, conflicts)
}

func TestOAuthIdentityRegistrationRollsBackWithoutOrphaningIdentity(t *testing.T) {
	database := setupOAuthIdentitySQLiteDB(t)
	require.NoError(t, EnsureUserOAuthIdentityUniqueIndexes())

	rollbackErr := errors.New("force registration rollback")
	err := database.Transaction(func(tx *gorm.DB) error {
		user := User{
			Username: "rolled-back-oauth-user",
			Status:   common.UserStatusEnabled,
			GitHubId: "rollback-github-subject",
		}
		require.NoError(t, user.InsertWithTx(tx, 0))
		return rollbackErr
	})
	require.ErrorIs(t, err, rollbackErr)

	user := User{
		Username: "replacement-oauth-user",
		Status:   common.UserStatusEnabled,
		GitHubId: "rollback-github-subject",
	}
	require.NoError(t, user.InsertWithTx(database, 0))
}
