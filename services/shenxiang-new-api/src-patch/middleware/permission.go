package middleware

import (
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/authz"

	"github.com/gin-gonic/gin"
)

func RequirePermission(permission authz.Permission) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetInt("id")
		role := c.GetInt("role")
		if authz.Can(userID, role, permission) {
			c.Next()
			return
		}

		model.RecordOperationAuditLog(
			userID,
			"permission denied",
			model.ResolveAuditClientIP(c),
			"permission.denied",
			map[string]interface{}{
				"resource": permission.Resource,
				"action":   permission.Action,
				"method":   c.Request.Method,
				"path":     c.Request.URL.Path,
			},
			map[string]interface{}{
				"admin_id":   userID,
				"admin_role": role,
			},
			map[string]interface{}{
				"reason": "authz_denied",
			},
		)

		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "permission denied",
		})
		c.Abort()
	}
}
