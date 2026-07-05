package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

const playgroundServeMediaTestFilename = "0123456789abcdef0123456789abcdef.png"

func setupPlaygroundServeMediaTest(t *testing.T) string {
	t.Helper()

	gin.SetMode(gin.TestMode)
	root := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", root)
	t.Setenv("PLAYGROUND_MEDIA_KEEP_MINUTES", "60")

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))

	oldDB := model.DB
	model.DB = db
	t.Cleanup(func() {
		model.DB = oldDB
	})

	require.NoError(t, model.DB.Create(&model.User{
		Id:       1,
		Username: "normal-user",
		AffCode:  "normal-user-aff",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
	}).Error)
	require.NoError(t, model.DB.Create(&model.User{
		Id:       9,
		Username: "admin-user",
		AffCode:  "admin-user-aff",
		Role:     common.RoleAdminUser,
		Status:   common.UserStatusEnabled,
	}).Error)

	return root
}

func writePlaygroundServeMediaTestFile(t *testing.T, root string, userID int) {
	t.Helper()

	userDir := filepath.Join(root, playgroundMediaUserDirName(userID))
	require.NoError(t, os.MkdirAll(userDir, 0o755))
	fullPath := filepath.Join(userDir, playgroundServeMediaTestFilename)
	require.NoError(t, os.WriteFile(fullPath, []byte("png"), 0o644))
	expiresAt := time.Now().Add(time.Hour).Format(time.RFC3339)
	require.NoError(t, os.WriteFile(fullPath+".json", []byte(`{"expiresAt":"`+expiresAt+`"}`), 0o644))
}

func writePlaygroundPublicReferenceTestFile(t *testing.T, root string, userID int) {
	t.Helper()

	userDir := filepath.Join(root, playgroundMediaUserDirName(userID))
	require.NoError(t, os.MkdirAll(userDir, 0o755))
	fullPath := filepath.Join(userDir, playgroundServeMediaTestFilename)
	require.NoError(t, os.WriteFile(fullPath, []byte("png"), 0o644))
	expiresAt := time.Now().Add(time.Hour).Format(time.RFC3339)
	require.NoError(t, os.WriteFile(fullPath+".json", []byte(`{
		"expiresAt":"`+expiresAt+`",
		"metadata":{"hidden":true,"source":"video_input","public_reference":true}
	}`), 0o644))
}

func requestPlaygroundServeMedia(t *testing.T, currentUserID int, tokenID int, targetPath string) *httptest.ResponseRecorder {
	t.Helper()

	server := gin.New()
	server.GET("/pg/media/files/*filepath", func(c *gin.Context) {
		c.Set("id", currentUserID)
		if tokenID != 0 {
			c.Set("token_id", tokenID)
		}
		PlaygroundServeMedia(c)
	})

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, targetPath, nil)
	server.ServeHTTP(recorder, req)
	return recorder
}

func requestPlaygroundServePublicMedia(t *testing.T, targetPath string) *httptest.ResponseRecorder {
	t.Helper()

	server := gin.New()
	server.GET("/pg/media/public/*filepath", PlaygroundServePublicMedia)

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, targetPath, nil)
	server.ServeHTTP(recorder, req)
	return recorder
}

func TestPlaygroundServeMediaAllowsOwner(t *testing.T) {
	root := setupPlaygroundServeMediaTest(t)
	writePlaygroundServeMediaTestFile(t, root, 1)

	recorder := requestPlaygroundServeMedia(t, 1, 0, "/pg/media/files/u-1/"+playgroundServeMediaTestFilename)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "png", recorder.Body.String())
}

func TestPlaygroundServeMediaDownloadDisposition(t *testing.T) {
	root := setupPlaygroundServeMediaTest(t)
	writePlaygroundServeMediaTestFile(t, root, 1)

	recorder := requestPlaygroundServeMedia(t, 1, 0, "/pg/media/files/u-1/"+playgroundServeMediaTestFilename+"?download=1")

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, `attachment; filename="`+playgroundServeMediaTestFilename+`"`, recorder.Header().Get("Content-Disposition"))
	require.Equal(t, "png", recorder.Body.String())
}

func TestPlaygroundServeMediaRejectsCrossUserForNormalUser(t *testing.T) {
	root := setupPlaygroundServeMediaTest(t)
	writePlaygroundServeMediaTestFile(t, root, 2)

	recorder := requestPlaygroundServeMedia(t, 1, 0, "/pg/media/files/u-2/"+playgroundServeMediaTestFilename)

	require.Equal(t, http.StatusForbidden, recorder.Code)
}

func TestPlaygroundServeMediaAllowsCrossUserForAdminSession(t *testing.T) {
	root := setupPlaygroundServeMediaTest(t)
	writePlaygroundServeMediaTestFile(t, root, 2)

	recorder := requestPlaygroundServeMedia(t, 9, 0, "/pg/media/files/u-2/"+playgroundServeMediaTestFilename)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "png", recorder.Body.String())
}

func TestPlaygroundServeMediaRejectsCrossUserForAdminToken(t *testing.T) {
	root := setupPlaygroundServeMediaTest(t)
	writePlaygroundServeMediaTestFile(t, root, 2)

	recorder := requestPlaygroundServeMedia(t, 9, 88, "/pg/media/files/u-2/"+playgroundServeMediaTestFilename)

	require.Equal(t, http.StatusForbidden, recorder.Code)
}

func TestPlaygroundServeMediaRejectsInvalidPathShape(t *testing.T) {
	root := setupPlaygroundServeMediaTest(t)
	writePlaygroundServeMediaTestFile(t, root, 1)

	recorder := requestPlaygroundServeMedia(t, 1, 0, "/pg/media/files/u-1/nested/"+playgroundServeMediaTestFilename)

	require.Equal(t, http.StatusNotFound, recorder.Code)
}

func TestPlaygroundServePublicMediaAllowsSignedReference(t *testing.T) {
	root := setupPlaygroundServeMediaTest(t)
	writePlaygroundPublicReferenceTestFile(t, root, 1)
	userDir := playgroundMediaUserDirName(1)
	expiresUnix := time.Now().Add(time.Hour).Unix()
	sig := playgroundPublicMediaSignature(userDir, playgroundServeMediaTestFilename, expiresUnix)
	target := fmt.Sprintf(
		"/pg/media/public/%s/%s?expires=%d&sig=%s",
		userDir,
		playgroundServeMediaTestFilename,
		expiresUnix,
		sig,
	)

	recorder := requestPlaygroundServePublicMedia(t, target)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "png", recorder.Body.String())
}

func TestPlaygroundServePublicMediaRejectsUnsignedReference(t *testing.T) {
	root := setupPlaygroundServeMediaTest(t)
	writePlaygroundPublicReferenceTestFile(t, root, 1)

	recorder := requestPlaygroundServePublicMedia(t, "/pg/media/public/u-1/"+playgroundServeMediaTestFilename)

	require.Equal(t, http.StatusForbidden, recorder.Code)
}

func TestPlaygroundServePublicMediaRejectsPrivateCacheItem(t *testing.T) {
	root := setupPlaygroundServeMediaTest(t)
	writePlaygroundServeMediaTestFile(t, root, 1)
	userDir := playgroundMediaUserDirName(1)
	expiresUnix := time.Now().Add(time.Hour).Unix()
	sig := playgroundPublicMediaSignature(userDir, playgroundServeMediaTestFilename, expiresUnix)
	target := fmt.Sprintf(
		"/pg/media/public/%s/%s?expires=%d&sig=%s",
		userDir,
		playgroundServeMediaTestFilename,
		expiresUnix,
		sig,
	)

	recorder := requestPlaygroundServePublicMedia(t, target)

	require.Equal(t, http.StatusForbidden, recorder.Code)
}

func TestPlaygroundPublicMediaSignatureUsesRuntimeSecretFallback(t *testing.T) {
	t.Setenv("PLAYGROUND_MEDIA_PUBLIC_SIGNING_SECRET", "")
	t.Setenv("CRYPTO_SECRET", "")
	t.Setenv("SESSION_SECRET", "")
	originalCryptoSecret := common.CryptoSecret
	originalSessionSecret := common.SessionSecret
	defer func() {
		common.CryptoSecret = originalCryptoSecret
		common.SessionSecret = originalSessionSecret
	}()

	common.CryptoSecret = ""
	common.SessionSecret = "runtime-session-secret"
	expiresUnix := time.Now().Add(time.Hour).Unix()
	sig := playgroundPublicMediaSignature("u-1", playgroundServeMediaTestFilename, expiresUnix)

	require.NotEmpty(t, sig)
	require.True(t, playgroundPublicMediaSignatureValid("u-1", playgroundServeMediaTestFilename, expiresUnix, sig))

	common.SessionSecret = "different-runtime-session-secret"
	require.False(t, playgroundPublicMediaSignatureValid("u-1", playgroundServeMediaTestFilename, expiresUnix, sig))
}
