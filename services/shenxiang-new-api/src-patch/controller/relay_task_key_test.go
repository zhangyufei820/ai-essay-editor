package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func TestPersistTaskPollingKeyUsesSelectedRequestKey(t *testing.T) {
	context := &gin.Context{}
	common.SetContextKey(context, constant.ContextKeyChannelKey, "selected-request-key")
	task := &model.Task{}

	persistTaskPollingKey(context, task)

	if task.PrivateData.Key != "selected-request-key" {
		t.Fatalf("private key = %q, want selected request key", task.PrivateData.Key)
	}
}

func TestPersistTaskPollingKeyDoesNotEraseExistingKey(t *testing.T) {
	task := &model.Task{PrivateData: model.TaskPrivateData{Key: "existing-key"}}

	persistTaskPollingKey(&gin.Context{}, task)

	if task.PrivateData.Key != "existing-key" {
		t.Fatalf("private key = %q, want existing key", task.PrivateData.Key)
	}
}
