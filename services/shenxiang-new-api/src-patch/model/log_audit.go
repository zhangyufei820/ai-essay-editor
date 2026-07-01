package model

import (
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

func BuildRequestAuditOther(c *gin.Context, other map[string]interface{}) map[string]interface{} {
	if other == nil {
		other = map[string]interface{}{}
	}
	adminInfo, _ := other["admin_info"].(map[string]interface{})
	if adminInfo == nil {
		adminInfo = map[string]interface{}{}
	}
	if requestId := strings.TrimSpace(contextRequestValue(c, common.RequestIdKey)); requestId != "" {
		adminInfo["request_id"] = requestId
	}
	if upstreamRequestId := strings.TrimSpace(contextRequestValue(c, common.UpstreamRequestIdKey)); upstreamRequestId != "" {
		adminInfo["upstream_request_id"] = upstreamRequestId
	}
	if clientIP := ResolveAuditClientIP(c); clientIP != "" {
		adminInfo["client_ip"] = clientIP
	}
	if len(adminInfo) > 0 {
		other["admin_info"] = adminInfo
	}
	return other
}

func ResolveAuditClientIP(c *gin.Context) string {
	if c == nil {
		return ""
	}
	// Allow operators to declare which header carries the real client IP,
	// matching the actual proxy topology (e.g. CF-Connecting-IP for Cloudflare,
	// X-Real-IP for nginx, empty to use RemoteAddr directly).
	trustedHeader := strings.TrimSpace(os.Getenv("TRUSTED_IP_HEADER"))
	if trustedHeader != "" {
		if value := strings.TrimSpace(c.GetHeader(trustedHeader)); value != "" {
			if comma := strings.Index(value, ","); comma >= 0 {
				value = strings.TrimSpace(value[:comma])
			}
			if value != "" {
				return value
			}
		}
	}
	return c.ClientIP()
}

func RecordOperationAuditLog(userId int, content string, ip string, action string, params map[string]interface{}, adminInfo map[string]interface{}, auditInfo map[string]interface{}) {
	if LOG_DB == nil {
		return
	}
	if params == nil {
		params = map[string]interface{}{}
	}
	other := map[string]interface{}{
		"operation_action": action,
		"operation_params": params,
	}
	if len(adminInfo) > 0 {
		other["admin_info"] = adminInfo
	}
	if len(auditInfo) > 0 {
		other["audit_info"] = auditInfo
	}

	gopool.Go(func() {
		username, _ := GetUsernameById(userId, false)
		log := &Log{
			UserId:    userId,
			Username:  username,
			CreatedAt: common.GetTimestamp(),
			Type:      LogTypeManage,
			Content:   content,
			Ip:        ip,
			Other:     common.MapToJsonStr(other),
		}
		if err := LOG_DB.Create(log).Error; err != nil {
			common.SysLog("failed to record operation audit log: " + err.Error())
		}
	})
}

func contextRequestValue(c *gin.Context, key string) string {
	if c == nil {
		return ""
	}
	if value := c.GetString(key); value != "" {
		return value
	}
	if c.Request != nil {
		if value := c.Request.Header.Get(key); value != "" {
			return value
		}
	}
	return ""
}
