package controller

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

type playgroundVideoMediaMarker struct {
	RequestID string                 `json:"request_id,omitempty"`
	Prompt    string                 `json:"prompt,omitempty"`
	Model     string                 `json:"model,omitempty"`
	Workflow  string                 `json:"workflow,omitempty"`
	Size      string                 `json:"size,omitempty"`
	Duration  int                    `json:"duration,omitempty"`
	Seconds   string                 `json:"seconds,omitempty"`
	Group     string                 `json:"group,omitempty"`
	Endpoint  string                 `json:"endpoint,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	Inputs    map[string]interface{} `json:"inputs,omitempty"`
}

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

	if benefitToken, ok := activePlaygroundImageBenefitToken(c, userId); ok {
		if err := middleware.SetupContextForToken(c, benefitToken); err != nil {
			return types.NewError(err, types.ErrorCodeAccessDenied, types.ErrOptionWithSkipRetry()), nil
		}
		common.SetContextKey(c, constant.ContextKeyTokenGroup, benefitToken.Group)
		if benefitToken.Group != "" {
			common.SetContextKey(c, constant.ContextKeyUsingGroup, benefitToken.Group)
			relayInfo.UsingGroup = benefitToken.Group
		}
		return nil, relayInfo
	}

	tempToken := &model.Token{
		UserId: userId,
		Name:   fmt.Sprintf("playground-%s", relayInfo.UsingGroup),
		Group:  relayInfo.UsingGroup,
	}
	_ = middleware.SetupContextForToken(c, tempToken)
	return nil, relayInfo
}

func activePlaygroundImageBenefitToken(c *gin.Context, userId int) (*model.Token, bool) {
	modelName := playgroundImageRequestModel(c)
	if !model.IsImageBenefitModel(modelName) {
		return nil, false
	}
	token, ok, err := model.GetActiveImageBenefitTokenForUser(userId, modelName)
	if err != nil || !ok {
		if err != nil {
			common.SysLog(fmt.Sprintf("failed to load image benefit token for playground user %d: %s", userId, err.Error()))
		}
		return nil, false
	}
	return token, true
}

func playgroundImageRequestModel(c *gin.Context) string {
	if c == nil || c.Request == nil {
		return ""
	}
	if c.Request.URL != nil {
		path := c.Request.URL.Path
		if path != "/pg/images/generations" && path != "/pg/images/edits" {
			return ""
		}
	}
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return ""
	}
	bodyBytes, err := storage.Bytes()
	if err != nil || len(bodyBytes) == 0 {
		return ""
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(bodyBytes))
	var imageReq dto.ImageRequest
	if strings.Contains(c.Request.Header.Get("Content-Type"), gin.MIMEMultipartPOSTForm) {
		form, err := common.ParseMultipartFormReusable(c)
		if err != nil {
			c.Request.Body = io.NopCloser(bytes.NewReader(bodyBytes))
			return ""
		}
		defer form.RemoveAll()
		if values := form.Value["model"]; len(values) > 0 {
			c.Request.Body = io.NopCloser(bytes.NewReader(bodyBytes))
			modelName, _ := normalizePlaygroundImageProductModelName(values[0])
			return modelName
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(bodyBytes))
		return ""
	}
	if err := common.UnmarshalBodyReusable(c, &imageReq); err != nil {
		c.Request.Body = io.NopCloser(bytes.NewReader(bodyBytes))
		return ""
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(bodyBytes))
	modelName, _ := normalizePlaygroundImageProductModelName(imageReq.Model)
	return modelName
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

	if handled := playgroundVideoFetchFromLocalTask(c); handled {
		return
	}

	RelayTaskFetch(c)
}

func playgroundVideoFetchFromLocalTask(c *gin.Context) bool {
	if c == nil {
		return false
	}
	taskID := strings.TrimSpace(c.Param("task_id"))
	if taskID == "" {
		taskID = strings.TrimSpace(c.Param("id"))
	}
	if taskID == "" {
		taskID = strings.TrimSpace(c.Query("task_id"))
	}
	if taskID == "" {
		return false
	}
	task, exists, err := model.GetByTaskId(c.GetInt("id"), taskID)
	if err != nil {
		common.SysError(fmt.Sprintf("failed to load playground video task %s: %s", taskID, err.Error()))
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"message": "查询视频任务失败",
				"type":    "playground_video_task_query_error",
			},
		})
		return true
	}
	if !exists || task == nil {
		return false
	}
	marker := playgroundVideoMarkerFromTask(task)
	if marker == nil {
		return false
	}
	c.JSON(http.StatusOK, taskToPlaygroundVideoTask(task, marker))
	return true
}

func playgroundVideoMarkerFromTask(task *model.Task) *playgroundVideoMediaMarker {
	if task == nil || len(task.Data) == 0 {
		return nil
	}
	payload := map[string]json.RawMessage{}
	if err := json.Unmarshal(task.Data, &payload); err != nil {
		return nil
	}
	encoded, ok := payload["playground_media"]
	if !ok || len(encoded) == 0 {
		return nil
	}
	marker := playgroundVideoMediaMarker{}
	if err := json.Unmarshal(encoded, &marker); err != nil {
		return nil
	}
	if strings.TrimSpace(marker.Endpoint) != "" && !strings.Contains(marker.Endpoint, "/video") {
		return nil
	}
	if marker.Metadata == nil {
		marker.Metadata = map[string]interface{}{}
	}
	return &marker
}

func taskToPlaygroundVideoTask(task *model.Task, marker *playgroundVideoMediaMarker) gin.H {
	taskID := strings.TrimSpace(task.TaskID)
	resultURL := strings.TrimSpace(task.GetResultURL())
	status := string(task.Status)
	response := gin.H{
		"id":          taskID,
		"task_id":     taskID,
		"status":      status,
		"task_status": status,
		"progress":    task.Progress,
		"created":     task.SubmitTime,
		"created_at":  task.SubmitTime,
		"updated_at":  task.FinishTime,
		"finish_time": task.FinishTime,
		"model":       firstNonEmptyString(marker.Model, task.Properties.OriginModelName),
		"prompt":      firstNonEmptyString(marker.Prompt, task.Properties.Input),
		"result_url":  resultURL,
		"url":         resultURL,
		"video_url":   resultURL,
		"fail_reason": task.FailReason,
		"message":     task.FailReason,
		"data": gin.H{
			"task_id":     taskID,
			"status":      status,
			"task_status": status,
			"progress":    task.Progress,
			"result_url":  resultURL,
			"url":         resultURL,
			"video_url":   resultURL,
			"fail_reason": task.FailReason,
		},
		"metadata": gin.H{
			"playground_media": marker,
			"source":           "local_task_polling",
		},
	}
	if marker.Duration > 0 {
		response["duration"] = marker.Duration
		response["data"].(gin.H)["duration"] = marker.Duration
	}
	if marker.Size != "" {
		response["size"] = marker.Size
		response["data"].(gin.H)["size"] = marker.Size
	}
	if resultURL != "" && task.Status == model.TaskStatusSuccess {
		response["output"] = gin.H{"url": resultURL}
		response["data"].(gin.H)["output"] = gin.H{"url": resultURL}
	}
	return response
}

func annotatePlaygroundVideoTaskData(c *gin.Context, task *model.Task, relayInfo *relaycommon.RelayInfo) {
	if c == nil || c.Request == nil || task == nil || relayInfo == nil {
		return
	}
	path := strings.TrimSpace(c.Request.URL.Path)
	if path != "/pg/videos" && path != "/pg/video/generations" {
		return
	}
	taskReq, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return
	}
	marker := playgroundVideoMediaMarker{
		RequestID: c.GetString(common.RequestIdKey),
		Prompt:    truncatePlaygroundText(taskReq.Prompt, 3000),
		Model:     truncatePlaygroundText(firstNonEmptyString(taskReq.Model, relayInfo.OriginModelName), 160),
		Workflow:  "video",
		Size:      truncatePlaygroundText(taskReq.Size, 120),
		Duration:  taskReq.Duration,
		Seconds:   truncatePlaygroundText(taskReq.Seconds, 40),
		Group:     truncatePlaygroundText(relayInfo.UsingGroup, 50),
		Endpoint:  path,
		Metadata:  normalizePlaygroundMetadata(taskReq.Metadata),
		Inputs:    summarizePlaygroundVideoInputs(taskReq.Metadata),
	}
	if marker.Duration <= 0 && marker.Seconds != "" {
		if v, err := strconv.Atoi(marker.Seconds); err == nil {
			marker.Duration = v
		}
	}
	payload := map[string]interface{}{}
	if len(task.Data) > 0 {
		_ = json.Unmarshal(task.Data, &payload)
	}
	payload["playground_media"] = marker
	encoded, err := json.Marshal(payload)
	if err != nil {
		return
	}
	task.Data = encoded
	if task.Properties.Input == "" {
		task.Properties.Input = marker.Prompt
	}
	if task.Properties.OriginModelName == "" {
		task.Properties.OriginModelName = marker.Model
	}
}

func summarizePlaygroundVideoInputs(metadata map[string]interface{}) map[string]interface{} {
	contentCount := 0
	referenceURLCount := 0
	for _, item := range playgroundVideoMetadataContent(metadata) {
		contentCount++
		if playgroundVideoContentImageURL(item) != "" {
			referenceURLCount++
		}
	}
	if contentCount == 0 && referenceURLCount == 0 {
		return nil
	}
	return map[string]interface{}{
		"metadata_content_count": contentCount,
		"reference_url_count":    referenceURLCount,
	}
}

func playgroundVideoMetadataContent(metadata map[string]interface{}) []interface{} {
	if len(metadata) == 0 {
		return nil
	}
	content, ok := metadata["content"]
	if !ok {
		return nil
	}
	items, ok := content.([]interface{})
	if !ok {
		return nil
	}
	return items
}

func playgroundVideoContentImageURL(item interface{}) string {
	obj, ok := item.(map[string]interface{})
	if !ok {
		return ""
	}
	imageURL, ok := obj["image_url"]
	if !ok {
		return ""
	}
	if value, ok := imageURL.(string); ok {
		return strings.TrimSpace(value)
	}
	nested, ok := imageURL.(map[string]interface{})
	if !ok {
		return ""
	}
	if value, ok := nested["url"].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
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
	if !canServePlaygroundMediaUserDir(c, userDir) {
		c.AbortWithStatus(http.StatusForbidden)
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
	// Prefer ExpiresAt from sidecar JSON over mtime-based fallback (L-5).
	expiresAt := info.ModTime().Add(playgroundMediaRetentionDuration())
	if metaBytes, err := os.ReadFile(fullPath + ".json"); err == nil {
		var meta playgroundMediaItem
		if json.Unmarshal(metaBytes, &meta) == nil && meta.ExpiresAt != "" {
			if t, err := time.Parse(time.RFC3339, meta.ExpiresAt); err == nil {
				expiresAt = t
			}
		}
	}
	if time.Now().After(expiresAt) {
		removePlaygroundMediaWithMetadata(fullPath)
		c.AbortWithStatus(http.StatusGone)
		return
	}
	ttl := time.Until(expiresAt)
	if ttl < 0 {
		ttl = 0
	}
	c.Header("Cache-Control", fmt.Sprintf("private, max-age=%d", int(ttl.Seconds())))
	c.File(fullPath)
}

func canServePlaygroundMediaUserDir(c *gin.Context, userDir string) bool {
	currentUserID := c.GetInt("id")
	if userDir == playgroundMediaUserDirName(currentUserID) {
		return true
	}
	if currentUserID == 0 || c.GetInt("token_id") != 0 {
		return false
	}
	return model.IsAdmin(currentUserID)
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
	if len(stem) != 32 && len(stem) != 24 {
		return false
	}
	for _, ch := range stem {
		if (ch < '0' || ch > '9') && (ch < 'a' || ch > 'f') {
			return false
		}
	}
	return true
}
