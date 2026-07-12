package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestResolveAdvanceResetTime(t *testing.T) {
	falseValue := false
	trueValue := true
	require.True(t, resolveAdvanceResetTime(nil))
	require.False(t, resolveAdvanceResetTime(&falseValue))
	require.True(t, resolveAdvanceResetTime(&trueValue))
}

func TestSubscriptionResetHandlersRejectInvalidRequestsBeforeDatabaseAccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		name        string
		handler     gin.HandlerFunc
		id          string
		body        string
		wantMessage string
	}{
		{"invalid plan id", AdminResetPlanSubscriptions, "0", "{}", "无效的ID"},
		{"invalid user id", AdminResetUserSubscriptionsByPlan, "0", "{}", "无效的用户ID"},
		{"invalid plan body", AdminResetPlanSubscriptions, "1", "not-json", "参数错误"},
		{"missing user plan id", AdminResetUserSubscriptionsByPlan, "1", "{}", "参数错误"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(test.body))
			context.Request.Header.Set("Content-Type", "application/json")
			context.Params = gin.Params{{Key: "id", Value: test.id}}

			test.handler(context)

			require.Equal(t, http.StatusOK, recorder.Code)
			require.JSONEq(t, `{"success":false,"message":"`+test.wantMessage+`"}`, recorder.Body.String())
		})
	}
}
