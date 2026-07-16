package sora

import (
	"bytes"
	"encoding/json"
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

const (
	seedanceLD17PublicModel      = "seedance-2.0-ld-17"
	seedanceLD17UpstreamModel    = "seedance-2.0-wc-b-720p"
	seedanceSD2FastPublicModel   = "seedance-sd2-fast-720p"
	seedanceSD2FastUpstreamModel = "sd2-fast-720p"
	grok15VideoPublicModel       = "grok-video-1.5"
	grok15VideoUpstreamModel     = "grok-imagine-1.5-video"
)

var moonApiXSeedanceVideoModels = map[string]bool{
	"seedance-2.0":         true,
	"seedance-2.0-kz":      true,
	"seedance-2.0-kz-fast": true,
	"seedance-2.0-cl-fast": true,
	"seedance-2.0-cl":      true,
	"seedance-2.0-cl-mini": true,
}

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
	Progress           any    `json:"progress"`
	Url                string `json:"url,omitempty"`
	VideoUrl           string `json:"video_url,omitempty"`
	ResultUrl          string `json:"result_url,omitempty"`
	OutputUrl          string `json:"output_url,omitempty"`
	Output             any    `json:"output,omitempty"`
	Metadata           any    `json:"metadata,omitempty"`
	Data               any    `json:"data,omitempty"`
	CreatedAt          int64  `json:"created_at"`
	CompletedAt        int64  `json:"completed_at,omitempty"`
	ExpiresAt          int64  `json:"expires_at,omitempty"`
	Seconds            string `json:"seconds,omitempty"`
	Size               string `json:"size,omitempty"`
	RemixedFromVideoID string `json:"remixed_from_video_id,omitempty"`
	Error              any    `json:"error,omitempty"`
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
		resTask.Data,
	} {
		if url := pickVideoResultURL(value, 0); url != "" {
			return url
		}
	}
	return ""
}

func responseTaskErrorMessage(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(v)
	case map[string]any:
		for _, key := range []string{"message", "error", "reason", "detail"} {
			if message := responseTaskErrorMessage(v[key]); message != "" {
				return message
			}
		}
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func responseTaskErrorCode(value any) string {
	if obj, ok := value.(map[string]any); ok {
		for _, key := range []string{"code", "error_code", "type"} {
			if code := strings.TrimSpace(fmt.Sprint(obj[key])); code != "" && code != "<nil>" {
				return code
			}
		}
	}
	return ""
}

func responseTaskProgress(value any) int {
	switch v := value.(type) {
	case nil:
		return 0
	case float64:
		return int(v)
	case float32:
		return int(v)
	case int:
		return v
	case int64:
		return int(v)
	case json.Number:
		if i, err := v.Int64(); err == nil {
			return int(i)
		}
	case string:
		raw := strings.TrimSpace(strings.TrimSuffix(v, "%"))
		if raw == "" {
			return 0
		}
		if f, err := strconv.ParseFloat(raw, 64); err == nil {
			return int(f)
		}
	}
	return 0
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
	if isFixedPriceVideoModel(info.OriginModelName) || isFixedPriceVideoModel(info.UpstreamModelName) {
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
	if isMoonApiXSeedanceVideoModel(info.UpstreamModelName) {
		return fmt.Sprintf("%s/v1/videos", a.baseURL), nil
	}
	if isOfficialSeedanceReferencesModel(info.UpstreamModelName) {
		return fmt.Sprintf("%s/v1/videos", a.baseURL), nil
	}
	if usesVideosEndpoint(info.UpstreamModelName) {
		return fmt.Sprintf("%s/v1/videos", a.baseURL), nil
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
	isJSONRequest := strings.HasPrefix(contentType, "application/json")
	if !isJSONRequest && usesVideosEndpoint(info.UpstreamModelName) && json.Valid(cachedBody) {
		isJSONRequest = true
		c.Request.Header.Set("Content-Type", "application/json")
	}

	if isJSONRequest {
		var bodyMap map[string]interface{}
		if err := common.Unmarshal(cachedBody, &bodyMap); err == nil {
			bodyMap["model"] = info.UpstreamModelName
			if isGrokVideoModel(info.UpstreamModelName) {
				bodyMap = normalizeGrokVideoRequestBody(bodyMap)
			} else if isMoonApiXSeedanceVideoModel(info.UpstreamModelName) {
				bodyMap = normalizeMoonApiXSeedanceVideoRequestBody(bodyMap)
			} else if isSeedanceVideoModel(info.UpstreamModelName) {
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

func isMoonApiXSeedanceVideoModel(modelName string) bool {
	return moonApiXSeedanceVideoModels[strings.ToLower(strings.TrimSpace(modelName))]
}

func isMoonApiXKZSeedanceVideoModel(modelName string) bool {
	switch strings.ToLower(strings.TrimSpace(modelName)) {
	case "seedance-2.0", "seedance-2.0-kz", "seedance-2.0-kz-fast":
		return true
	default:
		return false
	}
}

func isSeedanceVideoModel(modelName string) bool {
	modelName = strings.ToLower(strings.TrimSpace(modelName))
	return strings.Contains(modelName, "seedance") || modelName == seedanceSD2FastUpstreamModel
}

func isGrokVideoModel(modelName string) bool {
	modelName = strings.ToLower(strings.TrimSpace(modelName))
	return strings.Contains(modelName, "grok") && strings.Contains(modelName, "video")
}

func usesVideosEndpoint(modelName string) bool {
	switch strings.ToLower(strings.TrimSpace(modelName)) {
	case seedanceSD2FastPublicModel, seedanceSD2FastUpstreamModel, grok15VideoPublicModel, grok15VideoUpstreamModel:
		return true
	default:
		return false
	}
}

func isFixedPriceVideoModel(modelName string) bool {
	return isSeedanceLD17Model(modelName) || isGrokVideoModel(modelName)
}

func seedanceUpstreamModel(modelName string) string {
	return strings.TrimSpace(modelName)
}

func normalizeGrokVideoRequestBody(bodyMap map[string]interface{}) map[string]interface{} {
	cleaned := make(map[string]interface{}, len(bodyMap))
	if modelName := strings.TrimSpace(trimmedString(bodyMap["model"])); modelName != "" {
		cleaned["model"] = modelName
	}
	if prompt := strings.TrimSpace(trimmedString(bodyMap["prompt"])); prompt != "" {
		cleaned["prompt"] = prompt
	}
	cleaned["duration"] = 15
	if aspectRatio := seedanceVideoRatio(bodyMap); aspectRatio != "" {
		cleaned["aspect_ratio"] = aspectRatio
	}
	cleaned["size"] = grokVideoSize(bodyMap)

	metadata := mapFromAny(bodyMap["metadata"])
	references := normalizeSeedanceVideoReferences(bodyMap, metadata, "image")
	imageURLs := make([]string, 0, len(references))
	seen := make(map[string]bool)
	for _, reference := range references {
		if reference.url == "" || seen[reference.url] {
			continue
		}
		seen[reference.url] = true
		imageURLs = append(imageURLs, reference.url)
	}
	switch len(imageURLs) {
	case 0:
	case 1:
		cleaned["input_reference"] = imageURLs[0]
	default:
		cleaned["reference_image_urls"] = imageURLs
	}
	if callbackURL := firstNonBlankAnyString(bodyMap["callback_url"], metadata["callback_url"]); callbackURL != "" {
		cleaned["callback_url"] = callbackURL
	}
	return cleaned
}

func grokVideoSize(bodyMap map[string]interface{}) string {
	for _, value := range []string{
		trimmedString(bodyMap["size"]),
		trimmedString(bodyMap["resolution"]),
		trimmedString(mapFromAny(bodyMap["metadata"])["resolution"]),
	} {
		switch strings.ToUpper(strings.TrimSpace(value)) {
		case "720P":
			return "720P"
		case "1080P":
			return "1080P"
		}
	}
	return "720P"
}

func normalizeSeedanceVideoRequestBody(bodyMap map[string]interface{}) map[string]interface{} {
	cleaned := make(map[string]interface{}, len(bodyMap))
	modelName := seedanceUpstreamModel(trimmedString(bodyMap["model"]))
	if modelName != "" {
		cleaned["model"] = modelName
	}

	metadata := mapFromAny(bodyMap["metadata"])
	if isOfficialSeedanceReferencesModel(modelName) {
		if prompt := seedanceVideoPrompt(trimmedString(bodyMap["prompt"]), 0); prompt != "" {
			cleaned["prompt"] = prompt
		}
		cleaned["duration"] = seedanceVideoDuration(bodyMap, modelName)
		cleaned["ratio"] = seedanceVideoRatio(bodyMap)
		if resolution := seedanceOfficialResolutionForModel(bodyMap, modelName); resolution != "" {
			cleaned["resolution"] = resolution
		}
		if references := normalizeSeedanceOfficialReferences(bodyMap, metadata, modelName); len(references) > 0 {
			cleaned["references"] = references
		}
		if callbackURL := firstNonBlankAnyString(bodyMap["callback_url"], metadata["callback_url"]); callbackURL != "" {
			cleaned["callback_url"] = callbackURL
		}
		return cleaned
	}

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
		cleanMetadata["content"] = content
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

func normalizeMoonApiXSeedanceVideoRequestBody(bodyMap map[string]interface{}) map[string]interface{} {
	cleaned := make(map[string]interface{}, len(bodyMap))
	modelName := strings.ToLower(strings.TrimSpace(trimmedString(bodyMap["model"])))
	if modelName != "" {
		cleaned["model"] = modelName
	}
	prompt := trimmedString(bodyMap["prompt"])
	if !isMoonApiXKZSeedanceVideoModel(modelName) {
		prompt = stripMoonApiXLocalReferenceMentions(prompt)
	}
	if prompt != "" {
		cleaned["prompt"] = prompt
	}
	cleaned["duration"] = moonApiXSeedanceDuration(bodyMap)
	if ratio := seedanceVideoRatio(bodyMap); ratio != "" {
		cleaned["ratio"] = ratio
		cleaned["aspect_ratio"] = ratio
	}
	if resolution := moonApiXSeedanceResolution(bodyMap, modelName); resolution != "" {
		cleaned["resolution"] = resolution
	}
	if seed, ok := integerFromAny(bodyMap["seed"]); ok {
		cleaned["seed"] = seed
	}
	if value, ok := boolFromAny(firstPresentAny(bodyMap["watermark"], mapFromAny(bodyMap["metadata"])["watermark"])); ok {
		cleaned["watermark"] = value
	}

	metadata := mapFromAny(bodyMap["metadata"])
	references := normalizeMoonApiXSeedanceReferences(bodyMap, metadata, modelName)
	if len(references) > 0 {
		cleaned["references"] = references
		cleaned["images"] = moonApiXSeedanceImages(references)
		if firstFrameURL := moonApiXFirstFrameURL(references); firstFrameURL != "" {
			cleaned["image"] = firstFrameURL
			cleaned["image_url"] = firstFrameURL
			cleaned["first_frame_url"] = firstFrameURL
		}
		if lastFrameURL := moonApiXLastFrameURL(references); lastFrameURL != "" {
			cleaned["last_frame_url"] = lastFrameURL
		}
		if firstVideoURL := moonApiXFirstVideoURL(references); firstVideoURL != "" {
			cleaned["video"] = firstVideoURL
			cleaned["video_url"] = firstVideoURL
			cleaned["reference_video_url"] = firstVideoURL
		}
	}
	if callbackURL := firstNonBlankAnyString(bodyMap["callback_url"], metadata["callback_url"]); callbackURL != "" {
		cleaned["callback_url"] = callbackURL
	}
	return cleaned
}

func moonApiXSeedanceDuration(bodyMap map[string]interface{}) int {
	value := 5
	for _, key := range []string{"duration", "seconds"} {
		if parsed, ok := integerFromAny(bodyMap[key]); ok {
			value = parsed
			break
		}
	}
	if value < 4 {
		return 4
	}
	if value > 15 {
		return 15
	}
	return value
}

func moonApiXSeedanceResolution(bodyMap map[string]interface{}, modelName string) string {
	value := firstNonBlankAnyString(bodyMap["resolution"], mapFromAny(bodyMap["metadata"])["resolution"])
	normalized := strings.ToLower(strings.TrimSpace(value))
	switch modelName {
	case "seedance-2.0-cl-fast", "seedance-2.0-cl", "seedance-2.0-cl-mini":
		if normalized == "480p" {
			return "480p"
		}
		return "720p"
	default:
		return "720p"
	}
}

func normalizeMoonApiXSeedanceReferences(bodyMap, metadata map[string]interface{}, modelName string) []map[string]interface{} {
	isKZModel := isMoonApiXKZSeedanceVideoModel(modelName)
	allowVideo := isKZModel || modelName == "seedance-2.0-cl-mini"
	allowAudio := isKZModel
	maxImages := 10
	maxVideos := 1
	maxAudios := 0
	if isKZModel {
		maxImages = 9
		maxVideos = 3
		maxAudios = 3
	}
	rawReferences := normalizeSeedanceVideoReferences(bodyMap, metadata, "image", "video", "audio")
	seen := make(map[string]bool)
	result := make([]map[string]interface{}, 0, len(rawReferences))
	imageCount := 0
	videoCount := 0
	audioCount := 0
	hasVisualReference := false
	for _, reference := range rawReferences {
		if reference.url == "" {
			continue
		}
		if reference.mediaType == "video" && !allowVideo {
			continue
		}
		if reference.mediaType == "audio" && !allowAudio {
			continue
		}
		key := reference.mediaType + "\x00" + reference.url
		if seen[key] {
			continue
		}
		switch reference.mediaType {
		case "video":
			if videoCount >= maxVideos {
				continue
			}
			videoCount++
			hasVisualReference = true
		case "audio":
			if audioCount >= maxAudios {
				continue
			}
			audioCount++
		default:
			if imageCount >= maxImages {
				continue
			}
			imageCount++
			hasVisualReference = true
		}
		seen[key] = true
		item := map[string]interface{}{
			"media_type": reference.mediaType,
			"role":       reference.role,
			"url":        reference.url,
		}
		if reference.alias != "" && isKZModel {
			item["alias"] = reference.alias
		}
		result = append(result, item)
	}
	if allowAudio && audioCount > 0 && !hasVisualReference {
		filtered := result[:0]
		for _, item := range result {
			if item["media_type"] != "audio" {
				filtered = append(filtered, item)
			}
		}
		result = filtered
	}
	return result
}

func stripMoonApiXLocalReferenceMentions(prompt string) string {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return ""
	}

	var builder strings.Builder
	for index := 0; index < len(prompt); {
		if end, ok := moonApiXLocalReferenceMentionEnd(prompt, index); ok {
			index = end
			continue
		}
		builder.WriteByte(prompt[index])
		index++
	}

	return strings.Join(strings.Fields(builder.String()), " ")
}

func moonApiXLocalReferenceMentionEnd(prompt string, start int) (int, bool) {
	if start >= len(prompt) || prompt[start] != '@' {
		return 0, false
	}
	rest := prompt[start+1:]
	for _, prefix := range []string{"图片", "视频", "音频", "尾帧"} {
		if !strings.HasPrefix(rest, prefix) {
			continue
		}
		digitStart := start + 1 + len(prefix)
		digitEnd := digitStart
		for digitEnd < len(prompt) && prompt[digitEnd] >= '0' && prompt[digitEnd] <= '9' {
			digitEnd++
		}
		if digitEnd == digitStart || prompt[digitStart:digitEnd] == "0" {
			return 0, false
		}
		if digitEnd < len(prompt) && isASCIIMentionNameByte(prompt[digitEnd]) {
			return 0, false
		}
		return trimMoonApiXLocalReferencePunctuation(prompt, digitEnd), true
	}
	return 0, false
}

func trimMoonApiXLocalReferencePunctuation(prompt string, index int) int {
	for {
		next := index
		for _, suffix := range []string{",", "，", ".", "。", ";", "；", ":", "："} {
			if strings.HasPrefix(prompt[index:], suffix) {
				next = index + len(suffix)
				break
			}
		}
		if next == index {
			return index
		}
		index = next
	}
}

func isASCIIMentionNameByte(value byte) bool {
	return value == '_' || (value >= '0' && value <= '9') || (value >= 'A' && value <= 'Z') || (value >= 'a' && value <= 'z')
}

func moonApiXSeedanceImages(references []map[string]interface{}) []map[string]interface{} {
	images := make([]map[string]interface{}, 0, len(references))
	for _, reference := range references {
		if reference["media_type"] != "image" {
			continue
		}
		url := trimmedString(reference["url"])
		if url == "" {
			continue
		}
		item := map[string]interface{}{"url": url}
		if role := trimmedString(reference["role"]); role != "" {
			item["role"] = role
		}
		images = append(images, item)
	}
	return images
}

func moonApiXFirstFrameURL(references []map[string]interface{}) string {
	for _, reference := range references {
		if reference["media_type"] == "image" && reference["role"] == "first_frame" {
			if url := trimmedString(reference["url"]); url != "" {
				return url
			}
		}
	}
	for _, reference := range references {
		if reference["media_type"] == "image" {
			if url := trimmedString(reference["url"]); url != "" {
				return url
			}
		}
	}
	return ""
}

func moonApiXLastFrameURL(references []map[string]interface{}) string {
	for _, reference := range references {
		if reference["media_type"] == "image" && reference["role"] == "last_frame" {
			if url := trimmedString(reference["url"]); url != "" {
				return url
			}
		}
	}
	return ""
}

func moonApiXFirstVideoURL(references []map[string]interface{}) string {
	for _, reference := range references {
		if reference["media_type"] == "video" {
			if url := trimmedString(reference["url"]); url != "" {
				return url
			}
		}
	}
	return ""
}

func isOfficialSeedanceReferencesModel(modelName string) bool {
	return strings.EqualFold(strings.TrimSpace(modelName), "seedance-2.0-dj-fast") ||
		isSeedanceLD17Model(modelName)
}

func isSeedanceLD17Model(modelName string) bool {
	switch strings.ToLower(strings.TrimSpace(modelName)) {
	case seedanceLD17PublicModel, seedanceLD17UpstreamModel:
		return true
	default:
		return false
	}
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

func seedanceVideoDuration(bodyMap map[string]interface{}, modelName string) int {
	value := 0
	for _, key := range []string{"duration", "seconds"} {
		if parsed, ok := integerFromAny(bodyMap[key]); ok {
			value = parsed
			break
		}
	}
	modelName = strings.ToLower(strings.TrimSpace(modelName))
	if modelName == "seedance-2.0-dj-fast" {
		switch {
		case value <= 5:
			return 5
		case value <= 10:
			return 10
		default:
			return 15
		}
	}
	if value < 5 {
		return 5
	}
	if value > 15 {
		return 15
	}
	return value
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

func seedanceOfficialResolutionForModel(bodyMap map[string]interface{}, modelName string) string {
	if strings.EqualFold(strings.TrimSpace(modelName), "seedance-2.0-dj-fast") {
		return "720P"
	}
	return ""
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
	mediaType string
	role      string
	url       string
	alias     string
}

func normalizeSeedanceVideoContent(bodyMap, metadata map[string]interface{}) []interface{} {
	references := normalizeSeedanceVideoReferences(bodyMap, metadata, "image")
	content := make([]interface{}, 0, len(references))
	for _, reference := range references {
		content = append(content, seedanceVideoContentItem(reference.role, reference.url))
	}
	return content
}

func normalizeSeedanceOfficialReferences(bodyMap, metadata map[string]interface{}, modelName string) []map[string]interface{} {
	modelName = strings.ToLower(strings.TrimSpace(modelName))
	isLD17 := isSeedanceLD17Model(modelName)
	allowVideo := isLD17
	allowAudio := isLD17
	maxImages := 10
	maxVideos := 0
	maxAudios := 0
	if isLD17 {
		maxImages = 9
		maxVideos = 3
		maxAudios = 3
	}

	allowed := map[string]bool{"image": true}
	if allowVideo {
		allowed["video"] = true
	}
	if allowAudio {
		allowed["audio"] = true
	}
	rawReferences := normalizeSeedanceVideoReferences(bodyMap, metadata, "image", "video", "audio")
	seen := make(map[string]bool)
	imageCount := 0
	videoCount := 0
	audioCount := 0
	hasVisualReference := false
	result := make([]map[string]interface{}, 0, maxImages+maxVideos+maxAudios)
	for _, reference := range rawReferences {
		if !allowed[reference.mediaType] || reference.url == "" {
			continue
		}
		key := reference.mediaType + "\x00" + reference.url
		if seen[key] {
			continue
		}
		switch reference.mediaType {
		case "image":
			if imageCount >= maxImages {
				continue
			}
			imageCount++
			hasVisualReference = true
		case "video":
			if videoCount >= maxVideos {
				continue
			}
			videoCount++
			hasVisualReference = true
		case "audio":
			if audioCount >= maxAudios {
				continue
			}
			audioCount++
		}
		seen[key] = true
		item := map[string]interface{}{
			"media_type": reference.mediaType,
			"role":       reference.role,
			"url":        reference.url,
		}
		if reference.alias != "" {
			item["alias"] = reference.alias
		}
		result = append(result, item)
	}
	if allowAudio && audioCount > 0 && !hasVisualReference {
		filtered := result[:0]
		for _, item := range result {
			if item["media_type"] != "audio" {
				filtered = append(filtered, item)
			}
		}
		result = filtered
	}
	return result
}

func normalizeSeedanceVideoReferences(bodyMap, metadata map[string]interface{}, mediaTypes ...string) []seedanceVideoReference {
	allowedMediaTypes := map[string]bool{}
	for _, mediaType := range mediaTypes {
		allowedMediaTypes[normalizeSeedanceMediaType(mediaType)] = true
	}
	if len(allowedMediaTypes) == 0 {
		allowedMediaTypes["image"] = true
	}

	references := make([]seedanceVideoReference, 0)
	appendReference := func(mediaType string, role string, url string, alias string) {
		mediaType = normalizeSeedanceMediaType(mediaType)
		if !allowedMediaTypes[mediaType] {
			return
		}
		url = strings.TrimSpace(url)
		if url == "" || isVideoInputPlaceholder(url) {
			return
		}
		references = append(references, seedanceVideoReference{
			mediaType: mediaType,
			role:      normalizeSeedanceReferenceRole(mediaType, role),
			url:       url,
			alias:     strings.TrimSpace(alias),
		})
	}

	for _, item := range sliceFromAny(bodyMap["references"]) {
		itemMap := mapFromAny(item)
		mediaType := normalizeSeedanceMediaType(trimmedString(itemMap["media_type"]))
		appendReference(
			mediaType,
			trimmedString(itemMap["role"]),
			firstNonBlankAnyString(itemMap["url"], itemMap["asset_url"], itemMap["asset_ref"]),
			trimmedString(itemMap["alias"]),
		)
	}
	for _, item := range sliceFromAny(metadata["content"]) {
		itemMap := mapFromAny(item)
		mediaType := seedanceMediaTypeFromContentType(trimmedString(itemMap["type"]))
		appendReference(
			mediaType,
			trimmedString(itemMap["role"]),
			videoContentURLByMediaType(itemMap, mediaType),
			trimmedString(itemMap["alias"]),
		)
	}
	for _, item := range sliceFromAny(metadata["frames"]) {
		itemMap := mapFromAny(item)
		appendReference("image", trimmedString(itemMap["role"]), firstNonBlankAnyString(itemMap["image"], itemMap["url"]), trimmedString(itemMap["alias"]))
	}
	appendReference("image", "last_frame", trimmedString(metadata["last_frame_image"]), "")
	appendReference("image", "first_frame", firstNonBlankAnyString(bodyMap["image"], bodyMap["image_url"], bodyMap["first_frame_url"]), "")
	for index, image := range sliceFromAny(bodyMap["images"]) {
		role := "reference_image"
		if index == 0 {
			role = "first_frame"
		}
		itemMap := mapFromAny(image)
		appendReference("image", role, firstNonBlankAnyString(image, itemMap["url"], itemMap["image"], itemMap["image_url"]), trimmedString(itemMap["alias"]))
	}
	appendReference("image", "reference_image", firstNonBlankAnyString(bodyMap["reference_image_url"], bodyMap["reference_image"]), "")
	for _, image := range sliceFromAny(bodyMap["reference_image_urls"]) {
		itemMap := mapFromAny(image)
		appendReference("image", "reference_image", firstNonBlankAnyString(image, itemMap["url"]), trimmedString(itemMap["alias"]))
	}
	appendReference("video", "reference_video", firstNonBlankAnyString(bodyMap["video"], bodyMap["video_url"], bodyMap["reference_video_url"]), "")
	for _, video := range sliceFromAny(bodyMap["videos"]) {
		itemMap := mapFromAny(video)
		appendReference("video", "reference_video", firstNonBlankAnyString(video, itemMap["url"], itemMap["video"], itemMap["video_url"]), trimmedString(itemMap["alias"]))
	}
	for _, video := range sliceFromAny(bodyMap["reference_video_urls"]) {
		itemMap := mapFromAny(video)
		appendReference("video", "reference_video", firstNonBlankAnyString(video, itemMap["url"]), trimmedString(itemMap["alias"]))
	}
	appendReference("audio", "reference_audio", firstNonBlankAnyString(bodyMap["audio"], bodyMap["audio_url"], bodyMap["reference_audio_url"]), "")
	for _, audio := range sliceFromAny(bodyMap["audios"]) {
		itemMap := mapFromAny(audio)
		appendReference("audio", "reference_audio", firstNonBlankAnyString(audio, itemMap["url"], itemMap["audio"], itemMap["audio_url"]), trimmedString(itemMap["alias"]))
	}
	for _, audio := range sliceFromAny(bodyMap["reference_audio_urls"]) {
		itemMap := mapFromAny(audio)
		appendReference("audio", "reference_audio", firstNonBlankAnyString(audio, itemMap["url"]), trimmedString(itemMap["alias"]))
	}

	referenceItems := make([]seedanceVideoReference, 0, 9)
	seen := make(map[string]int)
	for _, reference := range references {
		key := reference.mediaType + "\x00" + reference.url
		if existingIndex, ok := seen[key]; ok {
			if reference.mediaType == "image" && reference.role == "first_frame" && referenceItems[existingIndex].role != "first_frame" {
				referenceItems[existingIndex].role = reference.role
			}
			continue
		}
		seen[key] = len(referenceItems)
		referenceItems = append(referenceItems, reference)
	}
	return referenceItems
}

func normalizeSeedanceMediaType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "video", "reference_video", "video_url":
		return "video"
	case "audio", "music", "reference_audio", "audio_url":
		return "audio"
	default:
		return "image"
	}
}

func seedanceMediaTypeFromContentType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "video_url":
		return "video"
	case "audio_url":
		return "audio"
	default:
		return "image"
	}
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

func normalizeSeedanceReferenceRole(mediaType string, role string) string {
	mediaType = normalizeSeedanceMediaType(mediaType)
	switch mediaType {
	case "video":
		return "reference_video"
	case "audio":
		return "reference_audio"
	default:
		return normalizeSeedanceVideoRole(role)
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

func videoContentURLByMediaType(itemMap map[string]interface{}, mediaType string) string {
	switch normalizeSeedanceMediaType(mediaType) {
	case "video":
		return nestedMediaURL(itemMap["video_url"])
	case "audio":
		return nestedMediaURL(itemMap["audio_url"])
	default:
		return videoContentImageURL(itemMap)
	}
}

func nestedMediaURL(value interface{}) string {
	if url := trimmedString(value); url != "" {
		return url
	}
	valueMap := mapFromAny(value)
	return firstNonBlankAnyString(valueMap["url"], valueMap["src"], valueMap["asset_url"])
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
		upstreamID = responseTaskNestedString(dResp.Data, "task_id")
	}
	if upstreamID == "" {
		upstreamID = responseTaskNestedString(dResp.Data, "id")
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
			code = responseTaskErrorCode(dResp.Error)
		}
		if message == "" {
			message = responseTaskErrorMessage(dResp.Error)
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

	status := strings.ToLower(strings.TrimSpace(resTask.Status))
	if status == "" {
		if dataStatus := responseTaskNestedString(resTask.Data, "status"); dataStatus != "" {
			status = strings.ToLower(dataStatus)
		}
	}
	if status == "" {
		if dataStatus := responseTaskNestedString(resTask.Metadata, "status"); dataStatus != "" {
			status = strings.ToLower(dataStatus)
		}
	}

	switch status {
	case "queued", "pending":
		taskResult.Status = model.TaskStatusQueued
	case "submitted", "processing", "in_progress", "running":
		taskResult.Status = model.TaskStatusInProgress
	case "completed", "succeeded", "success", "done":
		taskResult.Status = model.TaskStatusSuccess
		taskResult.Url = videoResultURLFromTask(resTask)
	case "failed", "cancelled":
		taskResult.Status = model.TaskStatusFailure
		if message := responseTaskErrorMessage(resTask.Error); message != "" {
			taskResult.Reason = message
		} else {
			taskResult.Reason = "task failed"
		}
	default:
	}
	if progress := responseTaskProgress(resTask.Progress); progress > 0 && progress < 100 {
		taskResult.Progress = fmt.Sprintf("%d%%", progress)
	}

	return &taskResult, nil
}

func responseTaskNestedString(value any, key string) string {
	typed, ok := value.(map[string]any)
	if !ok {
		return ""
	}
	raw, ok := typed[key]
	if !ok || raw == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(raw))
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(task *model.Task) ([]byte, error) {
	data := task.Data
	var err error
	if data, err = sjson.SetBytes(data, "id", task.TaskID); err != nil {
		return nil, errors.Wrap(err, "set id failed")
	}
	return data, nil
}
