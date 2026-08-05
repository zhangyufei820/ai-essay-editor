package controller

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type oauthLegacyMigrationStubProvider struct {
	taken  map[string]bool
	userID int
}

func (p *oauthLegacyMigrationStubProvider) GetName() string { return "Stub" }

func (p *oauthLegacyMigrationStubProvider) IsEnabled() bool { return true }

func (p *oauthLegacyMigrationStubProvider) ExchangeToken(context.Context, string, *gin.Context) (*oauth.OAuthToken, error) {
	return nil, nil
}

func (p *oauthLegacyMigrationStubProvider) GetUserInfo(context.Context, *oauth.OAuthToken) (*oauth.OAuthUser, error) {
	return nil, nil
}

func (p *oauthLegacyMigrationStubProvider) IsUserIDTaken(providerUserID string) bool {
	return p.taken[providerUserID]
}

func (p *oauthLegacyMigrationStubProvider) FillUserByProviderID(user *model.User, providerUserID string) error {
	user.Id = p.userID
	user.GitHubId = providerUserID
	return nil
}

func (p *oauthLegacyMigrationStubProvider) SetProviderUserID(user *model.User, providerUserID string) {
	user.GitHubId = providerUserID
}

func (p *oauthLegacyMigrationStubProvider) GetProviderPrefix() string { return "stub_" }

func setupOAuthLegacyMigrationTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))

	originalDB := model.DB
	model.DB = db
	t.Cleanup(func() {
		model.DB = originalDB
		sqlDatabase, err := db.DB()
		if err == nil {
			_ = sqlDatabase.Close()
		}
	})

	return db
}

func newOAuthLegacyMigrationUser() *oauth.OAuthUser {
	return &oauth.OAuthUser{
		ProviderUserID: "9001",
		Extra: map[string]any{
			"legacy_id": "legacy-login",
		},
	}
}

func createOAuthLegacyMigrationVictim(t *testing.T, db *gorm.DB) model.User {
	t.Helper()

	victim := model.User{
		Id:       101,
		Username: "legacy-victim",
		GitHubId: "legacy-login",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		AffCode:  "legacy-victim-aff",
	}
	require.NoError(t, db.Create(&victim).Error)
	return victim
}

func TestFindOrCreateOAuthUserRejectsLegacyMatchWhenMigrationDisabled(t *testing.T) {
	db := setupOAuthLegacyMigrationTestDB(t)
	victim := createOAuthLegacyMigrationVictim(t, db)
	for _, value := range []string{"", "false", "TRUE"} {
		t.Run(fmt.Sprintf("flag=%q", value), func(t *testing.T) {
			t.Setenv("GITHUB_LEGACY_MIGRATION_ENABLED", value)

			found, err := findOrCreateOAuthUser(nil, &oauth.GitHubProvider{}, newOAuthLegacyMigrationUser(), nil)

			require.Nil(t, found)
			var migrationDisabled *OAuthLegacyMigrationDisabledError
			require.ErrorAs(t, err, &migrationDisabled)

			var stored model.User
			require.NoError(t, db.First(&stored, victim.Id).Error)
			require.Equal(t, "legacy-login", stored.GitHubId)
		})
	}
}

func TestFindOrCreateOAuthUserMigratesGitHubLegacyMatchWhenEnabled(t *testing.T) {
	db := setupOAuthLegacyMigrationTestDB(t)
	victim := createOAuthLegacyMigrationVictim(t, db)
	t.Setenv("GITHUB_LEGACY_MIGRATION_ENABLED", "true")

	found, err := findOrCreateOAuthUser(nil, &oauth.GitHubProvider{}, newOAuthLegacyMigrationUser(), nil)

	require.NoError(t, err)
	require.Equal(t, victim.Id, found.Id)
	var stored model.User
	require.NoError(t, db.First(&stored, victim.Id).Error)
	require.Equal(t, "9001", stored.GitHubId)
}

func TestFindOrCreateOAuthUserFailsClosedWhenLegacyMigrationUpdateFails(t *testing.T) {
	db := setupOAuthLegacyMigrationTestDB(t)
	victim := createOAuthLegacyMigrationVictim(t, db)
	require.NoError(t, db.Exec(`CREATE TRIGGER reject_github_id_update BEFORE UPDATE OF github_id ON users BEGIN SELECT RAISE(ABORT, 'simulated migration failure'); END;`).Error)
	t.Setenv("GITHUB_LEGACY_MIGRATION_ENABLED", "true")

	found, err := findOrCreateOAuthUser(nil, &oauth.GitHubProvider{}, newOAuthLegacyMigrationUser(), nil)

	require.Nil(t, found)
	var migrationFailed *OAuthLegacyMigrationFailedError
	require.ErrorAs(t, err, &migrationFailed)
	var stored model.User
	require.NoError(t, db.First(&stored, victim.Id).Error)
	require.Equal(t, "legacy-login", stored.GitHubId)
}

func TestFindOrCreateOAuthUserDoesNotMigrateNonGitHubProvider(t *testing.T) {
	db := setupOAuthLegacyMigrationTestDB(t)
	victim := createOAuthLegacyMigrationVictim(t, db)
	originalRegisterEnabled := common.RegisterEnabled
	common.RegisterEnabled = false
	t.Cleanup(func() { common.RegisterEnabled = originalRegisterEnabled })
	t.Setenv("GITHUB_LEGACY_MIGRATION_ENABLED", "true")

	provider := &oauthLegacyMigrationStubProvider{
		taken:  map[string]bool{"legacy-login": true},
		userID: victim.Id,
	}
	found, err := findOrCreateOAuthUser(nil, provider, newOAuthLegacyMigrationUser(), nil)

	require.Nil(t, found)
	var registrationDisabled *OAuthRegistrationDisabledError
	require.ErrorAs(t, err, &registrationDisabled)
	var stored model.User
	require.NoError(t, db.First(&stored, victim.Id).Error)
	require.Equal(t, "legacy-login", stored.GitHubId)
}

func TestFindOrCreateOAuthUserRejectsSoftDeletedLegacyUser(t *testing.T) {
	db := setupOAuthLegacyMigrationTestDB(t)
	victim := createOAuthLegacyMigrationVictim(t, db)
	require.NoError(t, db.Delete(&victim).Error)
	t.Setenv("GITHUB_LEGACY_MIGRATION_ENABLED", "true")

	found, err := findOrCreateOAuthUser(nil, &oauth.GitHubProvider{}, newOAuthLegacyMigrationUser(), nil)

	require.Nil(t, found)
	var deleted *OAuthUserDeletedError
	require.ErrorAs(t, err, &deleted)
}

func TestFindOrCreateOAuthUserKeepsNumericGitHubLoginUnchanged(t *testing.T) {
	db := setupOAuthLegacyMigrationTestDB(t)
	existing := model.User{
		Id:       202,
		Username: "numeric-user",
		GitHubId: "9001",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		AffCode:  "numeric-user-aff",
	}
	require.NoError(t, db.Create(&existing).Error)
	t.Setenv("GITHUB_LEGACY_MIGRATION_ENABLED", "false")

	found, err := findOrCreateOAuthUser(nil, &oauth.GitHubProvider{}, newOAuthLegacyMigrationUser(), nil)

	require.NoError(t, err)
	require.Equal(t, existing.Id, found.Id)
	var stored model.User
	require.NoError(t, db.First(&stored, existing.Id).Error)
	require.Equal(t, "9001", stored.GitHubId)
}
