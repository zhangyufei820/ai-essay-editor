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
	Group  string
}

type SystemTokenEnsureResult struct {
	UserID  int
	Created int
	Updated int
	Skipped int
}

const AdminSystemTokenUserID = 1

const (
	rawGPTImage2ModelName     = "gpt-image-2"
	productGPTImage2ModelName = "gpt-image-2-4K"
	codexImage15KModelName    = "image 2电商商品图快速通道(1.5K)"
)

func videoTokenModels() []string {
	return []string{
		"grok-video-super-720p",
		"seedance-2.0-dj-fast",
		"seedance-2.0-cl-mini",
		"seedance-2.0-ld-17",
	}
}

func SystemTokenProfiles() []SystemTokenProfile {
	return []SystemTokenProfile{
		{
			Mode:   "codex",
			Name:   "星人 Codex 文本令牌",
			Models: []string{"gpt-5.5", "gpt-5.4", "gpt-5.4-mini", PublicDiscountImage2ModelName, PublicStableImage2ModelName, codexImage15KModelName},
		},
		{
			Mode:   "claude",
			Name:   "星人 Claude 高阶令牌",
			Models: []string{"claude-fable-5", "claude-haiku-4-5-20251001", "claude-opus-4-5-20251101", "claude-opus-4-6", "claude-opus-4-7", "claude-opus-4-8", "claude-sonnet-4-5-20250929", "claude-sonnet-4-6", "claude-sonnet-5"},
		},
		{
			Mode:   "image",
			Name:   "星人图像生成令牌",
			Models: []string{"gpt-image-2-4K", PublicDiscountImage2ModelName, PublicStableImage2ModelName, "grok-imagine-image", "banana-2", "gemini-3-pro-image-preview", "ecommerce-banana-2", codexImage15KModelName},
		},
		{
			Mode:   "video",
			Name:   "星人视频生成令牌",
			Models: videoTokenModels(),
		},
		{
			Mode:   "grok",
			Name:   Grok45AdminTokenName,
			Models: []string{Grok45ModelName},
			Group:  Grok45PricingGroupName,
		},
	}
}

func IsAdminSystemTokenUserID(userID int) bool {
	return userID == AdminSystemTokenUserID
}

func EnsureSystemTokensForUserID(ctx context.Context, userID int) (SystemTokenEnsureResult, error) {
	result := SystemTokenEnsureResult{UserID: userID}
	if userID <= 0 {
		return result, fmt.Errorf("invalid user id: %d", userID)
	}
	if !IsAdminSystemTokenUserID(userID) {
		return result, fmt.Errorf("system test tokens are restricted to admin user %d, got user %d", AdminSystemTokenUserID, userID)
	}

	err := model.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND status = ?", userID, common.UserStatusEnabled).First(&user).Error; err != nil {
			return err
		}

		userSetting := user.GetSetting()
		preferredTextGroup, hasPreferredTextGroup := model.NormalizeTextPricingGroup(userSetting.TextPricingGroup)
		for _, profile := range SystemTokenProfiles() {
			tokenGroup := strings.TrimSpace(profile.Group)
			if tokenGroup == "" {
				tokenGroup = user.Group
			}
			if profile.Mode == "codex" && hasPreferredTextGroup {
				tokenGroup = preferredTextGroup
			}
			var token model.Token
			if err := tx.Where("user_id = ? AND name = ?", user.Id, profile.Name).First(&token).Error; err != nil {
				if !errors.Is(err, gorm.ErrRecordNotFound) {
					return err
				}
			} else {
				if profile.Mode == "codex" && !hasPreferredTextGroup {
					if legacyGroup, ok := model.NormalizeTextPricingGroup(token.Group); ok {
						tokenGroup = legacyGroup
					}
				}
				nextLimits := systemTokenModelLimits(token.ModelLimits, profile)
				grokRetryEnabled := profile.Mode == "grok" && token.CrossGroupRetry
				codexRetryEnabled := profile.Mode == "codex" && token.CrossGroupRetry
				if !token.ModelLimitsEnabled || nextLimits != token.ModelLimits || token.Group != tokenGroup || grokRetryEnabled || codexRetryEnabled {
					updates := map[string]interface{}{
						"model_limits_enabled": true,
						"model_limits":         nextLimits,
						"group":                tokenGroup,
					}
					if profile.Mode == "grok" || profile.Mode == "codex" {
						updates["cross_group_retry"] = false
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
				Group:              tokenGroup,
				CrossGroupRetry:    profile.Mode != "grok" && profile.Mode != "codex",
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
	if result.Created > 0 || result.Updated > 0 {
		if err := model.InvalidateUserTokensCache(userID); err != nil {
			return result, fmt.Errorf("failed to invalidate system token cache for user %d: %w", userID, err)
		}
	}
	return result, nil
}

func systemTokenModelLimits(existing string, profile SystemTokenProfile) string {
	if profile.Mode == "grok" {
		return strings.Join(profile.Models, ",")
	}
	return mergeModelLimits(existing, profile.Models)
}

func mergeModelLimits(existing string, required []string) string {
	values := make([]string, 0, len(required))
	seen := make(map[string]bool)
	for _, modelName := range strings.Split(existing, ",") {
		modelName = strings.TrimSpace(modelName)
		modelName = canonicalSystemTokenModelLimit(modelName)
		if modelName == "" || seen[modelName] {
			continue
		}
		seen[modelName] = true
		values = append(values, modelName)
	}
	for _, modelName := range required {
		modelName = strings.TrimSpace(modelName)
		modelName = canonicalSystemTokenModelLimit(modelName)
		if modelName == "" || seen[modelName] {
			continue
		}
		seen[modelName] = true
		values = append(values, modelName)
	}
	return strings.Join(values, ",")
}

func canonicalSystemTokenModelLimit(modelName string) string {
	if strings.EqualFold(strings.TrimSpace(modelName), rawGPTImage2ModelName) {
		return productGPTImage2ModelName
	}
	return strings.TrimSpace(modelName)
}
