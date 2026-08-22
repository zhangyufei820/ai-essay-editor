package controller

import (
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// recordRegistrationAudit records only safe registration metadata. Credentials,
// verification codes, email addresses, and API keys must never enter audit logs.
func recordRegistrationAudit(c *gin.Context, userID int, username string, method string) {
	if userID <= 0 {
		return
	}
	model.RecordOperationAuditLog(
		userID,
		"user.register",
		model.ResolveAuditClientIP(c),
		"user.register",
		registrationAuditParams(username, method),
		nil,
		nil,
	)
}

func registrationAuditParams(username string, method string) map[string]interface{} {
	return map[string]interface{}{
		"username": username,
		"method":   method,
	}
}
