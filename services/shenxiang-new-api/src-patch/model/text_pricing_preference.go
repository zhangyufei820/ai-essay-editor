package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	TextPricingGroupDefault  = "default"
	TextPricingGroupDiscount = "discount"
	TextPricingGroupPlus     = "plus"
	maxTextPricingGroupChain = 3
)

var managedTextPricingTokenNames = []string{
	"星人 Codex 文本令牌",
	"星人 Codex 自动令牌",
}

func NormalizeTextPricingGroup(group string) (string, bool) {
	normalized := strings.ToLower(strings.TrimSpace(group))
	switch normalized {
	case TextPricingGroupDefault, TextPricingGroupDiscount, TextPricingGroupPlus:
		return normalized, true
	default:
		return "", false
	}
}

func NormalizeTextPricingGroupChain(rawGroup string) (string, string, bool) {
	groups := make([]string, 0, maxTextPricingGroupChain)
	seen := make(map[string]struct{}, maxTextPricingGroupChain)
	for _, rawPart := range strings.Split(rawGroup, ",") {
		group, ok := NormalizeTextPricingGroup(rawPart)
		if !ok {
			return "", "", false
		}
		if _, exists := seen[group]; exists {
			continue
		}
		seen[group] = struct{}{}
		groups = append(groups, group)
		if len(groups) > maxTextPricingGroupChain {
			return "", "", false
		}
	}
	if len(groups) == 0 {
		return "", "", false
	}
	return strings.Join(groups, ","), groups[0], true
}

func IsManagedTextPricingTokenName(name string) bool {
	normalized := strings.TrimSpace(name)
	for _, candidate := range managedTextPricingTokenNames {
		if normalized == candidate {
			return true
		}
	}
	return false
}

// ResolveUserTextPricingGroup returns the persisted preference. Existing users
// without the setting are migrated lazily from their managed text token so a
// prior manual 0.25x/1x choice is not overwritten during rollout.
func ResolveUserTextPricingGroup(userID int) (string, error) {
	if userID <= 0 {
		return "", errors.New("userId 无效")
	}
	setting, err := GetUserSetting(userID, false)
	if err != nil {
		return "", err
	}
	if group, ok := NormalizeTextPricingGroup(setting.TextPricingGroup); ok {
		return group, nil
	}

	for _, tokenName := range managedTextPricingTokenNames {
		var token Token
		err = DB.Select("group").Where("user_id = ? AND name = ?", userID, tokenName).Order("id desc").First(&token).Error
		if err == nil {
			if _, primaryGroup, ok := NormalizeTextPricingGroupChain(token.Group); ok {
				return primaryGroup, nil
			}
			continue
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return "", err
		}
	}
	return TextPricingGroupDefault, nil
}

// UpdateTokenWithTextPricingPreference keeps the managed OpenAI text token,
// its legacy alias and the user-level preference in one database transaction.
func UpdateTokenWithTextPricingPreference(token *Token, syncPreference bool) error {
	if token == nil {
		return errors.New("token 为空")
	}
	if !syncPreference {
		return token.Update()
	}
	groupChain, primaryGroup, ok := NormalizeTextPricingGroupChain(token.Group)
	if !ok {
		return errors.New("文本令牌仅支持最多三个 default、discount 或 plus 分组")
	}
	token.Group = groupChain
	token.CrossGroupRetry = false

	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", token.UserId).First(&user).Error; err != nil {
			return err
		}
		setting := user.GetSetting()
		setting.TextPricingGroup = primaryGroup
		user.SetSetting(setting)
		if err := tx.Model(&User{}).Where("id = ?", user.Id).Update("setting", user.Setting).Error; err != nil {
			return err
		}

		if err := tx.Model(&Token{}).
			Where("id = ? AND user_id = ?", token.Id, token.UserId).
			Select("name", "status", "expired_time", "remain_quota", "unlimited_quota", "model_limits_enabled", "model_limits", "allow_ips", "group", "cross_group_retry").
			Updates(token).Error; err != nil {
			return err
		}

		return tx.Model(&Token{}).
			Where("user_id = ? AND id <> ? AND name IN ?", token.UserId, token.Id, managedTextPricingTokenNames).
			Updates(map[string]interface{}{
				"group":             groupChain,
				"cross_group_retry": false,
			}).Error
	})
	if err != nil {
		return err
	}

	if err := InvalidateUserCache(token.UserId); err != nil {
		common.SysLog("failed to invalidate text pricing user cache: " + err.Error())
	}
	if err := InvalidateUserTokensCache(token.UserId); err != nil {
		common.SysLog("failed to invalidate text pricing token cache: " + err.Error())
	}
	return nil
}
