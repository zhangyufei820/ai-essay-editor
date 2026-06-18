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
				"error": newAPIError.ToOpenAIError(),
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
				"error": newAPIError.ToOpenAIError(),
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
				"error": newAPIError.ToOpenAIError(),
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
				"error": newAPIError.ToOpenAIError(),
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
	URL      string `json:"url"`
	Kind     string `json:"kind"`
	Filename string `json:"filename"`
}

func playgroundMediaCacheRoot() string {
	return common.GetEnvOrDefaultString("PLAYGROUND_MEDIA_CACHE_DIR", "/data/media-cache")
}

func playgroundMediaURLPrefix() string {
	prefix := common.GetEnvOrDefaultString("PLAYGROUND_MEDIA_URL_PREFIX", "/pg/media/files")
	return "/" + strings.Trim(strings.TrimSpace(prefix), "/")
}

func PlaygroundCacheMedia(c *gin.Context) {
	var req playgroundMediaCacheRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid cache request"})
		return
	}

	mediaURL, err := cachePlaygroundMedia(c, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"url":        mediaURL,
			"expires_in": int(playgroundMediaRetentionDuration().Seconds()),
		},
	})
}

func PlaygroundServeMedia(c *gin.Context) {
	name := filepath.Base(c.Param("filename"))
	if name == "." || name == "/" || strings.Contains(name, "..") {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	fullPath := filepath.Join(playgroundMediaCacheRoot(), name)
	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	if time.Since(info.ModTime()) > playgroundMediaRetentionDuration() {
		_ = os.Remove(fullPath)
		c.AbortWithStatus(http.StatusGone)
		return
	}
	c.File(fullPath)
}
