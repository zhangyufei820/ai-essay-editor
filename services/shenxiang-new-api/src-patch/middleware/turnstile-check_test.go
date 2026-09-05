package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestTurnstileTokenPrefersHeaderOverLegacyQuery(t *testing.T) {
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	request := httptest.NewRequest(http.MethodPost, "/api/user/login?turnstile=legacy-token", nil)
	request.Header.Set(turnstileTokenHeader, "header-token")
	context.Request = request

	require.Equal(t, "header-token", turnstileToken(context))
}

func TestTurnstileTokenSupportsLegacyQuery(t *testing.T) {
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodPost, "/api/user/login?turnstile=legacy-token", nil)

	require.Equal(t, "legacy-token", turnstileToken(context))
}
