package model

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm/clause"
)

// SelectLiveChannelForGroupModel chooses among enabled, untried channels in the
// highest remaining priority. It reads abilities directly because the upstream
// channel cache is built from channel configuration, not ability.enabled.
func SelectLiveChannelForGroupModel(group, modelName, requestPath string, tried []int, preferredID int) (*Channel, error) {
	models := []string{modelName}
	if normalized := ratio_setting.FormatMatchingModelName(modelName); normalized != "" && normalized != modelName {
		models = append(models, normalized)
	}
	var quotedGroupColumn strings.Builder
	DB.Dialector.QuoteTo(&quotedGroupColumn, "channels.group")
	for _, name := range models {
		var routes []struct {
			AbilityWithChannel
			ChannelGroup string
			ChannelTag   string
		}
		query := DB.Model(&Ability{}).
			Select("abilities.*, channels.type as channel_type, "+quotedGroupColumn.String()+" as channel_group, COALESCE(channels.tag, '') as channel_tag").
			Joins("JOIN channels ON channels.id = abilities.channel_id").
			Where(clause.Eq{Column: clause.Column{Table: "abilities", Name: "group"}, Value: group}).
			Where("abilities.model = ? AND abilities.enabled = ? AND channels.status = ?", name, true, common.ChannelStatusEnabled)
		if len(tried) > 0 {
			query = query.Where("abilities.channel_id NOT IN ?", tried)
		}
		if err := query.Order("COALESCE(abilities.priority, 0) DESC").Find(&routes).Error; err != nil {
			return nil, err
		}
		var candidates []Ability
		var maxPriority int64
		weight := 0
		for _, route := range routes {
			if !containsChannelGroup(route.ChannelGroup, group) {
				continue
			}
			tag := ""
			if route.Tag != nil {
				tag = *route.Tag
			}
			if tag != route.ChannelTag {
				continue
			}
			var priority int64
			if route.Priority != nil {
				priority = *route.Priority
			}
			if len(candidates) > 0 && priority < maxPriority {
				break
			}
			if requestPath != "" && route.ChannelType == constant.ChannelTypeAdvancedCustom {
				channel, err := getLiveCandidateChannel(route.ChannelId)
				if err != nil {
					return nil, err
				}
				if !ChannelSupportsRelayPath(channel, requestPath, modelName) {
					continue
				}
			}
			if route.ChannelId == preferredID {
				return getLiveCandidateChannel(preferredID)
			}
			maxPriority = priority
			candidates = append(candidates, route.Ability)
			weight += int(route.Weight)
		}
		if len(candidates) == 0 {
			continue
		}
		if weight == 0 {
			return getLiveCandidateChannel(candidates[common.GetRandomInt(len(candidates))].ChannelId)
		}
		picked := common.GetRandomInt(weight)
		for _, route := range candidates {
			picked -= int(route.Weight)
			if picked < 0 {
				return getLiveCandidateChannel(route.ChannelId)
			}
		}
	}
	return nil, nil
}

func ChannelSupportsRelayPath(channel *Channel, requestPath, modelName string) bool {
	if channel == nil {
		return false
	}
	if requestPath == "" || channel.Type != constant.ChannelTypeAdvancedCustom {
		return true
	}
	config := channel.GetOtherSettings().AdvancedCustom
	return config != nil && config.SupportsPathForModel(requestPath, modelName)
}

func containsChannelGroup(channelGroups, group string) bool {
	for _, candidate := range strings.Split(channelGroups, ",") {
		if strings.TrimSpace(candidate) == group {
			return true
		}
	}
	return false
}

func getLiveCandidateChannel(id int) (*Channel, error) {
	channel, err := CacheGetChannel(id)
	if err == nil && channel != nil && channel.Status == common.ChannelStatusEnabled {
		return channel, nil
	}
	return GetChannelById(id, true)
}

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

// IsChannelAbilityEnabled reads the live ability row instead of the 60-second
// channel cache. Discount and Plus circuit breakers use it to stop selecting a
// failed model immediately after the monitor disables that exact route.
func IsChannelAbilityEnabled(group string, modelName string, channelID int) (bool, error) {
	group = strings.TrimSpace(group)
	modelName = strings.TrimSpace(modelName)
	if group == "" || modelName == "" || channelID <= 0 {
		return false, nil
	}
	var count int64
	err := DB.Model(&Ability{}).
		Joins("JOIN channels ON channels.id = abilities.channel_id").
		Where("abilities.`group` = ? and abilities.model = ? and abilities.channel_id = ? and abilities.enabled = ?", group, modelName, channelID, true).
		Where("channels.status = ? and abilities.tag = channels.tag", common.ChannelStatusEnabled).
		Where("REPLACE(COALESCE(channels.`group`, ''), ' ', '') = ?", group).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	if count > 0 {
		return true, nil
	}
	normalized := ratio_setting.FormatMatchingModelName(modelName)
	if normalized == "" || normalized == modelName {
		return false, nil
	}
	count = 0
	err = DB.Model(&Ability{}).
		Joins("JOIN channels ON channels.id = abilities.channel_id").
		Where("abilities.`group` = ? and abilities.model = ? and abilities.channel_id = ? and abilities.enabled = ?", group, normalized, channelID, true).
		Where("channels.status = ? and abilities.tag = channels.tag", common.ChannelStatusEnabled).
		Where("REPLACE(COALESCE(channels.`group`, ''), ' ', '') = ?", group).
		Count(&count).Error
	return count > 0, err
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
