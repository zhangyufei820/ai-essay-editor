package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// UpdateTokenWithTextPricingSync preserves the upstream token update behavior
// and additionally treats the managed Codex text token group as the user's
// global text-pricing preference.
func UpdateTokenWithTextPricingSync(c *gin.Context) {
	userID := c.GetInt("id")
	statusOnly := c.Query("status_only")
	requestToken := model.Token{}
	if err := c.ShouldBindJSON(&requestToken); err != nil {
		common.ApiError(c, err)
		return
	}
	if len(requestToken.Name) > 50 {
		common.ApiErrorI18n(c, i18n.MsgTokenNameTooLong)
		return
	}
	if !requestToken.UnlimitedQuota {
		if requestToken.RemainQuota < 0 {
			common.ApiErrorI18n(c, i18n.MsgTokenQuotaNegative)
			return
		}
		maxQuotaValue := int(1000000000 * common.QuotaPerUnit)
		if requestToken.RemainQuota > maxQuotaValue {
			common.ApiErrorI18n(c, i18n.MsgTokenQuotaExceedMax, map[string]any{"Max": maxQuotaValue})
			return
		}
	}

	cleanToken, err := model.GetTokenByIds(requestToken.Id, userID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	originalName := cleanToken.Name
	if requestToken.Status == common.TokenStatusEnabled {
		if cleanToken.Status == common.TokenStatusExpired && cleanToken.ExpiredTime <= common.GetTimestamp() && cleanToken.ExpiredTime != -1 {
			common.ApiErrorI18n(c, i18n.MsgTokenExpiredCannotEnable)
			return
		}
		if cleanToken.Status == common.TokenStatusExhausted && cleanToken.RemainQuota <= 0 && !cleanToken.UnlimitedQuota {
			common.ApiErrorI18n(c, i18n.MsgTokenExhaustedCannotEable)
			return
		}
	}

	if statusOnly != "" {
		cleanToken.Status = requestToken.Status
	} else {
		cleanToken.Name = requestToken.Name
		cleanToken.ExpiredTime = requestToken.ExpiredTime
		cleanToken.RemainQuota = requestToken.RemainQuota
		cleanToken.UnlimitedQuota = requestToken.UnlimitedQuota
		cleanToken.ModelLimitsEnabled = requestToken.ModelLimitsEnabled
		cleanToken.ModelLimits = requestToken.ModelLimits
		cleanToken.AllowIps = requestToken.AllowIps
		cleanToken.Group = requestToken.Group
		cleanToken.CrossGroupRetry = requestToken.CrossGroupRetry
	}

	syncPreference := statusOnly == "" && (model.IsManagedTextPricingTokenName(originalName) || model.IsManagedTextPricingTokenName(cleanToken.Name))
	if err := model.UpdateTokenWithTextPricingPreference(cleanToken, syncPreference); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    buildMaskedTokenResponse(cleanToken),
	})
}
