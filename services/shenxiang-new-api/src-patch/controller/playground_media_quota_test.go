package controller

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type blockingPlaygroundMediaReader struct {
	started chan struct{}
	release chan struct{}
	done    bool
}

func (reader *blockingPlaygroundMediaReader) Read(buffer []byte) (int, error) {
	if reader.done {
		return 0, io.EOF
	}
	reader.done = true
	close(reader.started)
	<-reader.release
	return copy(buffer, []byte("image")), io.EOF
}

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

func TestWritePlaygroundMediaDoesNotPersistUpstreamURL(t *testing.T) {
	root := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", root)
	t.Setenv("PLAYGROUND_MEDIA_USER_MAX_MB", "10")
	t.Setenv("PLAYGROUND_MEDIA_TOTAL_MAX_MB", "10")
	t.Setenv("PLAYGROUND_MEDIA_MAX_FILES_PER_USER", "100")

	ctx, _ := gin.CreateTestContext(nil)
	ctx.Set("id", 7)
	rawURL := "https://private-user:private-pass@provider.example/media.png?token=upstream-secret"
	item, err := writePlaygroundMedia(
		ctx,
		playgroundMediaCacheRequest{URL: rawURL},
		bytes.NewReader([]byte("image")),
		".png",
		1024,
	)

	require.NoError(t, err)
	require.Empty(t, item.OriginalURL)
	metadata, err := os.ReadFile(filepath.Join(root, playgroundMediaUserDirName(7), item.Filename+".json"))
	require.NoError(t, err)
	require.NotContains(t, string(metadata), rawURL)
	require.NotContains(t, string(metadata), "private-user")
	require.NotContains(t, string(metadata), "upstream-secret")
}

func TestWritePlaygroundMediaDoesNotHoldQuotaLockWhileReading(t *testing.T) {
	root := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", root)
	t.Setenv("PLAYGROUND_MEDIA_USER_MAX_MB", "10")
	t.Setenv("PLAYGROUND_MEDIA_TOTAL_MAX_MB", "10")
	t.Setenv("PLAYGROUND_MEDIA_MAX_FILES_PER_USER", "100")

	ctx, _ := gin.CreateTestContext(nil)
	ctx.Set("id", 7)
	reader := &blockingPlaygroundMediaReader{
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
	result := make(chan error, 1)
	go func() {
		_, err := writePlaygroundMedia(
			ctx,
			playgroundMediaCacheRequest{URL: "https://provider.example/media.png"},
			reader,
			".png",
			1024,
		)
		result <- err
	}()

	select {
	case <-reader.started:
	case <-time.After(time.Second):
		close(reader.release)
		require.FailNow(t, "media reader did not start")
	}

	lockAcquired := make(chan struct{})
	go func() {
		common.PlaygroundMediaCacheMu.Lock()
		common.PlaygroundMediaCacheMu.Unlock()
		close(lockAcquired)
	}()

	select {
	case <-lockAcquired:
		close(reader.release)
		require.NoError(t, <-result)
	case <-time.After(250 * time.Millisecond):
		close(reader.release)
		<-result
		require.FailNow(t, "global media quota lock was held during reader copy")
	}
}
