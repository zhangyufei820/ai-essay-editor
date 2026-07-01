package service

import (
	"context"
	"errors"
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
	Updated int
	Skipped int
}

var MoonApiXSeedanceVideoModels = []string{
	"seedance-2.0-cl-mini",
}

func videoTokenModels() []string {
	models := []string{"seedance-2.0-dj-fast", "seedance-2.0-ld-17", "grok-video-super-720p"}
	models = append(models, MoonApiXSeedanceVideoModels...)
	return models
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
			Models: []string{"gpt-image-2-4K", "geek2api-image-2", "grok-imagine-image", "banana-2", "gemini-3-pro-image-preview"},
		},
		{
			Mode:   "video",
			Name:   "星人视频生成令牌",
			Models: videoTokenModels(),
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
			var token model.Token
			if err := tx.Where("user_id = ? AND name = ?", user.Id, profile.Name).First(&token).Error; err != nil {
				if !errors.Is(err, gorm.ErrRecordNotFound) {
					return err
				}
			} else {
				nextLimits := mergeModelLimits(token.ModelLimits, profile.Models)
				if !token.ModelLimitsEnabled || nextLimits != token.ModelLimits {
					updates := map[string]interface{}{
						"model_limits_enabled": true,
						"model_limits":         nextLimits,
					}
					if err := tx.Model(&model.Token{}).Where("id = ?", token.Id).Updates(updates).Error; err != nil {
						return err
					}
					result.Updated++
				} else {
					result.Skipped++
				}
				continue
			}

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
			newToken := model.Token{
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
			if err := tx.Create(&newToken).Error; err != nil {
				return err
			}
			result.Created++
		}
		return nil
	})
	if err != nil {
		return result, err
	}
	if result.Updated > 0 {
		if err := model.InvalidateUserTokensCache(userID); err != nil {
			common.SysLog(fmt.Sprintf("failed to invalidate system token cache for user %d: %v", userID, err))
		}
	}
	return result, nil
}

func mergeModelLimits(existing string, required []string) string {
	values := make([]string, 0, len(required))
	seen := make(map[string]bool)
	for _, modelName := range strings.Split(existing, ",") {
		modelName = strings.TrimSpace(modelName)
		if modelName == "" || seen[modelName] {
			continue
		}
		seen[modelName] = true
		values = append(values, modelName)
	}
	for _, modelName := range required {
		modelName = strings.TrimSpace(modelName)
		if modelName == "" || seen[modelName] {
			continue
		}
		seen[modelName] = true
		values = append(values, modelName)
	}
	return strings.Join(values, ",")
}
