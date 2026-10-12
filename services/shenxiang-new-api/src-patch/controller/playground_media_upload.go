package controller

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

const (
	playgroundMediaGlobalRequestBytes = int64(60 * 1024 * 1024)
	playgroundMediaMultipartOverhead  = int64(1024 * 1024)
	playgroundMediaDefaultImageBytes  = int64(20 * 1024 * 1024)
	playgroundMediaGPTImageBytes      = int64(49 * 1024 * 1024)
	playgroundMediaGeminiImageBytes   = int64(18 * 1024 * 1024)
	playgroundMediaOtherFileBytes     = int64(20 * 1024 * 1024)
	playgroundMediaMaxImageCount      = 10
)

type playgroundMediaUploadPolicy struct {
	Model             string `json:"model"`
	Workflow          string `json:"workflow"`
	MaxImageBytes     int64  `json:"max_image_bytes"`
	MaxFileBytes      int64  `json:"max_file_bytes"`
	MaxTotalBytes     int64  `json:"max_total_bytes"`
	GlobalTotalBytes  int64  `json:"global_total_bytes"`
	MaxImages         int    `json:"max_images"`
	AutoCompress      bool   `json:"auto_compress"`
	UploadTransport   string `json:"upload_transport"`
	ProviderLimitNote string `json:"provider_limit_note"`
}

type playgroundStoredImageEditRequest struct {
	Model     string   `json:"model"`
	ImageURLs []string `json:"image_urls"`
	MaskURL   string   `json:"mask_url"`
}

type playgroundStoredMediaFile struct {
	Path        string
	Filename    string
	ContentType string
	Size        int64
}

func playgroundMediaPolicyFor(modelName string, workflow string) playgroundMediaUploadPolicy {
	modelName = strings.TrimSpace(modelName)
	workflow = strings.TrimSpace(workflow)
	policy := playgroundMediaUploadPolicy{
		Model:             modelName,
		Workflow:          workflow,
		MaxImageBytes:     playgroundMediaDefaultImageBytes,
		MaxFileBytes:      playgroundMediaOtherFileBytes,
		MaxTotalBytes:     playgroundMediaGlobalRequestBytes,
		GlobalTotalBytes:  playgroundMediaGlobalRequestBytes,
		MaxImages:         playgroundMediaMaxImageCount,
		AutoCompress:      true,
		UploadTransport:   "stored_url",
		ProviderLimitNote: "供应商未声明更低限制时，单图按 20MB 安全阈值执行。",
	}

	normalized := strings.ToLower(modelName)
	switch {
	case isPlaygroundGPTImageUploadModel(normalized):
		// OpenAI image edits require each input image to be strictly below 50MB.
		policy.MaxImageBytes = playgroundMediaGPTImageBytes
		policy.ProviderLimitNote = "GPT Image 编辑输入单图必须小于 50MB；本站按 49MB 留出编码余量。"
	case isPlaygroundGeminiImageUploadModel(normalized):
		// The current Gemini image adapter still turns stored inputs into inlineData.
		// Keep the complete image input below the provider's 20MB inline request cap.
		policy.MaxImageBytes = playgroundMediaGeminiImageBytes
		policy.MaxTotalBytes = playgroundMediaGeminiImageBytes
		policy.ProviderLimitNote = "Gemini 当前适配器使用 inlineData；按 18MB 总量为供应商 20MB 限制留出编码余量。"
	case normalized == "gpt-5.5" || workflow == "reverse_prompt":
		policy.MaxImageBytes = playgroundMediaDefaultImageBytes
		policy.MaxTotalBytes = playgroundMediaDefaultImageBytes
		policy.MaxImages = 1
		policy.ProviderLimitNote = "图像识别单图按 20MB 输入限制执行，超限会在上传前自动压缩。"
	}

	return policy
}

func isPlaygroundGPTImageUploadModel(modelName string) bool {
	return strings.Contains(modelName, "gpt-image-2") ||
		strings.Contains(modelName, "image 2") ||
		strings.Contains(modelName, "image-2") ||
		strings.Contains(modelName, "官转image") ||
		strings.Contains(modelName, "geek2api-image")
}

func isPlaygroundGeminiImageUploadModel(modelName string) bool {
	return strings.Contains(modelName, "gemini") || strings.Contains(modelName, "banana")
}

func PlaygroundMediaPolicy(c *gin.Context) {
	policy := playgroundMediaPolicyFor(c.Query("model"), c.Query("workflow"))
	c.JSON(http.StatusOK, gin.H{"success": true, "data": policy})
}

func PlaygroundUploadMedia(c *gin.Context) {
	modelName := strings.TrimSpace(c.Query("model"))
	workflow := strings.TrimSpace(c.Query("workflow"))
	kind := strings.ToLower(strings.TrimSpace(c.Query("kind")))
	if kind == "" {
		kind = "image"
	}
	if kind != "image" && kind != "video" && kind != "audio" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "unsupported media kind"})
		return
	}

	policy := playgroundMediaPolicyFor(modelName, workflow)
	maxBytes := policy.MaxFileBytes
	if kind == "image" {
		maxBytes = policy.MaxImageBytes
	}
	if maxBytes > policy.MaxTotalBytes {
		maxBytes = policy.MaxTotalBytes
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes+playgroundMediaMultipartOverhead)
	if err := c.Request.ParseMultipartForm(1024 * 1024); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"success": false, "message": fmt.Sprintf("文件超过当前模型限制（%.0fMB）", float64(maxBytes)/(1024*1024))})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid media upload"})
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "media file is required"})
		return
	}
	defer file.Close()
	if header.Size <= 0 || header.Size > maxBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"success": false, "message": fmt.Sprintf("文件超过当前模型限制（%.0fMB）", float64(maxBytes)/(1024*1024))})
		return
	}

	contentType, ext, err := detectPlaygroundUploadedMedia(file)
	if err != nil || normalizePlaygroundMediaKind(kind, ext) != kind {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "unsupported or mismatched media content type"})
		return
	}

	metadata := map[string]interface{}{
		"role":              "reference",
		"reference_role":    strings.TrimSpace(c.PostForm("role")),
		"hidden":            true,
		"public_reference":  true,
		"source":            "direct_upload",
		"original_filename": filepath.Base(header.Filename),
		"content_type":      contentType,
		"provider_policy":   policy.ProviderLimitNote,
	}
	if raw := strings.TrimSpace(c.PostForm("metadata")); raw != "" {
		var clientMetadata map[string]interface{}
		if json.Unmarshal([]byte(raw), &clientMetadata) == nil {
			for key, value := range normalizePlaygroundMetadata(clientMetadata) {
				metadata[key] = value
			}
		}
	}
	// Security-sensitive metadata is always server-owned.
	metadata["role"] = "reference"
	metadata["hidden"] = true
	metadata["public_reference"] = true
	metadata["source"] = "direct_upload"
	metadata["original_filename"] = filepath.Base(header.Filename)
	metadata["content_type"] = contentType

	req := playgroundMediaCacheRequest{
		Kind:     kind,
		Filename: filepath.Base(header.Filename),
		Model:    modelName,
		Workflow: workflow,
		Metadata: metadata,
	}
	item, err := writePlaygroundMedia(c, req, file, ext, maxBytes)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(strings.ToLower(err.Error()), "exceeds") {
			status = http.StatusRequestEntityTooLarge
		}
		c.JSON(status, gin.H{"success": false, "message": err.Error()})
		return
	}
	publicURL := playgroundSignedPublicMediaURL(c, item)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"url":          item.URL,
			"public_url":   publicURL,
			"upstream_url": publicURL,
			"item":         item,
			"policy":       policy,
			"expires_in":   int(playgroundMediaRetentionDuration().Seconds()),
		},
	})
}

func detectPlaygroundUploadedMedia(file multipart.File) (string, string, error) {
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return "", "", err
	}
	buffer := make([]byte, 512)
	n, err := file.Read(buffer)
	if err != nil && !errors.Is(err, io.EOF) {
		return "", "", err
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return "", "", err
	}
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(http.DetectContentType(buffer[:n]), ";")[0]))
	ext := playgroundMediaExtensions[contentType]
	if ext == "" {
		return "", "", errors.New("unsupported media content type")
	}
	return contentType, ext, nil
}

func materializePlaygroundStoredImageEdit(c *gin.Context, body []byte) ([]byte, string, bool, int, error) {
	if c == nil || c.Request == nil || !strings.HasPrefix(strings.ToLower(c.Request.Header.Get("Content-Type")), "application/json") {
		return nil, "", false, 0, nil
	}
	var request playgroundStoredImageEditRequest
	if err := json.Unmarshal(body, &request); err != nil || len(request.ImageURLs) == 0 {
		return nil, "", false, 0, nil
	}
	policy := playgroundMediaPolicyFor(request.Model, "image_edit")
	if len(request.ImageURLs) > policy.MaxImages {
		return nil, "", false, http.StatusRequestEntityTooLarge, fmt.Errorf("当前模型最多支持 %d 张参考图", policy.MaxImages)
	}

	images := make([]playgroundStoredMediaFile, 0, len(request.ImageURLs))
	var totalBytes int64
	for _, rawURL := range request.ImageURLs {
		stored, err := resolvePlaygroundStoredMediaURL(c, rawURL, "image")
		if err != nil {
			return nil, "", false, http.StatusBadRequest, err
		}
		if stored.Size > policy.MaxImageBytes {
			return nil, "", false, http.StatusRequestEntityTooLarge, fmt.Errorf("参考图超过当前模型单图限制（%.0fMB）", float64(policy.MaxImageBytes)/(1024*1024))
		}
		totalBytes += stored.Size
		images = append(images, stored)
	}

	var mask *playgroundStoredMediaFile
	if strings.TrimSpace(request.MaskURL) != "" {
		stored, err := resolvePlaygroundStoredMediaURL(c, request.MaskURL, "image")
		if err != nil {
			return nil, "", false, http.StatusBadRequest, err
		}
		if stored.Size > policy.MaxImageBytes {
			return nil, "", false, http.StatusRequestEntityTooLarge, errors.New("遮罩图超过当前模型限制")
		}
		totalBytes += stored.Size
		mask = &stored
	}
	if totalBytes > policy.MaxTotalBytes || totalBytes > policy.GlobalTotalBytes {
		return nil, "", false, http.StatusRequestEntityTooLarge, fmt.Errorf("参考图片总量超过当前模型限制（%.0fMB）", float64(policy.MaxTotalBytes)/(1024*1024))
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, "", false, http.StatusBadRequest, errors.New("invalid image edit request")
	}
	delete(payload, "image_urls")
	delete(payload, "mask_url")

	var buffer bytes.Buffer
	writer := multipart.NewWriter(&buffer)
	for key, value := range payload {
		if value == nil {
			continue
		}
		fieldValue := fmt.Sprint(value)
		if _, ok := value.(string); !ok {
			encoded, err := json.Marshal(value)
			if err != nil {
				_ = writer.Close()
				return nil, "", false, http.StatusBadRequest, fmt.Errorf("invalid field %s", key)
			}
			fieldValue = string(encoded)
		}
		if err := writer.WriteField(key, fieldValue); err != nil {
			_ = writer.Close()
			return nil, "", false, http.StatusInternalServerError, errors.New("failed to prepare image edit request")
		}
	}
	for _, image := range images {
		if err := appendPlaygroundStoredMediaPart(writer, "image", image); err != nil {
			_ = writer.Close()
			return nil, "", false, http.StatusInternalServerError, err
		}
	}
	if mask != nil {
		if err := appendPlaygroundStoredMediaPart(writer, "mask", *mask); err != nil {
			_ = writer.Close()
			return nil, "", false, http.StatusInternalServerError, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, "", false, http.StatusInternalServerError, errors.New("failed to finalize image edit request")
	}
	return buffer.Bytes(), writer.FormDataContentType(), true, http.StatusOK, nil
}

func appendPlaygroundStoredMediaPart(writer *multipart.Writer, field string, media playgroundStoredMediaFile) error {
	file, err := os.Open(media.Path)
	if err != nil {
		return errors.New("stored reference image is unavailable")
	}
	defer file.Close()
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, field, media.Filename))
	header.Set("Content-Type", media.ContentType)
	part, err := writer.CreatePart(header)
	if err != nil {
		return errors.New("failed to prepare stored reference image")
	}
	if _, err := io.Copy(part, io.LimitReader(file, playgroundMediaGlobalRequestBytes+1)); err != nil {
		return errors.New("failed to read stored reference image")
	}
	return nil
}

func resolvePlaygroundStoredMediaURL(c *gin.Context, rawURL string, expectedKind string) (playgroundStoredMediaFile, error) {
	empty := playgroundStoredMediaFile{}
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.IsAbs() || parsed.RawQuery != "" || parsed.Fragment != "" {
		return empty, errors.New("invalid stored media url")
	}
	prefix := playgroundMediaURLPrefix() + "/"
	if !strings.HasPrefix(parsed.Path, prefix) {
		return empty, errors.New("reference image must use uploaded media storage")
	}
	relative := strings.TrimPrefix(parsed.Path, prefix)
	parts := strings.Split(relative, "/")
	if len(parts) != 2 {
		return empty, errors.New("invalid stored media path")
	}
	userDir := playgroundMediaUserDirName(c.GetInt("id"))
	name := filepath.Base(parts[1])
	if parts[0] != userDir || name != parts[1] || !isValidPlaygroundMediaFilename(name) {
		return empty, errors.New("stored media does not belong to current user")
	}

	root := filepath.Clean(playgroundMediaCacheRoot())
	fullPath := filepath.Join(root, userDir, name)
	cleanPath := filepath.Clean(fullPath)
	if !strings.HasPrefix(cleanPath, root+string(os.PathSeparator)) {
		return empty, errors.New("invalid stored media path")
	}
	info, err := os.Lstat(cleanPath)
	if err != nil || !info.Mode().IsRegular() {
		return empty, errors.New("stored reference image is unavailable")
	}
	metaBytes, err := os.ReadFile(cleanPath + ".json")
	if err != nil {
		return empty, errors.New("stored media metadata is unavailable")
	}
	var item playgroundMediaItem
	if err := json.Unmarshal(metaBytes, &item); err != nil || item.Kind != expectedKind {
		return empty, errors.New("stored media type does not match request")
	}
	if item.ExpiresAt != "" {
		expiresAt, err := time.Parse(time.RFC3339, item.ExpiresAt)
		if err != nil || time.Now().After(expiresAt) {
			return empty, errors.New("stored reference image has expired")
		}
	}
	file, err := os.Open(cleanPath)
	if err != nil {
		return empty, errors.New("stored reference image is unavailable")
	}
	contentType, _, detectErr := detectPlaygroundUploadedMedia(file)
	_ = file.Close()
	if detectErr != nil || !strings.HasPrefix(contentType, "image/") {
		return empty, errors.New("stored reference image content is invalid")
	}
	return playgroundStoredMediaFile{
		Path:        cleanPath,
		Filename:    name,
		ContentType: contentType,
		Size:        info.Size(),
	}, nil
}

func replacePlaygroundRequestBody(c *gin.Context, body []byte, contentType string) error {
	common.CleanupBodyStorage(c)
	storage, err := common.CreateBodyStorage(body)
	if err != nil {
		return err
	}
	c.Set(common.KeyBodyStorage, storage)
	c.Request.Body = io.NopCloser(storage)
	c.Request.ContentLength = int64(len(body))
	c.Request.Header.Set("Content-Type", contentType)
	return nil
}
