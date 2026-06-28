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
	Progress           int    `json:"progress"`
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
		return fmt.Sprintf("%s/v1/video/generations", a.baseURL), nil
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

func normalizeSeedanceVideoRequestBody(bodyMap map[string]interface{}) map[string]interface{} {
	cleaned := make(map[string]interface{}, len(bodyMap))
	copyPresentNonBlank(cleaned, bodyMap, "model")
	if prompt := stripPromptReferenceMarkers(trimmedString(bodyMap["prompt"])); prompt != "" {
		cleaned["prompt"] = prompt
	}
	cleaned["seconds"] = seedanceVideoSeconds(bodyMap)

	metadata := mapFromAny(bodyMap["metadata"])
	content := normalizeSeedanceVideoContent(bodyMap, metadata)
	cleanMetadata := map[string]interface{}{
		"ratio":      seedanceVideoRatio(bodyMap),
		"resolution": seedanceVideoResolution(bodyMap),
	}
	if len(content) > 0 {
		cleanMetadata["content"] = content
	}
	if value, ok := boolFromAny(firstPresentAny(bodyMap["watermark"], metadata["watermark"])); ok && value {
		cleanMetadata["watermark"] = value
	}
	if value, ok := boolFromAny(firstPresentAny(bodyMap["generate_audio"], metadata["generate_audio"])); ok && value {
		cleanMetadata["generate_audio"] = value
	}
	cleaned["metadata"] = cleanMetadata

	return cleaned
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

func stripPromptReferenceMarkers(prompt string) string {
	fields := strings.Fields(strings.TrimSpace(prompt))
	for len(fields) > 0 && isPromptReferenceMarker(fields[0]) {
		fields = fields[1:]
	}
	return strings.TrimSpace(strings.Join(fields, " "))
}

func isPromptReferenceMarker(value string) bool {
	value = strings.Trim(strings.ToLower(strings.TrimSpace(value)), ",，.:：;；")
	if !strings.HasPrefix(value, "@image") {
		return false
	}
	suffix := strings.TrimPrefix(value, "@image")
	if suffix == "" {
		return false
	}
	for _, char := range suffix {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
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

	firstFrameURL := ""
	lastFrameURL := ""
	seen := make(map[string]bool)
	for _, reference := range references {
		key := reference.role + "|" + reference.url
		if seen[key] {
			continue
		}
		seen[key] = true
		switch reference.role {
		case "last_frame":
			if lastFrameURL == "" {
				lastFrameURL = reference.url
			}
		case "first_frame":
			if firstFrameURL == "" {
				firstFrameURL = reference.url
			}
		default:
			if firstFrameURL == "" {
				firstFrameURL = reference.url
			}
		}
	}

	content := make([]interface{}, 0, 2)
	if firstFrameURL != "" {
		content = append(content, seedanceVideoContentItem("first_frame", firstFrameURL))
	}
	if lastFrameURL != "" && lastFrameURL != firstFrameURL {
		content = append(content, seedanceVideoContentItem("last_frame", lastFrameURL))
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

	switch resTask.Status {
	case "queued", "pending":
		taskResult.Status = model.TaskStatusQueued
	case "processing", "in_progress":
		taskResult.Status = model.TaskStatusInProgress
	case "completed":
		taskResult.Status = model.TaskStatusSuccess
		// Url intentionally left empty — the caller constructs the proxy URL using the public task ID
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
