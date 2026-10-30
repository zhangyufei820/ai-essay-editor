package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestDistributeRejectsRetiredTextModelsBeforeAnyChannelSelection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, path := range []string{"/v1/responses", "/v1/chat/completions", "/pg/chat/completions"} {
		for _, model := range []string{"gpt-5.5", "gpt-5.6", " GPT-5.5 "} {
			for _, forced := range []bool{false, true} {
				t.Run(path+model+map[bool]string{false: " unrestricted", true: " forced channel"}[forced], func(t *testing.T) {
					r := gin.New()
					r.POST(path, func(c *gin.Context) {
						common.SetContextKey(c, constant.ContextKeyTokenModelLimitEnabled, false)
						if forced {
							// This would fail channel parsing if retirement did not win first.
							common.SetContextKey(c, constant.ContextKeyTokenSpecificChannelId, "invalid")
						}
					}, Distribute(), func(c *gin.Context) { t.Error("retired request reached the relay") })
					w := httptest.NewRecorder()
					req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"model":"`+model+`","input":"OK"}`))
					req.Header.Set("Content-Type", "application/json")
					r.ServeHTTP(w, req)
					require.Equal(t, http.StatusNotFound, w.Code)
					require.Contains(t, w.Body.String(), "model_not_found")
				})
			}
		}
	}
}
