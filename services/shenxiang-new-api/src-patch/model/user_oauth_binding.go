package model

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
)

type UserOAuthBinding struct {
	Id             int       `json:"id" gorm:"primaryKey"`
	UserId         int       `json:"user_id" gorm:"not null;uniqueIndex:ux_user_provider"`
	ProviderId     int       `json:"provider_id" gorm:"not null;uniqueIndex:ux_user_provider"`
	ProviderUserId string    `json:"provider_user_id" gorm:"type:varchar(256);not null"`
	CreatedAt      time.Time `json:"created_at"`
}

func (UserOAuthBinding) TableName() string {
	return "user_oauth_bindings"
}

func GetUserOAuthBindingsByUserId(userId int) ([]*UserOAuthBinding, error) {
	var bindings []*UserOAuthBinding
	err := DB.Where("user_id = ?", userId).Find(&bindings).Error
	return bindings, err
}

func GetUserOAuthBinding(userId, providerId int) (*UserOAuthBinding, error) {
	var binding UserOAuthBinding
	err := DB.Where("user_id = ? AND provider_id = ?", userId, providerId).First(&binding).Error
	if err != nil {
		return nil, err
	}
	return &binding, nil
}

func LookupUserByOAuthBinding(providerId int, providerUserId string) (*User, bool, error) {
	if DB == nil {
		return nil, false, errors.New("database is not initialized")
	}
	binding, found, err := lookupUserOAuthBindingWithTx(DB, providerId, providerUserId)
	if err != nil || !found {
		return nil, found, err
	}
	var user User
	if err := DB.Unscoped().First(&user, binding.UserId).Error; err != nil {
		return nil, false, err
	}
	return &user, true, nil
}

func GetUserByOAuthBinding(providerId int, providerUserId string) (*User, error) {
	user, found, err := LookupUserByOAuthBinding(providerId, providerUserId)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, gorm.ErrRecordNotFound
	}
	return user, nil
}

func IsProviderUserIdTakenWithError(providerId int, providerUserId string) (bool, error) {
	_, found, err := lookupUserOAuthBindingWithTx(DB, providerId, providerUserId)
	return found, err
}

func IsProviderUserIdTaken(providerId int, providerUserId string) bool {
	taken, err := IsProviderUserIdTakenWithError(providerId, providerUserId)
	return err != nil || taken
}

func CreateUserOAuthBinding(binding *UserOAuthBinding) error {
	return CreateUserOAuthBindingWithTx(DB, binding)
}

func CreateUserOAuthBindingWithTx(tx *gorm.DB, binding *UserOAuthBinding) error {
	if err := validateUserOAuthBinding(binding); err != nil {
		return err
	}
	_, found, err := lookupUserOAuthBindingWithTx(tx, binding.ProviderId, binding.ProviderUserId)
	if err != nil {
		return err
	}
	if found {
		return ErrUserOAuthIdentityAlreadyBound
	}
	binding.CreatedAt = time.Now()
	return NormalizeUserOAuthIdentityError(tx.Create(binding).Error)
}

func UpdateUserOAuthBinding(userId, providerId int, newProviderUserId string) error {
	if userId <= 0 {
		return errors.New("user ID is required")
	}
	if providerId == 0 {
		return errors.New("provider ID is required")
	}
	if newProviderUserId == "" {
		return errors.New("provider user ID is required")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		existingOwner, found, err := lookupUserOAuthBindingWithTx(tx, providerId, newProviderUserId)
		if err != nil {
			return err
		}
		if found && existingOwner.UserId != userId {
			return ErrUserOAuthIdentityAlreadyBound
		}

		var binding UserOAuthBinding
		err = tx.Where("user_id = ? AND provider_id = ?", userId, providerId).First(&binding).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return CreateUserOAuthBindingWithTx(tx, &UserOAuthBinding{
				UserId:         userId,
				ProviderId:     providerId,
				ProviderUserId: newProviderUserId,
			})
		}
		if err != nil {
			return err
		}
		return NormalizeUserOAuthIdentityError(tx.Model(&binding).Update("provider_user_id", newProviderUserId).Error)
	})
}

func DeleteUserOAuthBinding(userId, providerId int) error {
	return DB.Where("user_id = ? AND provider_id = ?", userId, providerId).Delete(&UserOAuthBinding{}).Error
}

func deleteUserOAuthBindingsByUserId(tx *gorm.DB, userId int) error {
	return tx.Where("user_id = ?", userId).Delete(&UserOAuthBinding{}).Error
}

func GetBindingCountByProviderId(providerId int) (int64, error) {
	var count int64
	err := DB.Model(&UserOAuthBinding{}).Where("provider_id = ?", providerId).Count(&count).Error
	return count, err
}

func validateUserOAuthBinding(binding *UserOAuthBinding) error {
	if binding == nil {
		return errors.New("OAuth binding is required")
	}
	if binding.UserId == 0 {
		return errors.New("user ID is required")
	}
	if binding.ProviderId == 0 {
		return errors.New("provider ID is required")
	}
	if binding.ProviderUserId == "" {
		return errors.New("provider user ID is required")
	}
	return nil
}

func lookupUserOAuthBindingWithTx(tx *gorm.DB, providerId int, providerUserId string) (*UserOAuthBinding, bool, error) {
	if tx == nil {
		return nil, false, errors.New("database is not initialized")
	}
	if providerId == 0 || providerUserId == "" {
		return nil, false, nil
	}
	predicate, err := oauthBinaryEqualityPredicate("provider_user_id", userOAuthBindingBinaryColumnName)
	if err != nil {
		return nil, false, err
	}
	var bindings []UserOAuthBinding
	if err := tx.Where("provider_id = ?", providerId).Where(predicate, providerUserId).Limit(2).Find(&bindings).Error; err != nil {
		return nil, false, err
	}
	switch len(bindings) {
	case 0:
		return nil, false, nil
	case 1:
		return &bindings[0], true, nil
	default:
		return nil, false, fmt.Errorf("multiple users own the same custom OAuth identity for provider %d", providerId)
	}
}
