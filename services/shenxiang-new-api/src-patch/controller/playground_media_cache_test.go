package controller

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestCachePlaygroundMediaAcceptsImageDataURL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	root := t.TempDir()
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", root)
	t.Setenv("PLAYGROUND_MEDIA_URL_PREFIX", "/pg/media/files")

	pngBytes := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}
	dataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)
	c, _ := gin.CreateTestContext(nil)
	c.Set(common.RequestIdKey, "test-request")

	cachedURL, err := cachePlaygroundMedia(c, playgroundMediaCacheRequest{
		URL:  dataURL,
		Kind: "image",
	})

	require.NoError(t, err)
	require.Contains(t, cachedURL, "/pg/media/files/")
	entries, err := os.ReadDir(root)
	require.NoError(t, err)
	require.Len(t, entries, 1)
	saved, err := os.ReadFile(filepath.Join(root, entries[0].Name()))
	require.NoError(t, err)
	require.Equal(t, pngBytes, saved)
}
