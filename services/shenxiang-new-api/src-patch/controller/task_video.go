package controller

import (
	"context"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
)

func UpdateVideoTaskAll(ctx context.Context, platform constant.TaskPlatform, tasksByChannel map[int][]string, tasksByUpstreamID map[string]*model.Task) error {
	return service.UpdateVideoTasks(ctx, platform, tasksByChannel, tasksByUpstreamID)
}
