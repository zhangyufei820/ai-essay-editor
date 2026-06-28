package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRegisterPlaygroundMediaFilesRouteDoesNotUseRelayPerformanceGate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	server := gin.New()

	playgroundMediaRouter := server.Group("/pg/media/files")
	playgroundMediaRouter.Use(middleware.RouteTag("web"))
	playgroundMediaRouter.GET("/*filepath", func(c *gin.Context) {
		require.Equal(t, "web", c.GetString(middleware.RouteTagKey))
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/pg/media/files/u-1/test.png", nil)
	resp := httptest.NewRecorder()
	server.ServeHTTP(resp, req)

	require.Equal(t, http.StatusOK, resp.Code)
	require.Equal(t, "ok", resp.Body.String())
}

func TestPlaygroundServeMediaHandlerIsRegisteredForGet(t *testing.T) {
	gin.SetMode(gin.TestMode)
	server := gin.New()

	playgroundMediaRouter := server.Group("/pg/media/files")
	playgroundMediaRouter.Use(middleware.RouteTag("web"))
	playgroundMediaRouter.GET("/*filepath", controller.PlaygroundServeMedia)

	routes := server.Routes()
	require.Len(t, routes, 1)
	require.Equal(t, http.MethodGet, routes[0].Method)
	require.Equal(t, "/pg/media/files/*filepath", routes[0].Path)
}
