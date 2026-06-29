package sora

import (
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel"
	taskcommon "github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"
	"github.com/tidwall/sjson"
)

// ============================
// Request / Response structures
// ============================

type ContentItem struct {
	Type     string    `json:"type"`                // "text" or "image_url"
	Text     string    `json:"text,omitempty"`      // for text type
	ImageURL *ImageURL `json:"image_url,omitempty"` // for image_url type
}

type ImageURL struct {
	URL string `json:"url"`
}

type responseTask struct {
	ID                 string `json:"id"`
	TaskID             string `json:"task_id,omitempty"` //兼容旧接口
	Object             string `json:"object"`
	Model              string `json:"model"`
	Status             string `json:"status"`
	Success            *bool  `json:"success,omitempty"`
	StatusCode         int    `json:"status_code,omitempty"`
	ProviderCode       string `json:"provider_code,omitempty"`
	Code               string `json:"code,omitempty"`
	Message            string `json:"message,omitempty"`
	Progress           int    `json:"progress"`
	Url                string `json:"url,omitempty"`
	VideoUrl           string `json:"video_url,omitempty"`
	ResultUrl          string `json:"result_url,omitempty"`
	OutputUrl          string `json:"output_url,omitempty"`
	Output             any    `json:"output,omitempty"`
	Metadata           any    `json:"metadata,omitempty"`
	CreatedAt          int64  `json:"created_at"`
	CompletedAt        int64  `json:"completed_at,omitempty"`
	ExpiresAt          int64  `json:"expires_at,omitempty"`
	Seconds            string `json:"seconds,omitempty"`
	Size               string `json:"size,omitempty"`
	RemixedFromVideoID string `json:"remixed_from_video_id,omitempty"`
	Error              *struct {
		Message string `json:"message"`
		Code    string `json:"code"`
	} `json:"error,omitempty"`
}

func pickVideoResultURL(value any, depth int) string {
	if value == nil || depth > 6 {
		return ""
	}
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case []any:
		for _, item := range v {
			if url := pickVideoResultURL(item, depth+1); url != "" {
				return url
			}
		}
	case map[string]any:
		for _, key := range []string{
			"url",
			"video_url",
			"videoUrl",
			"result_url",
			"resultUrl",
			"output_url",
			"outputUrl",
			"download_url",
			"downloadUrl",
			"file_url",
			"fileUrl",
			"signed_url",
			"signedUrl",
			"uri",
			"link",
			"href",
		} {
			if url := pickVideoResultURL(v[key], depth+1); url != "" {
				return url
			}
		}
		for _, key := range []string{
			"output",
			"outputs",
			"metadata",
			"data",
			"result",
			"response",
			"content",
			"items",
			"videos",
			"files",
			"artifact",
			"artifacts",
		} {
			if url := pickVideoResultURL(v[key], depth+1); url != "" {
				return url
			}
		}
	}
	return ""
}

func videoResultURLFromTask(resTask responseTask) string {
	for _, value := range []any{
		resTask.Url,
		resTask.VideoUrl,
		resTask.ResultUrl,
		resTask.OutputUrl,
		resTask.Output,
		resTask.Metadata,
	} {
		if url := pickVideoResultURL(value, 0); url != "" {
			return url
		}
	}
	return ""
}

// ============================
// Adaptor implementation
// ============================

type TaskAdaptor struct {
	taskcommon.BaseBilling
	ChannelType int
	apiKey      string
	baseURL     string
}

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.ChannelType = info.ChannelType
	a.baseURL = info.ChannelBaseUrl
	a.apiKey = info.ApiKey
}

func validateRemixRequest(c *gin.Context) *dto.TaskError {
	var req relaycommon.TaskSubmitReq
	if err := common.UnmarshalBodyReusable(c, &req); err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}
	if strings.TrimSpace(req.Prompt) == "" {
		return service.TaskErrorWrapperLocal(fmt.Errorf("field prompt is required"), "invalid_request", http.StatusBadRequest)
	}
	// 存储原始请求到 context，与 ValidateMultipartDirect 路径保持一致
	c.Set("task_request", req)
	return nil
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) (taskErr *dto.TaskError) {
	if info.Action == constant.TaskActionRemix {
		return validateRemixRequest(c)
	}
	return relaycommon.ValidateMultipartDirect(c, info)
}

// EstimateBilling 根据用户请求的 seconds 和 size 计算 OtherRatios。
func (a *TaskAdaptor) EstimateBilling(c *gin.Context, info *relaycommon.RelayInfo) map[string]float64 {
	// remix 路径的 OtherRatios 已在 ResolveOriginTask 中设置
	if info.Action == constant.TaskActionRemix {
		return nil
	}

	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil
	}

	seconds, _ := strconv.Atoi(req.Seconds)
	if seconds == 0 {
		seconds = req.Duration
	}
	if seconds <= 0 {
		seconds = 4
	}

	size := req.Size
	if size == "" {
		size = "720x1280"
	}

	ratios := map[string]float64{
		"seconds": float64(seconds),
		"size":    1,
	}
	if size == "1792x1024" || size == "1024x1792" {
		ratios["size"] = 1.666667
	}
	return ratios
}

func (a *TaskAdaptor) BuildRequestURL(info *relaycommon.RelayInfo) (string, error) {
	if info.Action == constant.TaskActionRemix {
		return fmt.Sprintf("%s/v1/videos/%s/remix", a.baseURL, info.OriginTaskID), nil
	}
	if isSeedanceVideoModel(info.UpstreamModelName) {
		return fmt.Sprintf("%s/api/v1/video/generations", a.baseURL), nil
	}
	return fmt.Sprintf("%s/v1/videos", a.baseURL), nil
}

// BuildRequestHeader sets required headers.
func (a *TaskAdaptor) BuildRequestHeader(c *gin.Context, req *http.Request, info *relaycommon.RelayInfo) error {
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Content-Type", c.Request.Header.Get("Content-Type"))
	return nil
}

func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, errors.Wrap(err, "get_request_body_failed")
	}
	cachedBody, err := storage.Bytes()
	if err != nil {
		return nil, errors.Wrap(err, "read_body_bytes_failed")
	}
	contentType := c.GetHeader("Content-Type")

	if strings.HasPrefix(contentType, "application/json") {
		var bodyMap map[string]interface{}
		if err := common.Unmarshal(cachedBody, &bodyMap); err == nil {
			bodyMap["model"] = info.UpstreamModelName
			if isSeedanceVideoModel(info.UpstreamModelName) {
				bodyMap = normalizeSeedanceVideoRequestBody(bodyMap)
			}
			if newBody, err := common.Marshal(bodyMap); err == nil {
				return bytes.NewReader(newBody), nil
			}
		}
		return bytes.NewReader(cachedBody), nil
	}

	if strings.Contains(contentType, "multipart/form-data") {
		formData, err := common.ParseMultipartFormReusable(c)
		if err != nil {
			return bytes.NewReader(cachedBody), nil
		}
		var buf bytes.Buffer
		writer := multipart.NewWriter(&buf)
		writer.WriteField("model", info.UpstreamModelName)
		for key, values := range formData.Value {
			if key == "model" {
				continue
			}
			for _, v := range values {
				writer.WriteField(key, v)
			}
		}
		for fieldName, fileHeaders := range formData.File {
			for _, fh := range fileHeaders {
				f, err := fh.Open()
				if err != nil {
					continue
				}
				ct := fh.Header.Get("Content-Type")
				if ct == "" || ct == "application/octet-stream" {
					buf512 := make([]byte, 512)
					n, _ := io.ReadFull(f, buf512)
					ct = http.DetectContentType(buf512[:n])
					// Re-open after sniffing so the full content is copied below
					f.Close()
					f, err = fh.Open()
					if err != nil {
						continue
					}
				}
				h := make(textproto.MIMEHeader)
				h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, fieldName, fh.Filename))
				h.Set("Content-Type", ct)
				part, err := writer.CreatePart(h)
				if err != nil {
					f.Close()
					continue
				}
				io.Copy(part, f)
				f.Close()
			}
		}
		writer.Close()
		c.Request.Header.Set("Content-Type", writer.FormDataContentType())
		return &buf, nil
	}

	return common.ReaderOnly(storage), nil
}

func isSeedanceVideoModel(modelName string) bool {
	return strings.Contains(strings.ToLower(strings.TrimSpace(modelName)), "seedance")
}

func seedanceUpstreamModel(modelName string) string {
	return strings.TrimSpace(modelName)
}

func normalizeSeedanceVideoRequestBody(bodyMap map[string]interface{}) map[string]interface{} {
	cleaned := make(map[string]interface{}, len(bodyMap))
	if modelName := seedanceUpstreamModel(trimmedString(bodyMap["model"])); modelName != "" {
		cleaned["model"] = modelName
	}

	metadata := mapFromAny(bodyMap["metadata"])
	content := normalizeSeedanceVideoContent(bodyMap, metadata)
	if prompt := seedanceVideoPrompt(trimmedString(bodyMap["prompt"]), len(content)); prompt != "" {
		cleaned["prompt"] = prompt
	}
	cleaned["seconds"] = seedanceVideoSeconds(bodyMap)

	cleanMetadata := map[string]interface{}{
		"ratio":      seedanceVideoRatio(bodyMap),
		"resolution": seedanceVideoResolution(bodyMap),
	}
	if len(content) > 0 {
		if firstFrameURL := seedanceFirstFrameURL(content); firstFrameURL != "" {
			cleaned["first_frame_url"] = firstFrameURL
		}
		if imageWithRoles := seedanceImageWithRoles(content); len(imageWithRoles) > 0 {
			cleaned["image_with_roles"] = imageWithRoles
		} else if imageURLs := seedanceImageURLs(content); len(imageURLs) > 0 {
			cleaned["image_urls"] = imageURLs
		}
	}
	if value, ok := boolFromAny(firstPresentAny(bodyMap["watermark"], metadata["watermark"])); ok && value {
		cleanMetadata["watermark"] = value
	}
	if shouldForwardSeedanceGenerateAudio(trimmedString(bodyMap["model"])) {
		value, ok := boolFromAny(firstPresentAny(bodyMap["generate_audio"], metadata["generate_audio"]))
		if ok && value {
			cleanMetadata["generate_audio"] = value
		}
	}
	cleaned["metadata"] = cleanMetadata

	return cleaned
}

func seedanceFirstFrameURL(content []interface{}) string {
	for _, item := range content {
		itemMap := mapFromAny(item)
		if normalizeSeedanceVideoRole(trimmedString(itemMap["role"])) == "first_frame" {
			if url := videoContentImageURL(itemMap); url != "" {
				return url
			}
		}
	}
	for _, item := range content {
		if url := videoContentImageURL(mapFromAny(item)); url != "" {
			return url
		}
	}
	return ""
}

func seedanceImageURLs(content []interface{}) []string {
	urls := make([]string, 0, len(content))
	for _, item := range content {
		itemMap := mapFromAny(item)
		if normalizeSeedanceVideoRole(trimmedString(itemMap["role"])) == "last_frame" {
			return nil
		}
		if url := videoContentImageURL(itemMap); url != "" {
			urls = append(urls, url)
		}
	}
	return urls
}

func seedanceImageWithRoles(content []interface{}) []map[string]interface{} {
	hasLastFrame := false
	items := make([]map[string]interface{}, 0, len(content))
	for _, item := range content {
		itemMap := mapFromAny(item)
		role := normalizeSeedanceVideoRole(trimmedString(itemMap["role"]))
		if role == "last_frame" {
			hasLastFrame = true
		}
		if url := videoContentImageURL(itemMap); url != "" {
			items = append(items, map[string]interface{}{
				"url":  url,
				"role": role,
			})
		}
	}
	if !hasLastFrame {
		return nil
	}
	return items
}

func seedanceVideoPrompt(prompt string, _ int) string {
	return strings.TrimSpace(prompt)
}

func shouldForwardSeedanceGenerateAudio(modelName string) bool {
	modelName = strings.ToLower(strings.TrimSpace(modelName))
	return strings.HasPrefix(modelName, "doubao-seedance-2-0")
}

func copyPresentNonBlank(dst, src map[string]interface{}, key string) {
	value, ok := src[key]
	if !ok || value == nil {
		return
	}
	if text, ok := value.(string); ok && strings.TrimSpace(text) == "" {
		return
	}
	dst[key] = value
}

func seedanceVideoSeconds(bodyMap map[string]interface{}) string {
	for _, key := range []string{"seconds", "duration"} {
		if value, ok := integerFromAny(bodyMap[key]); ok && value >= 4 && value <= 15 {
			return strconv.Itoa(value)
		}
	}
	return "4"
}

func seedanceVideoRatio(bodyMap map[string]interface{}) string {
	if ratio := normalizedSeedanceRatio(trimmedString(bodyMap["ratio"])); ratio != "" {
		return ratio
	}
	metadata := mapFromAny(bodyMap["metadata"])
	if ratio := normalizedSeedanceRatio(trimmedString(metadata["ratio"])); ratio != "" {
		return ratio
	}

	width, height := seedanceVideoDimensions(bodyMap)
	if width > 0 && height > 0 {
		if width == height {
			return "1:1"
		}
		if width > height {
			return "16:9"
		}
		return "9:16"
	}
	return "16:9"
}

func normalizedSeedanceRatio(value string) string {
	switch strings.TrimSpace(value) {
	case "16:9", "9:16", "1:1", "4:3", "3:4", "21:9":
		return value
	default:
		return ""
	}
}

func seedanceVideoDimensions(bodyMap map[string]interface{}) (int, int) {
	size := strings.ToLower(strings.TrimSpace(trimmedString(bodyMap["size"])))
	if strings.Contains(size, "x") {
		parts := strings.SplitN(size, "x", 2)
		width, widthOK := integerFromAny(strings.TrimSpace(parts[0]))
		height, heightOK := integerFromAny(strings.TrimSpace(parts[1]))
		if widthOK && heightOK {
			return width, height
		}
	}
	width, widthOK := integerFromAny(bodyMap["width"])
	height, heightOK := integerFromAny(bodyMap["height"])
	if widthOK && heightOK {
		return width, height
	}
	return 0, 0
}

func seedanceVideoResolution(bodyMap map[string]interface{}) string {
	if resolution := normalizedSeedanceResolution(trimmedString(bodyMap["resolution"])); resolution != "" {
		return resolution
	}
	metadata := mapFromAny(bodyMap["metadata"])
	if resolution := normalizedSeedanceResolution(trimmedString(metadata["resolution"])); resolution != "" {
		return resolution
	}
	return "720p"
}

func normalizedSeedanceResolution(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "720p":
		return "720p"
	case "1080p":
		return "1080p"
	default:
		return ""
	}
}

func integerFromAny(value interface{}) (int, bool) {
	switch typed := value.(type) {
	case int:
		return typed, true
	case int64:
		return int(typed), true
	case float64:
		return int(typed), typed == float64(int(typed))
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(typed))
		return parsed, err == nil
	default:
		return 0, false
	}
}

func boolFromAny(value interface{}) (bool, bool) {
	if typed, ok := value.(bool); ok {
		return typed, true
	}
	return false, false
}

func firstPresentAny(values ...interface{}) interface{} {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

type seedanceVideoReference struct {
	role string
	url  string
}

func normalizeSeedanceVideoContent(bodyMap, metadata map[string]interface{}) []interface{} {
	references := make([]seedanceVideoReference, 0)
	appendReference := func(role string, url string) {
		url = strings.TrimSpace(url)
		if url == "" || isVideoInputPlaceholder(url) {
			return
		}
		references = append(references, seedanceVideoReference{
			role: normalizeSeedanceVideoRole(role),
			url:  url,
		})
	}

	for _, item := range sliceFromAny(metadata["content"]) {
		itemMap := mapFromAny(item)
		appendReference(trimmedString(itemMap["role"]), videoContentImageURL(itemMap))
	}
	for _, item := range sliceFromAny(metadata["frames"]) {
		itemMap := mapFromAny(item)
		appendReference(trimmedString(itemMap["role"]), firstNonBlankAnyString(itemMap["image"], itemMap["url"]))
	}
	appendReference("last_frame", trimmedString(metadata["last_frame_image"]))
	appendReference("first_frame", trimmedString(bodyMap["image"]))
	for index, image := range sliceFromAny(bodyMap["images"]) {
		role := "reference_image"
		if index == 0 {
			role = "first_frame"
		}
		appendReference(role, firstNonBlankAnyString(image))
	}

	referenceItems := make([]seedanceVideoReference, 0, 9)
	seen := make(map[string]int)
	for _, reference := range references {
		if existingIndex, ok := seen[reference.url]; ok {
			if reference.role == "first_frame" && referenceItems[existingIndex].role != "first_frame" {
				referenceItems[existingIndex].role = reference.role
			}
			continue
		}
		seen[reference.url] = len(referenceItems)
		referenceItems = append(referenceItems, reference)
		if len(referenceItems) >= 9 {
			break
		}
	}

	content := make([]interface{}, 0, len(referenceItems))
	for _, reference := range referenceItems {
		content = append(content, seedanceVideoContentItem(reference.role, reference.url))
	}
	return content
}

func normalizeSeedanceVideoRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "first_frame", "start_frame", "source_image":
		return "first_frame"
	case "last_frame", "end_frame":
		return "last_frame"
	default:
		return "reference_image"
	}
}

func seedanceVideoContentItem(role, url string) map[string]interface{} {
	return map[string]interface{}{
		"type":      "image_url",
		"image_url": map[string]interface{}{"url": url},
		"role":      role,
	}
}

func videoContentImageURL(itemMap map[string]interface{}) string {
	imageURL := itemMap["image_url"]
	if url := trimmedString(imageURL); url != "" {
		return url
	}
	imageMap := mapFromAny(imageURL)
	return firstNonBlankAnyString(imageMap["url"], imageMap["src"])
}

func mapFromAny(value interface{}) map[string]interface{} {
	if value == nil {
		return nil
	}
	if result, ok := value.(map[string]interface{}); ok {
		return result
	}
	return nil
}

func sliceFromAny(value interface{}) []interface{} {
	if value == nil {
		return nil
	}
	if result, ok := value.([]interface{}); ok {
		return result
	}
	if stringsSlice, ok := value.([]string); ok {
		result := make([]interface{}, 0, len(stringsSlice))
		for _, item := range stringsSlice {
			result = append(result, item)
		}
		return result
	}
	return nil
}

func firstNonBlankAnyString(values ...interface{}) string {
	for _, value := range values {
		if text := trimmedString(value); text != "" {
			return text
		}
	}
	return ""
}

func trimmedString(value interface{}) string {
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}
	return ""
}

func isVideoInputPlaceholder(value string) bool {
	return strings.Contains(value, "上传的") || strings.Contains(value, "自动填入")
}

// DoRequest delegates to common helper.
func (a *TaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error) {
	return channel.DoTaskApiRequest(a, c, info, requestBody)
}

// DoResponse handles upstream response, returns taskID etc.
func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (taskID string, taskData []byte, taskErr *dto.TaskError) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		taskErr = service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
		return
	}
	_ = resp.Body.Close()

	// Parse Sora response
	var dResp responseTask
	if err := common.Unmarshal(responseBody, &dResp); err != nil {
		taskErr = service.TaskErrorWrapper(errors.Wrapf(err, "body: %s", responseBody), "unmarshal_response_body_failed", http.StatusInternalServerError)
		return
	}

	if resp.StatusCode >= http.StatusBadRequest || dResp.Error != nil || (dResp.Success != nil && !*dResp.Success) {
		taskErr = seedanceGatewayTaskError(dResp, resp.StatusCode)
		return
	}

	upstreamID := dResp.ID
	if upstreamID == "" {
		upstreamID = dResp.TaskID
	}
	if upstreamID == "" {
		taskErr = service.TaskErrorWrapper(fmt.Errorf("task_id is empty"), "invalid_response", http.StatusInternalServerError)
		return
	}

	// 使用公开 task_xxxx ID 返回给客户端
	dResp.ID = info.PublicTaskID
	dResp.TaskID = info.PublicTaskID
	c.JSON(http.StatusOK, dResp)
	return upstreamID, responseBody, nil
}

func seedanceGatewayTaskError(dResp responseTask, httpStatus int) *dto.TaskError {
	statusCode := dResp.StatusCode
	if statusCode < http.StatusBadRequest {
		statusCode = httpStatus
	}
	if statusCode < http.StatusBadRequest {
		statusCode = http.StatusBadGateway
	}

	code := strings.TrimSpace(dResp.ProviderCode)
	if code == "" {
		code = strings.TrimSpace(dResp.Code)
	}
	message := strings.TrimSpace(dResp.Message)
	if dResp.Error != nil {
		if code == "" {
			code = strings.TrimSpace(dResp.Error.Code)
		}
		if message == "" {
			message = strings.TrimSpace(dResp.Error.Message)
		}
	}
	if code == "" {
		code = "service_error"
	}
	if message == "" {
		message = "服务暂时不可用，请稍后重试。"
	}

	return &dto.TaskError{
		Code:       code,
		Message:    message,
		StatusCode: statusCode,
		Error:      fmt.Errorf("%s", message),
	}
}

// FetchTask fetch task status
func (a *TaskAdaptor) FetchTask(baseUrl, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid task_id")
	}

	uri := fmt.Sprintf("%s/v1/videos/%s", baseUrl, taskID)

	req, err := http.NewRequest(http.MethodGet, uri, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+key)

	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client failed: %w", err)
	}
	return client.Do(req)
}

func (a *TaskAdaptor) GetModelList() []string {
	return ModelList
}

func (a *TaskAdaptor) GetChannelName() string {
	return ChannelName
}

func (a *TaskAdaptor) ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error) {
	resTask := responseTask{}
	if err := common.Unmarshal(respBody, &resTask); err != nil {
		return nil, errors.Wrap(err, "unmarshal task result failed")
	}

	taskResult := relaycommon.TaskInfo{
		Code: 0,
	}

	switch strings.ToLower(strings.TrimSpace(resTask.Status)) {
	case "queued", "pending":
		taskResult.Status = model.TaskStatusQueued
	case "processing", "in_progress":
		taskResult.Status = model.TaskStatusInProgress
	case "completed", "succeeded", "success", "done":
		taskResult.Status = model.TaskStatusSuccess
		taskResult.Url = videoResultURLFromTask(resTask)
	case "failed", "cancelled":
		taskResult.Status = model.TaskStatusFailure
		if resTask.Error != nil {
			taskResult.Reason = resTask.Error.Message
		} else {
			taskResult.Reason = "task failed"
		}
	default:
	}
	if resTask.Progress > 0 && resTask.Progress < 100 {
		taskResult.Progress = fmt.Sprintf("%d%%", resTask.Progress)
	}

	return &taskResult, nil
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(task *model.Task) ([]byte, error) {
	data := task.Data
	var err error
	if data, err = sjson.SetBytes(data, "id", task.TaskID); err != nil {
		return nil, errors.Wrap(err, "set id failed")
	}
	return data, nil
}
