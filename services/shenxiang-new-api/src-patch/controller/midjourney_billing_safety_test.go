package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRejectUnsafeMidjourneyMutationFailsClosed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mutatingModes := []int{
		relayconstant.RelayModeMidjourneyAction,
		relayconstant.RelayModeMidjourneyImagine,
		relayconstant.RelayModeMidjourneyDescribe,
		relayconstant.RelayModeMidjourneyBlend,
		relayconstant.RelayModeMidjourneyChange,
		relayconstant.RelayModeMidjourneySimpleChange,
		relayconstant.RelayModeMidjourneyModal,
		relayconstant.RelayModeMidjourneyShorten,
		relayconstant.RelayModeMidjourneyUpload,
		relayconstant.RelayModeMidjourneyVideo,
		relayconstant.RelayModeMidjourneyEdits,
		relayconstant.RelayModeSwapFace,
		-1,
	}

	for _, relayMode := range mutatingModes {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		require.True(t, rejectUnsafeMidjourneyMutation(ctx, relayMode))
		require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
		require.Contains(t, recorder.Body.String(), "midjourney_billing_safety_unavailable")
	}
}

func TestRelayMidjourneyWithInfoRejectsMutationBeforeDispatch(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	relayMidjourneyWithInfo(ctx, &relaycommon.RelayInfo{
		RelayMode: relayconstant.RelayModeMidjourneyImagine,
	})

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	require.Contains(t, recorder.Body.String(), "midjourney_billing_safety_unavailable")
}

func TestRejectUnsafeMidjourneyMutationAllowsReadOnlyModes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	readOnlyModes := []int{
		relayconstant.RelayModeMidjourneyNotify,
		relayconstant.RelayModeMidjourneyTaskFetch,
		relayconstant.RelayModeMidjourneyTaskFetchByCondition,
		relayconstant.RelayModeMidjourneyTaskImageSeed,
	}

	for _, relayMode := range readOnlyModes {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		require.False(t, rejectUnsafeMidjourneyMutation(ctx, relayMode))
		require.Equal(t, http.StatusOK, recorder.Code)
		require.Empty(t, recorder.Body.String())
	}
}
