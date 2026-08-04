package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const monthlyCardTokenName = service.MonthlyCardTokenName

func CreateMonthlyCardToken(c *gin.Context) {
	userID := c.GetInt("id")
	token, created, err := service.EnsureMonthlyCardTokenForUser(c.Request.Context(), userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrNoActiveMonthlyCard):
			c.JSON(http.StatusForbidden, gin.H{
				"success": false,
				"message": "当前账号没有有效月卡",
			})
		case errors.Is(err, service.ErrMonthlyCardTokenUnavailable):
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"message": "月卡专用 Key 已停用，请先在令牌管理页处理",
			})
		default:
			common.ApiError(c, err)
		}
		return
	}
	message := "monthly card token already exists"
	if created {
		message = "created"
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": message,
		"data":    buildMaskedTokenResponse(token),
	})
}

func buildMonthlyCardToken(userID int, key string) model.Token {
	return service.BuildMonthlyCardToken(userID, key)
}
