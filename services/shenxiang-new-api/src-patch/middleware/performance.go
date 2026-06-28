package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// SystemPerformanceCheck checks system pressure before handling user-facing routes.
func SystemPerformanceCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		skipCPUCheck := shouldSkipCPUOverloadCheck(path)
		if err := checkSystemPerformance(skipCPUCheck); err != nil {
			if strings.HasPrefix(path, "/v1/messages") {
				c.JSON(err.StatusCode, gin.H{
					"error": err.ToPublicClaudeError(c.GetString(common.RequestIdKey)),
				})
			} else {
				c.JSON(err.StatusCode, gin.H{
					"error": err.ToPublicOpenAIError(c.GetString(common.RequestIdKey)),
				})
			}
			c.Abort()
			return
		}
		c.Next()
	}
}

func shouldSkipCPUOverloadCheck(path string) bool {
	return path == "/v1" ||
		strings.HasPrefix(path, "/v1/") ||
		path == "/v1beta" ||
		strings.HasPrefix(path, "/v1beta/")
}

// checkSystemPerformance checks whether system pressure exceeds configured thresholds.
func checkSystemPerformance(skipCPUCheck bool) *types.NewAPIError {
	config := common.GetPerformanceMonitorConfig()
	if !config.Enabled {
		return nil
	}

	status := common.GetSystemStatus()

	// Core API relay traffic should not be rejected by a single host CPU sample.
	// User and model rate limits still apply, while memory/disk protection remains active.
	if !skipCPUCheck && config.CPUThreshold > 0 && int(status.CPUUsage) > config.CPUThreshold {
		return types.NewErrorWithStatusCode(
			fmt.Errorf("system cpu overloaded (current: %.1f%%, threshold: %d%%)", status.CPUUsage, config.CPUThreshold),
			"system_cpu_overloaded", http.StatusServiceUnavailable)
	}

	if config.MemoryThreshold > 0 && int(status.MemoryUsage) > config.MemoryThreshold {
		return types.NewErrorWithStatusCode(
			fmt.Errorf("system memory overloaded (current: %.1f%%, threshold: %d%%)", status.MemoryUsage, config.MemoryThreshold),
			"system_memory_overloaded", http.StatusServiceUnavailable)
	}

	if config.DiskThreshold > 0 && int(status.DiskUsage) > config.DiskThreshold {
		return types.NewErrorWithStatusCode(
			fmt.Errorf("system disk overloaded (current: %.1f%%, threshold: %d%%)", status.DiskUsage, config.DiskThreshold),
			"system_disk_overloaded", http.StatusServiceUnavailable)
	}

	return nil
}
