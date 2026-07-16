package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
	"github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

// maxVideoTotalTokens caps the upstream-reported token count used for video
// rebilling. An attacker-controlled or compromised upstream could otherwise
// return an astronomically large total_tokens; once multiplied by the model and
// group ratios the float→int conversion can overflow to a NEGATIVE quota, which
// routes into the refund branch and CREDITS the user's balance. Reject anything
// beyond a generous sane bound rather than trust it.
const maxVideoTotalTokens = 1_000_000_000

func UpdateVideoTaskAll(ctx context.Context, platform constant.TaskPlatform, taskChannelM map[int][]string, taskM map[string]*model.Task) error {
	for channelId, taskIds := range taskChannelM {
		if err := updateVideoTaskAll(ctx, platform, channelId, taskIds, taskM); err != nil {
			logger.LogError(ctx, fmt.Sprintf("Channel #%d failed to update video async tasks: %s", channelId, err.Error()))
		}
	}
	return nil
}

func updateVideoTaskAll(ctx context.Context, platform constant.TaskPlatform, channelId int, taskIds []string, taskM map[string]*model.Task) error {
	logger.LogInfo(ctx, fmt.Sprintf("Channel #%d pending video tasks: %d", channelId, len(taskIds)))
	if len(taskIds) == 0 {
		return nil
	}
	cacheGetChannel, err := model.CacheGetChannel(channelId)
	if err != nil {
		errUpdate := model.TaskBulkUpdate(taskIds, map[string]any{
			"fail_reason": fmt.Sprintf("Failed to get channel info, channel ID: %d", channelId),
			"status":      "FAILURE",
			"progress":    "100%",
		})
		if errUpdate != nil {
			common.SysLog(fmt.Sprintf("UpdateVideoTask error: %v", errUpdate))
		}
		return fmt.Errorf("CacheGetChannel failed: %w", err)
	}
	adaptor := relay.GetTaskAdaptor(platform)
	if adaptor == nil {
		return fmt.Errorf("video adaptor not found")
	}
	info := &relaycommon.RelayInfo{}
	info.ChannelMeta = &relaycommon.ChannelMeta{
		ChannelBaseUrl: cacheGetChannel.GetBaseURL(),
	}
	info.ApiKey = cacheGetChannel.Key
	adaptor.Init(info)
	for _, taskId := range taskIds {
		if err := updateVideoSingleTask(ctx, adaptor, cacheGetChannel, taskId, taskM); err != nil {
			logger.LogError(ctx, fmt.Sprintf("Failed to update video task %s: %s", taskId, err.Error()))
		}
	}
	return nil
}

func updateVideoSingleTask(ctx context.Context, adaptor channel.TaskAdaptor, channel *model.Channel, taskId string, taskM map[string]*model.Task) error {
	baseURL := constant.ChannelBaseURLs[channel.Type]
	if channel.GetBaseURL() != "" {
		baseURL = channel.GetBaseURL()
	}
	proxy := channel.GetSetting().Proxy

	task := taskM[taskId]
	if task == nil {
		logger.LogError(ctx, fmt.Sprintf("Task %s not found in taskM", taskId))
		return fmt.Errorf("task %s not found", taskId)
	}
	key := channel.Key

	privateData := task.PrivateData
	if privateData.Key != "" {
		key = privateData.Key
	}
	resp, err := adaptor.FetchTask(baseURL, key, map[string]any{
		"task_id": taskId,
		"action":  task.Action,
	}, proxy)
	if err != nil {
		return fmt.Errorf("fetchTask failed for task %s: %w", taskId, err)
	}
	//if resp.StatusCode != http.StatusOK {
	//return fmt.Errorf("get Video Task status code: %d", resp.StatusCode)
	//}
	defer resp.Body.Close()
	responseBody, err := common.ReadAllCapped(resp.Body)
	if err != nil {
		return fmt.Errorf("readAll failed for task %s: %w", taskId, err)
	}

	logger.LogDebug(ctx, "UpdateVideoSingleTask response: %s", responseBody)

	taskResult := &relaycommon.TaskInfo{}
	// try parse as New API response format
	var responseItems dto.TaskResponse[model.Task]
	if err = common.Unmarshal(responseBody, &responseItems); err == nil && responseItems.IsSuccess() {
		logger.LogDebug(ctx, "UpdateVideoSingleTask parsed as new api response format: %+v", responseItems)
		t := responseItems.Data
		taskResult.TaskID = t.TaskID
		taskResult.Status = string(t.Status)
		taskResult.Url = t.GetResultURL()
		taskResult.Progress = t.Progress
		taskResult.Reason = t.FailReason
		task.Data = redactVideoResponseBody(t.Data)
	} else if taskResult, err = adaptor.ParseTaskResult(responseBody); err != nil {
		return fmt.Errorf("parseTaskResult failed for task %s: %w", taskId, err)
	} else {
		task.Data = redactVideoResponseBody(responseBody)
	}

	logger.LogDebug(ctx, "UpdateVideoSingleTask taskResult: %+v", taskResult)

	now := time.Now().Unix()
	if taskResult.Status == "" {
		taskResult = relaycommon.FailTaskInfo("视频生成失败，请稍后重试。")
	}
	if taskResult.Status == string(model.TaskStatusFailure) {
		taskResult.Reason = "视频生成失败，请稍后重试。"
	}

	// 记录原本的状态，防止重复退款
	shouldRefund := false
	quota := task.Quota
	preStatus := task.Status

	task.Status = model.TaskStatus(taskResult.Status)

	// billingAction is executed only if we win the CAS update, preventing double-billing
	// when concurrent pollers process the same task simultaneously.
	var billingAction func()

	switch taskResult.Status {
	case model.TaskStatusSubmitted:
		task.Progress = "10%"
	case model.TaskStatusQueued:
		task.Progress = "20%"
	case model.TaskStatusInProgress:
		task.Progress = "30%"
		if task.StartTime == 0 {
			task.StartTime = now
		}
	case model.TaskStatusSuccess:
		task.Progress = "100%"
		if task.FinishTime == 0 {
			task.FinishTime = now
		}
		if !(len(taskResult.Url) > 5 && taskResult.Url[:5] == "data:") {
			task.PrivateData.ResultURL = taskResult.Url
			task.FailReason = ""
		}

		// 如果返回了 total_tokens 并且配置了模型倍率(非固定价格)，则重新计费。
		// 仅在首次进入 success 状态时结算，防止重复轮询导致重复补扣/退还。
		if taskResult.TotalTokens > maxVideoTotalTokens {
			logger.LogError(ctx, fmt.Sprintf("视频任务 %s 上游返回异常 token 数 %d，超过上限 %d，跳过重新计费",
				task.TaskID, taskResult.TotalTokens, maxVideoTotalTokens))
		} else if taskResult.TotalTokens > 0 && preStatus != model.TaskStatusSuccess {
			// 获取模型名称
			var taskData map[string]interface{}
			if err := json.Unmarshal(task.Data, &taskData); err == nil {
				if modelName, ok := taskData["model"].(string); ok && modelName != "" {
					// 获取模型价格和倍率
					modelRatio, hasRatioSetting, _ := ratio_setting.GetModelRatio(modelName)
					// 只有配置了倍率(非固定价格)时才按 token 重新计费
					if hasRatioSetting && modelRatio > 0 {
						// 获取用户和组的倍率信息
						group := task.Group
						if group == "" {
							user, err := model.GetUserById(task.UserId, false)
							if err == nil {
								group = user.Group
							}
						}
						if group != "" {
							groupRatio := ratio_setting.GetGroupRatio(group)
							userGroupRatio, hasUserGroupRatio := ratio_setting.GetGroupGroupRatio(group, group)

							var finalGroupRatio float64
							if hasUserGroupRatio {
								finalGroupRatio = userGroupRatio
							} else {
								finalGroupRatio = groupRatio
							}

							rawQuota := float64(taskResult.TotalTokens) * modelRatio * finalGroupRatio
							if math.IsNaN(rawQuota) || math.IsInf(rawQuota, 0) || rawQuota < 0 {
								rawQuota = 0
							}
							actualQuota := int(rawQuota)
							if actualQuota < 0 {
								actualQuota = 0
							}

							preConsumedQuota := task.Quota
							quotaDelta := actualQuota - preConsumedQuota

							// Capture billing variables for the post-CAS closure.
							capturedDelta := quotaDelta
							capturedActual := actualQuota
							capturedPre := preConsumedQuota
							capturedModelRatio := modelRatio
							capturedGroupRatio := finalGroupRatio
							capturedTokens := taskResult.TotalTokens

							task.Quota = actualQuota // reflect in task record before update

							if quotaDelta > 0 {
								billingAction = func() {
									logger.LogInfo(ctx, fmt.Sprintf("视频任务 %s 预扣费后补扣费：%s（实际消耗：%s，预扣费：%s，tokens：%d）",
										task.TaskID,
										logger.LogQuota(capturedDelta),
										logger.LogQuota(capturedActual),
										logger.LogQuota(capturedPre),
										capturedTokens,
									))
									if err := model.DecreaseUserQuota(task.UserId, capturedDelta, false); err != nil {
										logger.LogError(ctx, fmt.Sprintf("补扣费失败: %s", err.Error()))
									} else {
										model.UpdateUsageStats(task.UserId, task.ChannelId, capturedDelta)
										logContent := fmt.Sprintf("视频任务成功补扣费，模型倍率 %.2f，分组倍率 %.2f，tokens %d，预扣费 %s，实际扣费 %s，补扣费 %s",
											capturedModelRatio, capturedGroupRatio, capturedTokens,
											logger.LogQuota(capturedPre), logger.LogQuota(capturedActual), logger.LogQuota(capturedDelta))
										model.RecordLog(task.UserId, model.LogTypeSystem, logContent)
									}
								}
							} else if quotaDelta < 0 {
								refundQuota := -capturedDelta
								billingAction = func() {
									logger.LogInfo(ctx, fmt.Sprintf("视频任务 %s 预扣费后返还：%s（实际消耗：%s，预扣费：%s，tokens：%d）",
										task.TaskID,
										logger.LogQuota(refundQuota),
										logger.LogQuota(capturedActual),
										logger.LogQuota(capturedPre),
										capturedTokens,
									))
									if err := model.IncreaseUserQuota(task.UserId, refundQuota, false); err != nil {
										logger.LogError(ctx, fmt.Sprintf("退还预扣费失败: %s", err.Error()))
									} else {
										logContent := fmt.Sprintf("视频任务成功退还多扣费用，模型倍率 %.2f，分组倍率 %.2f，tokens %d，预扣费 %s，实际扣费 %s，退还 %s",
											capturedModelRatio, capturedGroupRatio, capturedTokens,
											logger.LogQuota(capturedPre), logger.LogQuota(capturedActual), logger.LogQuota(refundQuota))
										model.RecordLog(task.UserId, model.LogTypeSystem, logContent)
									}
								}
							} else {
								logger.LogInfo(ctx, fmt.Sprintf("视频任务 %s 预扣费准确（%s，tokens：%d）",
									task.TaskID, logger.LogQuota(capturedActual), capturedTokens))
							}
						}
					}
				}
			}
		}
	case model.TaskStatusFailure:
		logger.LogJson(ctx, fmt.Sprintf("Task %s failed", taskId), task)
		task.Status = model.TaskStatusFailure
		task.Progress = "100%"
		if task.FinishTime == 0 {
			task.FinishTime = now
		}
		task.FailReason = taskResult.Reason
		logger.LogInfo(ctx, fmt.Sprintf("Task %s failed: %s", task.TaskID, task.FailReason))
		taskResult.Progress = "100%"
		if quota != 0 {
			if preStatus != model.TaskStatusFailure {
				shouldRefund = true
			} else {
				logger.LogWarn(ctx, fmt.Sprintf("Task %s already in failure status, skip refund", task.TaskID))
			}
		}
	default:
		return fmt.Errorf("unknown task status %s for task %s", taskResult.Status, taskId)
	}
	if taskResult.Progress != "" {
		task.Progress = taskResult.Progress
	}
	won, err := task.UpdateWithStatus(preStatus)
	if err != nil {
		common.SysLog("UpdateVideoTask task error: " + err.Error())
		shouldRefund = false
	}
	if won && billingAction != nil {
		billingAction()
	}

	if shouldRefund {
		// 任务失败且之前状态不是失败才退还额度，防止重复退还
		if err := model.IncreaseUserQuota(task.UserId, quota, false); err != nil {
			logger.LogWarn(ctx, "Failed to increase user quota: "+err.Error())
		}
		logContent := fmt.Sprintf("Video async task failed %s, refund %s", task.TaskID, logger.LogQuota(quota))
		model.RecordLog(task.UserId, model.LogTypeSystem, logContent)
	}

	return nil
}

func redactVideoResponseBody(body []byte) []byte {
	var m map[string]any
	if err := json.Unmarshal(body, &m); err != nil {
		return []byte("{}")
	}
	redactVideoResponseMap(m)
	b, err := json.Marshal(m)
	if err != nil {
		return []byte("{}")
	}
	return b
}

func redactVideoResponseMap(value map[string]any) {
	for key, item := range value {
		normalized := strings.ToLower(strings.TrimSpace(key))
		if isPrivateVideoResponseKey(normalized) {
			delete(value, key)
			continue
		}
		switch typed := item.(type) {
		case map[string]any:
			redactVideoResponseMap(typed)
		case []any:
			for _, child := range typed {
				if childMap, ok := child.(map[string]any); ok {
					redactVideoResponseMap(childMap)
				}
			}
		}
	}
}

func isPrivateVideoResponseKey(key string) bool {
	if strings.Contains(key, "upstream") || strings.Contains(key, "provider") || strings.Contains(key, "supplier") || strings.Contains(key, "channel") {
		return true
	}
	switch key {
	case "id", "task_id", "model", "code", "status_code", "error", "message", "detail", "reason", "fail_reason",
		"request_id", "base_url", "api_key", "raw_response", "bytesbase64encoded", "url", "video_url", "result_url",
		"output_url", "download_url", "signed_url", "uri", "link", "href":
		return true
	default:
		return false
	}
}

func truncateBase64(s string) string {
	const maxKeep = 256
	if len(s) <= maxKeep {
		return s
	}
	return s[:maxKeep] + "..."
}
