package controller

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const monthlyCardTokenName = "月卡专用 Key"

func CreateMonthlyCardToken(c *gin.Context) {
	userID := c.GetInt("id")
	ok, err := service.UserHasMonthlyCard(userID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "当前账号没有有效月卡",
		})
		return
	}

	var existing model.Token
	err = model.DB.Where("user_id = ? AND name = ?", userID, monthlyCardTokenName).First(&existing).Error
	if err == nil {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "monthly card token already exists",
			"data":    buildMaskedTokenResponse(&existing),
		})
		return
	}
	if exists, recordErr := model.RecordExist(err); recordErr != nil {
		common.ApiError(c, recordErr)
		return
	} else if exists {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "monthly card token already exists",
			"data":    buildMaskedTokenResponse(&existing),
		})
		return
	}

	key, err := common.GenerateKey()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token := buildMonthlyCardToken(userID, key)
	if err := token.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "created",
		"data":    buildMaskedTokenResponse(&token),
	})
}

func buildMonthlyCardToken(userID int, key string) model.Token {
	return model.Token{
		UserId:             userID,
		Key:                key,
		Status:             common.TokenStatusEnabled,
		Name:               monthlyCardTokenName,
		CreatedTime:        common.GetTimestamp(),
		AccessedTime:       common.GetTimestamp(),
		ExpiredTime:        -1,
		RemainQuota:        0,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: true,
		ModelLimits:        strings.Join(service.MonthlyCardAllowedModels(), ","),
		Group:              "default",
		CrossGroupRetry:    false,
	}
}
