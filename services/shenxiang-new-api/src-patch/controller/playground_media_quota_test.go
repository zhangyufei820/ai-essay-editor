package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestPlaygroundCacheMediaRejectsOversizedRequestBody(t *testing.T) {
	t.Setenv("PLAYGROUND_MEDIA_CACHE_REQUEST_MAX_MB", "1")
	server := gin.New()
	server.POST("/pg/media/cache", func(c *gin.Context) {
		c.Set("id", 7)
		PlaygroundCacheMedia(c)
	})

	body := `{"url":"https://example.com/` + strings.Repeat("a", 1024*1024) + `"}`
	request := httptest.NewRequest(http.MethodPost, "/pg/media/cache", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusRequestEntityTooLarge, recorder.Code)
}

func TestWritePlaygroundMediaEnforcesPerUserByteQuota(t *testing.T) {
	root := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", root)
	t.Setenv("PLAYGROUND_MEDIA_USER_MAX_MB", "1")
	t.Setenv("PLAYGROUND_MEDIA_TOTAL_MAX_MB", "10")
	t.Setenv("PLAYGROUND_MEDIA_MAX_FILES_PER_USER", "100")

	userDir := filepath.Join(root, playgroundMediaUserDirName(7))
	require.NoError(t, os.MkdirAll(userDir, 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(userDir, "existing.png"), bytes.Repeat([]byte("x"), 900*1024), 0o600))

	ctx, _ := gin.CreateTestContext(nil)
	ctx.Set("id", 7)
	_, err := writePlaygroundMedia(
		ctx,
		playgroundMediaCacheRequest{URL: "https://example.com/media.png"},
		bytes.NewReader(bytes.Repeat([]byte("y"), 200*1024)),
		".png",
		256*1024,
	)

	require.ErrorContains(t, err, "user media cache quota")
}

func TestWritePlaygroundMediaEnforcesGlobalByteQuota(t *testing.T) {
	root := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", root)
	t.Setenv("PLAYGROUND_MEDIA_USER_MAX_MB", "10")
	t.Setenv("PLAYGROUND_MEDIA_TOTAL_MAX_MB", "1")
	t.Setenv("PLAYGROUND_MEDIA_MAX_FILES_PER_USER", "100")

	otherUserDir := filepath.Join(root, playgroundMediaUserDirName(8))
	require.NoError(t, os.MkdirAll(otherUserDir, 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(otherUserDir, "existing.mp4"), bytes.Repeat([]byte("x"), 900*1024), 0o600))

	ctx, _ := gin.CreateTestContext(nil)
	ctx.Set("id", 7)
	_, err := writePlaygroundMedia(
		ctx,
		playgroundMediaCacheRequest{URL: "https://example.com/media.png"},
		bytes.NewReader(bytes.Repeat([]byte("y"), 200*1024)),
		".png",
		256*1024,
	)

	require.ErrorContains(t, err, "total media cache quota")
}

func TestWritePlaygroundMediaEnforcesPerUserFileQuota(t *testing.T) {
	root := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", root)
	t.Setenv("PLAYGROUND_MEDIA_USER_MAX_MB", "10")
	t.Setenv("PLAYGROUND_MEDIA_TOTAL_MAX_MB", "10")
	t.Setenv("PLAYGROUND_MEDIA_MAX_FILES_PER_USER", "1")

	userDir := filepath.Join(root, playgroundMediaUserDirName(7))
	require.NoError(t, os.MkdirAll(userDir, 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(userDir, "existing.png"), []byte("x"), 0o600))

	ctx, _ := gin.CreateTestContext(nil)
	ctx.Set("id", 7)
	_, err := writePlaygroundMedia(
		ctx,
		playgroundMediaCacheRequest{URL: "https://example.com/media.png"},
		bytes.NewReader([]byte("y")),
		".png",
		1024,
	)

	require.ErrorContains(t, err, "file count quota")
}
