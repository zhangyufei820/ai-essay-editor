package middleware

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

func abortWithOpenAiMessage(c *gin.Context, statusCode int, message string, code ...types.ErrorCode) {
	errorCode := types.ErrorCode("new_api_error")
	if len(code) > 0 {
		errorCode = code[0]
	}
	userId := c.GetInt("id")
	apiErr := types.NewErrorWithStatusCode(fmt.Errorf("%s", message), errorCode, statusCode)
	c.JSON(statusCode, gin.H{
		"error": apiErr.ToPublicOpenAIError(c.GetString(common.RequestIdKey)),
	})
	c.Abort()
	logger.LogError(c.Request.Context(), fmt.Sprintf("user %d | %s", userId, message))
}

func abortWithMidjourneyMessage(c *gin.Context, statusCode int, code int, description string) {
	c.JSON(statusCode, gin.H{
		"description": description,
		"type":        "new_api_error",
		"code":        code,
	})
	c.Abort()
	logger.LogError(c.Request.Context(), description)
}
