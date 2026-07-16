package model

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"

	"github.com/bytedance/gopkg/util/gopool"
	"gorm.io/gorm"
)

func applyExplicitLogTextFilter(tx *gorm.DB, column string, value string) (*gorm.DB, error) {
	if value == "" {
		return tx, nil
	}
	if strings.Contains(value, "%") {
		pattern, err := sanitizeLikePattern(value)
		if err != nil {
			return nil, err
		}
		return tx.Where(column+" LIKE ? ESCAPE '!'", pattern), nil
	}
	return tx.Where(column+" = ?", value), nil
}

type Log struct {
	Id                int    `json:"id" gorm:"index:idx_created_at_id,priority:2;index:idx_user_id_id,priority:2"`
	UserId            int    `json:"user_id" gorm:"index;index:idx_user_id_id,priority:1"`
	CreatedAt         int64  `json:"created_at" gorm:"bigint;index:idx_created_at_id,priority:1;index:idx_created_at_type"`
	Type              int    `json:"type" gorm:"index:idx_created_at_type"`
	Content           string `json:"content"`
	Username          string `json:"username" gorm:"index;index:index_username_model_name,priority:2;default:''"`
	TokenName         string `json:"token_name" gorm:"index;default:''"`
	ModelName         string `json:"model_name" gorm:"index;index:index_username_model_name,priority:1;default:''"`
	Quota             int    `json:"quota" gorm:"default:0"`
	PromptTokens      int    `json:"prompt_tokens" gorm:"default:0"`
	CompletionTokens  int    `json:"completion_tokens" gorm:"default:0"`
	UseTime           int    `json:"use_time" gorm:"default:0"`
	IsStream          bool   `json:"is_stream"`
	ChannelId         int    `json:"channel" gorm:"index"`
	ChannelName       string `json:"channel_name" gorm:"->"`
	TokenId           int    `json:"token_id" gorm:"default:0;index"`
	Group             string `json:"group" gorm:"index"`
	Ip                string `json:"ip" gorm:"index;default:''"`
	RequestId         string `json:"request_id,omitempty" gorm:"type:varchar(64);index:idx_logs_request_id;default:''"`
	UpstreamRequestId string `json:"upstream_request_id,omitempty" gorm:"type:varchar(128);index:idx_logs_upstream_request_id;default:''"`
	Other             string `json:"other"`
}

// don't use iota, avoid change log type value
const (
	LogTypeUnknown = 0
	LogTypeTopup   = 1
	LogTypeConsume = 2
	LogTypeManage  = 3
	LogTypeSystem  = 4
	LogTypeError   = 5
	LogTypeRefund  = 6
	LogTypeLogin   = 7
)

func formatUserLogs(logs []*Log, startIdx int) {
	for i := range logs {
		logs[i].ChannelName = ""
		logs[i].ChannelId = 0
		logs[i].UpstreamRequestId = ""
		if types.ContainsProviderDisclosure(strings.ToLower(logs[i].Content)) {
			logs[i].Content = "模型服务暂时不可用，请稍后重试。"
		}
		var otherMap map[string]interface{}
		otherMap, _ = common.StrToMap(logs[i].Other)
		if otherMap != nil {
			sanitizeUserLogMetadata(otherMap)
		}
		logs[i].Other = common.MapToJsonStr(otherMap)
		logs[i].Id = startIdx + i + 1
	}
}

func sanitizeUserLogMetadata(metadata map[string]interface{}) {
	for key, value := range metadata {
		normalized := strings.ToLower(strings.TrimSpace(key))
		if normalized == "admin_info" || normalized == "stream_status" || normalized == "channel_id" ||
			normalized == "result_url" || normalized == "raw_response" || strings.Contains(normalized, "upstream") ||
			strings.Contains(normalized, "provider") || strings.Contains(normalized, "supplier") || strings.Contains(normalized, "channel") {
			delete(metadata, key)
			continue
		}
		switch typed := value.(type) {
		case map[string]interface{}:
			sanitizeUserLogMetadata(typed)
		case []interface{}:
			for _, child := range typed {
				if childMap, ok := child.(map[string]interface{}); ok {
					sanitizeUserLogMetadata(childMap)
				}
			}
		case string:
			if types.ContainsProviderDisclosure(strings.ToLower(typed)) {
				metadata[key] = "模型服务暂时不可用，请稍后重试。"
			}
		}
	}
}

func GetLogByTokenId(tokenId int) (logs []*Log, err error) {
	err = LOG_DB.Model(&Log{}).Where("token_id = ?", tokenId).Order("id desc").Limit(common.MaxRecentItems).Find(&logs).Error
	formatUserLogs(logs, 0)
	return logs, err
}

func RecordLog(userId int, logType int, content string) {
	if logType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(userId, false)
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      logType,
		Content:   content,
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		common.SysLog("failed to record log: " + err.Error())
	}
}

func RecordLoginLog(userId int, username string, content string, ip string, action string, params map[string]interface{}, extra map[string]interface{}) {
	other := map[string]interface{}{}
	for key, value := range extra {
		other[key] = value
	}
	other["op"] = map[string]interface{}{
		"action": action,
		"params": params,
	}
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      LogTypeLogin,
		Content:   content,
		Ip:        ip,
		Other:     common.MapToJsonStr(other),
	}
	if err := LOG_DB.Create(log).Error; err != nil {
		common.SysLog("failed to record login log: " + err.Error())
	}
}

// RecordLogWithAdminInfo 记录操作日志，并将管理员相关信息存入 Other.admin_info，
func RecordLogWithAdminInfo(userId int, logType int, content string, adminInfo map[string]interface{}) {
	if logType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(userId, false)
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      logType,
		Content:   content,
	}
	if len(adminInfo) > 0 {
		other := map[string]interface{}{
			"admin_info": adminInfo,
		}
		log.Other = common.MapToJsonStr(other)
	}
	if err := LOG_DB.Create(log).Error; err != nil {
		common.SysLog("failed to record log: " + err.Error())
	}
}

func RecordTopupLog(userId int, content string, callerIp string, paymentMethod string, callbackPaymentMethod string) {
	username, _ := GetUsernameById(userId, false)
	adminInfo := map[string]interface{}{
		"server_ip":               common.GetIp(),
		"node_name":               common.NodeName,
		"caller_ip":               callerIp,
		"payment_method":          paymentMethod,
		"callback_payment_method": callbackPaymentMethod,
		"version":                 common.Version,
	}
	other := map[string]interface{}{
		"admin_info": adminInfo,
	}
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      LogTypeTopup,
		Content:   content,
		Ip:        callerIp,
		Other:     common.MapToJsonStr(other),
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		common.SysLog("failed to record topup log: " + err.Error())
	}
}

func RecordErrorLog(c *gin.Context, userId int, channelId int, modelName string, tokenName string, content string, tokenId int, useTimeSeconds int,
	isStream bool, group string, other map[string]interface{}) {
	logger.LogInfo(c, fmt.Sprintf("record error log: userId=%d, channelId=%d, modelName=%s, tokenName=%s, content=%s", userId, channelId, modelName, tokenName, common.LocalLogPreview(content)))
	username := c.GetString("username")
	requestId := c.GetString(common.RequestIdKey)
	upstreamRequestId := c.GetString(common.UpstreamRequestIdKey)
	other = BuildRequestAuditOther(c, other)
	otherStr := common.MapToJsonStr(other)
	log := &Log{
		UserId:            userId,
		Username:          username,
		CreatedAt:         common.GetTimestamp(),
		Type:              LogTypeError,
		Content:           content,
		PromptTokens:      0,
		CompletionTokens:  0,
		TokenName:         tokenName,
		ModelName:         modelName,
		Quota:             0,
		ChannelId:         channelId,
		TokenId:           tokenId,
		UseTime:           useTimeSeconds,
		IsStream:          isStream,
		Group:             group,
		Ip:                ResolveAuditClientIP(c),
		RequestId:         requestId,
		UpstreamRequestId: upstreamRequestId,
		Other:             otherStr,
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		logger.LogError(c, "failed to record log: "+err.Error())
	}
}

type RecordTaskBillingLogParams struct {
	UserId    int                    `json:"user_id"`
	LogType   int                    `json:"log_type"`
	Content   string                 `json:"content"`
	ChannelId int                    `json:"channel_id"`
	ModelName string                 `json:"model_name"`
	Quota     int                    `json:"quota"`
	TokenId   int                    `json:"token_id"`
	Group     string                 `json:"group"`
	Other     map[string]interface{} `json:"other"`
}

func RecordTaskBillingLog(params RecordTaskBillingLogParams) {
	if params.LogType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(params.UserId, false)
	log := &Log{
		UserId:    params.UserId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      params.LogType,
		Content:   params.Content,
		TokenName: "task",
		ModelName: params.ModelName,
		Quota:     params.Quota,
		ChannelId: params.ChannelId,
		TokenId:   params.TokenId,
		UseTime:   0,
		IsStream:  false,
		Group:     params.Group,
		RequestId: "",
		Other:     common.MapToJsonStr(params.Other),
	}
	if err := LOG_DB.Create(log).Error; err != nil {
		common.SysLog("failed to record task billing log: " + err.Error())
	}
}

type RecordConsumeLogParams struct {
	ChannelId        int                    `json:"channel_id"`
	PromptTokens     int                    `json:"prompt_tokens"`
	CompletionTokens int                    `json:"completion_tokens"`
	ModelName        string                 `json:"model_name"`
	TokenName        string                 `json:"token_name"`
	Quota            int                    `json:"quota"`
	Content          string                 `json:"content"`
	TokenId          int                    `json:"token_id"`
	UseTimeSeconds   int                    `json:"use_time_seconds"`
	IsStream         bool                   `json:"is_stream"`
	Group            string                 `json:"group"`
	Other            map[string]interface{} `json:"other"`
}

func newConsumeLog(c *gin.Context, userId int, params RecordConsumeLogParams) *Log {
	var username string
	var requestId string
	var upstreamRequestId string
	if c != nil {
		username = c.GetString("username")
		requestId = c.GetString(common.RequestIdKey)
		upstreamRequestId = c.GetString(common.UpstreamRequestIdKey)
	}
	if username == "" {
		username, _ = GetUsernameById(userId, false)
	}
	params.Other = BuildRequestAuditOther(c, params.Other)
	otherStr := common.MapToJsonStr(params.Other)
	return &Log{
		UserId:            userId,
		Username:          username,
		CreatedAt:         common.GetTimestamp(),
		Type:              LogTypeConsume,
		Content:           params.Content,
		PromptTokens:      params.PromptTokens,
		CompletionTokens:  params.CompletionTokens,
		TokenName:         params.TokenName,
		ModelName:         params.ModelName,
		Quota:             params.Quota,
		ChannelId:         params.ChannelId,
		TokenId:           params.TokenId,
		UseTime:           params.UseTimeSeconds,
		IsStream:          params.IsStream,
		Group:             params.Group,
		Ip:                ResolveAuditClientIP(c),
		RequestId:         requestId,
		UpstreamRequestId: upstreamRequestId,
		Other:             otherStr,
	}
}

func afterConsumeLogRecorded(userId int, username string, params RecordConsumeLogParams) {
	if common.DataExportEnabled {
		gopool.Go(func() {
			LogQuotaData(QuotaDataLogParams{
				UserID:    userId,
				Username:  username,
				ModelName: params.ModelName,
				Quota:     params.Quota,
				CreatedAt: common.GetTimestamp(),
				TokenUsed: params.PromptTokens + params.CompletionTokens,
				UseGroup:  params.Group,
				TokenID:   params.TokenId,
				ChannelID: params.ChannelId,
				NodeName:  common.NodeName,
			})
		})
	}
}

func updatePendingPlaygroundImageConsumeLog(tx *gorm.DB, c *gin.Context, userId int, log *Log, params RecordConsumeLogParams) (bool, error) {
	if tx == nil || c == nil || log == nil || !c.GetBool("playground_image_async_worker") {
		return false, nil
	}
	requestId := strings.TrimSpace(log.RequestId)
	if requestId == "" {
		return false, nil
	}
	taskID := strings.TrimSpace(c.GetString("playground_image_task_id"))
	if taskID == "" && c.Request != nil {
		taskID = strings.TrimSpace(c.Request.Header.Get("X-Playground-Image-Async-Task"))
	}
	if taskID == "" {
		return false, nil
	}

	var candidates []*Log
	if err := tx.Where("user_id = ? AND request_id = ? AND type = ?", userId, requestId, LogTypeConsume).
		Order("id asc").
		Limit(8).
		Find(&candidates).Error; err != nil {
		return false, err
	}

	var target *Log
	targetOther := map[string]interface{}{}
	for _, candidate := range candidates {
		if candidate == nil {
			continue
		}
		other, _ := common.StrToMap(candidate.Other)
		if other == nil {
			other = map[string]interface{}{}
		}
		candidateTaskID := strings.TrimSpace(fmt.Sprint(other["task_id"]))
		isPlaygroundTask := fmt.Sprint(other["playground_image_task"]) == "true"
		phase := strings.TrimSpace(fmt.Sprint(other["request_phase"]))
		if candidateTaskID == taskID || (isPlaygroundTask && (phase == "submitted" || phase == "completed" || phase == "")) {
			target = candidate
			targetOther = other
			break
		}
	}
	if target == nil {
		return false, nil
	}

	completedOther, _ := common.StrToMap(log.Other)
	if completedOther != nil {
		for key, value := range completedOther {
			targetOther[key] = value
		}
	}
	targetOther["task_id"] = taskID
	targetOther["request_id"] = requestId
	targetOther["request_phase"] = "completed"
	targetOther["task_status"] = "SUCCESS"
	targetOther["playground_image_task"] = true
	targetOther["async"] = true
	targetOther["actual_quota"] = params.Quota
	targetOther["channel_id"] = params.ChannelId
	targetOther["use_time"] = params.UseTimeSeconds
	targetOther["finish_time"] = common.GetTimestamp()

	updates := map[string]interface{}{
		"content":             log.Content,
		"prompt_tokens":       log.PromptTokens,
		"completion_tokens":   log.CompletionTokens,
		"token_name":          log.TokenName,
		"model_name":          log.ModelName,
		"quota":               log.Quota,
		"channel_id":          log.ChannelId,
		"token_id":            log.TokenId,
		"use_time":            log.UseTime,
		"is_stream":           log.IsStream,
		"group":               log.Group,
		"ip":                  log.Ip,
		"upstream_request_id": log.UpstreamRequestId,
		"other":               common.MapToJsonStr(targetOther),
	}
	result := tx.Model(&Log{}).Where("id = ?", target.Id).Updates(updates)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

func UpdatePlaygroundImageTaskConsumeLogResult(userId int, requestId string, taskID string, resultURL string, finishTime int64, status string, extra map[string]interface{}) error {
	if LOG_DB == nil {
		return nil
	}
	requestId = strings.TrimSpace(requestId)
	taskID = strings.TrimSpace(taskID)
	resultURL = strings.TrimSpace(resultURL)
	if userId <= 0 || requestId == "" || taskID == "" {
		return nil
	}
	var candidates []*Log
	if err := LOG_DB.Where("user_id = ? AND request_id = ? AND type = ?", userId, requestId, LogTypeConsume).
		Order("id asc").
		Limit(8).
		Find(&candidates).Error; err != nil {
		return err
	}

	var matched *Log
	for _, candidate := range candidates {
		if candidate == nil {
			continue
		}
		other, _ := common.StrToMap(candidate.Other)
		if other == nil {
			other = map[string]interface{}{}
		}
		if fmt.Sprint(other["playground_image_completion_log"]) == "true" {
			continue
		}
		candidateTaskID := strings.TrimSpace(fmt.Sprint(other["task_id"]))
		isPlaygroundTask := fmt.Sprint(other["playground_image_task"]) == "true"
		if candidateTaskID != taskID && !isPlaygroundTask {
			continue
		}
		matched = candidate
		if extra != nil {
			for key, value := range extra {
				other[key] = value
			}
		}
		other["task_id"] = taskID
		other["request_id"] = requestId
		other["request_phase"] = "completed"
		if status != "" {
			other["task_status"] = status
		}
		other["playground_image_task"] = true
		other["media_kind"] = "image"
		other["async"] = true
		if resultURL != "" {
			other["result_url"] = resultURL
			other["image_url"] = resultURL
			other["cached_url"] = resultURL
		}
		if finishTime > 0 {
			other["finish_time"] = finishTime
		}
		if err := LOG_DB.Model(&Log{}).Where("id = ?", candidate.Id).Updates(map[string]interface{}{
			"other": common.MapToJsonStr(other),
		}).Error; err != nil {
			return err
		}
		break
	}
	if matched == nil {
		return createPlaygroundImageTaskResultLog(userId, requestId, taskID, resultURL, finishTime, status, extra)
	}
	if err := createPlaygroundImageCompletionReceiptLog(userId, matched, requestId, taskID, resultURL, finishTime, status, extra); err != nil {
		return err
	}
	return nil
}

func playgroundImageCompletionLogExists(userId int, taskID string, requestID string) (bool, error) {
	if LOG_DB == nil || userId <= 0 || taskID == "" || requestID == "" {
		return false, nil
	}
	query := LOG_DB.Where("user_id = ? AND type = ?", userId, LogTypeConsume).
		Where("other LIKE ? ESCAPE '!'", logContainsPattern("playground_image_completion_log")).
		Where("(other LIKE ? ESCAPE '!' OR other LIKE ? ESCAPE '!')", logContainsPattern(taskID), logContainsPattern(requestID))
	var candidates []*Log
	if err := query.Order("id desc").Limit(32).Find(&candidates).Error; err != nil {
		return false, err
	}
	for _, candidate := range candidates {
		if candidate == nil {
			continue
		}
		other, _ := common.StrToMap(candidate.Other)
		if other == nil || fmt.Sprint(other["playground_image_completion_log"]) != "true" {
			continue
		}
		candidateTaskID := strings.TrimSpace(fmt.Sprint(other["task_id"]))
		candidateRequestID := strings.TrimSpace(fmt.Sprint(other["request_id"]))
		if candidateTaskID == taskID || candidateRequestID == requestID {
			return true, nil
		}
	}
	return false, nil
}

func createPlaygroundImageCompletionReceiptLog(userId int, source *Log, requestID string, taskID string, resultURL string, finishTime int64, status string, extra map[string]interface{}) error {
	if LOG_DB == nil || userId <= 0 || requestID == "" || taskID == "" {
		return nil
	}
	exists, err := playgroundImageCompletionLogExists(userId, taskID, requestID)
	if err != nil || exists {
		return err
	}
	return createPlaygroundImageResultLog(userId, source, requestID, taskID, resultURL, finishTime, status, extra, true)
}

func createPlaygroundImageTaskResultLog(userId int, requestID string, taskID string, resultURL string, finishTime int64, status string, extra map[string]interface{}) error {
	exists, err := playgroundImageCompletionLogExists(userId, taskID, requestID)
	if err != nil || exists {
		return err
	}
	return createPlaygroundImageResultLog(userId, nil, requestID, taskID, resultURL, finishTime, status, extra, false)
}

func createPlaygroundImageResultLog(userId int, source *Log, requestID string, taskID string, resultURL string, finishTime int64, status string, extra map[string]interface{}, receipt bool) error {
	if LOG_DB == nil || userId <= 0 || requestID == "" || taskID == "" {
		return nil
	}
	other := map[string]interface{}{}
	if extra != nil {
		for key, value := range extra {
			other[key] = value
		}
	}
	other["task_id"] = taskID
	other["request_id"] = requestID
	other["request_phase"] = "completed"
	if status != "" {
		other["task_status"] = status
	} else {
		other["task_status"] = "SUCCESS"
	}
	other["playground_image_task"] = true
	other["media_kind"] = "image"
	other["async"] = true
	if receipt {
		other["playground_image_completion_log"] = true
		other["completion_log_kind"] = "receipt"
		if source != nil {
			other["source_log_id"] = source.Id
			other["original_quota"] = source.Quota
		} else if actualQuota := intFromLogOther(other["actual_quota"]); actualQuota > 0 {
			other["original_quota"] = actualQuota
		}
		other["receipt_quota"] = 0
	} else {
		other["playground_image_completion_log"] = true
		other["completion_log_kind"] = "standalone"
		if actualQuota := intFromLogOther(other["actual_quota"]); actualQuota > 0 {
			other["original_quota"] = actualQuota
			other["receipt_quota"] = 0
		}
	}
	if resultURL != "" {
		other["result_url"] = resultURL
		other["image_url"] = resultURL
		other["cached_url"] = resultURL
	}
	if finishTime > 0 {
		other["finish_time"] = finishTime
	}

	username := ""
	if source != nil {
		username = source.Username
	}
	if username == "" {
		username, _ = GetUsernameById(userId, false)
	}
	createdAt := common.GetTimestamp()
	if finishTime > 0 {
		createdAt = finishTime
	}
	sourceTokenName := ""
	sourceModelName := ""
	sourceChannelID := 0
	sourceTokenID := 0
	sourceGroup := ""
	sourceIP := ""
	sourceRequestID := ""
	sourceUpstreamRequestID := ""
	if source != nil {
		sourceTokenName = source.TokenName
		sourceModelName = source.ModelName
		sourceChannelID = source.ChannelId
		sourceTokenID = source.TokenId
		sourceGroup = source.Group
		sourceIP = source.Ip
		sourceRequestID = source.RequestId
		sourceUpstreamRequestID = source.UpstreamRequestId
	}
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: createdAt,
		Type:      LogTypeConsume,
		Content:   "媒体工坊图片任务完成",
		TokenName: firstNonEmptyLogString(
			sourceTokenName,
			logOtherString(other["token_name"]),
			"playground",
		),
		ModelName: firstNonEmptyLogString(sourceModelName, logOtherString(other["model_name"])),
		Quota:     0,
		ChannelId: firstNonZeroLogInt(sourceChannelID, intFromLogOther(other["channel_id"])),
		TokenId:   firstNonZeroLogInt(sourceTokenID, intFromLogOther(other["token_id"])),
		UseTime:   intFromLogOther(other["use_time"]),
		IsStream:  false,
		Group:     firstNonEmptyLogString(sourceGroup, logOtherString(other["group"])),
		Ip: func() string {
			if strings.TrimSpace(sourceIP) != "" {
				return sourceIP
			}
			return logOtherString(other["ip"])
		}(),
		RequestId: firstNonEmptyLogString(sourceRequestID, requestID),
		UpstreamRequestId: func() string {
			if strings.TrimSpace(sourceUpstreamRequestID) != "" {
				return sourceUpstreamRequestID
			}
			return logOtherString(other["upstream_request_id"])
		}(),
		Other: common.MapToJsonStr(other),
	}
	if log.TokenName == "" {
		log.TokenName = "playground"
	}
	return LOG_DB.Create(log).Error
}

func intFromLogOther(value interface{}) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		var parsed int
		if n, err := fmt.Sscanf(fmt.Sprint(value), "%d", &parsed); err == nil && n == 1 {
			return parsed
		}
		return 0
	}
}

func logOtherString(value interface{}) string {
	if value == nil {
		return ""
	}
	valueStr := strings.TrimSpace(fmt.Sprint(value))
	if valueStr == "" || valueStr == "<nil>" {
		return ""
	}
	return valueStr
}

func logContainsPattern(value string) string {
	value = strings.ReplaceAll(value, "!", "!!")
	value = strings.ReplaceAll(value, "%", "!%")
	value = strings.ReplaceAll(value, "_", "!_")
	return "%" + value + "%"
}

func UpdatePlaygroundVideoTaskConsumeLogResult(userId int, taskID string, resultURL string, finishTime int64, status string, extra map[string]interface{}) error {
	if LOG_DB == nil {
		return nil
	}
	taskID = strings.TrimSpace(taskID)
	resultURL = strings.TrimSpace(resultURL)
	if userId <= 0 || taskID == "" {
		return nil
	}
	upstreamTaskID := ""
	if extra != nil {
		upstreamTaskID = strings.TrimSpace(fmt.Sprint(extra["upstream_task_id"]))
	}
	isFailure := strings.EqualFold(status, "FAILURE") || strings.EqualFold(status, "failed")
	logTypes := []int{LogTypeConsume}
	if isFailure {
		logTypes = []int{LogTypeConsume, LogTypeError}
	}
	var candidates []*Log
	query := LOG_DB.Where("user_id = ? AND type IN ?", userId, logTypes)
	taskPattern := logContainsPattern(taskID)
	if upstreamTaskID != "" {
		upstreamPattern := logContainsPattern(upstreamTaskID)
		query = query.Where(
			"(other LIKE ? ESCAPE '!' OR content LIKE ? ESCAPE '!' OR other LIKE ? ESCAPE '!' OR content LIKE ? ESCAPE '!')",
			taskPattern,
			taskPattern,
			upstreamPattern,
			upstreamPattern,
		)
	} else {
		query = query.Where("(other LIKE ? ESCAPE '!' OR content LIKE ? ESCAPE '!')", taskPattern, taskPattern)
	}
	if err := query.
		Order("id desc").
		Limit(64).
		Find(&candidates).Error; err != nil {
		return err
	}
	for _, candidate := range candidates {
		if candidate == nil {
			continue
		}
		other, _ := common.StrToMap(candidate.Other)
		if other == nil {
			other = map[string]interface{}{}
		}
		if fmt.Sprint(other["playground_video_completion_log"]) == "true" {
			continue
		}
		candidateTaskID := strings.TrimSpace(fmt.Sprint(other["task_id"]))
		candidateUpstreamTaskID := strings.TrimSpace(fmt.Sprint(other["upstream_task_id"]))
		requestPath := strings.TrimSpace(fmt.Sprint(other["request_path"]))
		mediaKind := strings.TrimSpace(fmt.Sprint(other["media_kind"]))
		isPlaygroundTask := fmt.Sprint(other["playground_video_task"]) == "true"
		isVideoTask := isPlaygroundTask || mediaKind == "video" || requestPath == "/v1/videos" || requestPath == "/v1/video/generations" || requestPath == "/pg/videos" || requestPath == "/pg/video/generations"
		taskMatches := candidateTaskID == taskID || (upstreamTaskID != "" && candidateUpstreamTaskID == upstreamTaskID)
		if !taskMatches || !isVideoTask {
			continue
		}
		if extra != nil {
			for key, value := range extra {
				other[key] = value
			}
		}
		other["task_id"] = taskID
		if upstreamTaskID != "" {
			other["upstream_task_id"] = upstreamTaskID
		}
		other["request_phase"] = "completed"
		if status != "" {
			other["task_status"] = status
		}
		other["playground_video_task"] = true
		other["media_kind"] = "video"
		other["async"] = true
		if resultURL != "" {
			other["result_url"] = resultURL
			other["video_url"] = resultURL
			other["cached_url"] = resultURL
		}
		if finishTime > 0 {
			other["finish_time"] = finishTime
		}
		updates := map[string]interface{}{
			"other": common.MapToJsonStr(other),
		}
		if isFailure {
			reason := strings.TrimSpace(fmt.Sprint(other["fail_reason"]))
			content := "媒体工坊视频任务失败"
			if reason != "" {
				content += "，" + reason
			}
			useTime := 0
			if value, ok := other["use_time"]; ok {
				useTime = intFromLogOther(value)
			}
			other["request_phase"] = "failed"
			other["task_status"] = "FAILURE"
			other["final_log_type"] = "error"
			other["failure_kind"] = "media_task_failed"
			updates["type"] = LogTypeError
			updates["quota"] = 0
			updates["content"] = content
			updates["use_time"] = useTime
			updates["other"] = common.MapToJsonStr(other)
		}
		if err := LOG_DB.Model(&Log{}).Where("id = ?", candidate.Id).Updates(updates).Error; err != nil {
			return err
		}
		if !isFailure {
			if err := createPlaygroundVideoCompletionReceiptLog(userId, candidate, taskID, upstreamTaskID, resultURL, finishTime, status, other); err != nil {
				return err
			}
		}
		return nil
	}
	return createPlaygroundVideoTaskResultLog(userId, taskID, upstreamTaskID, resultURL, finishTime, status, extra)
}

func playgroundVideoCompletionLogExists(userId int, taskID string, upstreamTaskID string) (bool, error) {
	if LOG_DB == nil || userId <= 0 || taskID == "" {
		return false, nil
	}
	query := LOG_DB.Where("user_id = ? AND type = ?", userId, LogTypeConsume).
		Where("other LIKE ? ESCAPE '!'", logContainsPattern("playground_video_completion_log"))
	if upstreamTaskID != "" {
		query = query.Where(
			"(other LIKE ? ESCAPE '!' OR other LIKE ? ESCAPE '!')",
			logContainsPattern(taskID),
			logContainsPattern(upstreamTaskID),
		)
	} else {
		query = query.Where("other LIKE ? ESCAPE '!'", logContainsPattern(taskID))
	}
	var candidates []*Log
	if err := query.Order("id desc").Limit(32).Find(&candidates).Error; err != nil {
		return false, err
	}
	for _, candidate := range candidates {
		if candidate == nil {
			continue
		}
		other, _ := common.StrToMap(candidate.Other)
		if other == nil || fmt.Sprint(other["playground_video_completion_log"]) != "true" {
			continue
		}
		candidateTaskID := strings.TrimSpace(fmt.Sprint(other["task_id"]))
		candidateUpstreamTaskID := strings.TrimSpace(fmt.Sprint(other["upstream_task_id"]))
		if candidateTaskID == taskID || (upstreamTaskID != "" && candidateUpstreamTaskID == upstreamTaskID) {
			return true, nil
		}
	}
	return false, nil
}

func createPlaygroundVideoCompletionReceiptLog(userId int, source *Log, taskID string, upstreamTaskID string, resultURL string, finishTime int64, status string, extra map[string]interface{}) error {
	if LOG_DB == nil || source == nil || userId <= 0 || taskID == "" {
		return nil
	}
	exists, err := playgroundVideoCompletionLogExists(userId, taskID, upstreamTaskID)
	if err != nil || exists {
		return err
	}
	other := map[string]interface{}{}
	if extra != nil {
		for key, value := range extra {
			other[key] = value
		}
	}
	other["task_id"] = taskID
	if upstreamTaskID != "" {
		other["upstream_task_id"] = upstreamTaskID
	}
	if source.RequestId != "" {
		other["request_id"] = source.RequestId
	}
	other["request_phase"] = "completed"
	if status != "" {
		other["task_status"] = status
	} else {
		other["task_status"] = "SUCCESS"
	}
	other["playground_video_task"] = true
	other["playground_video_completion_log"] = true
	other["completion_log_kind"] = "receipt"
	other["source_log_id"] = source.Id
	other["media_kind"] = "video"
	other["async"] = true
	other["receipt_quota"] = 0
	other["original_quota"] = source.Quota
	if resultURL != "" {
		other["result_url"] = resultURL
		other["video_url"] = resultURL
		other["cached_url"] = resultURL
	}
	if finishTime > 0 {
		other["finish_time"] = finishTime
	}
	createdAt := finishTime
	if createdAt <= 0 {
		createdAt = common.GetTimestamp()
	}
	username := source.Username
	if username == "" {
		username, _ = GetUsernameById(userId, false)
	}
	log := &Log{
		UserId:            userId,
		Username:          username,
		CreatedAt:         createdAt,
		Type:              LogTypeConsume,
		Content:           "媒体工坊视频任务完成",
		TokenName:         firstNonEmptyLogString(source.TokenName, strings.TrimSpace(fmt.Sprint(other["token_name"])), "playground"),
		ModelName:         firstNonEmptyLogString(source.ModelName, strings.TrimSpace(fmt.Sprint(other["model_name"]))),
		Quota:             0,
		ChannelId:         firstNonZeroLogInt(source.ChannelId, intFromLogOther(other["channel_id"])),
		TokenId:           firstNonZeroLogInt(source.TokenId, intFromLogOther(other["token_id"])),
		UseTime:           intFromLogOther(other["use_time"]),
		IsStream:          false,
		Group:             firstNonEmptyLogString(source.Group, strings.TrimSpace(fmt.Sprint(other["group"]))),
		Ip:                source.Ip,
		RequestId:         source.RequestId,
		UpstreamRequestId: source.UpstreamRequestId,
		Other:             common.MapToJsonStr(other),
	}
	return LOG_DB.Create(log).Error
}

func createPlaygroundVideoTaskResultLog(userId int, taskID string, upstreamTaskID string, resultURL string, finishTime int64, status string, extra map[string]interface{}) error {
	if LOG_DB == nil || userId <= 0 || taskID == "" {
		return nil
	}
	isFailure := strings.EqualFold(status, "FAILURE") || strings.EqualFold(status, "failed")
	if !isFailure && !common.LogConsumeEnabled {
		return nil
	}
	if !isFailure {
		exists, err := playgroundVideoCompletionLogExists(userId, taskID, upstreamTaskID)
		if err != nil || exists {
			return err
		}
	}
	other := map[string]interface{}{}
	if extra != nil {
		for key, value := range extra {
			other[key] = value
		}
	}
	other["task_id"] = taskID
	if upstreamTaskID != "" {
		other["upstream_task_id"] = upstreamTaskID
	}
	other["playground_video_task"] = true
	other["media_kind"] = "video"
	other["async"] = true
	if !isFailure {
		other["playground_video_completion_log"] = true
		other["completion_log_kind"] = "standalone"
	}
	if status != "" {
		other["task_status"] = status
	}
	if resultURL != "" {
		other["result_url"] = resultURL
		other["video_url"] = resultURL
		other["cached_url"] = resultURL
	}
	if finishTime > 0 {
		other["finish_time"] = finishTime
	}

	logType := LogTypeConsume
	content := "媒体工坊视频任务完成"
	quota := 0
	if isFailure {
		logType = LogTypeError
		reason := strings.TrimSpace(fmt.Sprint(other["fail_reason"]))
		content = "媒体工坊视频任务失败"
		if reason != "" {
			content += "，" + reason
		}
		other["request_phase"] = "failed"
		other["task_status"] = "FAILURE"
		other["final_log_type"] = "error"
		other["failure_kind"] = "media_task_failed"
	} else {
		other["request_phase"] = "completed"
		if status == "" {
			other["task_status"] = "SUCCESS"
		}
		if actualQuota := intFromLogOther(other["actual_quota"]); actualQuota > 0 {
			other["original_quota"] = actualQuota
			other["receipt_quota"] = 0
		}
	}

	username, _ := GetUsernameById(userId, false)
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      logType,
		Content:   content,
		TokenName: strings.TrimSpace(fmt.Sprint(other["token_name"])),
		ModelName: strings.TrimSpace(fmt.Sprint(other["model_name"])),
		Quota:     quota,
		ChannelId: intFromLogOther(other["channel_id"]),
		TokenId:   intFromLogOther(other["token_id"]),
		UseTime:   intFromLogOther(other["use_time"]),
		IsStream:  false,
		Group:     strings.TrimSpace(fmt.Sprint(other["group"])),
		RequestId: strings.TrimSpace(fmt.Sprint(other["request_id"])),
		Other:     common.MapToJsonStr(other),
	}
	if log.TokenName == "" {
		log.TokenName = "playground"
	}
	if err := LOG_DB.Create(log).Error; err != nil {
		return err
	}
	return nil
}

func firstNonEmptyLogString(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}

func firstNonZeroLogInt(values ...int) int {
	for _, value := range values {
		if value != 0 {
			return value
		}
	}
	return 0
}

func RecordConsumeLog(c *gin.Context, userId int, params RecordConsumeLogParams) {
	if !common.LogConsumeEnabled {
		return
	}
	logger.LogInfo(c, fmt.Sprintf("record consume log: userId=%d, params=%s", userId, common.GetJsonString(params)))
	log := newConsumeLog(c, userId, params)
	if updated, err := updatePendingPlaygroundImageConsumeLog(LOG_DB, c, userId, log, params); err != nil {
		logger.LogError(c, "failed to update playground image consume log: "+err.Error())
	} else if updated {
		afterConsumeLogRecorded(userId, log.Username, params)
		return
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		logger.LogError(c, "failed to record log: "+err.Error())
		return
	}
	afterConsumeLogRecorded(userId, log.Username, params)
}

func logContextFromGin(c *gin.Context) context.Context {
	if c == nil {
		return context.Background()
	}
	v := reflect.ValueOf(c)
	if v.Kind() == reflect.Ptr && v.IsNil() {
		return context.Background()
	}
	return c
}

func RecordConsumeLogAndUsageStats(c *gin.Context, userId int, params RecordConsumeLogParams) {
	if !common.LogConsumeEnabled {
		UpdateUsageStats(userId, params.ChannelId, params.Quota)
		return
	}
	logger.LogInfo(logContextFromGin(c), fmt.Sprintf("record consume log: userId=%d, params=%s", userId, common.GetJsonString(params)))
	log := newConsumeLog(c, userId, params)
	if LOG_DB == DB {
		err := DB.Transaction(func(tx *gorm.DB) error {
			updated, err := updatePendingPlaygroundImageConsumeLog(tx, c, userId, log, params)
			if err != nil {
				return err
			}
			if !updated {
				if err := tx.Create(log).Error; err != nil {
					return err
				}
			}
			if err := tx.Model(&User{}).Where("id = ?", userId).Updates(
				map[string]interface{}{
					"used_quota":    gorm.Expr("used_quota + ?", params.Quota),
					"request_count": gorm.Expr("request_count + ?", 1),
				},
			).Error; err != nil {
				return err
			}
			if params.ChannelId > 0 {
				if err := tx.Model(&Channel{}).Where("id = ?", params.ChannelId).Update("used_quota", gorm.Expr("used_quota + ?", params.Quota)).Error; err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			logger.LogError(c, "failed to record consume log and usage stats: "+err.Error())
			return
		}
		afterConsumeLogRecorded(userId, log.Username, params)
		return
	}

	UpdateUsageStats(userId, params.ChannelId, params.Quota)
	if updated, err := updatePendingPlaygroundImageConsumeLog(LOG_DB, c, userId, log, params); err != nil {
		logger.LogError(c, "failed to update playground image consume log: "+err.Error())
	} else if updated {
		afterConsumeLogRecorded(userId, log.Username, params)
		return
	}
	if err := LOG_DB.Create(log).Error; err != nil {
		logger.LogError(c, "failed to record log: "+err.Error())
		return
	}
	afterConsumeLogRecorded(userId, log.Username, params)
}

func GetAllLogs(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string, startIdx int, num int, channel int, group string, requestId string, upstreamRequestId string) (logs []*Log, total int64, err error) {
	var tx *gorm.DB
	if logType == LogTypeUnknown {
		tx = LOG_DB
	} else {
		tx = LOG_DB.Where("logs.type = ?", logType)
	}

	if tx, err = applyExplicitLogTextFilter(tx, "logs.model_name", modelName); err != nil {
		return nil, 0, err
	}
	if tx, err = applyExplicitLogTextFilter(tx, "logs.username", username); err != nil {
		return nil, 0, err
	}
	if tokenName != "" {
		tx = tx.Where("logs.token_name = ?", tokenName)
	}
	if requestId != "" {
		tx = tx.Where("logs.request_id = ?", requestId)
	}
	if upstreamRequestId != "" {
		tx = tx.Where("logs.upstream_request_id = ?", upstreamRequestId)
	}
	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}
	if channel != 0 {
		tx = tx.Where("logs.channel_id = ?", channel)
	}
	if group != "" {
		tx = tx.Where("logs."+logGroupCol+" = ?", group)
	}
	err = tx.Model(&Log{}).Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	err = tx.Order("logs.created_at desc, logs.id desc").Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		return nil, 0, err
	}

	channelIds := types.NewSet[int]()
	for _, log := range logs {
		if log.ChannelId != 0 {
			channelIds.Add(log.ChannelId)
		}
	}

	if channelIds.Len() > 0 {
		var channels []struct {
			Id   int    `gorm:"column:id"`
			Name string `gorm:"column:name"`
		}
		if common.MemoryCacheEnabled {
			// Cache get channel
			for _, channelId := range channelIds.Items() {
				if cacheChannel, err := CacheGetChannel(channelId); err == nil {
					channels = append(channels, struct {
						Id   int    `gorm:"column:id"`
						Name string `gorm:"column:name"`
					}{
						Id:   channelId,
						Name: cacheChannel.Name,
					})
				}
			}
		} else {
			// Bulk query channels from DB
			if err = DB.Table("channels").Select("id, name").Where("id IN ?", channelIds.Items()).Find(&channels).Error; err != nil {
				return logs, total, err
			}
		}
		channelMap := make(map[int]string, len(channels))
		for _, channel := range channels {
			channelMap[channel.Id] = channel.Name
		}
		for i := range logs {
			logs[i].ChannelName = channelMap[logs[i].ChannelId]
		}
	}

	return logs, total, err
}

const logSearchCountLimit = 10000

func GetUserLogs(userId int, logType int, startTimestamp int64, endTimestamp int64, modelName string, tokenName string, startIdx int, num int, group string, requestId string, upstreamRequestId string) (logs []*Log, total int64, err error) {
	var tx *gorm.DB
	if logType == LogTypeUnknown {
		tx = LOG_DB.Where("logs.user_id = ?", userId)
	} else {
		tx = LOG_DB.Where("logs.user_id = ? and logs.type = ?", userId, logType)
	}

	if tx, err = applyExplicitLogTextFilter(tx, "logs.model_name", modelName); err != nil {
		return nil, 0, err
	}
	if tokenName != "" {
		tx = tx.Where("logs.token_name = ?", tokenName)
	}
	if requestId != "" {
		tx = tx.Where("logs.request_id = ?", requestId)
	}
	if upstreamRequestId != "" {
		tx = tx.Where("logs.upstream_request_id = ?", upstreamRequestId)
	}
	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}
	if group != "" {
		tx = tx.Where("logs."+logGroupCol+" = ?", group)
	}
	err = tx.Model(&Log{}).Limit(logSearchCountLimit).Count(&total).Error
	if err != nil {
		common.SysError("failed to count user logs: " + err.Error())
		return nil, 0, errors.New("查询日志失败")
	}
	err = tx.Order("logs.id desc").Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		common.SysError("failed to search user logs: " + err.Error())
		return nil, 0, errors.New("查询日志失败")
	}

	formatUserLogs(logs, startIdx)
	return logs, total, err
}

type Stat struct {
	Quota int `json:"quota"`
	Rpm   int `json:"rpm"`
	Tpm   int `json:"tpm"`
}

func SumUsedQuota(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string, channel int, group string) (stat Stat, err error) {
	tx := LOG_DB.Table("logs").Select("sum(quota) quota")

	// 为rpm和tpm创建单独的查询
	rpmTpmQuery := LOG_DB.Table("logs").Select("count(*) rpm, sum(prompt_tokens) + sum(completion_tokens) tpm")

	if tx, err = applyExplicitLogTextFilter(tx, "username", username); err != nil {
		return stat, err
	}
	if rpmTpmQuery, err = applyExplicitLogTextFilter(rpmTpmQuery, "username", username); err != nil {
		return stat, err
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
		rpmTpmQuery = rpmTpmQuery.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if tx, err = applyExplicitLogTextFilter(tx, "model_name", modelName); err != nil {
		return stat, err
	}
	if rpmTpmQuery, err = applyExplicitLogTextFilter(rpmTpmQuery, "model_name", modelName); err != nil {
		return stat, err
	}
	if channel != 0 {
		tx = tx.Where("channel_id = ?", channel)
		rpmTpmQuery = rpmTpmQuery.Where("channel_id = ?", channel)
	}
	if group != "" {
		tx = tx.Where(logGroupCol+" = ?", group)
		rpmTpmQuery = rpmTpmQuery.Where(logGroupCol+" = ?", group)
	}

	tx = tx.Where("type = ?", LogTypeConsume)
	rpmTpmQuery = rpmTpmQuery.Where("type = ?", LogTypeConsume)

	// 只统计最近60秒的rpm和tpm
	rpmTpmQuery = rpmTpmQuery.Where("created_at >= ?", time.Now().Add(-60*time.Second).Unix())

	// 执行查询
	if err := tx.Scan(&stat).Error; err != nil {
		common.SysError("failed to query log stat: " + err.Error())
		return stat, errors.New("查询统计数据失败")
	}
	if err := rpmTpmQuery.Scan(&stat).Error; err != nil {
		common.SysError("failed to query rpm/tpm stat: " + err.Error())
		return stat, errors.New("查询统计数据失败")
	}

	return stat, nil
}

func SumUsedToken(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string) (token int) {
	tx := LOG_DB.Table("logs").Select("ifnull(sum(prompt_tokens),0) + ifnull(sum(completion_tokens),0)")
	if username != "" {
		tx = tx.Where("username = ?", username)
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if modelName != "" {
		tx = tx.Where("model_name = ?", modelName)
	}
	tx.Where("type = ?", LogTypeConsume).Scan(&token)
	return token
}

func CountOldLog(ctx context.Context, targetTimestamp int64) (int64, error) {
	var total int64
	err := LOG_DB.WithContext(ctx).Model(&Log{}).Where("created_at < ?", targetTimestamp).Count(&total).Error
	return total, err
}

func DeleteOldLogBatch(ctx context.Context, targetTimestamp int64, limit int) (int64, error) {
	if limit <= 0 {
		limit = 1000
	}
	result := LOG_DB.WithContext(ctx).Where("created_at < ?", targetTimestamp).Limit(limit).Delete(&Log{})
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

func DeleteOldLog(ctx context.Context, targetTimestamp int64, limit int) (int64, error) {
	var total int64 = 0

	for {
		if nil != ctx.Err() {
			return total, ctx.Err()
		}

		result := LOG_DB.Where("created_at < ?", targetTimestamp).Limit(limit).Delete(&Log{})
		if nil != result.Error {
			return total, result.Error
		}

		total += result.RowsAffected

		if result.RowsAffected < int64(limit) {
			break
		}
	}

	return total, nil
}
