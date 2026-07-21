package controller

import (
	"context"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func ensureSystemTokensForUser(c *gin.Context, userID int) {
	if userID <= 0 {
		return
	}
	ctx := context.Background()
	if c != nil && c.Request != nil {
		ctx = c.Request.Context()
	}
	result, err := service.EnsureSystemTokensForUserID(ctx, userID)
	if err != nil {
		common.SysLog(fmt.Sprintf("ensure system tokens for user %d failed: %v", userID, err))
		return
	}
	if result.Created > 0 || result.Updated > 0 {
		common.SysLog(fmt.Sprintf("ensured system tokens for user %d: created=%d updated=%d", userID, result.Created, result.Updated))
	}
}

func GetAllTokensWithSystemSync(c *gin.Context) {
	ensureSystemTokensForUser(c, c.GetInt("id"))
	GetAllTokens(c)
}
