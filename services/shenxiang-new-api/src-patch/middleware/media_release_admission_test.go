//go:build unix

package middleware

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"golang.org/x/sys/unix"
)

func TestMediaReleaseAdmissionBlocksOnlyMediaSubmissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "media.lock")
	r := gin.New()
	r.Use(MediaReleaseAdmission(path))
	r.GET("/api/status", func(c *gin.Context) { c.Status(http.StatusOK) })
	r.GET("/v1/videos/:id", func(c *gin.Context) { c.Status(http.StatusOK) })
	r.POST("/v1/videos", func(c *gin.Context) { c.Status(http.StatusOK) })
	r.POST("/v1/chat/completions", func(c *gin.Context) { c.Status(http.StatusOK) })
	lock, err := os.Create(path)
	require.NoError(t, err)
	defer lock.Close()
	require.NoError(t, unix.Flock(int(lock.Fd()), unix.LOCK_EX|unix.LOCK_NB))

	request := func(method, path string) *httptest.ResponseRecorder {
		resp := httptest.NewRecorder()
		r.ServeHTTP(resp, httptest.NewRequest(method, path, nil))
		return resp
	}
	require.Equal(t, "1", request(http.MethodGet, "/api/status").Header().Get(MediaReleaseAdmissionHeader))
	require.Equal(t, http.StatusOK, request(http.MethodGet, "/v1/videos/task_a").Code)
	require.Equal(t, http.StatusOK, request(http.MethodPost, "/v1/chat/completions").Code)
	require.Equal(t, http.StatusServiceUnavailable, request(http.MethodPost, "/v1/videos").Code)
	require.NoError(t, unix.Flock(int(lock.Fd()), unix.LOCK_UN))
	require.Equal(t, http.StatusOK, request(http.MethodPost, "/v1/videos").Code)
}
