package controller

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

func setupPlaygroundTokenContext(c *gin.Context) (*types.NewAPIError, *relaycommon.RelayInfo) {
	useAccessToken := c.GetBool("use_access_token")
	if useAccessToken {
		return types.NewError(errors.New("暂不支持使用 access token"), types.ErrorCodeAccessDenied, types.ErrOptionWithSkipRetry()), nil
	}

	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatOpenAI, nil, nil)
	if err != nil {
		return types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry()), nil
	}

	userId := c.GetInt("id")

	// Write user context to ensure acceptUnsetRatio is available
	userCache, err := model.GetUserCache(userId)
	if err != nil {
		return types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry()), nil
	}
	userCache.WriteContext(c)

	tempToken := &model.Token{
		UserId: userId,
		Name:   fmt.Sprintf("playground-%s", relayInfo.UsingGroup),
		Group:  relayInfo.UsingGroup,
	}
	_ = middleware.SetupContextForToken(c, tempToken)
	return nil, relayInfo
}

func Playground(c *gin.Context) {
	var newAPIError *types.NewAPIError

	defer func() {
		if newAPIError != nil {
			c.JSON(newAPIError.StatusCode, gin.H{
				"error": newAPIError.ToPublicOpenAIError(c.GetString(common.RequestIdKey)),
			})
		}
	}()

	newAPIError, _ = setupPlaygroundTokenContext(c)
	if newAPIError != nil {
		return
	}

	Relay(c, types.RelayFormatOpenAI)
}

func PlaygroundImage(c *gin.Context) {
	var newAPIError *types.NewAPIError

	defer func() {
		if newAPIError != nil {
			c.JSON(newAPIError.StatusCode, gin.H{
				"error": newAPIError.ToPublicOpenAIError(c.GetString(common.RequestIdKey)),
			})
		}
	}()

	newAPIError, _ = setupPlaygroundTokenContext(c)
	if newAPIError != nil {
		return
	}

	Relay(c, types.RelayFormatOpenAIImage)
}

func PlaygroundVideo(c *gin.Context) {
	var newAPIError *types.NewAPIError

	defer func() {
		if newAPIError != nil {
			c.JSON(newAPIError.StatusCode, gin.H{
				"error": newAPIError.ToPublicOpenAIError(c.GetString(common.RequestIdKey)),
			})
		}
	}()

	newAPIError, _ = setupPlaygroundTokenContext(c)
	if newAPIError != nil {
		return
	}

	RelayTask(c)
}

func PlaygroundVideoFetch(c *gin.Context) {
	var newAPIError *types.NewAPIError

	defer func() {
		if newAPIError != nil {
			c.JSON(newAPIError.StatusCode, gin.H{
				"error": newAPIError.ToPublicOpenAIError(c.GetString(common.RequestIdKey)),
			})
		}
	}()

	newAPIError, _ = setupPlaygroundTokenContext(c)
	if newAPIError != nil {
		return
	}

	RelayTaskFetch(c)
}

type playgroundMediaCacheRequest struct {
	URL           string                 `json:"url"`
	Kind          string                 `json:"kind"`
	Filename      string                 `json:"filename"`
	Prompt        string                 `json:"prompt"`
	Model         string                 `json:"model"`
	Workflow      string                 `json:"workflow"`
	RevisedPrompt string                 `json:"revised_prompt"`
	Metadata      map[string]interface{} `json:"metadata"`
}

func playgroundMediaCacheRoot() string {
	return common.GetEnvOrDefaultString("PLAYGROUND_MEDIA_CACHE_DIR", "/data/media-cache")
}

func playgroundMediaURLPrefix() string {
	prefix := common.GetEnvOrDefaultString("PLAYGROUND_MEDIA_URL_PREFIX", "/pg/media/files")
	return "/" + strings.Trim(strings.TrimSpace(prefix), "/")
}

func playgroundMediaRetentionDuration() time.Duration {
	keepMinutes := common.GetEnvOrDefault("PLAYGROUND_MEDIA_KEEP_MINUTES", 72*60)
	if keepMinutes < 1 {
		keepMinutes = 72 * 60
	}
	return time.Duration(keepMinutes) * time.Minute
}

func PlaygroundCacheMedia(c *gin.Context) {
	var req playgroundMediaCacheRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid cache request"})
		return
	}

	item, err := cachePlaygroundMedia(c, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	if taskID, _ := req.Metadata["recovery_task_id"].(string); strings.TrimSpace(taskID) != "" {
		if task, exists, err := model.GetByTaskId(c.GetInt("id"), strings.TrimSpace(taskID)); err == nil && exists && task.Platform == constant.TaskPlatformPlaygroundImage {
			updatePlaygroundImageRecoveryTaskReady(task, item.URL, item)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"url":        item.URL,
			"item":       item,
			"expires_in": int(playgroundMediaRetentionDuration().Seconds()),
		},
	})
}

func PlaygroundListMedia(c *gin.Context) {
	items, err := listPlaygroundMedia(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"items":           items,
			"expires_in":      int(playgroundMediaRetentionDuration().Seconds()),
			"retention_hours": int(playgroundMediaRetentionDuration().Hours()),
		},
	})
}

func PlaygroundServeMedia(c *gin.Context) {
	parts := strings.Split(strings.Trim(c.Param("filepath"), "/"), "/")
	if len(parts) != 2 {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	userDir := strings.TrimSpace(parts[0])
	name := filepath.Base(parts[len(parts)-1])
	if !isValidPlaygroundMediaUserDir(userDir) || !isValidPlaygroundMediaFilename(name) || name != parts[1] {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	root := playgroundMediaCacheRoot()
	fullPath := filepath.Join(root, userDir, name)
	cleanRoot := filepath.Clean(root) + string(os.PathSeparator)
	cleanPath := filepath.Clean(fullPath)
	if !strings.HasPrefix(cleanPath, cleanRoot) {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	if time.Since(info.ModTime()) > playgroundMediaRetentionDuration() {
		removePlaygroundMediaWithMetadata(fullPath)
		c.AbortWithStatus(http.StatusGone)
		return
	}
	c.Header("Cache-Control", fmt.Sprintf("private, max-age=%d", int(playgroundMediaRetentionDuration().Seconds())))
	c.File(fullPath)
}

func isValidPlaygroundMediaUserDir(value string) bool {
	if !strings.HasPrefix(value, "u-") || value != filepath.Base(value) {
		return false
	}
	id := strings.TrimPrefix(value, "u-")
	if id == "" {
		return false
	}
	for _, ch := range id {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}

func isValidPlaygroundMediaFilename(value string) bool {
	if value != filepath.Base(value) || strings.Contains(value, "..") {
		return false
	}
	ext := strings.ToLower(filepath.Ext(value))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm":
	default:
		return false
	}
	stem := strings.TrimSuffix(value, ext)
	if len(stem) != 24 {
		return false
	}
	for _, ch := range stem {
		if (ch < '0' || ch > '9') && (ch < 'a' || ch > 'f') {
			return false
		}
	}
	return true
}
