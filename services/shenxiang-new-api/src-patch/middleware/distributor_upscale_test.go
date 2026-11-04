package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestUpscaleModelsRequireDedicatedEndpointBeforeChannelSelection(t *testing.T) {
	for _, path := range []string{"/v1/chat/completions", "/v1/images/generations"} {
		for _, name := range []string{"精准放大", "创意放大"} {
			r := gin.New()
			r.POST(path, Distribute(), func(c *gin.Context) { t.Fatal("upscale request entered generic relay") })
			w := httptest.NewRecorder()
			req := httptest.NewRequest("POST", path, strings.NewReader(`{"model":"`+name+`","prompt":"test"}`))
			req.Header.Set("Content-Type", "application/json")
			r.ServeHTTP(w, req)
			require.Equal(t, http.StatusBadRequest, w.Code)
			require.Contains(t, w.Body.String(), "/v1/images/upscale")
		}
	}
}
