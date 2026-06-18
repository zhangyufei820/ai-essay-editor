package controller

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
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
)

const playgroundMediaRetention = 24 * time.Hour

var playgroundMediaExtensions = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/gif":  ".gif",
	"video/mp4":  ".mp4",
	"video/webm": ".webm",
}

func cachePlaygroundMedia(c *gin.Context, req playgroundMediaCacheRequest) (string, error) {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(req.URL)), "data:") {
		return cachePlaygroundDataURL(c, req)
	}

	remoteURL, err := validatePlaygroundMediaURL(req.URL)
	if err != nil {
		return "", err
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
		return "", errors.New("failed to prepare media download")
	}
	httpReq.Header.Set("User-Agent", "NewAPI-Playground-Media-Cache/1.0")

	resp, err := client.Do(httpReq)
	if err != nil {
		return "", errors.New("failed to download generated media")
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("media download failed with status %d", resp.StatusCode)
	}

	contentType := strings.ToLower(strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0]))
	ext := playgroundMediaExtensions[contentType]
	if ext == "" {
		ext = extFromRemotePath(remoteURL.Path)
	}
	if ext == "" {
		return "", errors.New("unsupported media content type")
	}

	maxBytes := int64(common.GetEnvOrDefault("PLAYGROUND_MEDIA_MAX_MB", 256)) * 1024 * 1024
	if resp.ContentLength > maxBytes {
		return "", errors.New("generated media is too large to cache")
	}

	root := playgroundMediaCacheRoot()
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", errors.New("failed to create media cache directory")
	}

	sum := sha256.Sum256([]byte(fmt.Sprintf("%d:%s:%s", time.Now().UnixNano(), remoteURL.String(), c.GetString(common.RequestIdKey))))
	name := fmt.Sprintf("%x%s", sum[:12], ext)
	fullPath := filepath.Join(root, name)

	out, err := os.OpenFile(fullPath, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o644)
	if err != nil {
		return "", errors.New("failed to create cached media file")
	}
	defer out.Close()

	written, err := io.Copy(out, io.LimitReader(resp.Body, maxBytes+1))
	if err != nil {
		_ = os.Remove(fullPath)
		return "", errors.New("failed to save generated media")
	}
	if written > maxBytes {
		_ = os.Remove(fullPath)
		return "", errors.New("generated media exceeds cache size limit")
	}

	return playgroundMediaURLPrefix() + "/" + name, nil
}

func cachePlaygroundDataURL(c *gin.Context, req playgroundMediaCacheRequest) (string, error) {
	contentType, mediaBytes, err := decodePlaygroundDataURL(req.URL)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(req.Kind) == "video" && !strings.HasPrefix(contentType, "video/") {
		return "", errors.New("media kind does not match data url content type")
	}
	if strings.TrimSpace(req.Kind) != "video" && !strings.HasPrefix(contentType, "image/") {
		return "", errors.New("media kind does not match data url content type")
	}
	ext := playgroundMediaExtensions[contentType]
	if ext == "" {
		return "", errors.New("unsupported media content type")
	}

	maxBytes := int64(common.GetEnvOrDefault("PLAYGROUND_MEDIA_MAX_MB", 256)) * 1024 * 1024
	if int64(len(mediaBytes)) > maxBytes {
		return "", errors.New("generated media exceeds cache size limit")
	}

	root := playgroundMediaCacheRoot()
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", errors.New("failed to create media cache directory")
	}

	sum := sha256.Sum256([]byte(fmt.Sprintf("%d:%s:%s", time.Now().UnixNano(), contentType, c.GetString(common.RequestIdKey))))
	name := fmt.Sprintf("%x%s", sum[:12], ext)
	fullPath := filepath.Join(root, name)
	if err := os.WriteFile(fullPath, mediaBytes, 0o644); err != nil {
		return "", errors.New("failed to save generated media")
	}

	return playgroundMediaURLPrefix() + "/" + name, nil
}

func decodePlaygroundDataURL(raw string) (string, []byte, error) {
	raw = strings.TrimSpace(raw)
	comma := strings.Index(raw, ",")
	if comma <= 5 {
		return "", nil, errors.New("invalid media data url")
	}
	meta := raw[:comma]
	payload := raw[comma+1:]
	if !strings.HasPrefix(strings.ToLower(meta), "data:") || !strings.Contains(strings.ToLower(meta), ";base64") {
		return "", nil, errors.New("only base64 media data urls can be cached")
	}
	contentType := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.Split(meta, ";")[0], "data:")))
	if playgroundMediaExtensions[contentType] == "" {
		return "", nil, errors.New("unsupported media content type")
	}
	mediaBytes, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return "", nil, errors.New("invalid base64 media data")
	}
	if len(mediaBytes) == 0 {
		return "", nil, errors.New("empty media data")
	}
	return contentType, mediaBytes, nil
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
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			if err := os.Remove(filepath.Join(root, entry.Name())); err == nil {
				removed++
			}
		}
	}
	return removed, nil
}

func playgroundMediaRetentionDuration() time.Duration {
	minutes := common.GetEnvOrDefault("PLAYGROUND_MEDIA_KEEP_MINUTES", int(playgroundMediaRetention/time.Minute))
	if minutes <= 0 {
		return playgroundMediaRetention
	}
	return time.Duration(minutes) * time.Minute
}
