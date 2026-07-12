package common

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var PlaygroundMediaCacheMu sync.Mutex

var (
	ErrPlaygroundImageTaskRequestTooLarge      = errors.New("playground image task request is too large")
	ErrPlaygroundImageTaskPendingLimitExceeded = errors.New("playground image task pending limit exceeded")
	ErrPlaygroundImageTaskUserQuotaExceeded    = errors.New("playground image task user storage quota exceeded")
	ErrPlaygroundImageTaskTotalQuotaExceeded   = errors.New("playground image task total storage quota exceeded")
)

const (
	playgroundMediaMaxUserQuotaMB          = 10 * 1024
	playgroundMediaMaxTotalQuotaMB         = 100 * 1024
	playgroundMediaMaxFilesPerUserLimit    = 10_000
	playgroundImageTaskDefaultRequestMaxMB = 32
	playgroundImageTaskMaxRequestMaxMB     = 256
	playgroundImageTaskDefaultPendingLimit = 32
	playgroundImageTaskMaxPendingLimit     = 128
)

func PlaygroundMediaCacheUsage(root string, countMediaFiles bool) (int64, int, error) {
	var totalBytes int64
	mediaFiles := 0
	err := filepath.WalkDir(root, func(_ string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 || strings.HasPrefix(entry.Name(), ".playground-media-") {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		totalBytes += info.Size()
		if countMediaFiles && !strings.HasSuffix(entry.Name(), ".json") {
			mediaFiles++
		}
		return nil
	})
	if os.IsNotExist(err) {
		return 0, 0, nil
	}
	return totalBytes, mediaFiles, err
}

func PlaygroundMediaUserMaxBytes() int64 {
	return playgroundMediaQuotaBytes("PLAYGROUND_MEDIA_USER_MAX_MB", 2048, playgroundMediaMaxUserQuotaMB)
}

func PlaygroundMediaTotalMaxBytes() int64 {
	return playgroundMediaQuotaBytes("PLAYGROUND_MEDIA_TOTAL_MAX_MB", 20*1024, playgroundMediaMaxTotalQuotaMB)
}

func PlaygroundMediaMaxFilesPerUser() int {
	maxFiles := GetEnvOrDefault("PLAYGROUND_MEDIA_MAX_FILES_PER_USER", 200)
	if maxFiles < 1 {
		return 200
	}
	if maxFiles > playgroundMediaMaxFilesPerUserLimit {
		return playgroundMediaMaxFilesPerUserLimit
	}
	return maxFiles
}

func PlaygroundImageTaskRequestMaxBytes() int64 {
	megabytes := GetEnvOrDefault("PLAYGROUND_IMAGE_TASK_REQUEST_MAX_MB", playgroundImageTaskDefaultRequestMaxMB)
	if megabytes < 1 {
		megabytes = playgroundImageTaskDefaultRequestMaxMB
	}
	if megabytes > playgroundImageTaskMaxRequestMaxMB {
		megabytes = playgroundImageTaskMaxRequestMaxMB
	}
	return int64(megabytes) * 1024 * 1024
}

func PlaygroundImageTaskMaxPendingPerUser() int {
	limit := GetEnvOrDefault("PLAYGROUND_IMAGE_TASK_MAX_PENDING_PER_USER", playgroundImageTaskDefaultPendingLimit)
	if limit < 1 {
		limit = playgroundImageTaskDefaultPendingLimit
	}
	if limit > playgroundImageTaskMaxPendingLimit {
		limit = playgroundImageTaskMaxPendingLimit
	}
	return limit
}

func PlaygroundImageTaskRequestUsage(root string) (int64, int, error) {
	var totalBytes int64
	requestFiles := 0
	err := filepath.WalkDir(root, func(_ string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		isTemp := strings.HasPrefix(entry.Name(), ".playground-image-task-")
		if !isTemp && !strings.HasSuffix(entry.Name(), ".body") {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		totalBytes += info.Size()
		if !isTemp {
			requestFiles++
		}
		return nil
	})
	if os.IsNotExist(err) {
		return 0, 0, nil
	}
	return totalBytes, requestFiles, err
}

func playgroundMediaQuotaBytes(envName string, defaultMB int, maxMB int) int64 {
	megabytes := GetEnvOrDefault(envName, defaultMB)
	if megabytes < 1 {
		megabytes = defaultMB
	}
	if megabytes > maxMB {
		megabytes = maxMB
	}
	return int64(megabytes) * 1024 * 1024
}
