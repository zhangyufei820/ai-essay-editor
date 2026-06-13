package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SystemTokenProfile struct {
	Mode   string
	Name   string
	Models []string
}

type SystemTokenEnsureResult struct {
	UserID  int
	Created int
	Skipped int
}

func SystemTokenProfiles() []SystemTokenProfile {
	return []SystemTokenProfile{
		{
			Mode:   "codex",
			Name:   "星人 Codex 文本令牌",
			Models: []string{"gpt-5.5", "gpt-5.4", "gpt-5.4-mini"},
		},
		{
			Mode:   "claude",
			Name:   "星人 Claude 高阶令牌",
			Models: []string{"claude-fable-5", "claude-opus-4-6", "claude-opus-4-7", "claude-opus-4-8", "claude-sonnet-4-6"},
		},
		{
			Mode:   "image",
			Name:   "星人图像生成令牌",
			Models: []string{"gpt-image-2-4K", "grok-imagine-image", "banana-2"},
		},
		{
			Mode:   "video",
			Name:   "星人视频生成令牌",
			Models: []string{"seedance-2.0", "grok-video-super-720p"},
		},
	}
}

func EnsureSystemTokensForUserID(ctx context.Context, userID int) (SystemTokenEnsureResult, error) {
	result := SystemTokenEnsureResult{UserID: userID}
	if userID <= 0 {
		return result, fmt.Errorf("invalid user id: %d", userID)
	}

	err := model.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND status = ?", userID, common.UserStatusEnabled).First(&user).Error; err != nil {
			return err
		}

		for _, profile := range SystemTokenProfiles() {
			var count int64
			if err := tx.Model(&model.Token{}).Where("user_id = ? AND name = ?", user.Id, profile.Name).Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				result.Skipped++
				continue
			}

			key, err := common.GenerateKey()
			if err != nil {
				return err
			}
			token := model.Token{
				UserId:             user.Id,
				Key:                key,
				Status:             common.TokenStatusEnabled,
				Name:               profile.Name,
				CreatedTime:        common.GetTimestamp(),
				AccessedTime:       common.GetTimestamp(),
				ExpiredTime:        -1,
				RemainQuota:        0,
				UnlimitedQuota:     true,
				ModelLimitsEnabled: true,
				ModelLimits:        strings.Join(profile.Models, ","),
				Group:              user.Group,
				CrossGroupRetry:    true,
			}
			if err := tx.Create(&token).Error; err != nil {
				return err
			}
			result.Created++
		}
		return nil
	})
	if err != nil {
		return result, err
	}
	return result, nil
}
