package controller

import (
	"context"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

func AutomaticallyTestChannels() {
	setting := operation_setting.GetMonitorSetting()
	if !setting.AutoTestChannelEnabled {
		return
	}
	minutes := setting.AutoTestChannelMinutes
	if minutes <= 0 {
		minutes = 10
	}
	for {
		time.Sleep(time.Duration(minutes * float64(time.Minute)))
		if !common.IsMasterNode {
			continue
		}
		_, err := runChannelTestTask(context.Background(), "", false, nil)
		if err != nil {
			common.SysLog("automatic channel test failed: " + err.Error())
		}
	}
}

func StartChannelUpstreamModelUpdateTask() {
	RegisterScheduledSystemTasks()
}

func UpdateMidjourneyTaskBulk() {
	runMidjourneyTaskUpdateOnce(context.Background(), nil)
}

func UpdateTaskBulk() {
	if !constant.UpdateTask || !model.HasUnfinishedSyncTasks() {
		return
	}
	service.RunTaskPollingOnce(context.Background(), nil)
}
