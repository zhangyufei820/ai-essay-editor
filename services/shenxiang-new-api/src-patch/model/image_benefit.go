package model

import (
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm"
)

const (
	ImageBenefitRedemptionName = "30元1.5K图像福利包"
	ImageBenefitTokenName      = "1.5K图像福利包专用"
	ImageBenefitModelName      = "image 2电商商品图快速通道(1.5K)"
	ImageBenefitTotalImages    = 300
	ImageBenefitValidSeconds   = int64(7 * 24 * 60 * 60)
	ImageBenefitBaseURL        = "https://api.aiphui.top/v1"
)

type ImageBenefitTokenResult struct {
	TokenId         int      `json:"token_id"`
	Key             string   `json:"key"`
	Name            string   `json:"name"`
	BaseURL         string   `json:"base_url"`
	Model           string   `json:"model"`
	Models          []string `json:"models"`
	TotalImages     int      `json:"total_images"`
	UsedImages      int      `json:"used_images"`
	RemainingImages int      `json:"remaining_images"`
	ExpiredTime     int64    `json:"expired_time"`
	CreatedTime     int64    `json:"created_time"`
	Status          string   `json:"status"`
	QuotaPerImage   int      `json:"quota_per_image"`
	TotalQuota      int      `json:"total_quota"`
	UsedQuota       int      `json:"used_quota"`
	RemainingQuota  int      `json:"remaining_quota"`
}

func IsImageBenefitRedemption(redemption *Redemption) bool {
	if redemption == nil {
		return false
	}
	return strings.TrimSpace(redemption.Name) == ImageBenefitRedemptionName && redemption.Quota == 30 && redemption.PlanId == 0
}

func IsImageBenefitTokenName(name string) bool {
	return strings.TrimSpace(name) == ImageBenefitTokenName
}

func IsImageBenefitModel(modelName string) bool {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return false
	}
	if modelName == ImageBenefitModelName {
		return true
	}
	return ratio_setting.FormatMatchingModelName(modelName) == ratio_setting.FormatMatchingModelName(ImageBenefitModelName)
}

func IsActiveImageBenefitToken(token *Token, modelName string) bool {
	if token == nil || !IsImageBenefitTokenName(token.Name) || !IsImageBenefitModel(modelName) {
		return false
	}
	if token.Status != common.TokenStatusEnabled {
		return false
	}
	now := common.GetTimestamp()
	if token.ExpiredTime != -1 && token.ExpiredTime != 0 && token.ExpiredTime < now {
		return false
	}
	return token.UnlimitedQuota || token.RemainQuota > 0
}

func ImageBenefitBearerKey(key string) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return ""
	}
	if strings.HasPrefix(key, "sk-") {
		return key
	}
	return "sk-" + key
}

func ImageBenefitQuotaPerImageForGroup(group string) int {
	modelPrice, ok := ratio_setting.GetModelPrice(ImageBenefitModelName, false)
	if !ok {
		modelPrice, ok = ratio_setting.GetModelPrice(ImageBenefitModelName, true)
	}
	if !ok || modelPrice <= 0 {
		return 1
	}
	groupRatio := ratio_setting.GetGroupRatio(strings.TrimSpace(group))
	if groupRatio <= 0 {
		groupRatio = 1
	}
	quota := int(math.Round(modelPrice * common.QuotaPerUnit * groupRatio))
	if quota <= 0 {
		return 1
	}
	return quota
}

func imageBenefitTokenTotalQuota(group string) int {
	return ImageBenefitQuotaPerImageForGroup(group) * ImageBenefitTotalImages
}

func GetActiveImageBenefitTokenForUser(userId int, modelName string) (*Token, bool, error) {
	if userId <= 0 || !IsImageBenefitModel(modelName) {
		return nil, false, nil
	}
	now := common.GetTimestamp()
	var token Token
	err := DB.Where(
		"user_id = ? AND name = ? AND status = ? AND (expired_time = -1 OR expired_time = 0 OR expired_time >= ?) AND (unlimited_quota = ? OR remain_quota > 0)",
		userId,
		ImageBenefitTokenName,
		common.TokenStatusEnabled,
		now,
		true,
	).Order("id desc").First(&token).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return &token, true, nil
}

func CreateImageBenefitTokenTx(tx *gorm.DB, userId int) (*Token, error) {
	if tx == nil {
		return nil, errors.New("transaction is nil")
	}
	if userId <= 0 {
		return nil, errors.New("invalid user id")
	}
	var user User
	if err := tx.Where("id = ?", userId).First(&user).Error; err != nil {
		return nil, err
	}
	group := strings.TrimSpace(user.Group)
	if group == "" {
		group = "default"
	}
	now := common.GetTimestamp()
	expiredTime := now + ImageBenefitValidSeconds
	totalQuota := imageBenefitTokenTotalQuota(group)
	if totalQuota <= 0 {
		return nil, fmt.Errorf("invalid image benefit quota")
	}

	key, err := common.GenerateKey()
	if err != nil {
		return nil, err
	}
	token := &Token{
		UserId:             userId,
		Key:                key,
		Status:             common.TokenStatusEnabled,
		Name:               ImageBenefitTokenName,
		CreatedTime:        now,
		AccessedTime:       now,
		ExpiredTime:        expiredTime,
		RemainQuota:        totalQuota,
		UnlimitedQuota:     false,
		ModelLimitsEnabled: true,
		ModelLimits:        ImageBenefitModelName,
		Group:              group,
		CrossGroupRetry:    true,
	}
	if err := tx.Create(token).Error; err != nil {
		return nil, err
	}
	return token, nil
}

func ImageBenefitTokenResultFromToken(token *Token) *ImageBenefitTokenResult {
	return ImageBenefitTokenResultFromTokenWithUsedImages(token, -1)
}

func ImageBenefitTokenResultFromTokenWithUsedImages(token *Token, loggedUsedImages int) *ImageBenefitTokenResult {
	if token == nil {
		return &ImageBenefitTokenResult{
			BaseURL:     ImageBenefitBaseURL,
			Model:       ImageBenefitModelName,
			Models:      []string{ImageBenefitModelName},
			TotalImages: ImageBenefitTotalImages,
			Status:      "none",
		}
	}
	quotaPerImage := ImageBenefitQuotaPerImageForGroup(token.Group)
	totalQuota := token.RemainQuota + token.UsedQuota
	totalImages := ImageBenefitTotalImages
	usedImages := 0
	if quotaPerImage > 0 {
		usedImages = token.UsedQuota / quotaPerImage
	}
	if loggedUsedImages >= 0 {
		usedImages = loggedUsedImages
	}
	if usedImages < 0 {
		usedImages = 0
	}
	if usedImages > totalImages {
		usedImages = totalImages
	}
	remainingImages := totalImages - usedImages
	if quotaPerImage > 0 {
		remainingImages = token.RemainQuota / quotaPerImage
		if remainingImages > totalImages-usedImages {
			remainingImages = totalImages - usedImages
		}
	}
	if remainingImages < 0 {
		remainingImages = 0
	}

	status := "active"
	now := common.GetTimestamp()
	if token.Status == common.TokenStatusExhausted || (!token.UnlimitedQuota && token.RemainQuota <= 0) {
		status = "exhausted"
	} else if token.Status == common.TokenStatusExpired || (token.ExpiredTime != -1 && token.ExpiredTime != 0 && token.ExpiredTime < now) {
		status = "expired"
	} else if token.Status != common.TokenStatusEnabled {
		status = "disabled"
	}

	return &ImageBenefitTokenResult{
		TokenId:         token.Id,
		Key:             ImageBenefitBearerKey(token.Key),
		Name:            token.Name,
		BaseURL:         ImageBenefitBaseURL,
		Model:           ImageBenefitModelName,
		Models:          []string{ImageBenefitModelName},
		TotalImages:     totalImages,
		UsedImages:      usedImages,
		RemainingImages: remainingImages,
		ExpiredTime:     token.ExpiredTime,
		CreatedTime:     token.CreatedTime,
		Status:          status,
		QuotaPerImage:   quotaPerImage,
		TotalQuota:      totalQuota,
		UsedQuota:       token.UsedQuota,
		RemainingQuota:  token.RemainQuota,
	}
}

func CountImageBenefitSuccessImages(tokenId int, group string) (int, error) {
	if tokenId <= 0 || LOG_DB == nil {
		return 0, nil
	}
	quotaPerImage := ImageBenefitQuotaPerImageForGroup(group)
	if quotaPerImage <= 0 {
		quotaPerImage = 1
	}
	var totalQuota int64
	err := LOG_DB.Model(&Log{}).
		Where("token_id = ? AND type = ? AND model_name = ? AND quota > 0", tokenId, LogTypeConsume, ImageBenefitModelName).
		Select("COALESCE(SUM(quota), 0)").
		Scan(&totalQuota).Error
	if err != nil {
		return 0, err
	}
	if totalQuota <= 0 {
		return 0, nil
	}
	images := totalQuota / int64(quotaPerImage)
	if totalQuota%int64(quotaPerImage) != 0 {
		images++
	}
	if images > int64(ImageBenefitTotalImages) {
		return ImageBenefitTotalImages, nil
	}
	return int(images), nil
}

func GetLatestImageBenefitTokenResult(userId int) (*ImageBenefitTokenResult, error) {
	if userId <= 0 {
		return nil, errors.New("invalid user id")
	}
	var token Token
	err := DB.Where("user_id = ? AND name = ?", userId, ImageBenefitTokenName).
		Order("id desc").
		First(&token).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ImageBenefitTokenResultFromToken(nil), nil
	}
	if err != nil {
		return nil, err
	}
	usedImages, err := CountImageBenefitSuccessImages(token.Id, token.Group)
	if err != nil {
		return nil, err
	}
	return ImageBenefitTokenResultFromTokenWithUsedImages(&token, usedImages), nil
}
