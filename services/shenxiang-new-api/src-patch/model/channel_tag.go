package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

func GetEnabledChannelByTag(tag string) (*Channel, error) {
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return nil, errors.New("channel tag is empty")
	}
	var channel Channel
	if err := DB.
		Where("tag = ? AND status = ?", tag, common.ChannelStatusEnabled).
		Order("priority DESC, weight DESC, id DESC").
		First(&channel).Error; err != nil {
		return nil, err
	}
	return &channel, nil
}

func GetChannelByTag(tag string) (*Channel, error) {
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return nil, errors.New("channel tag is empty")
	}
	var channel Channel
	if err := DB.
		Where("tag = ?", tag).
		Order("priority DESC, weight DESC, id DESC").
		First(&channel).Error; err != nil {
		return nil, err
	}
	return &channel, nil
}
