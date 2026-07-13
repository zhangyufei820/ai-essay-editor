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

const managedGrok45ReconcileBatchSize = 200

type ManagedGrok45TokenEnsureResult struct {
	UserID           int
	UsersScanned     int
	Created          int
	Updated          int
	Skipped          int
	Failed           int
	CapabilityActive bool
}

func IsExactManagedGrok45UserToken(token *model.Token) bool {
	return isExactManagedGrok45Token(token, Grok45UserTokenName)
}

func isExactManagedGrok45Token(token *model.Token, expectedName string) bool {
	if token == nil || token.UserId <= 0 || strings.TrimSpace(token.Key) == "" {
		return false
	}
	allowIPs := ""
	if token.AllowIps != nil {
		allowIPs = strings.TrimSpace(*token.AllowIps)
	}
	return token.Status == common.TokenStatusEnabled &&
		token.Name == expectedName &&
		token.Group == Grok45PricingGroupName &&
		token.ModelLimitsEnabled &&
		token.ModelLimits == Grok45ModelName &&
		token.UnlimitedQuota &&
		token.RemainQuota == 0 &&
		token.ExpiredTime == -1 &&
		allowIPs == "" &&
		!token.CrossGroupRetry
}

func ManagedGrok45CapabilityActive(ctx context.Context) (bool, error) {
	if model.DB == nil {
		return false, errors.New("database is not initialized")
	}
	return managedGrok45CapabilityActiveWithDB(ctx, model.DB)
}

func managedGrok45CapabilityActiveWithDB(ctx context.Context, db *gorm.DB) (bool, error) {
	var count int64
	err := db.WithContext(ctx).
		Table("abilities AS managed_ability").
		Joins("JOIN channels AS managed_channel ON managed_channel.id = managed_ability.channel_id").
		Where("managed_ability.`group` = ?", Grok45PricingGroupName).
		Where("managed_ability.model = ?", Grok45ModelName).
		Where("managed_ability.enabled = ?", true).
		Where("managed_ability.tag = ?", Grok45ManagedChannelTag).
		Where("managed_channel.status = ?", common.ChannelStatusEnabled).
		Where("managed_channel.tag = ?", Grok45ManagedChannelTag).
		Where("managed_channel.base_url = ?", Grok45ManagedBaseURL).
		Where("COALESCE(managed_channel.`key`, '') <> ''").
		Where("managed_channel.`group` = ?", Grok45PricingGroupName).
		Where("managed_channel.models = ?", Grok45ModelName).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count == 1, nil
}

func UserHasManagedGrok45Entitlement(ctx context.Context, userID int) (bool, error) {
	if userID <= 0 {
		return false, nil
	}
	if model.DB == nil {
		return false, errors.New("database is not initialized")
	}
	entitled := false
	err := model.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		active, err := managedGrok45CapabilityActiveWithDB(ctx, tx)
		if err != nil || !active {
			return err
		}
		var user model.User
		err = tx.Where("id = ? AND status = ?", userID, common.UserStatusEnabled).First(&user).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		expectedName := Grok45UserTokenName
		if IsAdminSystemTokenUserID(userID) && (user.Role == common.RoleRootUser || user.Role == common.RoleAdminUser) {
			expectedName = Grok45AdminTokenName
		} else if user.Role != common.RoleCommonUser {
			return nil
		}
		var tokens []model.Token
		if err := tx.Where("user_id = ? AND name = ?", userID, expectedName).Find(&tokens).Error; err != nil {
			return err
		}
		activeTokens := 0
		exactTokens := 0
		for index := range tokens {
			if tokens[index].Status == common.TokenStatusEnabled {
				activeTokens++
			}
			if isExactManagedGrok45Token(&tokens[index], expectedName) {
				exactTokens++
			}
		}
		entitled = activeTokens == 1 && exactTokens == 1
		return nil
	})
	return entitled, err
}

func EnsureManagedGrok45UserTokenForUserID(ctx context.Context, userID int) (ManagedGrok45TokenEnsureResult, error) {
	result := ManagedGrok45TokenEnsureResult{UserID: userID}
	if userID <= 0 {
		return result, fmt.Errorf("invalid user id: %d", userID)
	}
	if model.DB == nil {
		return result, errors.New("database is not initialized")
	}

	err := model.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		active, err := managedGrok45CapabilityActiveWithDB(ctx, tx)
		if err != nil {
			return err
		}
		result.CapabilityActive = active
		if !active {
			return nil
		}

		var user model.User
		err = tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND role = ? AND status = ?", userID, common.RoleCommonUser, common.UserStatusEnabled).
			First(&user).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			result.Skipped++
			return nil
		}
		if err != nil {
			return err
		}

		var tokens []model.Token
		err = tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ? AND name = ?", userID, Grok45UserTokenName).
			Order("id").
			Find(&tokens).Error
		if err != nil {
			return err
		}
		activeTokenIndexes := make([]int, 0, len(tokens))
		for index := range tokens {
			if tokens[index].Status == common.TokenStatusEnabled {
				activeTokenIndexes = append(activeTokenIndexes, index)
			}
		}
		if len(activeTokenIndexes) == 0 && len(tokens) > 0 {
			result.Skipped++
			return nil
		}
		if len(tokens) == 0 {
			key, generateErr := common.GenerateKey()
			if generateErr != nil {
				return generateErr
			}
			emptyAllowIPs := ""
			token := model.Token{
				UserId:             userID,
				Key:                key,
				Status:             common.TokenStatusEnabled,
				Name:               Grok45UserTokenName,
				CreatedTime:        common.GetTimestamp(),
				AccessedTime:       common.GetTimestamp(),
				ExpiredTime:        -1,
				RemainQuota:        0,
				UnlimitedQuota:     true,
				ModelLimitsEnabled: true,
				ModelLimits:        Grok45ModelName,
				AllowIps:           &emptyAllowIPs,
				Group:              Grok45PricingGroupName,
				CrossGroupRetry:    false,
			}
			if err := tx.Create(&token).Error; err != nil {
				return err
			}
			result.Created++
			return nil
		}

		canonical := tokens[activeTokenIndexes[0]]
		if !IsExactManagedGrok45UserToken(&canonical) {
			updates := map[string]interface{}{
				"expired_time":         int64(-1),
				"remain_quota":         0,
				"unlimited_quota":      true,
				"model_limits_enabled": true,
				"model_limits":         Grok45ModelName,
				"allow_ips":            "",
				"group":                Grok45PricingGroupName,
				"cross_group_retry":    false,
			}
			if strings.TrimSpace(canonical.Key) == "" {
				key, generateErr := common.GenerateKey()
				if generateErr != nil {
					return generateErr
				}
				updates["key"] = key
			}
			if err := tx.Model(&model.Token{}).Where("id = ?", canonical.Id).Updates(updates).Error; err != nil {
				return err
			}
			result.Updated++
		}
		duplicateIDs := make([]int, 0, len(activeTokenIndexes)-1)
		for _, index := range activeTokenIndexes[1:] {
			duplicateIDs = append(duplicateIDs, tokens[index].Id)
		}
		if len(duplicateIDs) > 0 {
			if err := tx.Model(&model.Token{}).Where("id IN ?", duplicateIDs).Update("status", common.TokenStatusDisabled).Error; err != nil {
				return err
			}
			result.Updated += len(duplicateIDs)
		}
		if result.Updated == 0 {
			result.Skipped++
		}
		return nil
	})
	if err != nil {
		return result, err
	}
	if result.Created > 0 || result.Updated > 0 {
		if err := model.InvalidateUserTokensCache(userID); err != nil {
			return result, fmt.Errorf("failed to invalidate managed Grok token cache for user %d: %w", userID, err)
		}
	}
	return result, nil
}

func ReconcileManagedGrok45UserTokens(ctx context.Context) (ManagedGrok45TokenEnsureResult, error) {
	result := ManagedGrok45TokenEnsureResult{}
	active, err := ManagedGrok45CapabilityActive(ctx)
	if err != nil {
		return result, err
	}
	result.CapabilityActive = active
	if !active {
		return result, nil
	}

	lastUserID := 0
	var firstErr error
	for {
		if err := ctx.Err(); err != nil {
			return result, err
		}
		var userIDs []int
		err := model.DB.WithContext(ctx).
			Model(&model.User{}).
			Where("id > ? AND role = ? AND status = ?", lastUserID, common.RoleCommonUser, common.UserStatusEnabled).
			Where(`(
				(SELECT COUNT(*) FROM tokens AS active_managed_grok_token
				 WHERE active_managed_grok_token.user_id = users.id
					AND active_managed_grok_token.deleted_at IS NULL
					AND active_managed_grok_token.name = ?
					AND active_managed_grok_token.status = ?) <> 1
				OR NOT EXISTS (
				SELECT 1 FROM tokens AS managed_grok_token
				WHERE managed_grok_token.user_id = users.id
					AND managed_grok_token.deleted_at IS NULL
					AND managed_grok_token.status = ?
					AND managed_grok_token.name = ?
					AND COALESCE(managed_grok_token.key, '') <> ''
					AND managed_grok_token.model_limits_enabled = ?
					AND managed_grok_token.model_limits = ?
					AND managed_grok_token.unlimited_quota = ?
					AND managed_grok_token.remain_quota = 0
					AND managed_grok_token.expired_time = -1
					AND COALESCE(managed_grok_token.allow_ips, '') = ''
					AND managed_grok_token.`+"`group`"+` = ?
					AND managed_grok_token.cross_group_retry = ?
				)
			)`,
				Grok45UserTokenName,
				common.TokenStatusEnabled,
				common.TokenStatusEnabled,
				Grok45UserTokenName,
				true,
				Grok45ModelName,
				true,
				Grok45PricingGroupName,
				false,
			).
			Where(`(
				NOT EXISTS (
					SELECT 1 FROM tokens AS any_managed_grok_token
					WHERE any_managed_grok_token.user_id = users.id
						AND any_managed_grok_token.deleted_at IS NULL
						AND any_managed_grok_token.name = ?
				)
				OR EXISTS (
					SELECT 1 FROM tokens AS enabled_managed_grok_token
					WHERE enabled_managed_grok_token.user_id = users.id
						AND enabled_managed_grok_token.deleted_at IS NULL
						AND enabled_managed_grok_token.name = ?
						AND enabled_managed_grok_token.status = ?
				)
			)`,
				Grok45UserTokenName,
				Grok45UserTokenName,
				common.TokenStatusEnabled,
			).
			Order("id").
			Limit(managedGrok45ReconcileBatchSize).
			Pluck("id", &userIDs).Error
		if err != nil {
			return result, err
		}
		if len(userIDs) == 0 {
			break
		}
		for _, userID := range userIDs {
			result.UsersScanned++
			ensured, ensureErr := EnsureManagedGrok45UserTokenForUserID(ctx, userID)
			if ensureErr != nil {
				result.Failed++
				if firstErr == nil {
					firstErr = ensureErr
				}
				continue
			}
			if !ensured.CapabilityActive {
				result.CapabilityActive = false
				return result, firstErr
			}
			result.Created += ensured.Created
			result.Updated += ensured.Updated
			result.Skipped += ensured.Skipped
		}
		lastUserID = userIDs[len(userIDs)-1]
	}
	return result, firstErr
}
