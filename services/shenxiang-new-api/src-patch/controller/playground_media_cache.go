package controller

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
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
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	_ "golang.org/x/image/webp"
)

var playgroundMediaExtensions = map[string]string{
	"audio/aac":       ".aac",
	"audio/mp4":       ".m4a",
	"audio/mpeg":      ".mp3",
	"audio/wav":       ".wav",
	"audio/x-wav":     ".wav",
	"image/gif":       ".gif",
	"image/jpeg":      ".jpg",
	"image/png":       ".png",
	"image/webp":      ".webp",
	"video/mp4":       ".mp4",
	"video/quicktime": ".mov",
	"video/webm":      ".webm",
	"video/x-m4v":     ".m4v",
}

var playgroundMediaSSRFProtection = &common.SSRFProtection{
	AllowPrivateIp:   false,
	DomainFilterMode: false,
	IpFilterMode:     false,
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
			if req.URL.Scheme != "https" && req.URL.Scheme != "http" {
				return errors.New("invalid redirect url scheme")
			}
			if isPrivateHost(req.URL.Hostname()) {
				return errors.New("private redirect target")
			}
			return nil
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
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, errors.New("failed to create media cache directory")
	}

	sum := sha256.Sum256([]byte(fmt.Sprintf("%d:%s:%s:%d", time.Now().UnixNano(), req.URL, c.GetString(common.RequestIdKey), c.GetInt("id"))))
	id := fmt.Sprintf("%x", sum[:16])
	name := fmt.Sprintf("%x%s", sum[:16], ext)
	fullPath := filepath.Join(root, name)

	tempFile, err := os.CreateTemp(playgroundMediaCacheRoot(), ".playground-media-*.tmp")
	if err != nil {
		return nil, errors.New("failed to create temporary media file")
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath)

	written, err := io.Copy(tempFile, io.LimitReader(reader, maxBytes+1))
	if err != nil {
		_ = tempFile.Close()
		return nil, errors.New("failed to save generated media")
	}
	if written > maxBytes {
		_ = tempFile.Close()
		return nil, errors.New("generated media exceeds cache size limit")
	}
	if err := tempFile.Close(); err != nil {
		return nil, errors.New("failed to finalize temporary media file")
	}

	common.PlaygroundMediaCacheMu.Lock()
	defer common.PlaygroundMediaCacheMu.Unlock()

	userBytes, userFiles, err := playgroundMediaCacheUsage(root, true)
	if err != nil {
		return nil, errors.New("failed to inspect user media cache quota")
	}
	if userFiles >= playgroundMediaMaxFilesPerUser() {
		return nil, errors.New("user media cache file count quota exceeded")
	}
	if userBytes+written > playgroundMediaUserMaxBytes() {
		return nil, errors.New("user media cache quota exceeded")
	}
	totalBytes, _, err := playgroundMediaCacheUsage(playgroundMediaCacheRoot(), false)
	if err != nil {
		return nil, errors.New("failed to inspect total media cache quota")
	}
	if totalBytes+written+(64<<10) > playgroundMediaTotalMaxBytes() {
		return nil, errors.New("total media cache quota exceeded")
	}
	if err := os.Rename(tempPath, fullPath); err != nil {
		return nil, errors.New("failed to publish cached media file")
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

func playgroundMediaCacheUsage(root string, countMediaFiles bool) (int64, int, error) {
	return common.PlaygroundMediaCacheUsage(root, countMediaFiles)
}

func playgroundMediaUserMaxBytes() int64 {
	return common.PlaygroundMediaUserMaxBytes()
}

func playgroundMediaTotalMaxBytes() int64 {
	return common.PlaygroundMediaTotalMaxBytes()
}

func playgroundMediaMaxFilesPerUser() int {
	return common.PlaygroundMediaMaxFilesPerUser()
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

func playgroundOriginalURL(_ string) string {
	return ""
}

func playgroundMediaPublicURLPrefix() string {
	prefix := common.GetEnvOrDefaultString("PLAYGROUND_MEDIA_PUBLIC_URL_PREFIX", "/pg/media/public")
	prefix = strings.TrimSpace(prefix)
	if prefix == "" {
		prefix = "/pg/media/public"
	}
	if strings.HasPrefix(prefix, "https://") || strings.HasPrefix(prefix, "http://") {
		return strings.TrimRight(prefix, "/")
	}
	return "/" + strings.Trim(prefix, "/")
}

func playgroundMediaPublicTTL() time.Duration {
	keepMinutes := common.GetEnvOrDefault("PLAYGROUND_MEDIA_PUBLIC_KEEP_MINUTES", 6*60)
	if keepMinutes < 1 {
		keepMinutes = 6 * 60
	}
	return time.Duration(keepMinutes) * time.Minute
}

func playgroundMediaPublicSigningSecret() []byte {
	for _, key := range []string{"PLAYGROUND_MEDIA_PUBLIC_SIGNING_SECRET", "CRYPTO_SECRET", "SESSION_SECRET"} {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return []byte(value)
		}
	}
	for _, value := range []string{common.CryptoSecret, common.SessionSecret} {
		if value = strings.TrimSpace(value); value != "" {
			return []byte(value)
		}
	}
	return nil
}

func playgroundMediaPublicReferenceAllowed(item *playgroundMediaItem) bool {
	if item == nil || len(item.Metadata) == 0 {
		return false
	}
	if value, ok := item.Metadata["public_reference"].(bool); ok && value {
		return true
	}
	hidden, _ := item.Metadata["hidden"].(bool)
	source := strings.TrimSpace(fmt.Sprint(item.Metadata["source"]))
	return hidden && source == "video_input"
}

func playgroundSignedPublicMediaURL(c *gin.Context, item *playgroundMediaItem) string {
	if item == nil || !playgroundMediaPublicReferenceAllowed(item) {
		return ""
	}
	userDir := playgroundMediaUserDirName(c.GetInt("id"))
	filename := filepath.Base(item.Filename)
	if !isValidPlaygroundMediaUserDir(userDir) || !isValidPlaygroundMediaFilename(filename) {
		return ""
	}
	if len(playgroundMediaPublicSigningSecret()) == 0 {
		return ""
	}

	expiresAt := time.Now().Add(playgroundMediaPublicTTL())
	if item.ExpiresAt != "" {
		if t, err := time.Parse(time.RFC3339, item.ExpiresAt); err == nil && t.Before(expiresAt) {
			expiresAt = t
		}
	}
	expiresUnix := expiresAt.Unix()
	sig := playgroundPublicMediaSignature(userDir, filename, expiresUnix)
	return fmt.Sprintf("%s/%s/%s?expires=%d&sig=%s", playgroundMediaPublicURLPrefix(), userDir, filename, expiresUnix, sig)
}

func playgroundPublicMediaSignature(userDir, filename string, expiresUnix int64) string {
	secret := playgroundMediaPublicSigningSecret()
	if len(secret) == 0 {
		return ""
	}
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(userDir))
	_, _ = mac.Write([]byte{'\n'})
	_, _ = mac.Write([]byte(filename))
	_, _ = mac.Write([]byte{'\n'})
	_, _ = mac.Write([]byte(strconv.FormatInt(expiresUnix, 10)))
	return hex.EncodeToString(mac.Sum(nil))
}

func playgroundPublicMediaSignatureValid(userDir, filename string, expiresUnix int64, sig string) bool {
	expectedSig := playgroundPublicMediaSignature(userDir, filename, expiresUnix)
	if expectedSig == "" {
		return false
	}
	expected, err := hex.DecodeString(expectedSig)
	if err != nil {
		return false
	}
	actual, err := hex.DecodeString(strings.TrimSpace(sig))
	if err != nil {
		return false
	}
	return hmac.Equal(actual, expected)
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
	return !playgroundMediaSSRFProtection.IsIPAccessAllowed(ip)
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
		if !playgroundMediaSSRFProtection.IsIPAccessAllowed(ip) {
			return true
		}
	}
	return false
}

func safePlaygroundMediaDialContext(ctx context.Context, network, address string) (net.Conn, error) {
	dialer := &net.Dialer{Timeout: 30 * time.Second}
	return dialValidatedPlaygroundMediaAddress(
		ctx,
		network,
		address,
		net.DefaultResolver.LookupIPAddr,
		dialer.DialContext,
	)
}

func dialValidatedPlaygroundMediaAddress(
	ctx context.Context,
	network string,
	address string,
	lookupIPAddr func(context.Context, string) ([]net.IPAddr, error),
	dialContext func(context.Context, string, string) (net.Conn, error),
) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	if ip := net.ParseIP(host); ip != nil {
		if !playgroundMediaSSRFProtection.IsIPAccessAllowed(ip) {
			return nil, errors.New("private media address cannot be reached")
		}
		return dialContext(ctx, network, net.JoinHostPort(ip.String(), port))
	}

	ips, err := lookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, errors.New("media address did not resolve")
	}
	for _, ipAddr := range ips {
		if !playgroundMediaSSRFProtection.IsIPAccessAllowed(ipAddr.IP) {
			return nil, errors.New("private media address cannot be reached")
		}
	}

	var lastErr error
	for _, ipAddr := range ips {
		conn, dialErr := dialContext(ctx, network, net.JoinHostPort(ipAddr.IP.String(), port))
		if dialErr == nil {
			return conn, nil
		}
		lastErr = dialErr
	}
	return nil, lastErr
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
	case ".mov":
		return ".mov"
	case ".m4v":
		return ".m4v"
	case ".webm":
		return ".webm"
	case ".mp3":
		return ".mp3"
	case ".m4a":
		return ".m4a"
	case ".aac":
		return ".aac"
	case ".wav":
		return ".wav"
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
	if kind == "image" || kind == "video" || kind == "audio" {
		return kind
	}
	switch ext {
	case ".mp4", ".mov", ".m4v", ".webm":
		return "video"
	case ".mp3", ".m4a", ".aac", ".wav":
		return "audio"
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
	return os.WriteFile(mediaPath+".json", data, 0o600)
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
	common.PlaygroundMediaCacheMu.Lock()
	defer common.PlaygroundMediaCacheMu.Unlock()
	return cleanupPlaygroundMediaCache(maxAge)
}

func cleanupPlaygroundMediaCache(maxAge time.Duration) (int, error) {
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
					// Two-level nesting: tasks/u-{id}/ — clean up orphan .body files.
					nestedDirPath := filepath.Join(entryPath, nested.Name())
					if innerEntries, err := os.ReadDir(nestedDirPath); err == nil {
						for _, inner := range innerEntries {
							if inner.IsDir() {
								continue
							}
							innerPath := filepath.Join(nestedDirPath, inner.Name())
							info, err := inner.Info()
							if err != nil || !info.ModTime().Before(cutoff) {
								continue
							}
							if err := os.Remove(innerPath); err == nil {
								removed++
							}
						}
					}
					_ = os.Remove(nestedDirPath)
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

func StartPlaygroundMediaCacheCleanupTask() {
	intervalMinutes := common.GetEnvOrDefault("PLAYGROUND_MEDIA_CLEANUP_INTERVAL_MINUTES", 30)
	if intervalMinutes < 1 {
		intervalMinutes = 30
	}
	interval := time.Duration(intervalMinutes) * time.Minute
	go func() {
		if removed, err := CleanupPlaygroundMediaCache(0); err != nil {
			common.SysError("playground media cache cleanup failed: " + err.Error())
		} else if removed > 0 {
			common.SysLog(fmt.Sprintf("playground media cache cleanup removed %d expired files", removed))
		}
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			if removed, err := CleanupPlaygroundMediaCache(0); err != nil {
				common.SysError("playground media cache cleanup failed: " + err.Error())
			} else if removed > 0 {
				common.SysLog(fmt.Sprintf("playground media cache cleanup removed %d expired files", removed))
			}
		}
	}()
}
