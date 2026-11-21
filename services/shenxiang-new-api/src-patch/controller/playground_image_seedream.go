package controller

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const seedreamPendingMessage = "图片服务受理结果待确认，请保留任务 ID 并避免重复提交。"

var activeSeedreamResultCopies sync.Map

// ResolveSeedreamImageTaskRefund is an operator action after verifying that the
// provider cannot deliver images. A guarded transition prevents repeat refunds.
func ResolveSeedreamImageTaskRefund(c *gin.Context) {
	var request struct {
		ConfirmedUndeliverable bool `json:"confirmed_undeliverable"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || !request.ConfirmedUndeliverable {
		common.ApiErrorMsg(c, "请先确认上游无法交付图片。")
		return
	}
	task, exists, err := model.GetByOnlyTaskId(c.Param("task_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !exists || task.Platform != constant.TaskPlatformPlaygroundImage ||
		task.Properties.OriginModelName != dto.Seedream55Model || task.Status != model.TaskStatusUnknown {
		common.ApiErrorMsg(c, "没有找到需要核对的图片任务。")
		return
	}
	won, err := failPlaygroundImageTask(task, "已确认无法交付图片，预扣费用将退回。")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !won {
		common.ApiErrorMsg(c, "任务状态已变更，请刷新后重试。")
		return
	}
	common.SysLog(fmt.Sprintf("image task refund confirmed by admin %d for task %s", c.GetInt("id"), task.TaskID))
	common.ApiSuccess(c, gin.H{"task_id": task.TaskID, "status": model.TaskStatusFailure})
}

func markSeedreamImageTaskPending(task *model.Task) bool {
	if task.Status != model.TaskStatusInProgress {
		return task.Status == model.TaskStatusUnknown
	}
	result := model.DB.Model(&model.Task{}).
		Where("id = ? AND status = ? AND platform = ?", task.ID, model.TaskStatusInProgress, constant.TaskPlatformPlaygroundImage).
		Updates(map[string]any{"status": model.TaskStatusUnknown, "fail_reason": seedreamPendingMessage})
	if result.Error != nil {
		common.SysError("failed to checkpoint image task pending confirmation: " + result.Error.Error())
		return false
	}
	return result.RowsAffected == 1
}

func saveSeedreamImageTaskResponse(requestFile string, body []byte) error {
	f, err := os.CreateTemp(filepath.Dir(requestFile), "seedream-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	_, err = f.Write(body)
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(f.Name(), requestFile+".outputs")
}

func finishSeedreamImageTask(task *model.Task, response *dto.ImageResponse, status, quota int) {
	if _, active := activeSeedreamResultCopies.LoadOrStore(task.ID, struct{}{}); active {
		return
	}
	defer activeSeedreamResultCopies.Delete(task.ID)
	latest, exists, err := model.GetByTaskId(task.UserId, task.TaskID)
	if err != nil || !exists || latest.Status != model.TaskStatusInProgress {
		return
	}
	task = latest
	var payload playgroundImageTaskPayload
	_ = task.GetData(&payload)
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "/pg/media", nil)
	c := &gin.Context{Request: req}
	c.Set("id", task.UserId)
	c.Set(common.RequestIdKey, payload.RequestID)
	items, err := cacheSeedreamImageTaskItems(c, task, &payload, response)
	if err != nil {
		markPlaygroundImageTaskFailure(task, "生成结果转存失败，未能交付完整图片。")
		return
	}
	payload.Items = items
	markPlaygroundImageTaskSuccess(task, items[0], &payload, status, quota)
}

func cacheSeedreamImageTaskItems(c *gin.Context, task *model.Task, payload *playgroundImageTaskPayload, response *dto.ImageResponse) ([]*playgroundMediaItem, error) {
	if response == nil || len(response.Data) == 0 || len(response.Data) > 100 {
		return nil, errors.New("invalid number of generated images")
	}
	items := make([]*playgroundMediaItem, 0, len(response.Data))
	for _, data := range response.Data {
		item, err := cachePlaygroundImageTaskData(c, task, payload, data)
		if err != nil && data.Url != "" && c.Request.Context().Err() == nil {
			// Only repeat the download. Generating again would charge for a different result.
			item, err = cachePlaygroundImageTaskData(c, task, payload, data)
		}
		if err == nil {
			filename := filepath.Join(playgroundMediaUserDir(c), item.Filename)
			items = append(items, item)
			layer := seedreamImageTaskLayer(data)
			if len(layer) > 0 {
				if item.Metadata == nil {
					item.Metadata = map[string]interface{}{}
				}
				item.Metadata["layer"] = layer
				err = writePlaygroundMediaMetadata(filename, item)
			}
		}
		if err != nil {
			for _, cached := range items {
				removePlaygroundMediaWithMetadata(filepath.Join(playgroundMediaUserDir(c), cached.Filename))
			}
			return nil, err
		}
	}
	return items, nil
}

func seedreamImageTaskLayer(data dto.ImageData) map[string]interface{} {
	var metadata map[string]interface{}
	// Use the response DTO's allowlisted layer fields. Media bodies never enter task history.
	data.Url, data.B64Json, data.RevisedPrompt = "", "", ""
	raw, _ := json.Marshal(data)
	_ = json.Unmarshal(raw, &metadata)
	delete(metadata, "url")
	delete(metadata, "b64_json")
	delete(metadata, "revised_prompt")
	return metadata
}
