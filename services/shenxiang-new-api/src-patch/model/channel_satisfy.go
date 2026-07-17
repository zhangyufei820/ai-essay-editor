package model

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

func GetEnabledTaggedChannelForGroupModel(group string, modelName string, tag string) (*Channel, error) {
	group = strings.TrimSpace(group)
	modelName = strings.TrimSpace(modelName)
	tag = strings.TrimSpace(tag)
	if group == "" || modelName == "" || tag == "" {
		return nil, nil
	}

	if common.MemoryCacheEnabled {
		channelSyncLock.RLock()
		defer channelSyncLock.RUnlock()

		channelIDs := group2model2channels[group][modelName]
		if len(channelIDs) == 0 {
			normalizedModel := ratio_setting.FormatMatchingModelName(modelName)
			if normalizedModel != "" && normalizedModel != modelName {
				channelIDs = group2model2channels[group][normalizedModel]
			}
		}
		var selected *Channel
		for _, channelID := range channelIDs {
			channel := channelsIDM[channelID]
			if channel == nil || channel.Status != common.ChannelStatusEnabled || channel.Tag == nil || strings.TrimSpace(*channel.Tag) != tag {
				continue
			}
			if selected != nil {
				return nil, fmt.Errorf("multiple enabled channels use routing tag %q for group %q and model %q", tag, group, modelName)
			}
			selected = channel
		}
		return selected, nil
	}

	var channelIDs []int
	query := DB.Model(&Ability{}).
		Where(map[string]interface{}{"group": group, "model": modelName, "enabled": true}).
		Pluck("channel_id", &channelIDs)
	if query.Error != nil {
		return nil, query.Error
	}
	if len(channelIDs) == 0 {
		normalizedModel := ratio_setting.FormatMatchingModelName(modelName)
		if normalizedModel != "" && normalizedModel != modelName {
			query = DB.Model(&Ability{}).
				Where(map[string]interface{}{"group": group, "model": normalizedModel, "enabled": true}).
				Pluck("channel_id", &channelIDs)
			if query.Error != nil {
				return nil, query.Error
			}
		}
	}

	var selected *Channel
	for _, channelID := range channelIDs {
		channel, err := GetChannelById(channelID, true)
		if err != nil {
			return nil, err
		}
		if channel.Status != common.ChannelStatusEnabled || channel.Tag == nil || strings.TrimSpace(*channel.Tag) != tag {
			continue
		}
		if selected != nil {
			return nil, fmt.Errorf("multiple enabled channels use routing tag %q for group %q and model %q", tag, group, modelName)
		}
		selected = channel
	}
	return selected, nil
}

func IsChannelEnabledForGroupModel(group string, modelName string, channelID int) bool {
	if group == "" || modelName == "" || channelID <= 0 {
		return false
	}
	if !common.MemoryCacheEnabled {
		return isChannelEnabledForGroupModelDB(group, modelName, channelID)
	}

	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	if group2model2channels == nil {
		return false
	}

	if isChannelIDInList(group2model2channels[group][modelName], channelID) {
		return true
	}
	normalized := ratio_setting.FormatMatchingModelName(modelName)
	if normalized != "" && normalized != modelName {
		return isChannelIDInList(group2model2channels[group][normalized], channelID)
	}
	return false
}

func IsChannelEnabledForAnyGroupModel(groups []string, modelName string, channelID int) bool {
	if len(groups) == 0 {
		return false
	}
	for _, g := range groups {
		if IsChannelEnabledForGroupModel(g, modelName, channelID) {
			return true
		}
	}
	return false
}

func IsChannelCurrentPriorityForGroupModel(group string, modelName string, channelID int) bool {
	if !IsChannelEnabledForGroupModel(group, modelName, channelID) {
		return false
	}
	channel, err := CacheGetChannel(channelID)
	if err != nil || channel == nil || channel.Status != common.ChannelStatusEnabled {
		return false
	}
	maxPriority, ok := GetMaxEnabledPriorityForGroupModel(group, modelName)
	if !ok {
		return false
	}
	return channel.GetPriority() >= maxPriority
}

func IsChannelCurrentPriorityForAnyGroupModel(groups []string, modelName string, channelID int) bool {
	if len(groups) == 0 {
		return false
	}
	for _, g := range groups {
		if IsChannelCurrentPriorityForGroupModel(g, modelName, channelID) {
			return true
		}
	}
	return false
}

func GetMaxEnabledPriorityForGroupModel(group string, modelName string) (int64, bool) {
	if group == "" || modelName == "" {
		return 0, false
	}
	if !common.MemoryCacheEnabled {
		return getMaxEnabledPriorityForGroupModelDB(group, modelName)
	}

	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	if group2model2channels == nil || channelsIDM == nil {
		return 0, false
	}
	model2channels, ok := group2model2channels[group]
	if !ok {
		return 0, false
	}
	channelIDs := model2channels[modelName]
	if len(channelIDs) == 0 {
		normalized := ratio_setting.FormatMatchingModelName(modelName)
		if normalized != "" && normalized != modelName {
			channelIDs = model2channels[normalized]
		}
	}
	if len(channelIDs) == 0 {
		return 0, false
	}

	var maxPriority int64
	found := false
	for _, id := range channelIDs {
		channel := channelsIDM[id]
		if channel == nil || channel.Status != common.ChannelStatusEnabled {
			continue
		}
		priority := channel.GetPriority()
		if !found || priority > maxPriority {
			maxPriority = priority
			found = true
		}
	}
	return maxPriority, found
}

func isChannelEnabledForGroupModelDB(group string, modelName string, channelID int) bool {
	var count int64
	err := DB.Model(&Ability{}).
		Where(commonGroupCol+" = ? and model = ? and channel_id = ? and enabled = ?", group, modelName, channelID, true).
		Count(&count).Error
	if err == nil && count > 0 {
		return true
	}
	normalized := ratio_setting.FormatMatchingModelName(modelName)
	if normalized == "" || normalized == modelName {
		return false
	}
	count = 0
	err = DB.Model(&Ability{}).
		Where(commonGroupCol+" = ? and model = ? and channel_id = ? and enabled = ?", group, normalized, channelID, true).
		Count(&count).Error
	return err == nil && count > 0
}

func getMaxEnabledPriorityForGroupModelDB(group string, modelName string) (int64, bool) {
	maxPriority, ok := getMaxEnabledPriorityForExactGroupModelDB(group, modelName)
	if ok {
		return maxPriority, true
	}
	normalized := ratio_setting.FormatMatchingModelName(modelName)
	if normalized == "" || normalized == modelName {
		return 0, false
	}
	return getMaxEnabledPriorityForExactGroupModelDB(group, normalized)
}

func getMaxEnabledPriorityForExactGroupModelDB(group string, modelName string) (int64, bool) {
	var ability Ability
	err := DB.Model(&Ability{}).
		Where(commonGroupCol+" = ? and model = ? and enabled = ?", group, modelName, true).
		Order("priority DESC").
		Limit(1).
		First(&ability).Error
	if err != nil || ability.Priority == nil {
		return 0, false
	}
	return *ability.Priority, true
}

func isChannelIDInList(list []int, channelID int) bool {
	for _, id := range list {
		if id == channelID {
			return true
		}
	}
	return false
}
