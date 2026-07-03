package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaypkg "github.com/QuantumNous/new-api/relay"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

const (
	playgroundImageAsyncBillingCaptureKey = "playground_image_billing_capture"
	playgroundImageTaskResultCaptureKey   = "playground_image_task_result_capture"
)

// playgroundImageWorkerSem caps the number of concurrent async image workers
// to prevent goroutine exhaustion under high load.
var playgroundImageWorkerSem = make(chan struct{}, 500)

func FailInterruptedPlaygroundImageTasksOnStartup() {
	if model.DB == nil {
		return
	}
	var tasks []*model.Task
	err := model.DB.
		Where("platform = ?", constant.TaskPlatformPlaygroundImage).
		Where("action IN ?", []string{constant.TaskActionImageGenerate, constant.TaskActionImageEdit}).
		Where("status NOT IN ?", []string{string(model.TaskStatusFailure), string(model.TaskStatusSuccess)}).
		Order("id").
		Limit(200).
		Find(&tasks).Error
	if err != nil {
		common.SysError("failed to load interrupted playground image tasks: " + err.Error())
		return
	}
	if len(tasks) == 0 {
		return
	}
	for _, task := range tasks {
		markPlaygroundImageTaskFailure(task, "图像任务因服务重启中断，请重新提交。")
	}
	common.SysLog(fmt.Sprintf("marked %d interrupted playground image tasks as failed on startup", len(tasks)))
}

var (
	playgroundCredentialPattern        = regexp.MustCompile(`(?i)(bearer\s+|sk-)[A-Za-z0-9._\-]{8,}`)
	playgroundCredentialEncodedPattern = regexp.MustCompile(`(?i)(bearer%20|bearer\+|sk-)[A-Za-z0-9._\-%+]{8,}`)
	playgroundSecretClausePattern      = regexp.MustCompile(`(?i)\s*[,，;；]?\s*(api[_\s-]?key|apikey|bearer|token|secret|password|sk-)\s*[:=]?\s*[^,，;；\)）]*`)
	playgroundRequestIDPattern         = regexp.MustCompile(`(?i)\s*[\(（]?\s*(request[_\s-]?id|upstream[_\s-]?request[_\s-]?id)\s*[:=]\s*[^,，;；\)）\s]+[\)）]?`)
	playgroundInternalPrefixPattern    = regexp.MustCompile(`(?i)^\s*(upstream|provider|供应商|渠道)\s*(error|response|request\s+failed|rejected|返回|拒绝)?\s*[:：=\-]?\s*`)
	playgroundInternalClausePattern    = regexp.MustCompile(`(?i)\s*[\(（]?\s*(upstream\s+)?(channel|provider|供应商|渠道)\s*(#|id|[:=])\s*[^,，;；\)）]*[\)）]?`)
	playgroundStatusCodePrefixPattern  = regexp.MustCompile(`(?i)^\s*status[_\s-]?code\s*=\s*\d+\s*[,，:]?\s*`)
)

type playgroundImageTaskCreateResponse struct {
	TaskID    string `json:"task_id"`
	RequestID string `json:"request_id"`
	Status    string `json:"status"`
	PollURL   string `json:"poll_url"`
}

type openAIImageTaskCreateResponse struct {
	TaskID  string `json:"task_id"`
	ID      string `json:"id,omitempty"`
	Status  string `json:"status"`
	PollURL string `json:"poll_url"`
}

type openAIImageTaskListResponse struct {
	Data []map[string]interface{} `json:"data"`
}

type playgroundImageTaskPayload struct {
	Model          string                 `json:"model,omitempty"`
	Prompt         string                 `json:"prompt,omitempty"`
	Workflow       string                 `json:"workflow,omitempty"`
	RequestPath    string                 `json:"request_path,omitempty"`
	RequestMethod  string                 `json:"request_method,omitempty"`
	RequestFile    string                 `json:"request_file,omitempty"`
	ContentType    string                 `json:"content_type,omitempty"`
	RequestID      string                 `json:"request_id,omitempty"`
	TokenID        int                    `json:"token_id,omitempty"`
	TokenName      string                 `json:"token_name,omitempty"`
	UseAPIToken    bool                   `json:"use_api_token,omitempty"`
	ClientIP       string                 `json:"client_ip,omitempty"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
	CachedURL      string                 `json:"cached_url,omitempty"`
	Item           *playgroundMediaItem   `json:"item,omitempty"`
	OriginalStatus int                    `json:"original_status,omitempty"`
	Error          string                 `json:"error,omitempty"`
	ActualQuota    int                    `json:"actual_quota,omitempty"`
}

type playgroundImageTaskResultCapture struct {
	Response             *dto.ImageResponse
	Usage                *dto.Usage
	Quota                int
	LastFailureReason    string
	LastFailureChannelID int
}

func PlaygroundCreateImageTask(c *gin.Context) {
	createImageTask(c, false)
}

func V1CreateImageTask(c *gin.Context) {
	createImageTask(c, true)
}

func createImageTask(c *gin.Context, openAICompat bool) {
	path := resolvePlaygroundImageTaskRequestPath(c)
	if path != "/pg/images/generations" && path != "/pg/images/edits" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid image task endpoint"})
		return
	}

	bodyStorage, err := common.GetBodyStorage(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "failed to read image request"})
		return
	}
	bodyBytes, err := bodyStorage.Bytes()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "failed to copy image request"})
		return
	}
	if len(bodyBytes) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "empty image request"})
		return
	}

	var imageReq dto.ImageRequest
	if err := parsePlaygroundImageTaskRequest(c, &imageReq); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid image request"})
		return
	}
	if normalizedModel, changed := normalizePlaygroundImageProductModelName(imageReq.Model); changed {
		imageReq.Model = normalizedModel
	}
	if strings.TrimSpace(imageReq.Model) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "model is required"})
		return
	}
	if strings.TrimSpace(imageReq.Prompt) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "prompt is required"})
		return
	}
	if len([]rune(strings.TrimSpace(imageReq.Prompt))) > 10000 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "prompt is too long"})
		return
	}
	if normalizedBody, ok := normalizePlaygroundImageTaskPayload(bodyBytes, &imageReq); ok {
		bodyBytes = normalizedBody
		if storage, err := common.CreateBodyStorage(bodyBytes); err == nil {
			c.Set(common.KeyBodyStorage, storage)
		}
	}
	usingGroup, userGroup, err := resolvePlaygroundImageTaskGroup(c, &imageReq)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": err.Error()})
		return
	}
	if !openAICompat {
		if benefitToken, ok, err := model.GetActiveImageBenefitTokenForUser(c.GetInt("id"), imageReq.Model); err != nil {
			logger.LogError(c, "failed to load image benefit token: "+err.Error())
		} else if ok {
			if err := middleware.SetupContextForToken(c, benefitToken); err != nil {
				c.JSON(http.StatusForbidden, gin.H{"success": false, "message": err.Error()})
				return
			}
			if benefitToken.Group != "" {
				usingGroup = benefitToken.Group
			}
		}
	}

	taskID := model.GenerateTaskID()
	requestID := c.GetString(common.RequestIdKey)
	if requestID == "" {
		requestID = common.GetTimeString() + common.GetRandomString(8)
		c.Set(common.RequestIdKey, requestID)
	}
	contentType := c.Request.Header.Get("Content-Type")
	requestFile, err := persistPlaygroundImageTaskRequest(c.GetInt("id"), taskID, bodyBytes)
	if err != nil {
		logger.LogError(c, "failed to persist playground image task request: "+err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to persist image task"})
		return
	}

	action := constant.TaskActionImageGenerate
	workflow := "文生图"
	if path == "/pg/images/edits" {
		action = constant.TaskActionImageEdit
		workflow = "图像修改"
	}

	now := time.Now().Unix()
	payload := playgroundImageTaskPayload{
		Model:         truncatePlaygroundText(imageReq.Model, 160),
		Prompt:        truncatePlaygroundText(imageReq.Prompt, 3000),
		Workflow:      workflow,
		RequestPath:   path,
		RequestMethod: http.MethodPost,
		RequestFile:   requestFile,
		ContentType:   truncatePlaygroundText(contentType, 300),
		RequestID:     requestID,
		TokenID:       c.GetInt("token_id"),
		TokenName:     truncatePlaygroundText(c.GetString("token_name"), 160),
		UseAPIToken:   openAICompat,
		ClientIP:      c.ClientIP(),
		Metadata: map[string]interface{}{
			"endpoint": path,
			"async":    true,
			"group":    usingGroup,
		},
	}
	annotatePlaygroundImageRequestMetadata(payload.Metadata, &imageReq)
	task := &model.Task{
		TaskID:     taskID,
		Platform:   constant.TaskPlatformPlaygroundImage,
		UserId:     c.GetInt("id"),
		Group:      truncatePlaygroundText(usingGroup, 50),
		Action:     action,
		Status:     model.TaskStatusSubmitted,
		Progress:   "5%",
		SubmitTime: now,
		Properties: model.Properties{
			Input:           truncatePlaygroundText(imageReq.Prompt, 3000),
			OriginModelName: truncatePlaygroundText(imageReq.Model, 160),
		},
	}
	task.SetData(payload)
	if err := task.Insert(); err != nil {
		_ = os.Remove(requestFile)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to create image task"})
		return
	}
	recordPlaygroundImageTaskSubmittedLog(c, task, &payload, &imageReq)

	userID := c.GetInt("id")
	username := c.GetString("username")
	role := c.GetInt("role")
	tokenName := c.GetString("token_name")
	gopool.Go(func() {
		runPlaygroundImageTask(task.TaskID, userID, username, role, userGroup, usingGroup, tokenName)
	})

	if openAICompat {
		c.JSON(http.StatusOK, openAIImageTaskCreateResponse{
			TaskID:  taskID,
			ID:      taskID,
			Status:  string(task.Status),
			PollURL: "/v1/images/tasks/" + taskID,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": playgroundImageTaskCreateResponse{
			TaskID:    taskID,
			RequestID: requestID,
			Status:    string(task.Status),
			PollURL:   "/pg/images/tasks/" + taskID,
		},
	})
}

func parsePlaygroundImageTaskRequest(c *gin.Context, imageReq *dto.ImageRequest) error {
	if c == nil || c.Request == nil || imageReq == nil {
		return errors.New("invalid image request")
	}
	if strings.Contains(c.Request.Header.Get("Content-Type"), gin.MIMEMultipartPOSTForm) {
		return parsePlaygroundImageTaskMultipartRequest(c, imageReq)
	}
	return common.UnmarshalBodyReusable(c, imageReq)
}

func normalizePlaygroundImageTaskPayload(body []byte, imageReq *dto.ImageRequest) ([]byte, bool) {
	if len(body) == 0 || imageReq == nil {
		return nil, false
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil || payload == nil {
		return nil, false
	}
	changed := normalizePlaygroundImageTaskRequest(imageReq, payload)
	if !changed {
		return nil, false
	}
	normalized, err := json.Marshal(payload)
	if err != nil {
		return nil, false
	}
	return normalized, true
}

func normalizePlaygroundImageTaskRequest(imageReq *dto.ImageRequest, payload map[string]interface{}) bool {
	if imageReq == nil || payload == nil {
		return false
	}
	changed := false
	if normalizePlaygroundImageTaskModel(imageReq, payload) {
		changed = true
	}
	if normalizePlaygroundImageTaskCount(imageReq, payload) {
		changed = true
	}
	aspectRatio := strings.TrimSpace(imageReq.AspectRatio)
	imageSize := strings.TrimSpace(imageReq.ImageSize)
	resolution := strings.TrimSpace(imageReq.Resolution)
	if aspectRatio == "" {
		aspectRatio = firstNonEmptyNestedString(payload, []string{"responseFormat", "image", "aspectRatio"}, []string{"generationConfig", "imageConfig", "aspectRatio"}, []string{"generationConfig", "responseFormat", "image", "aspectRatio"}, []string{"extra_body", "google", "image_config", "aspect_ratio"})
	}
	if imageSize == "" {
		imageSize = firstNonEmptyNestedString(payload, []string{"responseFormat", "image", "imageSize"}, []string{"generationConfig", "imageConfig", "imageSize"}, []string{"generationConfig", "responseFormat", "image", "imageSize"}, []string{"extra_body", "google", "image_config", "image_size"})
	}
	if resolution == "" {
		resolution = firstNonEmptyNestedString(payload, []string{"resolution"})
	}
	if resolution == "" && imageSize != "" {
		resolution = imageSize
	}
	if imageSize == "" && resolution != "" {
		imageSize = resolution
	}
	if aspectRatio != "" && strings.TrimSpace(imageReq.AspectRatio) == "" {
		imageReq.AspectRatio = aspectRatio
		payload["aspect_ratio"] = aspectRatio
		changed = true
	}
	if resolution != "" && strings.TrimSpace(imageReq.Resolution) == "" {
		imageReq.Resolution = resolution
		payload["resolution"] = resolution
		changed = true
	}
	if imageSize != "" && strings.TrimSpace(imageReq.ImageSize) == "" {
		imageReq.ImageSize = imageSize
		payload["image_size"] = imageSize
		changed = true
	}
	if aspectRatio != "" || imageSize != "" {
		if ensureGoogleImageConfig(payload, aspectRatio, imageSize) {
			changed = true
		}
		if raw, err := json.Marshal(payload["extra_body"]); err == nil && len(raw) > 0 {
			imageReq.ExtraBody = raw
		}
	}
	return changed
}

func normalizePlaygroundImageTaskModel(imageReq *dto.ImageRequest, payload map[string]interface{}) bool {
	normalized, changed := normalizePlaygroundImageProductModelName(imageReq.Model)
	if !changed {
		return false
	}
	imageReq.Model = normalized
	payload["model"] = normalized
	return true
}

func normalizePlaygroundImageProductModelName(modelName string) (string, bool) {
	trimmed := strings.TrimSpace(modelName)
	if strings.EqualFold(trimmed, "gpt-image-2") {
		return "gpt-image-2-4K", true
	}
	return trimmed, trimmed != modelName
}

const playgroundImageMaxCount = uint(10)

func normalizePlaygroundImageTaskCount(imageReq *dto.ImageRequest, payload map[string]interface{}) bool {
	raw, exists := payload["n"]
	if !exists {
		return false
	}
	n, ok := parsePlaygroundImageTaskCount(raw)
	if !ok || n == 0 {
		delete(payload, "n")
		imageReq.N = nil
		return true
	}
	if n > playgroundImageMaxCount {
		n = playgroundImageMaxCount
	}
	if imageReq.N == nil || *imageReq.N != n {
		imageReq.N = &n
	}
	if current, ok := raw.(float64); ok && current == float64(n) {
		return false
	}
	payload["n"] = float64(n)
	return true
}

func parsePlaygroundImageTaskCount(raw interface{}) (uint, bool) {
	switch value := raw.(type) {
	case float64:
		maxUint := uint64(^uint(0))
		if value <= 0 || value > float64(maxUint) || value != float64(uint64(value)) {
			return 0, false
		}
		return uint(value), true
	case string:
		parsed, err := strconv.ParseUint(strings.TrimSpace(value), 10, 32)
		if err != nil || parsed == 0 {
			return 0, false
		}
		return uint(parsed), true
	case json.Number:
		parsed, err := strconv.ParseUint(strings.TrimSpace(value.String()), 10, 32)
		if err != nil || parsed == 0 {
			return 0, false
		}
		return uint(parsed), true
	default:
		return 0, false
	}
}

func firstNonEmptyNestedString(payload map[string]interface{}, paths ...[]string) string {
	for _, path := range paths {
		if value := nestedString(payload, path...); value != "" {
			return value
		}
	}
	return ""
}

func nestedString(payload map[string]interface{}, path ...string) string {
	var current interface{} = payload
	for _, key := range path {
		m, ok := current.(map[string]interface{})
		if !ok {
			return ""
		}
		current = m[key]
	}
	switch value := current.(type) {
	case string:
		return strings.TrimSpace(value)
	default:
		return ""
	}
}

func ensureGoogleImageConfig(payload map[string]interface{}, aspectRatio string, imageSize string) bool {
	extraBody := ensureMap(payload, "extra_body")
	google := ensureMap(extraBody, "google")
	imageConfig := ensureMap(google, "image_config")
	changed := false
	if aspectRatio != "" && isPlaygroundImageTaskBlankValue(imageConfig["aspect_ratio"]) {
		imageConfig["aspect_ratio"] = aspectRatio
		changed = true
	}
	if imageSize != "" && isPlaygroundImageTaskBlankValue(imageConfig["image_size"]) {
		imageConfig["image_size"] = imageSize
		changed = true
	}
	return changed
}

func isPlaygroundImageTaskBlankValue(value interface{}) bool {
	if value == nil {
		return true
	}
	return strings.TrimSpace(fmt.Sprint(value)) == ""
}

func ensureMap(parent map[string]interface{}, key string) map[string]interface{} {
	if parent == nil {
		return map[string]interface{}{}
	}
	if existing, ok := parent[key].(map[string]interface{}); ok && existing != nil {
		return existing
	}
	created := map[string]interface{}{}
	parent[key] = created
	return created
}

func parsePlaygroundImageTaskMultipartRequest(c *gin.Context, imageReq *dto.ImageRequest) error {
	form, err := common.ParseMultipartFormReusable(c)
	if err != nil {
		return err
	}
	defer form.RemoveAll()

	formValue := func(key string) string {
		values := form.Value[key]
		if len(values) == 0 {
			return ""
		}
		return strings.TrimSpace(values[0])
	}

	imageReq.Model = formValue("model")
	imageReq.Prompt = formValue("prompt")
	imageReq.Size = formValue("size")
	imageReq.Quality = formValue("quality")
	imageReq.AspectRatio = formValue("aspect_ratio")
	imageReq.Resolution = formValue("resolution")
	imageReq.ImageSize = formValue("image_size")
	imageReq.ResponseFormat = formValue("response_format")
	if rawN := formValue("n"); rawN != "" {
		n, ok := parsePlaygroundImageTaskCount(rawN)
		if !ok {
			return fmt.Errorf("invalid image count")
		}
		imageReq.N = &n
	}
	imageReq.Stream = parsePlaygroundImageTaskBoolPointer(formValue("stream"))
	imageReq.Watermark = parsePlaygroundImageTaskBoolPointer(formValue("watermark"))
	imageReq.Extra = map[string]json.RawMessage{}

	rawFields := map[string]*json.RawMessage{
		"style":              &imageReq.Style,
		"user":               &imageReq.User,
		"extra_fields":       &imageReq.ExtraFields,
		"background":         &imageReq.Background,
		"moderation":         &imageReq.Moderation,
		"output_format":      &imageReq.OutputFormat,
		"output_compression": &imageReq.OutputCompression,
		"partial_images":     &imageReq.PartialImages,
		"extra_body":         &imageReq.ExtraBody,
		"images":             &imageReq.Images,
		"mask":               &imageReq.Mask,
		"input_fidelity":     &imageReq.InputFidelity,
		"watermark_enabled":  &imageReq.WatermarkEnabled,
		"user_id":            &imageReq.UserId,
		"image":              &imageReq.Image,
		"responseFormat":     &imageReq.ResponseFormatObj,
		"generationConfig":   &imageReq.GenerationConfig,
	}
	for key, target := range rawFields {
		if value := formValue(key); value != "" {
			*target = playgroundImageTaskFormRawMessage(value)
		}
	}

	for key, values := range form.Value {
		if _, ok := rawFields[key]; ok {
			continue
		}
		if isPlaygroundImageTaskKnownFormField(key) || len(values) == 0 {
			continue
		}
		imageReq.Extra[key] = playgroundImageTaskFormRawMessage(values[0])
	}
	return nil
}

func parsePlaygroundImageTaskBoolPointer(value string) *bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true", "1", "yes", "on":
		v := true
		return &v
	case "false", "0", "no", "off":
		v := false
		return &v
	default:
		return nil
	}
}

func playgroundImageTaskFormRawMessage(value string) json.RawMessage {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	if json.Valid([]byte(trimmed)) {
		return json.RawMessage(trimmed)
	}
	raw, err := json.Marshal(trimmed)
	if err != nil {
		return nil
	}
	return raw
}

func isPlaygroundImageTaskKnownFormField(key string) bool {
	switch key {
	case "model", "prompt", "n", "size", "quality", "aspect_ratio", "resolution", "image_size", "response_format", "stream", "watermark":
		return true
	default:
		return false
	}
}

func PlaygroundGetImageTask(c *gin.Context) {
	taskID := strings.TrimSpace(c.Param("task_id"))
	if taskID == "" {
		taskID = strings.TrimSpace(c.Query("task_id"))
	}
	task, exists, err := model.GetByTaskId(c.GetInt("id"), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to read image task"})
		return
	}
	if !exists || task.Platform != constant.TaskPlatformPlaygroundImage || !isPlaygroundImageTaskAction(task.Action) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "image task not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": taskToPlaygroundImageTask(task)})
}

func V1GetImageTask(c *gin.Context) {
	taskID := strings.TrimSpace(c.Param("task_id"))
	if taskID == "" {
		taskID = strings.TrimSpace(c.Query("task_id"))
	}
	task, exists, err := model.GetByTaskId(c.GetInt("id"), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": "failed to read image task"}})
		return
	}
	if !exists || task.Platform != constant.TaskPlatformPlaygroundImage || !isPlaygroundImageTaskAction(task.Action) {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"message": "image task not found"}})
		return
	}
	c.JSON(http.StatusOK, taskToOpenAIImageTask(task))
}

func PlaygroundListImageTasks(c *gin.Context) {
	query := model.SyncTaskQueryParams{
		Platform:       constant.TaskPlatformPlaygroundImage,
		StartTimestamp: time.Now().Add(-playgroundMediaRetentionDuration()).Unix(),
	}
	if taskID := strings.TrimSpace(c.Query("task_id")); taskID != "" {
		query.TaskID = taskID
	}
	tasks := model.TaskGetAllUserTask(c.GetInt("id"), 0, 50, query)
	items := make([]gin.H, 0, len(tasks))
	for _, task := range tasks {
		if task == nil || !isPlaygroundImageTaskAction(task.Action) {
			continue
		}
		items = append(items, taskToPlaygroundImageTask(task))
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": items}})
}

func V1ListImageTasks(c *gin.Context) {
	query := model.SyncTaskQueryParams{
		Platform:       constant.TaskPlatformPlaygroundImage,
		StartTimestamp: time.Now().Add(-playgroundMediaRetentionDuration()).Unix(),
	}
	if taskID := strings.TrimSpace(c.Query("task_id")); taskID != "" {
		query.TaskID = taskID
	}
	tasks := model.TaskGetAllUserTask(c.GetInt("id"), 0, 50, query)
	items := make([]map[string]interface{}, 0, len(tasks))
	for _, task := range tasks {
		if task == nil || !isPlaygroundImageTaskAction(task.Action) {
			continue
		}
		items = append(items, taskToOpenAIImageTask(task))
	}
	c.JSON(http.StatusOK, openAIImageTaskListResponse{Data: items})
}

func resolvePlaygroundImageTaskGroup(c *gin.Context, imageReq *dto.ImageRequest) (string, string, error) {
	userGroup := strings.TrimSpace(common.GetContextKeyString(c, constant.ContextKeyUserGroup))
	if userGroup == "" {
		userGroup = strings.TrimSpace(c.GetString("user_group"))
	}
	if userGroup == "" {
		userGroup = strings.TrimSpace(c.GetString("group"))
	}
	if userGroup == "" {
		if userCache, err := model.GetUserCache(c.GetInt("id")); err == nil && userCache != nil {
			userGroup = strings.TrimSpace(userCache.Group)
		}
	}

	usingGroup := strings.TrimSpace(common.GetContextKeyString(c, constant.ContextKeyUsingGroup))
	if usingGroup == "" {
		usingGroup = userGroup
	}
	requestedGroup := strings.TrimSpace(playgroundImageRequestExtraString(imageReq, "group"))
	if requestedGroup != "" {
		if !service.GroupInUserUsableGroups(userGroup, requestedGroup) && requestedGroup != userGroup {
			return "", userGroup, errors.New("无权访问该分组")
		}
		usingGroup = requestedGroup
	}
	if usingGroup == "" {
		usingGroup = "default"
	}
	if userGroup == "" {
		userGroup = usingGroup
	}
	common.SetContextKey(c, constant.ContextKeyUserGroup, userGroup)
	common.SetContextKey(c, constant.ContextKeyUsingGroup, usingGroup)
	common.SetContextKey(c, constant.ContextKeyTokenGroup, usingGroup)
	c.Set("group", userGroup)
	c.Set("user_group", userGroup)
	return usingGroup, userGroup, nil
}

func playgroundImageRequestExtraString(imageReq *dto.ImageRequest, key string) string {
	if imageReq == nil || imageReq.Extra == nil {
		return ""
	}
	raw, ok := imageReq.Extra[key]
	if !ok || len(raw) == 0 {
		return ""
	}
	var value string
	if err := common.Unmarshal(raw, &value); err == nil {
		return value
	}
	return strings.Trim(strings.TrimSpace(string(raw)), `"`)
}

func annotatePlaygroundImageRequestMetadata(metadata map[string]interface{}, request *dto.ImageRequest) {
	if metadata == nil || request == nil {
		return
	}
	size := strings.TrimSpace(request.Size)
	if size != "" {
		metadata["requested_size"] = size
		metadata["effective_size"] = size
	}
	if resolution := strings.TrimSpace(request.Resolution); resolution != "" {
		metadata["resolution"] = resolution
	}
	if imageSize := strings.TrimSpace(request.ImageSize); imageSize != "" {
		metadata["image_size"] = imageSize
	}
	if aspectRatio := strings.TrimSpace(request.AspectRatio); aspectRatio != "" {
		metadata["aspect_ratio"] = aspectRatio
	}
	if len(request.ResponseFormatObj) > 0 {
		metadata["responseFormat"] = json.RawMessage(request.ResponseFormatObj)
	}
	if len(request.GenerationConfig) > 0 {
		metadata["generationConfig"] = json.RawMessage(request.GenerationConfig)
	}
}

func recordPlaygroundImageTaskSubmittedLog(c *gin.Context, task *model.Task, payload *playgroundImageTaskPayload, request *dto.ImageRequest) {
	if c == nil || task == nil || payload == nil || request == nil || model.LOG_DB == nil {
		return
	}
	imageN := uint(1)
	if request.N != nil && *request.N > 0 {
		imageN = *request.N
	}
	size := strings.TrimSpace(request.Size)
	if size == "" {
		size = "auto"
	}
	quality := strings.TrimSpace(request.Quality)
	if quality == "" {
		quality = "auto"
	}
	contentParts := []string{
		"媒体工坊图片任务生成中",
		fmt.Sprintf("任务ID %s", task.TaskID),
		fmt.Sprintf("请求ID %s", payload.RequestID),
		fmt.Sprintf("模式 %s", payload.Workflow),
		fmt.Sprintf("大小 %s", size),
		fmt.Sprintf("清晰度 %s", quality),
		fmt.Sprintf("生成数量 %d", imageN),
	}
	other := map[string]interface{}{
		"task_id":               task.TaskID,
		"request_id":            payload.RequestID,
		"request_path":          payload.RequestPath,
		"request_phase":         "submitted",
		"task_status":           string(task.Status),
		"playground_image_task": true,
		"media_kind":            "image",
		"workflow":              payload.Workflow,
		"async":                 true,
		"result_url":            "",
		"image_url":             "",
		"cached_url":            "",
		"size":                  size,
		"quality":               quality,
		"n":                     imageN,
	}
	if resolution := strings.TrimSpace(request.Resolution); resolution != "" {
		other["resolution"] = resolution
	}
	if imageSize := strings.TrimSpace(request.ImageSize); imageSize != "" {
		other["image_size"] = imageSize
	}
	if aspectRatio := strings.TrimSpace(request.AspectRatio); aspectRatio != "" {
		other["aspect_ratio"] = aspectRatio
	}
	other = model.BuildRequestAuditOther(c, other)
	username := c.GetString("username")
	if username == "" {
		username, _ = model.GetUsernameById(task.UserId, false)
	}
	log := &model.Log{
		UserId:    task.UserId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      model.LogTypeConsume,
		Content:   strings.Join(contentParts, "，"),
		TokenName: c.GetString("token_name"),
		ModelName: payload.Model,
		Quota:     0,
		ChannelId: 0,
		TokenId:   c.GetInt("token_id"),
		UseTime:   0,
		IsStream:  false,
		Group:     task.Group,
		Ip:        model.ResolveAuditClientIP(c),
		RequestId: payload.RequestID,
		Other:     common.MapToJsonStr(other),
	}
	if err := model.LOG_DB.Create(log).Error; err != nil {
		logger.LogError(c, "failed to record playground image task submitted log: "+err.Error())
	}
}

func runPlaygroundImageTask(taskID string, userID int, username string, role int, userGroup string, usingGroup string, tokenName string) {
	select {
	case playgroundImageWorkerSem <- struct{}{}:
		defer func() { <-playgroundImageWorkerSem }()
	default:
		if task, exists, err := model.GetByTaskId(userID, taskID); err == nil && exists && task != nil {
			markPlaygroundImageTaskFailure(task, "server busy, please retry later")
		}
		return
	}

	task, exists, err := model.GetByTaskId(userID, taskID)
	if err != nil || !exists || task == nil {
		common.SysLog(fmt.Sprintf("playground image task %s not found for user %d", taskID, userID))
		return
	}
	var payload playgroundImageTaskPayload
	_ = task.GetData(&payload)
	if payload.RequestFile == "" {
		markPlaygroundImageTaskFailure(task, "image task request payload missing")
		return
	}
	bodyBytes, err := os.ReadFile(payload.RequestFile)
	if err != nil {
		markPlaygroundImageTaskFailure(task, "image task request payload unavailable")
		return
	}

	fromStatus := task.Status
	task.Status = model.TaskStatusInProgress
	task.Progress = "15%"
	task.StartTime = time.Now().Unix()
	if won, err := task.UpdateWithStatus(fromStatus); err != nil {
		logger.LogError(nil, fmt.Sprintf("failed to mark playground image task %s in progress: %s", task.TaskID, err.Error()))
		return
	} else if !won {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, payload.RequestPath, bytes.NewReader(bodyBytes))
	if err != nil {
		markPlaygroundImageTaskFailure(task, "failed to prepare image task request")
		return
	}
	request.RemoteAddr = "127.0.0.1:0"
	if ip := strings.TrimSpace(payload.ClientIP); ip != "" {
		request.RemoteAddr = ip + ":0"
	}
	if payload.ContentType != "" {
		request.Header.Set("Content-Type", payload.ContentType)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("X-Playground-Image-Async-Task", task.TaskID)

	userCache, err := model.GetUserCache(userID)
	if err != nil || userCache == nil {
		markPlaygroundImageTaskFailure(task, "failed to read user context")
		return
	}
	if userGroup == "" {
		userGroup = userCache.Group
	}
	if usingGroup == "" {
		usingGroup = task.Group
	}
	if usingGroup == "" {
		usingGroup = userGroup
	}

	recorder := httptest.NewRecorder()
	capture := &playgroundImageTaskResultCapture{}
	engine := gin.New()
	var relayCtx *gin.Context
	engine.Use(func(ginCtx *gin.Context) {
		ginCtx.Next()
		common.CleanupBodyStorage(ginCtx)
	})
	engine.Use(func(ginCtx *gin.Context) {
		seedPlaygroundImageTaskContext(ginCtx, userID, username, role, userGroup, usingGroup, tokenName, &payload, task.TaskID, bodyBytes, capture)
	})
	engine.Use(middleware.Distribute())
	engine.POST("/pg/images/generations", func(ginCtx *gin.Context) {
		relayCtx = ginCtx
		Relay(ginCtx, types.RelayFormatOpenAIImage)
	})
	engine.POST("/pg/images/edits", func(ginCtx *gin.Context) {
		relayCtx = ginCtx
		Relay(ginCtx, types.RelayFormatOpenAIImage)
	})
	engine.ServeHTTP(recorder, request)
	if recorder.Code >= http.StatusBadRequest {
		applyPlaygroundImageTaskFailureCapture(task, capture)
		markPlaygroundImageTaskFailure(task, resolvePlaygroundImageTaskFailureReason(capture, task.UserId, payload.RequestID, recorder.Body.Bytes(), recorder.Code))
		return
	}

	task, exists, err = model.GetByTaskId(userID, taskID)
	if err != nil || !exists || task == nil {
		cleanupPlaygroundImageTaskRequest(payload.RequestFile)
		return
	}
	var response dto.ImageResponse
	responseBody := recorder.Body.Bytes()
	if err := common.Unmarshal(responseBody, &response); err != nil || len(response.Data) == 0 {
		if msg := extractPlaygroundImageTaskError(responseBody, recorder.Code); msg != "" {
			applyPlaygroundImageTaskFailureCapture(task, capture)
			markPlaygroundImageTaskFailure(task, resolvePlaygroundImageTaskFailureReason(capture, task.UserId, payload.RequestID, responseBody, recorder.Code))
		} else {
			markPlaygroundImageTaskFailure(task, "image task completed without a usable image")
		}
		return
	}
	capture.Response = &response

	item, err := cacheFirstPlaygroundImageTaskResult(relayCtx, task, &payload, capture.Response)
	if err != nil {
		markPlaygroundImageTaskFailure(task, err.Error())
		return
	}
	if refreshedTask, exists, err := model.GetByTaskId(userID, taskID); err == nil && exists && refreshedTask != nil {
		task = refreshedTask
		_ = task.GetData(&payload)
	}
	markPlaygroundImageTaskSuccess(task, item, &payload, recorder.Code, capture.Quota)
}

func seedPlaygroundImageTaskContext(ginCtx *gin.Context, userID int, username string, role int, userGroup string, usingGroup string, tokenName string, payload *playgroundImageTaskPayload, taskID string, bodyBytes []byte, capture *playgroundImageTaskResultCapture) {
	requestID := ""
	if payload != nil {
		requestID = payload.RequestID
		if payload.TokenName != "" {
			tokenName = payload.TokenName
		}
	}
	ginCtx.Set(common.RequestIdKey, requestID)
	ginCtx.Set("id", userID)
	ginCtx.Set("username", username)
	ginCtx.Set("role", role)
	ginCtx.Set("group", userGroup)
	ginCtx.Set("user_group", userGroup)
	ginCtx.Set("token_name", tokenName)
	ginCtx.Set("use_access_token", false)
	ginCtx.Set("playground_image_async_worker", true)
	ginCtx.Set("playground_image_task_id", taskID)
	ginCtx.Set(playgroundImageTaskResultCaptureKey, capture)
	if userCache, err := model.GetUserCache(userID); err == nil && userCache != nil {
		userCache.WriteContext(ginCtx)
	}
	common.SetContextKey(ginCtx, constant.ContextKeyUserGroup, userGroup)
	common.SetContextKey(ginCtx, constant.ContextKeyUsingGroup, usingGroup)
	if payload != nil && payload.UseAPIToken && payload.TokenID > 0 {
		token, err := model.GetTokenById(payload.TokenID)
		if err != nil {
			ginCtx.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{"message": "image task token unavailable"}})
			return
		}
		if err := middleware.SetupContextForToken(ginCtx, token); err != nil {
			ginCtx.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{"message": err.Error()}})
			return
		}
		tokenName = token.Name
	} else if payload != nil && model.IsImageBenefitTokenName(payload.TokenName) && payload.TokenID > 0 {
		token, err := model.GetTokenById(payload.TokenID)
		if err != nil {
			ginCtx.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{"message": "image benefit token unavailable"}})
			return
		}
		if !model.IsActiveImageBenefitToken(token, model.ImageBenefitModelName) {
			ginCtx.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{"message": "image benefit token expired or exhausted"}})
			return
		}
		if err := middleware.SetupContextForToken(ginCtx, token); err != nil {
			ginCtx.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{"message": err.Error()}})
			return
		}
		tokenName = token.Name
	} else {
		tempToken := &model.Token{
			UserId: userID,
			Name:   fmt.Sprintf("playground-%s", usingGroup),
			Group:  usingGroup,
		}
		if err := middleware.SetupContextForToken(ginCtx, tempToken); err != nil {
			ginCtx.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{"message": err.Error()}})
			return
		}
	}
	ginCtx.Set("token_name", tokenName)
	common.SetContextKey(ginCtx, constant.ContextKeyUserGroup, userGroup)
	common.SetContextKey(ginCtx, constant.ContextKeyUsingGroup, usingGroup)
	storage, err := common.CreateBodyStorage(bodyBytes)
	if err != nil {
		ginCtx.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": "failed to prepare image task body"}})
		return
	}
	ginCtx.Set(common.KeyBodyStorage, storage)
	ginCtx.Set(playgroundImageAsyncBillingCaptureKey, func(actualQuota int, info *relaycommon.RelayInfo) {
		capture.Quota = actualQuota
		capturePlaygroundImageTaskBilling(taskID, actualQuota, info)
	})
	ginCtx.Set(relaypkg.PlaygroundImageResponseCaptureKey, func(_ *dto.ImageRequest, usage *dto.Usage) {
		capture.Usage = usage
	})
}

func recordPlaygroundImageTaskChannelError(c *gin.Context, channelID int, err *types.NewAPIError) {
	if c == nil || err == nil || !c.GetBool("playground_image_async_worker") {
		return
	}
	value, exists := c.Get(playgroundImageTaskResultCaptureKey)
	if !exists {
		return
	}
	capture, ok := value.(*playgroundImageTaskResultCapture)
	if !ok || capture == nil {
		return
	}
	reason := sanitizePlaygroundImageTaskFailure(err.MaskSensitiveErrorWithStatusCode())
	if reason == "" || isGenericPlaygroundImageTaskFailureReason(reason) {
		return
	}
	capture.LastFailureReason = reason
	if channelID > 0 {
		capture.LastFailureChannelID = channelID
	}
}

func applyPlaygroundImageTaskFailureCapture(task *model.Task, capture *playgroundImageTaskResultCapture) {
	if task == nil || capture == nil || capture.LastFailureChannelID <= 0 || task.ChannelId > 0 {
		return
	}
	task.ChannelId = capture.LastFailureChannelID
}

func capturePlaygroundImageTaskBilling(taskID string, actualQuota int, info *relaycommon.RelayInfo) {
	task, exists, err := model.GetByOnlyTaskId(taskID)
	if err != nil || !exists || task == nil {
		return
	}
	task.Quota = actualQuota
	if info != nil {
		task.ChannelId = info.ChannelId
		task.Group = truncatePlaygroundText(info.UsingGroup, 50)
		task.PrivateData.BillingSource = info.BillingSource
		task.PrivateData.SubscriptionId = info.SubscriptionId
		task.PrivateData.TokenId = info.TokenId
		task.PrivateData.BillingContext = &model.TaskBillingContext{
			ModelPrice:      info.PriceData.ModelPrice,
			GroupRatio:      info.PriceData.GroupRatioInfo.GroupRatio,
			ModelRatio:      info.PriceData.ModelRatio,
			OtherRatios:     info.PriceData.OtherRatios,
			OriginModelName: info.OriginModelName,
			PerCallBilling:  info.PriceData.UsePrice,
		}
		if info.UpstreamModelName != "" {
			task.Properties.UpstreamModelName = info.UpstreamModelName
		}
	}
	payload := playgroundImageTaskPayload{}
	_ = task.GetData(&payload)
	payload.ActualQuota = actualQuota
	task.SetData(payload)
	_ = task.Update()
}

func cacheFirstPlaygroundImageTaskResult(c *gin.Context, task *model.Task, payload *playgroundImageTaskPayload, response *dto.ImageResponse) (*playgroundMediaItem, error) {
	if response == nil || len(response.Data) == 0 {
		return nil, errors.New("image task returned no image")
	}
	first := response.Data[0]
	rawURL := strings.TrimSpace(first.Url)
	if rawURL == "" && strings.TrimSpace(first.B64Json) != "" {
		rawURL = "data:image/png;base64," + strings.TrimSpace(first.B64Json)
	}
	if rawURL == "" {
		return nil, errors.New("image task returned no image url")
	}
	metadata := map[string]interface{}{}
	if payload.Metadata != nil {
		for k, v := range payload.Metadata {
			metadata[k] = v
		}
	}
	metadata["task_id"] = task.TaskID
	metadata["request_id"] = payload.RequestID
	item, err := cachePlaygroundMedia(c, playgroundMediaCacheRequest{
		URL:           rawURL,
		Kind:          "image",
		Prompt:        payload.Prompt,
		Model:         payload.Model,
		Workflow:      payload.Workflow,
		RevisedPrompt: first.RevisedPrompt,
		Metadata:      metadata,
	})
	if err != nil {
		return nil, err
	}
	return item, nil
}

func markPlaygroundImageTaskSuccess(task *model.Task, item *playgroundMediaItem, payload *playgroundImageTaskPayload, status int, actualQuota int) {
	if task == nil || item == nil || payload == nil {
		return
	}
	now := time.Now().Unix()
	fromStatus := task.Status
	task.Status = model.TaskStatusSuccess
	task.Progress = "100%"
	task.FinishTime = now
	task.FailReason = item.URL
	task.PrivateData.ResultURL = item.URL
	payload.CachedURL = item.URL
	payload.Item = item
	payload.OriginalStatus = status
	requestFile := payload.RequestFile
	payload.RequestFile = ""
	if actualQuota > 0 {
		payload.ActualQuota = actualQuota
		task.Quota = actualQuota
	}
	task.SetData(payload)
	won, err := task.UpdateWithStatus(fromStatus)
	if err != nil {
		logger.LogError(nil, fmt.Sprintf("failed to complete playground image task %s: %s", task.TaskID, err.Error()))
	}
	extra := map[string]interface{}{}
	if actualQuota > 0 {
		extra["actual_quota"] = actualQuota
	}
	if task.ChannelId > 0 {
		extra["channel_id"] = task.ChannelId
	}
	if task.StartTime > 0 && task.FinishTime >= task.StartTime {
		extra["use_time"] = int(task.FinishTime - task.StartTime)
	}
	logErr := model.UpdatePlaygroundImageTaskConsumeLogResult(task.UserId, payload.RequestID, task.TaskID, item.URL, task.FinishTime, string(model.TaskStatusSuccess), extra)
	if logErr != nil {
		common.SysError("failed to update playground image task result log: " + logErr.Error())
	}
	if won {
		cleanupPlaygroundImageTaskRequest(requestFile)
	}
}

func updatePlaygroundImageRecoveryTaskReady(task *model.Task, url string, item *playgroundMediaItem) {
	if task == nil {
		return
	}
	var payload playgroundImageTaskPayload
	_ = task.GetData(&payload)
	if item == nil {
		url = strings.TrimSpace(url)
		if url == "" {
			return
		}
		item = &playgroundMediaItem{
			ID:          task.TaskID,
			Kind:        "image",
			URL:         url,
			DisplayURL:  url,
			CachedURL:   url,
			Filename:    filepath.Base(url),
			Prompt:      payload.Prompt,
			Model:       payload.Model,
			Workflow:    payload.Workflow,
			Status:      "ready",
			CacheStatus: "cached",
			CreatedAt:   time.Now().Format(time.RFC3339),
			ExpiresAt:   time.Now().Add(playgroundMediaRetentionDuration()).Format(time.RFC3339),
		}
	}
	if item.URL == "" {
		item.URL = strings.TrimSpace(url)
	}
	if item.DisplayURL == "" {
		item.DisplayURL = item.URL
	}
	if item.CachedURL == "" {
		item.CachedURL = item.URL
	}
	markPlaygroundImageTaskSuccess(task, item, &payload, http.StatusOK, task.Quota)
}

func markPlaygroundImageTaskFailure(task *model.Task, reason string) {
	if task == nil {
		return
	}
	capturedChannelID := task.ChannelId
	if latest, exists, err := model.GetByOnlyTaskId(task.TaskID); err == nil && exists && latest != nil {
		if latest.ChannelId == 0 && capturedChannelID > 0 {
			latest.ChannelId = capturedChannelID
		}
		task = latest
	}
	reason = truncatePlaygroundText(strings.TrimSpace(sanitizePlaygroundImageTaskFailure(reason)), 1000)
	if reason == "" {
		reason = "image task failed"
	}
	fromStatus := task.Status
	task.Status = model.TaskStatusFailure
	task.Progress = "100%"
	task.FinishTime = time.Now().Unix()
	task.FailReason = reason
	var payload playgroundImageTaskPayload
	_ = task.GetData(&payload)
	payload.Error = reason
	requestFile := payload.RequestFile
	payload.RequestFile = ""
	task.SetData(payload)
	won, err := task.UpdateWithStatus(fromStatus)
	if err != nil {
		logger.LogError(nil, fmt.Sprintf("failed to fail playground image task %s: %s", task.TaskID, err.Error()))
		return
	}
	if !won {
		return
	}
	markPlaygroundImageTaskLogFailure(task, &payload, reason)
	cleanupPlaygroundImageTaskRequest(requestFile)
	service.RefundTaskQuota(nil, task, reason)
}

func sanitizePlaygroundImageTaskFailure(reason string) string {
	trimmed := strings.TrimSpace(reason)
	if trimmed == "" {
		return ""
	}
	if publicReason := sanitizePlaygroundImageTaskPublicReason(trimmed); publicReason != "" {
		return publicReason
	}
	lower := strings.ToLower(trimmed)
	sensitiveMarkers := []string{
		"upstream",
		"channel",
		"渠道",
		"供应商",
		"request id",
		"request_id",
		"api key",
		"apikey",
		"sk-",
		"bearer",
		"token",
		"secret",
		"password",
		"status_code",
	}
	for _, marker := range sensitiveMarkers {
		if strings.Contains(lower, marker) {
			return "模型服务暂时无法处理该请求，请稍后重试或调整参数"
		}
	}
	return trimmed
}

func sanitizePlaygroundImageTaskPublicReason(reason string) string {
	cleaned := strings.TrimSpace(common.MaskSensitiveInfo(reason))
	if cleaned == "" {
		return ""
	}
	cleaned = playgroundCredentialPattern.ReplaceAllString(cleaned, "[REDACTED]")
	cleaned = playgroundSecretClausePattern.ReplaceAllString(cleaned, "")
	cleaned = playgroundStatusCodePrefixPattern.ReplaceAllString(cleaned, "")
	cleaned = playgroundRequestIDPattern.ReplaceAllString(cleaned, "")
	cleaned = playgroundInternalPrefixPattern.ReplaceAllString(cleaned, "")
	cleaned = playgroundInternalClausePattern.ReplaceAllString(cleaned, "")
	cleaned = strings.TrimSpace(strings.Trim(cleaned, " ,，;；.。"))
	if cleaned == "" {
		return ""
	}
	if strings.Contains(cleaned, "[REDACTED]") {
		return ""
	}
	lower := strings.ToLower(cleaned)
	for _, marker := range []string{"api key", "apikey", "bearer", "token", "secret", "password", "sk-"} {
		if strings.Contains(lower, marker) {
			return ""
		}
	}
	if isGenericPlaygroundImageTaskFailureReason(cleaned) {
		return ""
	}
	return cleaned
}

func resolvePlaygroundImageTaskFailureReason(capture *playgroundImageTaskResultCapture, userID int, requestID string, body []byte, status int) string {
	if capture != nil {
		reason := strings.TrimSpace(capture.LastFailureReason)
		if reason != "" && !isGenericPlaygroundImageTaskFailureReason(reason) {
			return reason
		}
	}
	if reason := latestPlaygroundImageTaskRelayErrorReason(userID, requestID); reason != "" {
		return reason
	}
	return sanitizePlaygroundImageTaskFailure(extractPlaygroundImageTaskError(body, status))
}

func latestPlaygroundImageTaskRelayErrorReason(userID int, requestID string) string {
	requestID = strings.TrimSpace(requestID)
	if userID == 0 || requestID == "" || model.LOG_DB == nil {
		return ""
	}
	var logs []model.Log
	err := model.LOG_DB.Where("user_id = ? AND request_id = ? AND type = ?", userID, requestID, model.LogTypeError).
		Order("id desc").
		Limit(5).
		Find(&logs).Error
	if err != nil {
		return ""
	}
	for _, log := range logs {
		reason := sanitizePlaygroundImageTaskFailure(log.Content)
		if reason != "" && !isGenericPlaygroundImageTaskFailureReason(reason) {
			return reason
		}
	}
	return ""
}

func isGenericPlaygroundImageTaskFailureReason(reason string) bool {
	normalized := strings.TrimSpace(reason)
	if normalized == "" {
		return true
	}
	switch normalized {
	case "模型服务暂时无法处理该请求，请稍后重试或调整参数",
		"请求参数有误，请检查后重试。",
		"模型服务暂时不可用，请稍后重试。",
		"image task failed",
		"request failed",
		"request failed with",
		"with":
		return true
	}
	return false
}

func markPlaygroundImageTaskLogFailure(task *model.Task, payload *playgroundImageTaskPayload, reason string) {
	if task == nil || payload == nil || payload.RequestID == "" || model.LOG_DB == nil {
		return
	}
	var existing model.Log
	err := model.LOG_DB.Where("user_id = ? AND request_id = ? AND type = ?", task.UserId, payload.RequestID, model.LogTypeConsume).
		Order("id asc").
		First(&existing).Error
	if err != nil {
		return
	}
	other, _ := common.StrToMap(existing.Other)
	if other == nil {
		other = map[string]interface{}{}
	}
	failureChannelID := task.ChannelId
	if failureChannelID == 0 {
		failureChannelID = existing.ChannelId
	}
	if failureChannelID == 0 {
		failureChannelID = intFromPlaygroundLogValue(other["channel_id"])
	}
	if failureChannelID == 0 {
		failureChannelID = latestPlaygroundImageTaskRequestChannelID(task.UserId, payload.RequestID)
	}
	other["task_id"] = task.TaskID
	other["request_id"] = payload.RequestID
	other["request_phase"] = "failed"
	other["task_status"] = string(model.TaskStatusFailure)
	other["playground_image_task"] = true
	other["media_kind"] = "image"
	other["failure_kind"] = "media_task_failed"
	other["final_log_type"] = "error"
	other["refund_reason"] = "media_task_failed"
	other["billing_settlement"] = "preconsume_refund_task_failed"
	other["finish_time"] = task.FinishTime
	other["fail_reason"] = reason
	other["result_url"] = ""
	other["image_url"] = ""
	other["cached_url"] = ""
	if failureChannelID > 0 {
		other["channel_id"] = failureChannelID
	}
	if task.Group != "" {
		other["group"] = task.Group
	}
	if task.Quota > 0 {
		other["pre_refund_quota"] = task.Quota
	}
	useTime := 0
	if task.StartTime > 0 && task.FinishTime >= task.StartTime {
		useTime = int(task.FinishTime - task.StartTime)
	}
	other["use_time"] = useTime
	content := "媒体工坊图片任务失败"
	if reason != "" {
		content += "，" + reason
	}
	if err := model.LOG_DB.Model(&model.Log{}).Where("id = ?", existing.Id).Updates(map[string]interface{}{
		"content":    truncatePlaygroundText(content, 1000),
		"type":       model.LogTypeError,
		"quota":      0,
		"channel_id": failureChannelID,
		"use_time":   useTime,
		"other":      common.MapToJsonStr(other),
	}).Error; err != nil {
		common.SysError("failed to update playground image task failure log: " + err.Error())
	}
}

func latestPlaygroundImageTaskRequestChannelID(userID int, requestID string) int {
	requestID = strings.TrimSpace(requestID)
	if userID == 0 || requestID == "" || model.LOG_DB == nil {
		return 0
	}
	var log model.Log
	err := model.LOG_DB.Where("user_id = ? AND request_id = ? AND channel_id > 0", userID, requestID).
		Order("id desc").
		First(&log).Error
	if err != nil {
		return 0
	}
	return log.ChannelId
}

func intFromPlaygroundLogValue(value interface{}) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case json.Number:
		parsed, _ := typed.Int64()
		return int(parsed)
	default:
		var parsed int
		if n, err := fmt.Sscanf(fmt.Sprint(value), "%d", &parsed); err == nil && n == 1 {
			return parsed
		}
		return 0
	}
}

func taskToPlaygroundImageTask(task *model.Task) gin.H {
	payload := playgroundImageTaskPayload{}
	_ = task.GetData(&payload)
	payload.RequestFile = ""
	return gin.H{
		"task_id":     task.TaskID,
		"request_id":  payload.RequestID,
		"status":      task.Status,
		"progress":    task.Progress,
		"submit_time": task.SubmitTime,
		"start_time":  task.StartTime,
		"finish_time": task.FinishTime,
		"model":       task.Properties.OriginModelName,
		"prompt":      task.Properties.Input,
		"action":      task.Action,
		"result_url":  task.GetResultURL(),
		"fail_reason": task.FailReason,
		"quota":       task.Quota,
		"data":        payload,
		"item":        payload.Item,
	}
}

func taskToOpenAIImageTask(task *model.Task) map[string]interface{} {
	payload := playgroundImageTaskPayload{}
	_ = task.GetData(&payload)
	payload.RequestFile = ""
	taskID := task.TaskID
	resultURL := strings.TrimSpace(task.GetResultURL())
	response := map[string]interface{}{
		"task_id":     taskID,
		"id":          taskID,
		"status":      string(task.Status),
		"task_status": string(task.Status),
		"progress":    task.Progress,
		"created":     task.SubmitTime,
		"created_at":  task.SubmitTime,
		"updated_at":  task.FinishTime,
		"model":       task.Properties.OriginModelName,
		"result_url":  resultURL,
		"fail_reason": task.FailReason,
		"message":     task.FailReason,
		"data": map[string]interface{}{
			"task_id":     taskID,
			"status":      string(task.Status),
			"task_status": string(task.Status),
			"progress":    task.Progress,
			"result_url":  resultURL,
			"fail_reason": task.FailReason,
			"data":        []map[string]interface{}{},
		},
	}
	if resultURL != "" && task.Status == model.TaskStatusSuccess {
		imageData := []map[string]interface{}{
			{
				"url": resultURL,
			},
		}
		if payload.Item != nil && strings.TrimSpace(payload.Item.RevisedPrompt) != "" {
			imageData[0]["revised_prompt"] = payload.Item.RevisedPrompt
		}
		response["data"].(map[string]interface{})["data"] = imageData
		response["data"].(map[string]interface{})["url"] = resultURL
		response["url"] = resultURL
	}
	if payload.Item != nil {
		response["item"] = payload.Item
		response["data"].(map[string]interface{})["item"] = payload.Item
	}
	if payload.Error != "" {
		response["error"] = gin.H{"message": payload.Error}
	}
	return response
}

func isPlaygroundImageTaskAction(action string) bool {
	return action == constant.TaskActionImageGenerate || action == constant.TaskActionImageEdit
}

func normalizePlaygroundImageTaskPath(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if strings.HasPrefix(value, "/v1/images/") {
		return "/pg" + strings.TrimPrefix(value, "/v1")
	}
	if strings.HasPrefix(value, "/pg/images/") {
		return value
	}
	return ""
}

func resolvePlaygroundImageTaskRequestPath(c *gin.Context) string {
	path := ""
	if c != nil {
		path = normalizePlaygroundImageTaskPath(c.Query("endpoint"))
	}
	if path == "" {
		path = "/pg/images/generations"
	}
	if c != nil && c.Request != nil && c.Request.URL != nil {
		if strings.HasSuffix(c.Request.URL.Path, "/edits") {
			path = "/pg/images/edits"
		} else if strings.HasSuffix(c.Request.URL.Path, "/generations") {
			path = "/pg/images/generations"
		}
	}
	return path
}

func persistPlaygroundImageTaskRequest(userID int, taskID string, body []byte) (string, error) {
	root := filepath.Join(playgroundMediaCacheRoot(), "tasks", playgroundMediaUserDirName(userID))
	if err := os.MkdirAll(root, 0o700); err != nil {
		return "", err
	}
	name := filepath.Base(taskID) + ".body"
	if name == ".body" || strings.Contains(name, "..") {
		return "", errors.New("invalid task id")
	}
	fullPath := filepath.Join(root, name)
	cleanRoot := filepath.Clean(root) + string(os.PathSeparator)
	cleanPath := filepath.Clean(fullPath)
	if !strings.HasPrefix(cleanPath, cleanRoot) {
		return "", errors.New("invalid task request path")
	}
	if err := os.WriteFile(cleanPath, body, 0o600); err != nil {
		return "", err
	}
	return cleanPath, nil
}

func cleanupPlaygroundImageTaskRequest(path string) {
	path = strings.TrimSpace(path)
	if path == "" {
		return
	}
	root := filepath.Clean(filepath.Join(playgroundMediaCacheRoot(), "tasks")) + string(os.PathSeparator)
	cleanPath := filepath.Clean(path)
	if !strings.HasPrefix(cleanPath, root) {
		return
	}
	_ = os.Remove(cleanPath)
}

func extractPlaygroundImageTaskError(body []byte, status int) string {
	var payload struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
		Message string `json:"message"`
		Success *bool  `json:"success"`
	}
	if len(body) > 0 && json.Unmarshal(body, &payload) == nil {
		if payload.Error.Message != "" {
			return payload.Error.Message
		}
		if payload.Message != "" {
			return payload.Message
		}
	}
	if len(body) > 0 {
		ct := http.DetectContentType(body)
		if _, _, err := mime.ParseMediaType(ct); err == nil {
			return truncatePlaygroundText(string(body), 1000)
		}
	}
	if status > 0 {
		return fmt.Sprintf("image task failed with status %d", status)
	}
	return "image task failed"
}
