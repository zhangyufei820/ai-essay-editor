//go:build unix

package middleware

import (
	"errors"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"golang.org/x/sys/unix"
)

const MediaReleaseAdmissionHeader = "X-New-API-Media-Release-Admission"

func MediaReleaseAdmission(lockPath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodGet && c.Request.URL.Path == "/api/status" {
			c.Header(MediaReleaseAdmissionHeader, "1")
		}
		if c.Request.Method != http.MethodPost || !isMediaCreationRoute(c.FullPath()) {
			c.Next()
			return
		}
		lock, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDONLY, 0o640)
		if err == nil {
			defer lock.Close()
			for {
				err = unix.Flock(int(lock.Fd()), unix.LOCK_SH|unix.LOCK_NB)
				if !errors.Is(err, unix.EINTR) {
					break
				}
			}
		}
		if err != nil {
			c.Header("Retry-After", "15")
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"message": "媒体任务暂时无法提交，请稍后重试。",
				"error":   gin.H{"message": "媒体任务暂时无法提交，请稍后重试。", "type": "service_unavailable"},
			})
			return
		}
		c.Next()
	}
}

func isMediaCreationRoute(path string) bool {
	switch path {
	case "/pg/images/generations", "/pg/images/edits", "/pg/images/tasks",
		"/pg/images/tasks/generations", "/pg/images/tasks/edits", "/pg/media/recovery",
		"/pg/media/recovery/:task_id/recover", "/pg/upscale/tasks",
		"/pg/videos", "/pg/video/generations", "/v1/images/upscale",
		"/v1/images/generations", "/v1/images/edits", "/v1/videos", "/v1/video/generations",
		"/v1/videos/:video_id/remix", "/kling/v1/videos/text2video", "/kling/v1/videos/image2video",
		"/jimeng/":
		return true
	default:
		return false
	}
}
