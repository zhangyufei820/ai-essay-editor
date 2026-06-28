package controller

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	_ "golang.org/x/image/webp"
)

var playgroundMediaExtensions = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/gif":  ".gif",
	"video/mp4":  ".mp4",
	"video/webm": ".webm",
}

type playgroundMediaItem struct {
	ID            string                 `json:"id"`
	Kind          string                 `json:"kind"`
	URL           string                 `json:"url"`
	DisplayURL    string                 `json:"displayUrl"`
	CachedURL     string                 `json:"cachedUrl"`
	OriginalURL   string                 `json:"originalUrl,omitempty"`
	Filename      string                 `json:"filename"`
	Prompt        string                 `json:"prompt,omitempty"`
	Model         string                 `json:"model,omitempty"`
	Workflow      string                 `json:"workflow,omitempty"`
	RevisedPrompt string                 `json:"revisedPrompt,omitempty"`
	Status        string                 `json:"status"`
	CacheStatus   string                 `json:"cacheStatus"`
	CreatedAt     string                 `json:"createdAt"`
	ExpiresAt     string                 `json:"expiresAt"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

func cachePlaygroundMedia(c *gin.Context, req playgroundMediaCacheRequest) (*playgroundMediaItem, error) {
	rawURL := strings.TrimSpace(req.URL)
	if rawURL == "" {
		return nil, errors.New("media url is required")
	}
	if strings.HasPrefix(strings.ToLower(rawURL), "data:") {
		return cachePlaygroundDataMedia(c, req, rawURL)
	}

	remoteURL, err := validatePlaygroundMediaURL(req.URL)
	if err != nil {
		return nil, err
	}

	client := &http.Client{
		Timeout: 90 * time.Second,
		Transport: &http.Transport{
			DialContext: safePlaygroundMediaDialContext,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many media redirects")
			}
			_, err := validatePlaygroundMediaURL(req.URL.String())
			return err
		},
	}
	httpReq, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, remoteURL.String(), nil)
	if err != nil {
		return nil, errors.New("failed to prepare media download")
	}
	httpReq.Header.Set("User-Agent", "NewAPI-Playground-Media-Cache/1.0")

	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, errors.New("failed to download generated media")
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("media download failed with status %d", resp.StatusCode)
	}

	contentType := strings.ToLower(strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0]))
	ext := playgroundMediaExtensions[contentType]
	if ext == "" {
		ext = extFromRemotePath(remoteURL.Path)
	}
	if ext == "" {
		return nil, errors.New("unsupported media content type")
	}

	maxBytes := int64(common.GetEnvOrDefault("PLAYGROUND_MEDIA_MAX_MB", 256)) * 1024 * 1024
	if resp.ContentLength > maxBytes {
		return nil, errors.New("generated media is too large to cache")
	}

	return writePlaygroundMedia(c, req, resp.Body, ext, maxBytes)
}

func cachePlaygroundDataMedia(c *gin.Context, req playgroundMediaCacheRequest, rawURL string) (*playgroundMediaItem, error) {
	contentType, data, err := decodePlaygroundDataURL(rawURL)
	if err != nil {
		return nil, err
	}
	ext := playgroundMediaExtensions[contentType]
	if ext == "" {
		return nil, errors.New("unsupported media content type")
	}
	maxBytes := int64(common.GetEnvOrDefault("PLAYGROUND_MEDIA_MAX_MB", 256)) * 1024 * 1024
	if int64(len(data)) > maxBytes {
		return nil, errors.New("generated media exceeds cache size limit")
	}
	return writePlaygroundMedia(c, req, bytes.NewReader(data), ext, maxBytes)
}

func writePlaygroundMedia(c *gin.Context, req playgroundMediaCacheRequest, reader io.Reader, ext string, maxBytes int64) (*playgroundMediaItem, error) {
	root := playgroundMediaUserDir(c)
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, errors.New("failed to create media cache directory")
	}

	sum := sha256.Sum256([]byte(fmt.Sprintf("%d:%s:%s:%d", time.Now().UnixNano(), req.URL, c.GetString(common.RequestIdKey), c.GetInt("id"))))
	id := fmt.Sprintf("%x", sum[:12])
	name := fmt.Sprintf("%x%s", sum[:12], ext)
	fullPath := filepath.Join(root, name)

	out, err := os.OpenFile(fullPath, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o644)
	if err != nil {
		return nil, errors.New("failed to create cached media file")
	}
	defer out.Close()

	written, err := io.Copy(out, io.LimitReader(reader, maxBytes+1))
	if err != nil {
		_ = os.Remove(fullPath)
		return nil, errors.New("failed to save generated media")
	}
	if written > maxBytes {
		_ = os.Remove(fullPath)
		return nil, errors.New("generated media exceeds cache size limit")
	}

	metadata := normalizePlaygroundMetadata(req.Metadata)
	if metadata == nil {
		metadata = map[string]interface{}{}
	}
	annotatePlaygroundMediaActualSize(fullPath, normalizePlaygroundMediaKind(req.Kind, ext), written, metadata)

	now := time.Now()
	mediaURL := playgroundMediaURLPrefix() + "/" + playgroundMediaUserDirName(c.GetInt("id")) + "/" + name
	item := &playgroundMediaItem{
		ID:            id,
		Kind:          normalizePlaygroundMediaKind(req.Kind, ext),
		URL:           mediaURL,
		DisplayURL:    mediaURL,
		CachedURL:     mediaURL,
		OriginalURL:   playgroundOriginalURL(req.URL),
		Filename:      name,
		Prompt:        truncatePlaygroundText(req.Prompt, 3000),
		Model:         truncatePlaygroundText(req.Model, 160),
		Workflow:      truncatePlaygroundText(req.Workflow, 120),
		RevisedPrompt: truncatePlaygroundText(req.RevisedPrompt, 3000),
		Status:        "ready",
		CacheStatus:   "ready",
		CreatedAt:     now.Format(time.RFC3339),
		ExpiresAt:     now.Add(playgroundMediaRetentionDuration()).Format(time.RFC3339),
		Metadata:      metadata,
	}
	if err := writePlaygroundMediaMetadata(fullPath, item); err != nil {
		removePlaygroundMediaWithMetadata(fullPath)
		return nil, errors.New("failed to save media metadata")
	}

	return item, nil
}

func annotatePlaygroundMediaActualSize(mediaPath string, kind string, bytesWritten int64, metadata map[string]interface{}) {
	if metadata == nil {
		return
	}
	metadata["actual_bytes"] = bytesWritten
	if kind != "image" {
		return
	}
	file, err := os.Open(mediaPath)
	if err != nil {
		return
	}
	defer file.Close()
	cfg, _, err := image.DecodeConfig(file)
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 {
		return
	}
	actualSize := fmt.Sprintf("%dx%d", cfg.Width, cfg.Height)
	metadata["actual_width"] = cfg.Width
	metadata["actual_height"] = cfg.Height
	metadata["actual_size"] = actualSize
	if requested, _ := metadata["effective_size"].(string); requested != "" && requested != actualSize {
		metadata["requested_actual_mismatch"] = true
	}
}

func playgroundOriginalURL(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" || strings.HasPrefix(strings.ToLower(rawURL), "data:") {
		return ""
	}
	return rawURL
}

func validatePlaygroundMediaURL(raw string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed == nil || parsed.Hostname() == "" {
		return nil, errors.New("invalid media url")
	}
	if parsed.Scheme != "https" && parsed.Scheme != "http" {
		return nil, errors.New("only http and https media urls can be cached")
	}
	if isPrivateHost(parsed.Hostname()) || hostResolvesPrivate(parsed.Hostname()) {
		return nil, errors.New("private media urls cannot be cached")
	}
	return parsed, nil
}

func isPrivateHost(host string) bool {
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()
}

func hostResolvesPrivate(host string) bool {
	if net.ParseIP(host) != nil {
		return false
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return true
	}
	if len(ips) == 0 {
		return true
	}
	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return true
		}
	}
	return false
}

func safePlaygroundMediaDialContext(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	if isPrivateHost(host) {
		return nil, errors.New("private media address cannot be reached")
	}

	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	for _, ipAddr := range ips {
		ip := ipAddr.IP
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return nil, errors.New("private media address cannot be reached")
		}
	}

	dialer := &net.Dialer{Timeout: 30 * time.Second}
	return dialer.DialContext(ctx, network, net.JoinHostPort(host, port))
}

func extFromRemotePath(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".jpg", ".jpeg":
		return ".jpg"
	case ".png":
		return ".png"
	case ".webp":
		return ".webp"
	case ".gif":
		return ".gif"
	case ".mp4":
		return ".mp4"
	case ".webm":
		return ".webm"
	default:
		return ""
	}
}

func decodePlaygroundDataURL(raw string) (string, []byte, error) {
	idx := strings.Index(raw, ",")
	if idx <= 5 {
		return "", nil, errors.New("invalid data media url")
	}
	header := strings.ToLower(strings.TrimSpace(raw[:idx]))
	if !strings.HasPrefix(header, "data:") || !strings.Contains(header, ";base64") {
		return "", nil, errors.New("only base64 data media urls can be cached")
	}
	contentType := strings.TrimSpace(strings.TrimPrefix(strings.Split(header, ";")[0], "data:"))
	if contentType == "" {
		return "", nil, errors.New("missing data media content type")
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(raw[idx+1:]))
	if err != nil {
		return "", nil, errors.New("invalid base64 media data")
	}
	return contentType, data, nil
}

func playgroundMediaUserDirName(userID int) string {
	return fmt.Sprintf("u-%d", userID)
}

func playgroundMediaUserDir(c *gin.Context) string {
	return filepath.Join(playgroundMediaCacheRoot(), playgroundMediaUserDirName(c.GetInt("id")))
}

func normalizePlaygroundMediaKind(kind string, ext string) string {
	kind = strings.ToLower(strings.TrimSpace(kind))
	if kind == "image" || kind == "video" {
		return kind
	}
	switch ext {
	case ".mp4", ".webm":
		return "video"
	default:
		return "image"
	}
}

func truncatePlaygroundText(value string, maxRunes int) string {
	value = strings.TrimSpace(value)
	if maxRunes <= 0 {
		return value
	}
	runes := []rune(value)
	if len(runes) <= maxRunes {
		return value
	}
	return string(runes[:maxRunes])
}

func normalizePlaygroundMetadata(metadata map[string]interface{}) map[string]interface{} {
	if len(metadata) == 0 {
		return nil
	}
	encoded, err := json.Marshal(metadata)
	if err != nil || len(encoded) > 8192 {
		return nil
	}
	var normalized map[string]interface{}
	if err := json.Unmarshal(encoded, &normalized); err != nil {
		return nil
	}
	return normalized
}

func writePlaygroundMediaMetadata(mediaPath string, item *playgroundMediaItem) error {
	data, err := json.MarshalIndent(item, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(mediaPath+".json", data, 0o644)
}

func removePlaygroundMediaWithMetadata(mediaPath string) {
	_ = os.Remove(mediaPath)
	_ = os.Remove(mediaPath + ".json")
}

func listPlaygroundMedia(c *gin.Context) ([]playgroundMediaItem, error) {
	root := playgroundMediaUserDir(c)
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return []playgroundMediaItem{}, nil
		}
		return nil, errors.New("failed to read temporary media directory")
	}

	items := make([]playgroundMediaItem, 0, len(entries))
	cutoff := time.Now().Add(-playgroundMediaRetentionDuration())
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		metaPath := filepath.Join(root, entry.Name())
		mediaPath := strings.TrimSuffix(metaPath, ".json")
		info, err := os.Stat(mediaPath)
		if err != nil || info.IsDir() {
			_ = os.Remove(metaPath)
			continue
		}
		if info.ModTime().Before(cutoff) {
			removePlaygroundMediaWithMetadata(mediaPath)
			continue
		}
		data, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}
		var item playgroundMediaItem
		if err := json.Unmarshal(data, &item); err != nil {
			continue
		}
		if playgroundMediaItemHidden(item) {
			continue
		}
		if item.ID == "" {
			item.ID = strings.TrimSuffix(entry.Name(), filepath.Ext(strings.TrimSuffix(entry.Name(), ".json"))+".json")
		}
		item.Filename = filepath.Base(mediaPath)
		item.URL = playgroundMediaURLPrefix() + "/" + playgroundMediaUserDirName(c.GetInt("id")) + "/" + item.Filename
		item.CachedURL = item.URL
		item.DisplayURL = item.URL
		item.Status = "ready"
		item.CacheStatus = "ready"
		if item.ExpiresAt == "" {
			item.ExpiresAt = info.ModTime().Add(playgroundMediaRetentionDuration()).Format(time.RFC3339)
		}
		items = append(items, item)
	}

	sortPlaygroundMediaItems(items)
	if len(items) > 100 {
		items = items[:100]
	}
	return items, nil
}

func playgroundMediaItemHidden(item playgroundMediaItem) bool {
	if len(item.Metadata) == 0 {
		return false
	}
	hidden, ok := item.Metadata["hidden"].(bool)
	if ok && hidden {
		return true
	}
	role, _ := item.Metadata["role"].(string)
	return strings.EqualFold(strings.TrimSpace(role), "reference")
}

func sortPlaygroundMediaItems(items []playgroundMediaItem) {
	for i := 1; i < len(items); i++ {
		item := items[i]
		j := i - 1
		for ; j >= 0 && playgroundMediaCreatedAtBefore(items[j], item); j-- {
			items[j+1] = items[j]
		}
		items[j+1] = item
	}
}

func playgroundMediaCreatedAtBefore(a playgroundMediaItem, b playgroundMediaItem) bool {
	aTime, aErr := time.Parse(time.RFC3339, a.CreatedAt)
	bTime, bErr := time.Parse(time.RFC3339, b.CreatedAt)
	if aErr != nil || bErr != nil {
		return a.CreatedAt < b.CreatedAt
	}
	return aTime.Before(bTime)
}

func CleanupPlaygroundMediaCache(maxAge time.Duration) (int, error) {
	if maxAge <= 0 {
		maxAge = playgroundMediaRetentionDuration()
	}
	root := playgroundMediaCacheRoot()
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}

	removed := 0
	cutoff := time.Now().Add(-maxAge)
	for _, entry := range entries {
		entryPath := filepath.Join(root, entry.Name())
		if entry.IsDir() {
			nestedEntries, err := os.ReadDir(entryPath)
			if err != nil {
				continue
			}
			for _, nested := range nestedEntries {
				if nested.IsDir() {
					continue
				}
				nestedPath := filepath.Join(entryPath, nested.Name())
				info, err := nested.Info()
				if err != nil {
					continue
				}
				if info.ModTime().Before(cutoff) {
					if strings.HasSuffix(nested.Name(), ".json") {
						_ = os.Remove(nestedPath)
						removed++
					} else {
						removePlaygroundMediaWithMetadata(nestedPath)
						removed++
					}
				}
			}
			_ = os.Remove(entryPath)
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			if strings.HasSuffix(entry.Name(), ".json") {
				if err := os.Remove(entryPath); err == nil {
					removed++
				}
				continue
			}
			if err := os.Remove(entryPath); err == nil {
				_ = os.Remove(entryPath + ".json")
				removed++
			}
		}
	}
	return removed, nil
}
