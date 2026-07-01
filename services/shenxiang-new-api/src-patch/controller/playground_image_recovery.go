package controller

import (
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

func PlaygroundCreateImageRecoveryTask(c *gin.Context) {
	taskID := strings.TrimSpace(c.PostForm("task_id"))
	if taskID == "" {
		var req struct {
			TaskID string `json:"task_id"`
		}
		_ = c.ShouldBindJSON(&req)
		taskID = strings.TrimSpace(req.TaskID)
	}
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "task_id is required"})
		return
	}
	task, exists, err := model.GetByTaskId(c.GetInt("id"), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to read image task"})
		return
	}
	if !exists || task == nil || task.Platform != constant.TaskPlatformPlaygroundImage || !isPlaygroundImageTaskAction(task.Action) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "image task not found"})
		return
	}
	if task.Status == model.TaskStatusSuccess || task.Status == model.TaskStatusFailure {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "task already in terminal state"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": taskToPlaygroundImageTask(task)})
}

func PlaygroundListImageRecoveryTasks(c *gin.Context) {
	query := model.SyncTaskQueryParams{
		Platform:       constant.TaskPlatformPlaygroundImage,
		StartTimestamp: time.Now().Add(-playgroundMediaRetentionDuration()).Unix(),
	}
	tasks := model.TaskGetAllUserTask(c.GetInt("id"), 0, 50, query)
	items := make([]gin.H, 0, len(tasks))
	for _, task := range tasks {
		if task == nil || !isPlaygroundImageTaskAction(task.Action) {
			continue
		}
		payload := playgroundImageTaskPayload{}
		_ = task.GetData(&payload)
		if payload.RequestFile != "" || strings.TrimSpace(task.GetResultURL()) != "" {
			items = append(items, taskToPlaygroundImageTask(task))
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": items}})
}

func PlaygroundRecoverImageTask(c *gin.Context) {
	taskID := strings.TrimSpace(c.Param("task_id"))
	task, exists, err := model.GetByTaskId(c.GetInt("id"), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to read image task"})
		return
	}
	if !exists || task == nil || task.Platform != constant.TaskPlatformPlaygroundImage || !isPlaygroundImageTaskAction(task.Action) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "image task not found"})
		return
	}
	if task.Status == model.TaskStatusSuccess || task.Status == model.TaskStatusFailure {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "task already in terminal state"})
		return
	}
	if task.Status != model.TaskStatusSubmitted {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "task is already being processed"})
		return
	}

	if resultURL := strings.TrimSpace(task.GetResultURL()); resultURL != "" {
		updatePlaygroundImageRecoveryTaskReady(task, resultURL, nil)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": taskToPlaygroundImageTask(task)})
		return
	}

	payload := playgroundImageTaskPayload{}
	_ = task.GetData(&payload)
	if payload.RequestFile == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "image task request payload missing"})
		return
	}
	if _, err := os.Stat(payload.RequestFile); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "image task request payload unavailable"})
		return
	}

	userID := c.GetInt("id")
	username := c.GetString("username")
	role := c.GetInt("role")
	userGroup := c.GetString("user_group")
	if userGroup == "" {
		userGroup = c.GetString("group")
	}
	usingGroup := task.Group
	tokenName := payload.TokenName
	gopool.Go(func() {
		runPlaygroundImageTask(task.TaskID, userID, username, role, userGroup, usingGroup, tokenName)
	})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": taskToPlaygroundImageTask(task)})
}
