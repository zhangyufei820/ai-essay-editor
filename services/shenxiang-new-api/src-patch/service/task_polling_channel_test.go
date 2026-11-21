package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestVideoPollingKeepsIdenticalUpstreamIDsInTheirOwnChannels(t *testing.T) {
	first := &model.Task{
		ID: 1, TaskID: "first-public-id", ChannelId: 11,
		PrivateData: model.TaskPrivateData{UpstreamTaskID: "provider-task"},
	}
	second := &model.Task{
		ID: 2, TaskID: "second-public-id", ChannelId: 22,
		PrivateData: model.TaskPrivateData{UpstreamTaskID: "provider-task"},
	}
	legacy := &model.Task{ID: 3, TaskID: "legacy-id", ChannelId: 11}
	missing := &model.Task{ID: 4, ChannelId: 11}

	batches, missingIDs := groupTaskPollingByChannel([]*model.Task{first, second, legacy, missing})

	require.Equal(t, []int64{4}, missingIDs)
	require.Len(t, batches, 2)
	require.Equal(t, []string{"provider-task", "legacy-id"}, batches[11].ids)
	require.Same(t, first, batches[11].tasks["provider-task"])
	require.Same(t, legacy, batches[11].tasks["legacy-id"])
	require.Equal(t, []string{"provider-task"}, batches[22].ids)
	require.Same(t, second, batches[22].tasks["provider-task"])
}
