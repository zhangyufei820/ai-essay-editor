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

const MonthlyCardTokenName = "月卡专用 Key"

var ErrNoActiveMonthlyCard = errors.New("current account has no active monthly card")
var ErrMonthlyCardTokenUnavailable = errors.New("monthly card token is disabled or unavailable")

func BuildMonthlyCardToken(userID int, key string) model.Token {
	return model.Token{
		UserId:             userID,
		Key:                key,
		Status:             common.TokenStatusEnabled,
		Name:               MonthlyCardTokenName,
		CreatedTime:        common.GetTimestamp(),
		AccessedTime:       common.GetTimestamp(),
		ExpiredTime:        -1,
		RemainQuota:        0,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: true,
		ModelLimits:        strings.Join(MonthlyCardAllowedModels(), ","),
		Group:              "default",
		CrossGroupRetry:    false,
	}
}

func EnsureMonthlyCardTokenForUser(ctx context.Context, userID int) (*model.Token, bool, error) {
	if userID <= 0 {
		return nil, false, fmt.Errorf("invalid user id: %d", userID)
	}
	if model.DB == nil {
		return nil, false, errors.New("database is not initialized")
	}

	var token model.Token
	created := false
	reused := false
	err := model.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND status = ?", userID, common.UserStatusEnabled).
			First(&user).Error; err != nil {
			return err
		}
		eligible, err := userHasMonthlyCard(ctx, tx, userID)
		if err != nil {
			return err
		}
		if !eligible {
			return ErrNoActiveMonthlyCard
		}

		err = tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ? AND name = ? AND status = ?", userID, MonthlyCardTokenName, common.TokenStatusEnabled).
			Order("id DESC").
			First(&token).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			var unavailable model.Token
			err = tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("user_id = ? AND name = ?", userID, MonthlyCardTokenName).
				Order("id DESC").
				First(&unavailable).Error
			if err == nil {
				return ErrMonthlyCardTokenUnavailable
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			key, keyErr := common.GenerateKey()
			if keyErr != nil {
				return keyErr
			}
			token = BuildMonthlyCardToken(userID, key)
			if err := tx.Create(&token).Error; err != nil {
				return err
			}
			created = true
			return nil
		}
		reused = true

		if token.UserId != userID {
			return fmt.Errorf("monthly card token owner mismatch: token=%d owner=%d user=%d", token.Id, token.UserId, userID)
		}
		expectedModels := strings.Join(MonthlyCardAllowedModels(), ",")
		updates := map[string]interface{}{}
		if strings.TrimSpace(token.Key) == "" {
			key, keyErr := common.GenerateKey()
			if keyErr != nil {
				return keyErr
			}
			updates["key"] = key
		}
		if !token.UnlimitedQuota {
			updates["unlimited_quota"] = true
		}
		if !token.ModelLimitsEnabled {
			updates["model_limits_enabled"] = true
		}
		if token.ModelLimits != expectedModels {
			updates["model_limits"] = expectedModels
		}
		if token.ExpiredTime != -1 {
			updates["expired_time"] = -1
		}
		if token.Group != "default" {
			updates["group"] = "default"
		}
		if token.CrossGroupRetry {
			updates["cross_group_retry"] = false
		}
		if len(updates) == 0 {
			return nil
		}
		if err := tx.Model(&model.Token{}).Where("id = ? AND user_id = ?", token.Id, userID).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.Where("id = ? AND user_id = ?", token.Id, userID).First(&token).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	if created || reused {
		if err := model.InvalidateUserTokensCache(userID); err != nil {
			return nil, false, fmt.Errorf("invalidate monthly card token cache for user %d: %w", userID, err)
		}
	}
	return &token, created, nil
}
