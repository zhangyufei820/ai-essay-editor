package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/samber/lo"
)

type playgroundVideoMediaMarker struct {
	RequestID string         `json:"request_id,omitempty"`
	Prompt    string         `json:"prompt,omitempty"`
	Model     string         `json:"model,omitempty"`
	Workflow  string         `json:"workflow,omitempty"`
	Size      string         `json:"size,omitempty"`
	Duration  int            `json:"duration,omitempty"`
	Seconds   string         `json:"seconds,omitempty"`
	Group     string         `json:"group,omitempty"`
	Endpoint  string         `json:"endpoint,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
	CachedURL string         `json:"cached_url,omitempty"`
	Item      any            `json:"item,omitempty"`
	Error     string         `json:"error,omitempty"`
}

type playgroundVideoMediaItem struct {
	ID            string         `json:"id"`
	Kind          string         `json:"kind"`
	URL           string         `json:"url"`
	DisplayURL    string         `json:"displayUrl"`
	CachedURL     string         `json:"cachedUrl"`
	OriginalURL   string         `json:"originalUrl,omitempty"`
	Filename      string         `json:"filename"`
	Prompt        string         `json:"prompt,omitempty"`
	Model         string         `json:"model,omitempty"`
	Workflow      string         `json:"workflow,omitempty"`
	RevisedPrompt string         `json:"revisedPrompt,omitempty"`
	Status        string         `json:"status"`
	CacheStatus   string         `json:"cacheStatus"`
	CreatedAt     string         `json:"createdAt"`
	ExpiresAt     string         `json:"expiresAt"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

type TaskPollingSummary struct {
	Total             int            `json:"total"`
	Processed         int            `json:"processed"`
	FixedNullTasks    int            `json:"fixed_null_tasks"`
	SkippedPlayground int            `json:"skipped_playground"`
	PlatformCount     map[string]int `json:"platform_count"`
}

const (
	asyncVideoWatchInterval       = 15 * time.Second
	asyncVideoWatchTimeout        = 35 * time.Minute
	maxPollingFailureRunes        = 500
	PublicAsyncTaskFailureMessage = "模型服务暂时无法处理该任务，请稍后重试"
)

var activeAsyncVideoWatchers sync.Map
var playgroundVideoCacheWriteSem = make(chan struct{}, 4)

var (
	pollingFailureURLPattern        = regexp.MustCompile(`(?i)https?://[^\s,，;；]+`)
	pollingFailureCredentialPattern = regexp.MustCompile(`(?i)(bearer\s+|sk-)[A-Za-z0-9._\-]{6,}`)
	pollingFailureSecretPattern     = regexp.MustCompile(`(?i)(api[_\s-]?key|apikey|token|secret|password|authorization)\s*[:=]\s*[^\s,，;；]+`)
	pollingFailureRequestIDPattern  = regexp.MustCompile(`(?i)(request[_\s-]?id|upstream[_\s-]?request[_\s-]?id)\s*[:=]\s*[^\s,，;；]+`)
)

var playgroundVideoSSRFProtection = &common.SSRFProtection{
	AllowPrivateIp:   false,
	DomainFilterMode: false,
	IpFilterMode:     false,
}

// TaskPollingAdaptor 定义轮询所需的最小适配器接口，避免 service -> relay 的循环依赖
type TaskPollingAdaptor interface {
	Init(info *relaycommon.RelayInfo)
	FetchTaskWithContext(ctx context.Context, baseURL string, key string, body map[string]any, proxy string) (*http.Response, error)
	ParseTaskResult(body []byte) (*relaycommon.TaskInfo, error)
	// AdjustBillingOnComplete 在任务到达终态（成功/失败）时由轮询循环调用。
	// 返回正数触发差额结算（补扣/退还），返回 0 保持预扣费金额不变。
	AdjustBillingOnComplete(task *model.Task, taskResult *relaycommon.TaskInfo) int
}

// GetTaskAdaptorFunc 由 main 包注入，用于获取指定平台的任务适配器。
// 打破 service -> relay -> relay/channel -> service 的循环依赖。
var GetTaskAdaptorFunc func(platform constant.TaskPlatform) TaskPollingAdaptor

func pollingTaskMapKey(channelID int, upstreamID string) string {
	return fmt.Sprintf("%d\x00%s", channelID, strings.TrimSpace(upstreamID))
}

func indexPollingTask(tasks map[string]*model.Task, channelID int, upstreamID string, task *model.Task) {
	if tasks == nil || task == nil || strings.TrimSpace(upstreamID) == "" {
		return
	}
	tasks[pollingTaskMapKey(channelID, upstreamID)] = task
}

func lookupPollingTask(tasks map[string]*model.Task, channelID int, upstreamID string) *model.Task {
	if tasks == nil {
		return nil
	}
	if task := tasks[pollingTaskMapKey(channelID, upstreamID)]; task != nil {
		return task
	}
	if task := tasks[strings.TrimSpace(upstreamID)]; task != nil && task.ChannelId == channelID {
		return task
	}
	return nil
}

// sweepTimedOutTasks 在主轮询之前独立清理超时任务。
// 每次最多处理 100 条，剩余的下个周期继续处理。
// 使用 per-task CAS (UpdateWithStatus) 防止覆盖被正常轮询已推进的任务。
func sweepTimedOutTasks(ctx context.Context) {
	if ctx == nil {
		ctx = context.Background()
	}
	if ctx.Err() != nil || constant.TaskTimeoutMinutes <= 0 {
		return
	}
	cutoff := time.Now().Unix() - int64(constant.TaskTimeoutMinutes)*60
	tasks := model.GetTimedOutUnfinishedTasks(cutoff, 100)
	if len(tasks) == 0 {
		return
	}

	const legacyTaskCutoff int64 = 1740182400 // 2026-02-22 00:00:00 UTC
	reason := fmt.Sprintf("任务超时（%d分钟）", constant.TaskTimeoutMinutes)
	legacyReason := "任务超时（旧系统遗留任务，不进行退款，请联系管理员）"
	now := time.Now().Unix()
	timedOutCount := 0

	for _, task := range tasks {
		if ctx.Err() != nil {
			return
		}
		isLegacy := task.SubmitTime > 0 && task.SubmitTime < legacyTaskCutoff

		oldStatus := task.Status
		task.Status = model.TaskStatusFailure
		task.Progress = "100%"
		task.FinishTime = now
		if isLegacy {
			task.FailReason = legacyReason
		} else {
			task.FailReason = reason
		}

		won, err := task.UpdateWithStatus(oldStatus)
		if err != nil {
			logger.LogError(ctx, fmt.Sprintf("sweepTimedOutTasks CAS update error for task %s: %v", task.TaskID, err))
			continue
		}
		if !won {
			logger.LogInfo(ctx, fmt.Sprintf("sweepTimedOutTasks: task %s already transitioned, skip", task.TaskID))
			continue
		}
		timedOutCount++
		if !isLegacy && task.Quota != 0 {
			RefundTaskQuota(ctx, task, reason)
		}
	}

	if timedOutCount > 0 {
		logger.LogInfo(ctx, fmt.Sprintf("sweepTimedOutTasks: timed out %d tasks", timedOutCount))
	}
}

// TaskPollingLoop 主轮询循环，每 15 秒检查一次未完成的任务
func TaskPollingLoop() {
	for {
		time.Sleep(time.Duration(15) * time.Second)
		common.SysLog("任务进度轮询开始")
		RunTaskPollingOnce(context.TODO(), nil)
		common.SysLog("任务进度轮询完成")
	}
}

func RunTaskPollingOnce(ctx context.Context, progress func(processed, total int)) TaskPollingSummary {
	summary := TaskPollingSummary{PlatformCount: make(map[string]int)}
	if GetTaskAdaptorFunc == nil {
		return summary
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if ctx.Err() != nil {
		return summary
	}
	sweepTimedOutTasks(ctx)
	if ctx.Err() != nil {
		return summary
	}
	allTasks := model.GetAllUnFinishSyncTasks(constant.TaskQueryLimit)
	summary.Total = len(allTasks)
	if progress != nil {
		progress(0, summary.Total)
	}
	platformTask := make(map[constant.TaskPlatform][]*model.Task)
	for _, t := range allTasks {
		platformTask[t.Platform] = append(platformTask[t.Platform], t)
		summary.PlatformCount[string(t.Platform)]++
	}
	for platform, tasks := range platformTask {
		if ctx.Err() != nil {
			break
		}
		if len(tasks) == 0 {
			continue
		}
		if platform == constant.TaskPlatformPlaygroundImage {
			summary.SkippedPlayground += len(tasks)
			summary.Processed += len(tasks)
			if progress != nil {
				progress(summary.Processed, summary.Total)
			}
			continue
		}
		taskChannelM := make(map[int][]string)
		taskM := make(map[string]*model.Task)
		nullTasks := make([]*model.Task, 0)
		for _, task := range tasks {
			upstreamID := strings.TrimSpace(task.GetUpstreamTaskID())
			if upstreamID == "" {
				nullTasks = append(nullTasks, task)
				continue
			}
			indexPollingTask(taskM, task.ChannelId, upstreamID, task)
			taskChannelM[task.ChannelId] = append(taskChannelM[task.ChannelId], upstreamID)
		}
		if len(nullTasks) > 0 && ctx.Err() == nil {
			recordVideoResult := platform != constant.TaskPlatformSuno && platform != constant.TaskPlatformMidjourney
			for _, task := range nullTasks {
				won, err := failPollingTaskWithoutUpstreamID(ctx, task, recordVideoResult)
				if err != nil {
					logger.LogError(ctx, fmt.Sprintf("fail task with missing upstream id %d: %v", task.ID, err))
					continue
				}
				if won {
					summary.FixedNullTasks++
				}
			}
		}
		if len(taskChannelM) > 0 && ctx.Err() == nil {
			DispatchPlatformUpdate(ctx, platform, taskChannelM, taskM)
		}
		summary.Processed += len(tasks)
		if progress != nil && ctx.Err() == nil {
			progress(summary.Processed, summary.Total)
		}
	}
	if progress != nil && summary.Total == 0 && ctx.Err() == nil {
		progress(0, 0)
	}
	return summary
}

func failPollingTaskWithoutUpstreamID(ctx context.Context, task *model.Task, recordVideoResult bool) (bool, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return false, err
	}
	if task == nil || task.Status == model.TaskStatusSuccess || task.Status == model.TaskStatusFailure ||
		strings.TrimSpace(task.GetUpstreamTaskID()) != "" {
		return false, nil
	}

	const reason = PublicAsyncTaskFailureMessage
	won, err := task.FailIfTaskIDMissing(task.Status, reason, time.Now().Unix(), taskcommon.ProgressComplete)
	if err != nil || !won {
		return won, err
	}
	recordPollingTaskFailure(ctx, task, "missing_upstream_task_id", recordVideoResult)
	if task.Quota != 0 {
		RefundTaskQuota(ctx, task, reason)
	}
	return true, nil
}

func WatchAsyncVideoTask(taskID string) {
	taskID = strings.TrimSpace(taskID)
	if taskID == "" {
		return
	}
	if _, loaded := activeAsyncVideoWatchers.LoadOrStore(taskID, struct{}{}); loaded {
		return
	}
	defer activeAsyncVideoWatchers.Delete(taskID)

	timer := time.NewTimer(asyncVideoWatchTimeout)
	defer timer.Stop()
	ticker := time.NewTicker(asyncVideoWatchInterval)
	defer ticker.Stop()

	for {
		select {
		case <-timer.C:
			logger.LogWarn(context.Background(), fmt.Sprintf("async video watcher timed out for task %s", taskID))
			return
		case <-ticker.C:
			done, err := pollAsyncVideoTaskByPublicID(context.Background(), taskID)
			if err != nil {
				logger.LogWarn(context.Background(), fmt.Sprintf("async video watcher failed for task %s: %s", taskID, err.Error()))
				continue
			}
			if done {
				return
			}
		}
	}
}

func pollAsyncVideoTaskByPublicID(ctx context.Context, taskID string) (bool, error) {
	task, exists, err := model.GetByOnlyTaskId(taskID)
	if err != nil {
		return false, err
	}
	if !exists || task == nil {
		return true, nil
	}
	if task.Status == model.TaskStatusSuccess || task.Status == model.TaskStatusFailure {
		return true, nil
	}
	upstreamID := strings.TrimSpace(task.GetUpstreamTaskID())
	if upstreamID == "" {
		return false, nil
	}
	taskM := make(map[string]*model.Task, 1)
	indexPollingTask(taskM, task.ChannelId, upstreamID, task)
	if err := updateVideoTasks(ctx, task.Platform, task.ChannelId, []string{upstreamID}, taskM); err != nil {
		return false, err
	}
	refreshed, exists, err := model.GetByOnlyTaskId(taskID)
	if err != nil {
		return false, err
	}
	if !exists || refreshed == nil {
		return true, nil
	}
	return refreshed.Status == model.TaskStatusSuccess || refreshed.Status == model.TaskStatusFailure, nil
}

// DispatchPlatformUpdate 按平台分发轮询更新
func DispatchPlatformUpdate(ctx context.Context, platform constant.TaskPlatform, taskChannelM map[int][]string, taskM map[string]*model.Task) {
	if ctx == nil {
		ctx = context.Background()
	}
	if ctx.Err() != nil {
		return
	}
	switch platform {
	case constant.TaskPlatformMidjourney:
		// MJ 轮询由其自身处理，这里预留入口
	case constant.TaskPlatformSuno:
		_ = UpdateSunoTasks(ctx, taskChannelM, taskM)
	default:
		if err := UpdateVideoTasks(ctx, platform, taskChannelM, taskM); err != nil {
			common.SysLog(fmt.Sprintf("UpdateVideoTasks fail: %s", err))
		}
	}
}

// UpdateSunoTasks 按渠道更新所有 Suno 任务
func UpdateSunoTasks(ctx context.Context, taskChannelM map[int][]string, taskM map[string]*model.Task) error {
	if ctx == nil {
		ctx = context.Background()
	}
	for channelId, taskIds := range taskChannelM {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		err := updateSunoTasks(ctx, channelId, taskIds, taskM)
		if err != nil {
			logger.LogError(ctx, fmt.Sprintf("渠道 #%d 更新异步任务失败: %s", channelId, err.Error()))
		}
	}
	return nil
}

func updateSunoTasks(ctx context.Context, channelId int, taskIds []string, taskM map[string]*model.Task) error {
	logger.LogInfo(ctx, fmt.Sprintf("渠道 #%d 未完成的任务有: %d", channelId, len(taskIds)))
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if len(taskIds) == 0 {
		return nil
	}
	ch, err := model.CacheGetChannel(channelId)
	if err != nil {
		common.SysLog(fmt.Sprintf("CacheGetChannel: %v", err))
		failPollingTasksForUnavailableChannel(ctx, channelId, taskIds, taskM, fmt.Sprintf("获取渠道信息失败，请联系管理员，渠道ID：%d", channelId), false)
		return err
	}
	adaptor := GetTaskAdaptorFunc(constant.TaskPlatformSuno)
	if adaptor == nil {
		return errors.New("adaptor not found")
	}
	proxy := ch.GetSetting().Proxy
	resp, err := adaptor.FetchTaskWithContext(ctx, *ch.BaseURL, ch.Key, map[string]any{
		"ids": taskIds,
	}, proxy)
	if err != nil {
		common.SysLog(fmt.Sprintf("Get Task Do req error: %v", err))
		return err
	}
	if resp == nil {
		return errors.New("Get Task returned an empty response")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		logger.LogError(ctx, fmt.Sprintf("Get Task status code: %d", resp.StatusCode))
		return fmt.Errorf("Get Task status code: %d", resp.StatusCode)
	}
	responseBody, err := common.ReadAllCapped(resp.Body)
	if err != nil {
		common.SysLog(fmt.Sprintf("Get Suno Task parse body error: %v", err))
		return err
	}
	var responseItems dto.TaskResponse[[]dto.SunoDataResponse]
	err = common.Unmarshal(responseBody, &responseItems)
	if err != nil {
		logger.LogError(ctx, fmt.Sprintf("Get Suno Task parse body error: %v (bytes=%d)", err, len(responseBody)))
		return err
	}
	if !responseItems.IsSuccess() {
		logger.LogError(ctx, fmt.Sprintf("渠道 #%d 查询 %d 个未完成任务时上游返回失败", channelId, len(taskIds)))
		return errors.New("upstream task query failed")
	}

	for _, responseItem := range responseItems.Data {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		task := lookupPollingTask(taskM, channelId, responseItem.TaskID)
		if task == nil {
			logger.LogWarn(ctx, fmt.Sprintf("Suno task response ignored: unknown task_id=%s", responseItem.TaskID))
			continue
		}
		if !taskNeedsUpdate(task, responseItem) {
			continue
		}

		snapshot := task.Snapshot()
		shouldRefund := false
		task.Status = lo.If(model.TaskStatus(responseItem.Status) != "", model.TaskStatus(responseItem.Status)).Else(task.Status)
		if responseItem.FailReason != "" || task.Status == model.TaskStatusFailure {
			task.FailReason = SanitizeAsyncTaskFailure(responseItem.FailReason)
		}
		task.SubmitTime = lo.If(responseItem.SubmitTime != 0, responseItem.SubmitTime).Else(task.SubmitTime)
		task.StartTime = lo.If(responseItem.StartTime != 0, responseItem.StartTime).Else(task.StartTime)
		task.FinishTime = lo.If(responseItem.FinishTime != 0, responseItem.FinishTime).Else(task.FinishTime)
		if responseItem.FailReason != "" || task.Status == model.TaskStatusFailure {
			logger.LogInfo(ctx, task.TaskID+" 构建失败，"+task.FailReason)
			task.Progress = "100%"
			shouldRefund = task.Quota != 0 && snapshot.Status != model.TaskStatusFailure
		}
		if responseItem.Status == model.TaskStatusSuccess {
			task.Progress = "100%"
		}
		if task.Status == model.TaskStatusFailure {
			task.Data = RedactAsyncTaskResponseBody(responseItem.Data, true)
		} else {
			task.Data = responseItem.Data
		}

		isDone := task.Status == model.TaskStatusSuccess || task.Status == model.TaskStatusFailure
		if isDone && snapshot.Status != task.Status {
			won, updateErr := task.UpdateWithStatus(snapshot.Status)
			if updateErr != nil {
				logger.LogError(ctx, fmt.Sprintf("UpdateSunoTask CAS error for task %s: %s", task.TaskID, updateErr.Error()))
				shouldRefund = false
			} else if !won {
				logger.LogWarn(ctx, fmt.Sprintf("Suno task %s already transitioned; skip refund", task.TaskID))
				shouldRefund = false
			}
		} else if !snapshot.Equal(task.Snapshot()) {
			if _, updateErr := task.UpdateWithStatus(snapshot.Status); updateErr != nil {
				logger.LogError(ctx, fmt.Sprintf("UpdateSunoTask error for task %s: %s", task.TaskID, updateErr.Error()))
				shouldRefund = false
			}
		}
		if shouldRefund {
			RefundTaskQuota(ctx, task, task.FailReason)
		}
	}
	return nil
}

// taskNeedsUpdate 检查 Suno 任务是否需要更新
func taskNeedsUpdate(oldTask *model.Task, newTask dto.SunoDataResponse) bool {
	if oldTask.SubmitTime != newTask.SubmitTime {
		return true
	}
	if oldTask.StartTime != newTask.StartTime {
		return true
	}
	if oldTask.FinishTime != newTask.FinishTime {
		return true
	}
	if string(oldTask.Status) != newTask.Status {
		return true
	}
	newFailReason := newTask.FailReason
	if newTask.FailReason != "" || model.TaskStatus(newTask.Status) == model.TaskStatusFailure {
		newFailReason = SanitizeAsyncTaskFailure(newTask.FailReason)
	}
	if oldTask.FailReason != newFailReason {
		return true
	}

	if (oldTask.Status == model.TaskStatusFailure || oldTask.Status == model.TaskStatusSuccess) && oldTask.Progress != "100%" {
		return true
	}

	oldData, _ := common.Marshal(oldTask.Data)
	newTaskData := newTask.Data
	if model.TaskStatus(newTask.Status) == model.TaskStatusFailure {
		newTaskData = RedactAsyncTaskResponseBody(newTask.Data, true)
	}
	newData, _ := common.Marshal(newTaskData)

	sort.Slice(oldData, func(i, j int) bool {
		return oldData[i] < oldData[j]
	})
	sort.Slice(newData, func(i, j int) bool {
		return newData[i] < newData[j]
	})

	if string(oldData) != string(newData) {
		return true
	}
	return false
}

// UpdateVideoTasks 按渠道更新所有视频任务
func UpdateVideoTasks(ctx context.Context, platform constant.TaskPlatform, taskChannelM map[int][]string, taskM map[string]*model.Task) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	channelIDs := make([]int, 0, len(taskChannelM))
	for channelID := range taskChannelM {
		channelIDs = append(channelIDs, channelID)
	}
	sort.Ints(channelIDs)

	var wg sync.WaitGroup
	for _, channelId := range channelIDs {
		if ctx.Err() != nil {
			break
		}
		taskIds := taskChannelM[channelId]
		if len(taskIds) == 0 {
			continue
		}
		taskIds = append([]string(nil), taskIds...)
		wg.Add(1)
		gopool.Go(func() {
			defer wg.Done()
			if err := updateVideoTasks(ctx, platform, channelId, taskIds, taskM); err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
				logger.LogError(ctx, fmt.Sprintf("Channel #%d failed to update video async tasks: %s", channelId, err.Error()))
			}
		})
	}
	wg.Wait()
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return nil
}

func updateVideoTasks(ctx context.Context, platform constant.TaskPlatform, channelId int, taskIds []string, taskM map[string]*model.Task) error {
	logger.LogInfo(ctx, fmt.Sprintf("Channel #%d pending video tasks: %d", channelId, len(taskIds)))
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if len(taskIds) == 0 {
		return nil
	}
	cacheGetChannel, err := model.CacheGetChannel(channelId)
	if err != nil {
		failPollingTasksForUnavailableChannel(ctx, channelId, taskIds, taskM, fmt.Sprintf("Failed to get channel info, channel ID: %d", channelId), true)
		return fmt.Errorf("CacheGetChannel failed: %w", err)
	}
	adaptor := GetTaskAdaptorFunc(platform)
	if adaptor == nil {
		return fmt.Errorf("video adaptor not found")
	}
	info := &relaycommon.RelayInfo{}
	info.ChannelMeta = &relaycommon.ChannelMeta{
		ChannelBaseUrl: cacheGetChannel.GetBaseURL(),
	}
	info.ApiKey = cacheGetChannel.Key
	adaptor.Init(info)
	disablePollingSleep := cacheGetChannel.GetOtherSettings().DisableTaskPollingSleep
	for index, taskId := range taskIds {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := updateVideoSingleTask(ctx, adaptor, cacheGetChannel, taskId, taskM); err != nil {
			logger.LogError(ctx, fmt.Sprintf("Failed to update video task %s: %s", taskId, err.Error()))
		}
		if disablePollingSleep || index == len(taskIds)-1 {
			continue
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
		}
	}
	return nil
}

func updateVideoSingleTask(ctx context.Context, adaptor TaskPollingAdaptor, ch *model.Channel, taskId string, taskM map[string]*model.Task) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	baseURL := constant.ChannelBaseURLs[ch.Type]
	if ch.GetBaseURL() != "" {
		baseURL = ch.GetBaseURL()
	}
	proxy := ch.GetSetting().Proxy

	task := lookupPollingTask(taskM, ch.Id, taskId)
	if task == nil {
		logger.LogError(ctx, fmt.Sprintf("Task %s not found in taskM", taskId))
		return fmt.Errorf("task %s not found", taskId)
	}
	key := ch.Key

	privateData := task.PrivateData
	if privateData.Key != "" {
		key = privateData.Key
	}
	resp, err := adaptor.FetchTaskWithContext(ctx, baseURL, key, map[string]any{
		"task_id": task.GetUpstreamTaskID(),
		"action":  task.Action,
	}, proxy)
	if err != nil {
		return fmt.Errorf("fetchTask failed for task %s: %w", taskId, err)
	}
	if resp == nil {
		return fmt.Errorf("fetchTask returned an empty response for task %s", taskId)
	}
	defer resp.Body.Close()
	responseBody, err := common.ReadAllCapped(resp.Body)
	if err != nil {
		return fmt.Errorf("readAll failed for task %s: %w", taskId, err)
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}

	logger.LogDebug(ctx, "updateVideoSingleTask response received: task=%s bytes=%d", taskId, len(responseBody))

	snap := task.Snapshot()
	originalData := append([]byte(nil), task.Data...)
	playgroundMarker := extractPlaygroundVideoMediaMarker(originalData)

	taskResult := &relaycommon.TaskInfo{}
	// try parse as New API response format
	var responseItems dto.TaskResponse[model.Task]
	if err = common.Unmarshal(responseBody, &responseItems); err == nil && responseItems.IsSuccess() {
		t := responseItems.Data
		taskResult.TaskID = t.TaskID
		taskResult.Status = string(t.Status)
		taskResult.Url = t.GetResultURL()
		taskResult.Progress = t.Progress
		taskResult.Reason = t.FailReason
		task.Data = t.Data
	} else if taskResult, err = adaptor.ParseTaskResult(responseBody); err != nil {
		return fmt.Errorf("parseTaskResult failed for task %s: %w", taskId, err)
	}

	logger.LogDebug(ctx, "updateVideoSingleTask parsed result: task=%s status=%s progress=%s total_tokens=%d", taskId, taskResult.Status, taskResult.Progress, taskResult.TotalTokens)

	now := time.Now().Unix()
	if taskResult.Status == "" {
		//taskResult = relaycommon.FailTaskInfo("upstream returned empty status")
		errorResult := &dto.GeneralErrorResponse{}
		if err = common.Unmarshal(responseBody, &errorResult); err == nil {
			openaiError := errorResult.TryToOpenAIError()
			if openaiError != nil {
				// 返回规范的 OpenAI 错误格式，提取错误信息，判断错误是否为任务失败
				if openaiError.Code == "429" {
					// 429 错误通常表示请求过多或速率限制，暂时不认为是任务失败，保持原状态等待下一轮轮询
					return nil
				}

				// 其他错误认为是任务失败，记录错误信息并更新任务状态
				taskResult = relaycommon.FailTaskInfo("upstream returned error")
			} else {
				logger.LogError(ctx, fmt.Sprintf("Task %s returned empty status with unrecognized error format (bytes=%d)", taskId, len(responseBody)))
				taskResult = relaycommon.FailTaskInfo("upstream returned unrecognized message")
			}
		}
	}
	if taskResult.Status == string(model.TaskStatusFailure) {
		taskResult.Reason = SanitizeAsyncTaskFailure(taskResult.Reason)
	}
	task.Data = mergePlaygroundVideoTaskData(
		RedactAsyncTaskResponseBody(responseBody, taskResult.Status == string(model.TaskStatusFailure)),
		playgroundMarker,
	)

	shouldRefund := false
	shouldSettle := false
	shouldFinalizeSuccess := false
	resultURLForCache := ""
	var videoMarker *playgroundVideoMediaMarker
	quota := task.Quota

	task.Status = model.TaskStatus(taskResult.Status)
	switch taskResult.Status {
	case model.TaskStatusSubmitted:
		task.Progress = taskcommon.ProgressSubmitted
	case model.TaskStatusQueued:
		task.Progress = taskcommon.ProgressQueued
	case model.TaskStatusInProgress:
		task.Progress = taskcommon.ProgressInProgress
		if task.StartTime == 0 {
			task.StartTime = now
		}
	case model.TaskStatusSuccess:
		task.Progress = taskcommon.ProgressComplete
		if task.FinishTime == 0 {
			task.FinishTime = now
		}
		resultURLForCache = taskResult.Url
		if strings.HasPrefix(taskResult.Url, "data:") {
			// data: URI (e.g. Vertex base64 encoded video) — keep in Data, not in ResultURL
			task.PrivateData.ResultURL = taskcommon.BuildProxyURL(task.TaskID)
		} else if taskResult.Url != "" {
			// Direct upstream URL (e.g. Kling, Ali, Doubao, etc.)
			task.PrivateData.ResultURL = taskResult.Url
		} else {
			// No URL from adaptor — construct proxy URL using public task ID
			task.PrivateData.ResultURL = taskcommon.BuildProxyURL(task.TaskID)
		}
		if snap.Status != model.TaskStatusSuccess {
			videoMarker = playgroundMarker
			if videoMarker == nil {
				videoMarker = taskVideoMediaMarker(task)
			}
			shouldFinalizeSuccess = true
		}
		shouldSettle = true
	case model.TaskStatusFailure:
		task.Status = model.TaskStatusFailure
		task.Progress = taskcommon.ProgressComplete
		if task.FinishTime == 0 {
			task.FinishTime = now
		}
		task.FailReason = sanitizePollingFailure(taskResult.Reason)
		logger.LogInfo(ctx, fmt.Sprintf("Task %s failed: %s", task.TaskID, task.FailReason))
		taskResult.Progress = taskcommon.ProgressComplete
		if quota != 0 {
			shouldRefund = true
		}
	default:
		return fmt.Errorf("unknown task status %s for task %s", taskResult.Status, task.TaskID)
	}
	if taskResult.Progress != "" {
		task.Progress = taskResult.Progress
	}

	isDone := task.Status == model.TaskStatusSuccess || task.Status == model.TaskStatusFailure
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if isDone && snap.Status != task.Status {
		won, err := task.UpdateWithStatus(snap.Status)
		if err != nil {
			logger.LogError(ctx, fmt.Sprintf("UpdateWithStatus failed for task %s: %s", task.TaskID, err.Error()))
			shouldRefund = false
			shouldSettle = false
		} else if !won {
			logger.LogWarn(ctx, fmt.Sprintf("Task %s already transitioned by another process, skip billing", task.TaskID))
			shouldRefund = false
			shouldSettle = false
		}
	} else if !snap.Equal(task.Snapshot()) {
		if _, err := task.UpdateWithStatus(snap.Status); err != nil {
			logger.LogError(ctx, fmt.Sprintf("Failed to update task %s: %s", task.TaskID, err.Error()))
		}
	} else {
		// No changes, skip update
		logger.LogDebug(ctx, "No update needed for task %s", task.TaskID)
	}

	if shouldSettle && shouldFinalizeSuccess {
		finalizationPersisted := true
		dataBeforeFinalize := append([]byte(nil), task.Data...)
		resultURLBeforeFinalize := task.PrivateData.ResultURL
		var cachedItem *playgroundVideoMediaItem
		if videoMarker != nil {
			if strings.TrimSpace(resultURLForCache) == "" {
				resultURLForCache = task.GetResultURL()
			}
			cachedItem, err = cachePlaygroundVideoTaskResult(ctx, task, videoMarker, resultURLForCache, ch)
			if err != nil {
				logger.LogError(ctx, fmt.Sprintf("cache video task %s failed: %s", task.TaskID, err.Error()))
				videoMarker.Error = err.Error()
			} else if cachedItem != nil {
				videoMarker.CachedURL = cachedItem.URL
				videoMarker.Item = cachedItem
				task.PrivateData.ResultURL = cachedItem.URL
			}
			task.Data = mergePlaygroundVideoTaskData(task.Data, videoMarker)
			won, persistErr := task.UpdateWithStatus(model.TaskStatusSuccess)
			if persistErr != nil || !won {
				finalizationPersisted = false
				removePlaygroundVideoMediaItem(task, cachedItem)
				task.Data = dataBeforeFinalize
				task.PrivateData.ResultURL = resultURLBeforeFinalize
				if persistErr != nil {
					logger.LogError(ctx, fmt.Sprintf("failed to persist cached video task %s: %s", task.TaskID, persistErr.Error()))
				} else {
					logger.LogWarn(ctx, fmt.Sprintf("cached video task %s changed concurrently; discarded cached media", task.TaskID))
				}
			}
		}
		if finalizationPersisted {
			extra := map[string]interface{}{}
			if task.ChannelId > 0 {
				extra["channel_id"] = task.ChannelId
			}
			if upstreamTaskID := strings.TrimSpace(task.GetUpstreamTaskID()); upstreamTaskID != "" {
				extra["upstream_task_id"] = upstreamTaskID
			}
			if task.StartTime > 0 && task.FinishTime >= task.StartTime {
				extra["use_time"] = int(task.FinishTime - task.StartTime)
			}
			if task.Quota > 0 {
				extra["actual_quota"] = task.Quota
			}
			extra["model_name"] = taskModelName(task)
			extra["group"] = task.Group
			if task.PrivateData.TokenId > 0 {
				extra["token_id"] = task.PrivateData.TokenId
			}
			if err := model.UpdatePlaygroundVideoTaskConsumeLogResult(task.UserId, task.TaskID, task.GetResultURL(), task.FinishTime, string(model.TaskStatusSuccess), extra); err != nil {
				logger.LogError(ctx, fmt.Sprintf("failed to update playground video task log %s: %s", task.TaskID, err.Error()))
			}
		}
	}

	if shouldSettle {
		settleTaskBillingOnComplete(ctx, adaptor, task, taskResult)
	}
	if shouldRefund {
		recordPollingTaskFailure(ctx, task, "media_task_failed", true)
		RefundTaskQuota(ctx, task, task.FailReason)
	}

	return nil
}

func failPollingTasksForUnavailableChannel(ctx context.Context, channelID int, taskIDs []string, taskByUpstreamID map[string]*model.Task, reason string, recordVideoResult bool) {
	for _, upstreamID := range taskIDs {
		if ctx.Err() != nil {
			return
		}
		task := lookupPollingTask(taskByUpstreamID, channelID, upstreamID)
		if task == nil || task.Status == model.TaskStatusSuccess || task.Status == model.TaskStatusFailure {
			continue
		}
		previousStatus := task.Status
		task.Status = model.TaskStatusFailure
		task.Progress = taskcommon.ProgressComplete
		task.FailReason = sanitizePollingFailure(reason)
		if task.FinishTime == 0 {
			task.FinishTime = time.Now().Unix()
		}
		won, err := task.UpdateWithStatus(previousStatus)
		if err != nil {
			logger.LogError(ctx, fmt.Sprintf("failed to mark task %s after channel #%d lookup failure: %s", task.TaskID, channelID, err.Error()))
			continue
		}
		if !won {
			logger.LogWarn(ctx, fmt.Sprintf("task %s already transitioned after channel #%d lookup failure; skip refund", task.TaskID, channelID))
			continue
		}
		recordPollingTaskFailure(ctx, task, "channel_unavailable", recordVideoResult)
		if task.Quota != 0 {
			RefundTaskQuota(ctx, task, task.FailReason)
		}
	}
}

func recordPollingTaskFailure(ctx context.Context, task *model.Task, failureKind string, recordVideoResult bool) {
	if task == nil {
		return
	}
	publicReason := sanitizePollingFailure(task.FailReason)
	task.FailReason = publicReason
	extra := map[string]interface{}{
		"fail_reason":        publicReason,
		"failure_kind":       failureKind,
		"final_log_type":     "error",
		"refund_reason":      failureKind,
		"billing_settlement": "preconsume_refund_task_failed",
	}
	if task.ChannelId > 0 {
		extra["channel_id"] = task.ChannelId
	}
	if upstreamTaskID := strings.TrimSpace(task.GetUpstreamTaskID()); upstreamTaskID != "" {
		extra["upstream_task_id"] = upstreamTaskID
	}
	if task.StartTime > 0 && task.FinishTime >= task.StartTime {
		extra["use_time"] = int(task.FinishTime - task.StartTime)
	}
	if task.Quota > 0 {
		extra["pre_refund_quota"] = task.Quota
	}
	extra["model_name"] = taskModelName(task)
	extra["group"] = task.Group
	if task.PrivateData.TokenId > 0 {
		extra["token_id"] = task.PrivateData.TokenId
	}
	if !recordVideoResult {
		return
	}
	if err := model.UpdatePlaygroundVideoTaskConsumeLogResult(task.UserId, task.TaskID, "", task.FinishTime, string(model.TaskStatusFailure), extra); err != nil {
		logger.LogError(ctx, fmt.Sprintf("failed to update failed task log %s: %s", task.TaskID, err.Error()))
	}
}

func SanitizeAsyncTaskFailure(_ string) string {
	return PublicAsyncTaskFailureMessage
}

func sanitizePollingFailure(reason string) string {
	return SanitizeAsyncTaskFailure(reason)
}

func RedactAsyncTaskResponseBody(body []byte, sanitizeFailure bool) []byte {
	var payload any
	if err := common.Unmarshal(body, &payload); err != nil {
		return summarizedVideoResponseBody(len(body))
	}
	payload = redactVideoResponseValue(payload, sanitizeFailure)
	redacted, err := common.Marshal(payload)
	if err != nil {
		return summarizedVideoResponseBody(len(body))
	}
	if len(redacted) > 1<<20 {
		return summarizedVideoResponseBody(len(body))
	}
	return redacted
}

func redactVideoResponseBody(body []byte) []byte {
	return RedactAsyncTaskResponseBody(body, false)
}

func redactVideoResponseValue(value any, sanitizeFailure bool) any {
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			if isSensitiveVideoResponseKey(key) {
				delete(typed, key)
				continue
			}
			if sanitizeFailure && isInternalAsyncTaskFailureKey(key) {
				delete(typed, key)
				continue
			}
			if text, ok := child.(string); ok {
				if sanitizeFailure && (isAsyncTaskFailureTextKey(key) || shouldRedactAsyncTaskFailureText(text)) {
					typed[key] = PublicAsyncTaskFailureMessage
					continue
				}
			}
			typed[key] = redactVideoResponseValue(child, sanitizeFailure)
		}
		return typed
	case []any:
		for index, child := range typed {
			typed[index] = redactVideoResponseValue(child, sanitizeFailure)
		}
		return typed
	case string:
		if sanitizeFailure && shouldRedactAsyncTaskFailureText(typed) {
			return PublicAsyncTaskFailureMessage
		}
		if len(typed) > 4096 {
			return truncateBase64(typed)
		}
		return typed
	default:
		return value
	}
}

func shouldRedactAsyncTaskFailureText(value string) bool {
	if len([]rune(value)) > maxPollingFailureRunes || pollingFailureURLPattern.MatchString(value) ||
		pollingFailureCredentialPattern.MatchString(value) || pollingFailureSecretPattern.MatchString(value) ||
		pollingFailureRequestIDPattern.MatchString(value) {
		return true
	}
	lower := strings.ToLower(value)
	for _, marker := range []string{"geek2api", "moonapix", "ccapi", "dragtokens", "upstream", "provider", "供应商", "渠道"} {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

func isAsyncTaskFailureTextKey(key string) bool {
	switch normalizeAsyncTaskResponseKey(key) {
	case "reason", "fail_reason", "failure_reason", "error", "error_message", "message", "detail", "description":
		return true
	default:
		return false
	}
}

func isInternalAsyncTaskFailureKey(key string) bool {
	switch normalizeAsyncTaskResponseKey(key) {
	case "provider", "upstream", "channel", "channel_id", "base_url", "endpoint", "request_url", "request_id", "upstream_request_id":
		return true
	default:
		return false
	}
}

func normalizeAsyncTaskResponseKey(key string) string {
	return strings.ToLower(strings.ReplaceAll(strings.TrimSpace(key), "-", "_"))
}

func isSensitiveVideoResponseKey(key string) bool {
	normalized := normalizeAsyncTaskResponseKey(key)
	switch normalized {
	case "authorization", "proxy_authorization", "api_key", "apikey", "key", "access_token", "refresh_token", "token", "secret", "password", "cookie", "set_cookie", "bytesbase64encoded", "bytes_base64_encoded":
		return true
	default:
		return false
	}
}

func summarizedVideoResponseBody(size int) []byte {
	encoded, _ := common.Marshal(map[string]any{
		"response_redacted": true,
		"response_bytes":    size,
	})
	return encoded
}

func extractPlaygroundVideoMediaMarker(data []byte) *playgroundVideoMediaMarker {
	if len(data) == 0 {
		return nil
	}
	var payload map[string]any
	if err := common.Unmarshal(data, &payload); err != nil {
		return nil
	}
	raw, ok := payload["playground_media"]
	if !ok {
		return nil
	}
	encoded, err := common.Marshal(raw)
	if err != nil {
		return nil
	}
	var marker playgroundVideoMediaMarker
	if err := common.Unmarshal(encoded, &marker); err != nil {
		return nil
	}
	if marker.Metadata == nil {
		marker.Metadata = map[string]any{}
	}
	return &marker
}

func taskVideoMediaMarker(task *model.Task) *playgroundVideoMediaMarker {
	if task == nil {
		return nil
	}
	modelName := firstNonEmptyVideoString(task.Properties.OriginModelName, task.Properties.UpstreamModelName)
	if modelName == "" && task.PrivateData.BillingContext != nil {
		modelName = task.PrivateData.BillingContext.OriginModelName
	}
	marker := &playgroundVideoMediaMarker{
		RequestID: task.TaskID,
		Prompt:    truncatePlaygroundVideoText(task.Properties.Input, 3000),
		Model:     truncatePlaygroundVideoText(modelName, 160),
		Workflow:  "video",
		Size:      "",
		Duration:  0,
		Group:     truncatePlaygroundVideoText(task.Group, 50),
		Endpoint:  "/v1/videos",
		Metadata: map[string]any{
			"task_id":    task.TaskID,
			"media_kind": "video",
		},
	}
	if task.Action != "" {
		marker.Metadata["action"] = task.Action
	}
	return marker
}

func firstNonEmptyVideoString(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}

func mergePlaygroundVideoTaskData(data []byte, marker *playgroundVideoMediaMarker) []byte {
	if marker == nil {
		return data
	}
	payload := map[string]any{}
	if len(data) > 0 {
		if err := common.Unmarshal(data, &payload); err != nil {
			if json.Valid(data) {
				payload["response"] = json.RawMessage(data)
			} else {
				payload["raw_response"] = truncatePlaygroundVideoText(string(data), 3000)
			}
		}
	}
	payload["playground_media"] = marker
	encoded, err := common.Marshal(payload)
	if err != nil {
		return data
	}
	return encoded
}

func cachePlaygroundVideoTaskResult(ctx context.Context, task *model.Task, marker *playgroundVideoMediaMarker, rawURL string, ch *model.Channel) (*playgroundVideoMediaItem, error) {
	if task == nil || marker == nil {
		return nil, nil
	}
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return nil, errors.New("video task returned no media url")
	}
	if strings.HasPrefix(strings.ToLower(rawURL), "data:") {
		return cachePlaygroundVideoDataMedia(task, marker, rawURL)
	}

	item, err := cachePlaygroundVideoRemoteMedia(ctx, task, marker, rawURL, "", "")
	if err == nil || !shouldFallbackToUpstreamVideoContent(rawURL, err) {
		return item, err
	}

	upstreamTaskID := strings.TrimSpace(task.GetUpstreamTaskID())
	if ch == nil || upstreamTaskID == "" || upstreamTaskID == strings.TrimSpace(task.TaskID) {
		return nil, err
	}
	baseURL := strings.TrimRight(strings.TrimSpace(ch.GetBaseURL()), "/")
	if baseURL == "" {
		return nil, err
	}
	upstreamURL := fmt.Sprintf("%s/v1/videos/%s/content", baseURL, upstreamTaskID)
	return cachePlaygroundVideoRemoteMediaWithValidation(ctx, task, marker, upstreamURL, ch.Key, ch.GetSetting().Proxy, false)
}

func shouldFallbackToUpstreamVideoContent(rawURL string, err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(strings.ToLower(rawURL), "/v1/videos/") && strings.Contains(strings.ToLower(rawURL), "/content")
}

func cachePlaygroundVideoRemoteMedia(ctx context.Context, task *model.Task, marker *playgroundVideoMediaMarker, rawURL string, bearerToken string, proxy string) (*playgroundVideoMediaItem, error) {
	return cachePlaygroundVideoRemoteMediaWithValidation(ctx, task, marker, rawURL, bearerToken, proxy, true)
}

func cachePlaygroundVideoRemoteMediaWithValidation(ctx context.Context, task *model.Task, marker *playgroundVideoMediaMarker, rawURL string, bearerToken string, proxy string, rejectPrivateHost bool) (*playgroundVideoMediaItem, error) {
	remoteURL, err := validatePlaygroundVideoMediaURLWithPolicy(rawURL, rejectPrivateHost)
	if err != nil {
		return nil, err
	}
	client, err := newPlaygroundVideoMediaHTTPClient(proxy, rejectPrivateHost)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, remoteURL.String(), nil)
	if err != nil {
		return nil, errors.New("failed to prepare video download")
	}
	httpReq.Header.Set("User-Agent", "NewAPI-Playground-Video-Cache/1.0")
	if strings.TrimSpace(bearerToken) != "" {
		httpReq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(bearerToken))
	}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, errors.New("failed to download generated video")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("video download failed with status %d", resp.StatusCode)
	}
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0]))
	ext := playgroundVideoExtFromContentType(contentType)
	if ext == "" {
		ext = playgroundVideoExtFromPath(remoteURL.Path)
	}
	if ext == "" {
		return nil, errors.New("unsupported video content type")
	}
	maxBytes := playgroundVideoMediaMaxBytes()
	if resp.ContentLength > maxBytes {
		return nil, errors.New("generated video is too large to cache")
	}
	return writePlaygroundVideoMedia(task, marker, rawURL, resp.Body, ext, maxBytes)
}

func newPlaygroundVideoMediaHTTPClient(proxy string, rejectPrivateHost bool) (*http.Client, error) {
	proxy = strings.TrimSpace(proxy)
	checkRedirect := func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many media redirects")
		}
		_, err := validatePlaygroundVideoMediaURLWithPolicy(req.URL.String(), rejectPrivateHost)
		return err
	}

	if rejectPrivateHost {
		if proxy != "" {
			return nil, errors.New("proxy is not allowed for untrusted video urls")
		}
		return &http.Client{
			Timeout: 90 * time.Second,
			Transport: &http.Transport{
				DialContext: safePlaygroundVideoMediaDialContext,
			},
			CheckRedirect: checkRedirect,
		}, nil
	}

	client := &http.Client{}
	if proxy != "" {
		proxyClient, err := GetHttpClientWithProxy(proxy)
		if err != nil {
			return nil, errors.New("invalid video proxy configuration")
		}
		if proxyClient == nil {
			return nil, errors.New("video proxy client is unavailable")
		}
		clientCopy := *proxyClient
		client = &clientCopy
	}
	client.Timeout = 90 * time.Second
	client.CheckRedirect = checkRedirect
	return client, nil
}

func cachePlaygroundVideoDataMedia(task *model.Task, marker *playgroundVideoMediaMarker, rawURL string) (*playgroundVideoMediaItem, error) {
	contentType, data, err := decodePlaygroundVideoDataURL(rawURL)
	if err != nil {
		return nil, err
	}
	ext := playgroundVideoExtFromContentType(contentType)
	if ext == "" {
		return nil, errors.New("unsupported video content type")
	}
	maxBytes := playgroundVideoMediaMaxBytes()
	if int64(len(data)) > maxBytes {
		return nil, errors.New("generated video exceeds cache size limit")
	}
	return writePlaygroundVideoMedia(task, marker, rawURL, bytes.NewReader(data), ext, maxBytes)
}

func writePlaygroundVideoMedia(task *model.Task, marker *playgroundVideoMediaMarker, originalURL string, reader io.Reader, ext string, maxBytes int64) (*playgroundVideoMediaItem, error) {
	playgroundVideoCacheWriteSem <- struct{}{}
	defer func() { <-playgroundVideoCacheWriteSem }()

	root := filepath.Join(playgroundVideoMediaCacheRoot(), playgroundVideoMediaUserDirName(task.UserId))
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, errors.New("failed to create video cache directory")
	}
	sum := sha256.Sum256([]byte(fmt.Sprintf("%d:%s:%s:%d", time.Now().UnixNano(), originalURL, task.TaskID, task.UserId)))
	id := fmt.Sprintf("%x", sum[:12])
	name := id + ext
	fullPath := filepath.Join(root, name)
	cleanRoot := filepath.Clean(root) + string(os.PathSeparator)
	cleanPath := filepath.Clean(fullPath)
	if !strings.HasPrefix(cleanPath, cleanRoot) {
		return nil, errors.New("invalid video cache path")
	}
	tempFile, err := os.CreateTemp(playgroundVideoMediaCacheRoot(), ".playground-media-*.tmp")
	if err != nil {
		return nil, errors.New("failed to create temporary video file")
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath)

	written, err := io.Copy(tempFile, io.LimitReader(reader, maxBytes+1))
	if err != nil {
		_ = tempFile.Close()
		return nil, errors.New("failed to save generated video")
	}
	if written > maxBytes {
		_ = tempFile.Close()
		return nil, errors.New("generated video exceeds cache size limit")
	}
	if err := tempFile.Close(); err != nil {
		return nil, errors.New("failed to finalize temporary video file")
	}

	common.PlaygroundMediaCacheMu.Lock()
	defer common.PlaygroundMediaCacheMu.Unlock()

	userBytes, userFiles, err := common.PlaygroundMediaCacheUsage(root, true)
	if err != nil {
		return nil, errors.New("failed to inspect user media cache quota")
	}
	if userFiles >= common.PlaygroundMediaMaxFilesPerUser() {
		return nil, errors.New("user media cache file count quota exceeded")
	}
	if userBytes+written > common.PlaygroundMediaUserMaxBytes() {
		return nil, errors.New("user media cache quota exceeded")
	}
	totalBytes, _, err := common.PlaygroundMediaCacheUsage(playgroundVideoMediaCacheRoot(), false)
	if err != nil {
		return nil, errors.New("failed to inspect total media cache quota")
	}
	if totalBytes+written+(64<<10) > common.PlaygroundMediaTotalMaxBytes() {
		return nil, errors.New("total media cache quota exceeded")
	}
	if err := os.Rename(tempPath, cleanPath); err != nil {
		return nil, errors.New("failed to publish cached video file")
	}

	metadata := normalizePlaygroundVideoMetadata(marker.Metadata)
	if metadata == nil {
		metadata = map[string]any{}
	}
	metadata["actual_bytes"] = written
	metadata["task_id"] = task.TaskID
	metadata["request_id"] = marker.RequestID
	if marker.Size != "" {
		metadata["size"] = marker.Size
	}
	if marker.Duration > 0 {
		metadata["duration"] = marker.Duration
	}
	if marker.Seconds != "" {
		metadata["seconds"] = marker.Seconds
	}
	if marker.Group != "" {
		metadata["group"] = marker.Group
	}
	if marker.Endpoint != "" {
		metadata["endpoint"] = marker.Endpoint
	}

	now := time.Now()
	mediaURL := playgroundVideoMediaURLPrefix() + "/" + playgroundVideoMediaUserDirName(task.UserId) + "/" + name
	item := &playgroundVideoMediaItem{
		ID:          id,
		Kind:        "video",
		URL:         mediaURL,
		DisplayURL:  mediaURL,
		CachedURL:   mediaURL,
		OriginalURL: playgroundVideoOriginalURL(originalURL),
		Filename:    name,
		Prompt:      truncatePlaygroundVideoText(marker.Prompt, 3000),
		Model:       truncatePlaygroundVideoText(marker.Model, 160),
		Workflow:    truncatePlaygroundVideoText(marker.Workflow, 120),
		Status:      "ready",
		CacheStatus: "ready",
		CreatedAt:   now.Format(time.RFC3339),
		ExpiresAt:   now.Add(playgroundVideoMediaRetentionDuration()).Format(time.RFC3339),
		Metadata:    metadata,
	}
	if err := writePlaygroundVideoMediaMetadata(cleanPath, item); err != nil {
		_ = os.Remove(cleanPath)
		_ = os.Remove(cleanPath + ".json")
		return nil, errors.New("failed to save video metadata")
	}
	return item, nil
}

func playgroundVideoMediaCacheRoot() string {
	return common.GetEnvOrDefaultString("PLAYGROUND_MEDIA_CACHE_DIR", "/data/media-cache")
}

func playgroundVideoMediaURLPrefix() string {
	prefix := common.GetEnvOrDefaultString("PLAYGROUND_MEDIA_URL_PREFIX", "/pg/media/files")
	return "/" + strings.Trim(strings.TrimSpace(prefix), "/")
}

func playgroundVideoMediaRetentionDuration() time.Duration {
	keepMinutes := common.GetEnvOrDefault("PLAYGROUND_MEDIA_KEEP_MINUTES", 72*60)
	if keepMinutes < 1 {
		keepMinutes = 72 * 60
	}
	return time.Duration(keepMinutes) * time.Minute
}

func playgroundVideoMediaMaxBytes() int64 {
	maxMB := common.GetEnvOrDefault("PLAYGROUND_MEDIA_MAX_MB", 256)
	if maxMB < 1 {
		maxMB = 256
	}
	return int64(maxMB) * 1024 * 1024
}

func playgroundVideoMediaUserDirName(userID int) string {
	return fmt.Sprintf("u-%d", userID)
}

func playgroundVideoExtFromContentType(contentType string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	default:
		return ""
	}
}

func playgroundVideoExtFromPath(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".mp4":
		return ".mp4"
	case ".webm":
		return ".webm"
	default:
		return ""
	}
}

func playgroundVideoOriginalURL(rawURL string) string {
	return ""
}

func validatePlaygroundVideoMediaURL(raw string) (*url.URL, error) {
	return validatePlaygroundVideoMediaURLWithPolicy(raw, true)
}

func validatePlaygroundVideoMediaURLWithPolicy(raw string, rejectPrivateHost bool) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed == nil || parsed.Hostname() == "" {
		return nil, errors.New("invalid video url")
	}
	if parsed.Scheme != "https" && parsed.Scheme != "http" {
		return nil, errors.New("only http and https video urls can be cached")
	}
	if rejectPrivateHost && (isPrivatePlaygroundVideoHost(parsed.Hostname()) || playgroundVideoHostResolvesPrivate(parsed.Hostname())) {
		return nil, errors.New("private video urls cannot be cached")
	}
	return parsed, nil
}

func isPrivatePlaygroundVideoHost(host string) bool {
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	return !playgroundVideoSSRFProtection.IsIPAccessAllowed(ip)
}

func playgroundVideoHostResolvesPrivate(host string) bool {
	if net.ParseIP(host) != nil {
		return false
	}
	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return true
	}
	for _, ip := range ips {
		if !playgroundVideoSSRFProtection.IsIPAccessAllowed(ip) {
			return true
		}
	}
	return false
}

func safePlaygroundVideoMediaDialContext(ctx context.Context, network, address string) (net.Conn, error) {
	dialer := &net.Dialer{Timeout: 30 * time.Second}
	return dialValidatedPlaygroundVideoAddress(
		ctx,
		network,
		address,
		net.DefaultResolver.LookupIPAddr,
		dialer.DialContext,
	)
}

func dialValidatedPlaygroundVideoAddress(
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
		if !playgroundVideoSSRFProtection.IsIPAccessAllowed(ip) {
			return nil, errors.New("private video address cannot be reached")
		}
		return dialContext(ctx, network, net.JoinHostPort(ip.String(), port))
	}
	ips, err := lookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, errors.New("video address did not resolve")
	}
	for _, ipAddr := range ips {
		if !playgroundVideoSSRFProtection.IsIPAccessAllowed(ipAddr.IP) {
			return nil, errors.New("private video address cannot be reached")
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

func decodePlaygroundVideoDataURL(raw string) (string, []byte, error) {
	idx := strings.Index(raw, ",")
	if idx <= 5 {
		return "", nil, errors.New("invalid data video url")
	}
	header := strings.ToLower(strings.TrimSpace(raw[:idx]))
	if !strings.HasPrefix(header, "data:") || !strings.Contains(header, ";base64") {
		return "", nil, errors.New("only base64 data video urls can be cached")
	}
	contentType := strings.TrimSpace(strings.TrimPrefix(strings.Split(header, ";")[0], "data:"))
	if contentType == "" {
		return "", nil, errors.New("missing data video content type")
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(raw[idx+1:]))
	if err != nil {
		return "", nil, errors.New("invalid base64 video data")
	}
	return contentType, data, nil
}

func normalizePlaygroundVideoMetadata(metadata map[string]any) map[string]any {
	if len(metadata) == 0 {
		return nil
	}
	encoded, err := json.Marshal(metadata)
	if err != nil || len(encoded) > 8192 {
		return nil
	}
	var normalized map[string]any
	if err := json.Unmarshal(encoded, &normalized); err != nil {
		return nil
	}
	return normalized
}

func writePlaygroundVideoMediaMetadata(mediaPath string, item *playgroundVideoMediaItem) error {
	data, err := json.MarshalIndent(item, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(mediaPath+".json", data, 0o600)
}

func removePlaygroundVideoMediaItem(task *model.Task, item *playgroundVideoMediaItem) {
	if task == nil || item == nil {
		return
	}
	filename := filepath.Base(strings.TrimSpace(item.Filename))
	if filename == "" || filename == "." {
		return
	}
	root := filepath.Join(playgroundVideoMediaCacheRoot(), playgroundVideoMediaUserDirName(task.UserId))
	mediaPath := filepath.Join(root, filename)
	cleanRoot := filepath.Clean(root) + string(os.PathSeparator)
	cleanPath := filepath.Clean(mediaPath)
	if !strings.HasPrefix(cleanPath, cleanRoot) {
		return
	}
	_ = os.Remove(cleanPath)
	_ = os.Remove(cleanPath + ".json")
}

func truncatePlaygroundVideoText(value string, maxRunes int) string {
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

func truncateBase64(s string) string {
	const maxKeep = 256
	if len(s) <= maxKeep {
		return s
	}
	return s[:maxKeep] + "..."
}

// settleTaskBillingOnComplete 任务完成时的统一计费调整。
// 优先级：1. adaptor.AdjustBillingOnComplete 返回正数 → 使用 adaptor 计算的额度
//
//  2. taskResult.TotalTokens > 0 → 按 token 重算
//  3. 都不满足 → 保持预扣额度不变
func settleTaskBillingOnComplete(ctx context.Context, adaptor TaskPollingAdaptor, task *model.Task, taskResult *relaycommon.TaskInfo) {
	// 0. 按次计费的任务不做差额结算
	if bc := task.PrivateData.BillingContext; bc != nil && bc.PerCallBilling {
		logger.LogInfo(ctx, fmt.Sprintf("任务 %s 按次计费，跳过差额结算", task.TaskID))
		return
	}
	// 1. 优先让 adaptor 决定最终额度
	if actualQuota := adaptor.AdjustBillingOnComplete(task, taskResult); actualQuota > 0 {
		RecalculateTaskQuota(ctx, task, actualQuota, "adaptor计费调整")
		return
	}
	// 2. 回退到 token 重算
	if taskResult.TotalTokens > 0 {
		RecalculateTaskQuotaByTokens(ctx, task, taskResult.TotalTokens)
		return
	}
	// 3. 无调整，保持预扣额度
}
