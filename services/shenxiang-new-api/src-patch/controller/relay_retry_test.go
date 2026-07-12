package controller

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

func TestShouldRetryBypassesChannelAffinityForUpstreamForbidden(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("channel_affinity_skip_retry_on_failure", true)

	err := types.WithOpenAIError(types.OpenAIError{
		Message: "insufficient upstream quota",
		Type:    "insufficient_user_quota",
		Code:    string(types.ErrorCodeInsufficientUserQuota),
	}, http.StatusForbidden)

	if !shouldRetry(c, err, 1) {
		t.Fatal("shouldRetry() = false, want true for upstream 403 despite channel affinity")
	}
}

func TestShouldRetryKeepsChannelAffinityLockForLocalQuota(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("channel_affinity_skip_retry_on_failure", true)

	err := types.NewErrorWithStatusCode(
		errors.New("订阅额度不足"),
		types.ErrorCodeInsufficientUserQuota,
		http.StatusForbidden,
		types.ErrOptionWithSkipRetry(),
	)

	if shouldRetry(c, err, 1) {
		t.Fatal("shouldRetry() = true, want false for local quota failure")
	}
}

func TestIsVideoTaskPathIncludesPublicSubmitEndpoint(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		name string
		path string
		want bool
	}{
		{name: "public video submit", path: "/v1/videos", want: true},
		{name: "public video generations", path: "/v1/video/generations", want: true},
		{name: "playground videos", path: "/pg/videos", want: true},
		{name: "playground video generations", path: "/pg/video/generations", want: true},
		{name: "public video fetch", path: "/v1/videos/task_123", want: false},
		{name: "image submit", path: "/v1/images/generations", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, tt.path, nil)
			if got := isVideoTaskPath(c); got != tt.want {
				t.Fatalf("isVideoTaskPath(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

func TestRejectImageModelTextEndpointRequestRejectsResponses(t *testing.T) {
	err := rejectImageModelTextEndpointRequest(
		types.RelayFormatOpenAIResponses,
		&dto.OpenAIResponsesRequest{Model: "gpt-image-2-4K"},
	)
	if err == nil {
		t.Fatal("rejectImageModelTextEndpointRequest() = nil, want image model rejection")
	}
	if err.StatusCode != http.StatusBadRequest {
		t.Fatalf("StatusCode = %d, want %d", err.StatusCode, http.StatusBadRequest)
	}
	if !types.IsSkipRetryError(err) {
		t.Fatal("IsSkipRetryError() = false, want true")
	}
	if !strings.Contains(err.Error(), "/v1/images/generations") || !strings.Contains(err.Error(), "/v1/images/edits") {
		t.Fatalf("error = %q, want image endpoint hints", err.Error())
	}
}

func TestRejectImageModelTextEndpointRequestHidesSupplierModelName(t *testing.T) {
	err := rejectImageModelTextEndpointRequest(
		types.RelayFormatOpenAIResponses,
		&dto.OpenAIResponsesRequest{Model: "geek2api-image-2"},
	)
	if err == nil {
		t.Fatal("rejectImageModelTextEndpointRequest() = nil, want image model rejection")
	}
	if strings.Contains(err.Error(), "geek2api") {
		t.Fatalf("error = %q, want no supplier model name", err.Error())
	}
	if !strings.Contains(err.Error(), "/v1/images/generations") || !strings.Contains(err.Error(), "/v1/images/edits") {
		t.Fatalf("error = %q, want image endpoint hints", err.Error())
	}
}

func TestRejectImageModelTextEndpointRequestRejectsDiscountImage2PublicAlias(t *testing.T) {
	err := rejectImageModelTextEndpointRequest(
		types.RelayFormatOpenAIResponses,
		&dto.OpenAIResponsesRequest{Model: "特价 image-2"},
	)
	if err == nil {
		t.Fatal("rejectImageModelTextEndpointRequest() = nil, want image model rejection")
	}
	if err.StatusCode != http.StatusBadRequest {
		t.Fatalf("StatusCode = %d, want %d", err.StatusCode, http.StatusBadRequest)
	}
	if strings.Contains(err.Error(), "geek2api") {
		t.Fatalf("error = %q, want no supplier model name", err.Error())
	}
	if !strings.Contains(err.Error(), "特价 image-2") {
		t.Fatalf("error = %q, want public model name", err.Error())
	}
	if !strings.Contains(err.Error(), "/v1/images/generations") || !strings.Contains(err.Error(), "/v1/images/edits") {
		t.Fatalf("error = %q, want image endpoint hints", err.Error())
	}
}

func TestRejectImageModelTextEndpointRequestRejectsChat(t *testing.T) {
	err := rejectImageModelTextEndpointRequest(
		types.RelayFormatOpenAI,
		&dto.GeneralOpenAIRequest{Model: "gpt-image-2"},
	)
	if err == nil {
		t.Fatal("rejectImageModelTextEndpointRequest() = nil, want image model rejection")
	}
	if err.StatusCode != http.StatusBadRequest {
		t.Fatalf("StatusCode = %d, want %d", err.StatusCode, http.StatusBadRequest)
	}
}

func TestRejectImageModelTextEndpointRequestAllowsTextModels(t *testing.T) {
	err := rejectImageModelTextEndpointRequest(
		types.RelayFormatOpenAIResponses,
		&dto.OpenAIResponsesRequest{Model: "gpt-5.5"},
	)
	if err != nil {
		t.Fatalf("rejectImageModelTextEndpointRequest() = %v, want nil for text model", err)
	}
}

func TestRejectImageModelTextEndpointRequestSkipsImageEndpoint(t *testing.T) {
	err := rejectImageModelTextEndpointRequest(
		types.RelayFormatOpenAIImage,
		&dto.ImageRequest{Model: "gpt-image-2-4K"},
	)
	if err != nil {
		t.Fatalf("rejectImageModelTextEndpointRequest() = %v, want nil for image endpoint", err)
	}
}

func TestPlaygroundImage2ForcedResolution(t *testing.T) {
	tests := []struct {
		name string
		req  *dto.ImageRequest
		want string
	}{
		{
			name: "explicit 4K wins",
			req:  &dto.ImageRequest{Resolution: "4K", Size: "1024x1024"},
			want: "4K",
		},
		{
			name: "extra body image size",
			req:  &dto.ImageRequest{ExtraBody: json.RawMessage(`{"google":{"image_config":{"image_size":"2K"}}}`)},
			want: "2K",
		},
		{
			name: "custom 4K landscape size",
			req:  &dto.ImageRequest{Size: "3840x2160"},
			want: "4K",
		},
		{
			name: "custom 4K portrait size",
			req:  &dto.ImageRequest{Resolution: "custom", Size: "2160x3840"},
			want: "4K",
		},
		{
			name: "2K size",
			req:  &dto.ImageRequest{Size: "2048x1152"},
			want: "2K",
		},
		{
			name: "1K size not forced",
			req:  &dto.ImageRequest{Size: "1536x864"},
			want: "",
		},
		{
			name: "custom without size not forced",
			req:  &dto.ImageRequest{Resolution: "custom"},
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := playgroundImage2ForcedResolution(tt.req); got != tt.want {
				t.Fatalf("playgroundImage2ForcedResolution() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestPlaygroundImage2ForcedChannelResolutionDefaultsTo1K(t *testing.T) {
	tests := []struct {
		name string
		req  *dto.ImageRequest
		want string
	}{
		{
			name: "plain 1024 request",
			req:  &dto.ImageRequest{Size: "1024x1024"},
			want: "1K",
		},
		{
			name: "explicit auto",
			req:  &dto.ImageRequest{Resolution: "auto"},
			want: "1K",
		},
		{
			name: "forced 2K remains 2K",
			req:  &dto.ImageRequest{Resolution: "2K"},
			want: "2K",
		},
		{
			name: "custom 4K size remains 4K",
			req:  &dto.ImageRequest{Resolution: "custom", Size: "3840x2160"},
			want: "4K",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := playgroundImage2ForcedChannelResolution(tt.req); got != tt.want {
				t.Fatalf("playgroundImage2ForcedChannelResolution() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestPlaygroundImage2ForcedChannelIDsDefaultList(t *testing.T) {
	t.Setenv("GPT_IMAGE_2_4K_1K_CHANNEL_IDS", "")
	t.Setenv("GPT_IMAGE_2_4K_CHANNEL_IDS", "")
	t.Setenv("GPT_IMAGE_2_CHANNEL_IDS", "")

	key, channelIDs := playgroundImage2ForcedChannelIDs("1K")
	if key != "default" {
		t.Fatalf("key = %q, want default", key)
	}
	want := []int{24, 16, 12}
	if len(channelIDs) != len(want) {
		t.Fatalf("channelIDs = %v, want %v", channelIDs, want)
	}
	for i := range want {
		if channelIDs[i] != want[i] {
			t.Fatalf("channelIDs = %v, want %v", channelIDs, want)
		}
	}
}

func TestPlaygroundImage2ForcedChannelIDsResolutionEnvWins(t *testing.T) {
	t.Setenv("GPT_IMAGE_2_4K_1K_CHANNEL_IDS", "8,16")
	t.Setenv("GPT_IMAGE_2_4K_CHANNEL_IDS", "24,4,8,16")
	t.Setenv("GPT_IMAGE_2_CHANNEL_IDS", "")

	key, channelIDs := playgroundImage2ForcedChannelIDs("1K")
	if key != "GPT_IMAGE_2_4K_1K_CHANNEL_IDS" {
		t.Fatalf("key = %q, want GPT_IMAGE_2_4K_1K_CHANNEL_IDS", key)
	}
	want := []int{8, 16}
	if len(channelIDs) != len(want) {
		t.Fatalf("channelIDs = %v, want %v", channelIDs, want)
	}
	for i := range want {
		if channelIDs[i] != want[i] {
			t.Fatalf("channelIDs = %v, want %v", channelIDs, want)
		}
	}
}

func TestPlaygroundImage2ForcedChannelSkipsKnownBadVipMapping(t *testing.T) {
	if !shouldSkipPlaygroundImage2ForcedChannel(nil, playgroundImage2VipMappedChannelID) {
		t.Fatal("shouldSkipPlaygroundImage2ForcedChannel(#4) = false, want true")
	}
	if shouldSkipPlaygroundImage2ForcedChannel(nil, 8) {
		t.Fatal("shouldSkipPlaygroundImage2ForcedChannel(#8) = true, want false")
	}
}

func withPlaygroundImage2TempCircuitForTest(t *testing.T, channelID int, circuit *temporaryChannelCircuit) {
	t.Helper()
	oldCircuit, existed := playgroundImage2TempCircuits[channelID]
	playgroundImage2TempCircuits[channelID] = circuit
	t.Cleanup(func() {
		if existed {
			playgroundImage2TempCircuits[channelID] = oldCircuit
			return
		}
		delete(playgroundImage2TempCircuits, channelID)
	})
}

func TestPlaygroundImage2TempCircuitSkipsChannel16ButNotGeek2API(t *testing.T) {
	t.Setenv("PLAYGROUND_IMAGE2_CHANNEL16_TEMP_CIRCUIT_ENABLED", "true")
	t.Setenv("PLAYGROUND_IMAGE2_CHANNEL16_TEMP_COOLDOWN_SECONDS", "300")
	now := time.Date(2026, 7, 5, 9, 0, 0, 0, time.UTC)
	withPlaygroundImage2TempCircuitForTest(t, playgroundImage2Channel16TempCircuitChannelID, &temporaryChannelCircuit{
		now: func() time.Time { return now },
	})

	if !shouldSkipPlaygroundImage2TempCircuitChannel(nil, playgroundImage2Channel16TempCircuitChannelID) {
		t.Fatal("shouldSkipPlaygroundImage2TempCircuitChannel(#16) = false, want true during initial cooldown")
	}
	if shouldSkipPlaygroundImage2TempCircuitChannel(nil, 27) {
		t.Fatal("shouldSkipPlaygroundImage2TempCircuitChannel(#27) = true, want false for independent Geek2API channel")
	}
}

func TestPlaygroundImage2TempCircuitChannel16FailureAndSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("PLAYGROUND_IMAGE2_CHANNEL16_TEMP_CIRCUIT_ENABLED", "true")
	t.Setenv("PLAYGROUND_IMAGE2_CHANNEL16_TEMP_COOLDOWN_SECONDS", "300")
	t.Setenv("PLAYGROUND_IMAGE2_CHANNEL16_TEMP_SUCCESS_THRESHOLD", "1")
	now := time.Date(2026, 7, 5, 9, 0, 0, 0, time.UTC)
	circuit := &temporaryChannelCircuit{now: func() time.Time { return now }}
	circuit.clear()
	withPlaygroundImage2TempCircuitForTest(t, playgroundImage2Channel16TempCircuitChannelID, circuit)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set(playgroundImage2TempCircuitScopeKey, true)
	err := types.WithOpenAIError(types.OpenAIError{
		Message: "The origin web server did not return a complete response within the 120-second Proxy Read Timeout window",
		Type:    "openai_error",
		Code:    "upstream_timeout",
	}, 524)

	recordPlaygroundImage2TempCircuitFailure(c, playgroundImage2Channel16TempCircuitChannelID, err)
	skip, probe, _ := circuit.shouldSkipOrProbe(5 * time.Minute)
	if !skip || probe {
		t.Fatalf("after #16 failure shouldSkipOrProbe() = skip %v probe %v, want cooldown skip", skip, probe)
	}

	now = now.Add(5*time.Minute + time.Second)
	skip, probe, _ = circuit.shouldSkipOrProbe(5 * time.Minute)
	if skip || !probe {
		t.Fatalf("expired #16 cooldown shouldSkipOrProbe() = skip %v probe %v, want half-open probe", skip, probe)
	}

	c.Set(playgroundImage2TempCircuitRequestKey, true)
	recordPlaygroundImage2TempCircuitSuccess(c, playgroundImage2Channel16TempCircuitChannelID)
	skip, probe, _ = circuit.shouldSkipOrProbe(5 * time.Minute)
	if skip || probe {
		t.Fatalf("after #16 success shouldSkipOrProbe() = skip %v probe %v, want restored channel", skip, probe)
	}
}

func TestPlaygroundImage2TempCircuitRequiresConsecutiveProbeSuccesses(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("PLAYGROUND_IMAGE2_CHANNEL24_TEMP_CIRCUIT_ENABLED", "true")
	t.Setenv("PLAYGROUND_IMAGE2_CHANNEL24_TEMP_COOLDOWN_SECONDS", "300")
	t.Setenv("PLAYGROUND_IMAGE2_CHANNEL24_TEMP_SUCCESS_THRESHOLD", "3")
	now := time.Date(2026, 7, 5, 9, 0, 0, 0, time.UTC)
	circuit := &temporaryChannelCircuit{now: func() time.Time { return now }}
	circuit.coolDown(5 * time.Minute)
	withPlaygroundImage2TempCircuitForTest(t, playgroundImage2Channel24TempCircuitChannelID, circuit)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set(playgroundImage2TempCircuitScopeKey, true)

	for attempt := 1; attempt <= 2; attempt++ {
		now = now.Add(5*time.Minute + time.Second)
		skip, probe, _ := circuit.shouldSkipOrProbe(5 * time.Minute)
		if skip || !probe {
			t.Fatalf("probe attempt %d shouldSkipOrProbe() = skip %v probe %v, want half-open probe", attempt, skip, probe)
		}
		c.Set(playgroundImage2TempCircuitRequestKey, true)
		recordPlaygroundImage2TempCircuitSuccess(c, playgroundImage2Channel24TempCircuitChannelID)
		skip, probe, _ = circuit.shouldSkipOrProbe(5 * time.Minute)
		if !skip || probe {
			t.Fatalf("after probe success %d shouldSkipOrProbe() = skip %v probe %v, want still cooled", attempt, skip, probe)
		}
	}

	now = now.Add(5*time.Minute + time.Second)
	skip, probe, _ := circuit.shouldSkipOrProbe(5 * time.Minute)
	if skip || !probe {
		t.Fatalf("third probe shouldSkipOrProbe() = skip %v probe %v, want half-open probe", skip, probe)
	}
	c.Set(playgroundImage2TempCircuitRequestKey, true)
	recordPlaygroundImage2TempCircuitSuccess(c, playgroundImage2Channel24TempCircuitChannelID)
	skip, probe, _ = circuit.shouldSkipOrProbe(5 * time.Minute)
	if skip || probe {
		t.Fatalf("after third probe success shouldSkipOrProbe() = skip %v probe %v, want restored", skip, probe)
	}
}

func TestShouldRetryAllowsPlaygroundForcedTimeoutFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("channel_affinity_skip_retry_on_failure", true)
	setPlaygroundForcedChannelIDs(c, []int{24, 4, 8, 16, 12})
	c.Set("use_channel", []string{"8"})

	err := types.WithOpenAIError(types.OpenAIError{
		Message: "The origin web server did not return a complete response within the 120-second Proxy Read Timeout window",
		Type:    "openai_error",
		Code:    "upstream_timeout",
	}, 524)

	if !shouldRetry(c, err, 2) {
		t.Fatal("shouldRetry() = false, want true for playground forced 524 with remaining channels")
	}
}

func TestShouldRetryAllowsPlaygroundForcedUpstreamBalanceFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("channel_affinity_skip_retry_on_failure", true)
	setPlaygroundForcedChannelIDs(c, []int{8, 16, 12})
	c.Set("use_channel", []string{"8"})

	err := types.WithOpenAIError(types.OpenAIError{
		Message: "Insufficient balance to start image generation: available $1.972320, required up to $1.980000",
		Type:    "insufficient_user_quota",
		Code:    "insufficient_user_quota",
	}, http.StatusBadRequest)

	if !shouldRetry(c, err, 2) {
		t.Fatal("shouldRetry() = false, want true for upstream image balance failure with remaining channels")
	}
}

func TestShouldRetryKeepsGlobalTimeoutPolicyWithoutForcedFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	err := types.WithOpenAIError(types.OpenAIError{
		Message: "gateway timeout",
		Type:    "openai_error",
		Code:    "upstream_timeout",
	}, 524)

	if shouldRetry(c, err, 2) {
		t.Fatal("shouldRetry() = true, want false for normal 524 without playground forced fallback")
	}
}

func TestShouldRetryStopsWhenForcedFallbackExhausted(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	setPlaygroundForcedChannelIDs(c, []int{8})
	c.Set("use_channel", []string{"8"})

	err := types.WithOpenAIError(types.OpenAIError{
		Message: "gateway timeout",
		Type:    "openai_error",
		Code:    "upstream_timeout",
	}, 524)

	if shouldRetry(c, err, 2) {
		t.Fatal("shouldRetry() = true, want false after forced fallback channels are exhausted")
	}
}

func TestTemporaryChannelCircuitStartsCoolingThenAllowsProbe(t *testing.T) {
	now := time.Date(2026, 7, 2, 12, 0, 0, 0, time.UTC)
	circuit := &temporaryChannelCircuit{now: func() time.Time { return now }}

	skip, probe, _ := circuit.shouldSkipOrProbe(5 * time.Minute)
	if !skip || probe {
		t.Fatalf("initial shouldSkipOrProbe() = skip %v probe %v, want initial cooldown skip", skip, probe)
	}

	now = now.Add(5*time.Minute + time.Second)
	skip, probe, _ = circuit.shouldSkipOrProbe(5 * time.Minute)
	if skip || !probe {
		t.Fatalf("expired shouldSkipOrProbe() = skip %v probe %v, want half-open probe", skip, probe)
	}

	skip, probe, _ = circuit.shouldSkipOrProbe(5 * time.Minute)
	if !skip || probe {
		t.Fatalf("probe window shouldSkipOrProbe() = skip %v probe %v, want skip while probe cooldown is active", skip, probe)
	}
}

func TestTemporaryChannelCircuitClearsAfterSuccessfulProbe(t *testing.T) {
	now := time.Date(2026, 7, 2, 12, 0, 0, 0, time.UTC)
	circuit := &temporaryChannelCircuit{now: func() time.Time { return now }}
	circuit.coolDown(5 * time.Minute)

	now = now.Add(5*time.Minute + time.Second)
	_, probe, _ := circuit.shouldSkipOrProbe(5 * time.Minute)
	if !probe {
		t.Fatal("shouldSkipOrProbe() probe = false, want half-open probe after cooldown")
	}

	circuit.clear()
	for i := 0; i < 3; i++ {
		skip, probe, _ := circuit.shouldSkipOrProbe(5 * time.Minute)
		if skip || probe {
			t.Fatalf("after clear attempt %d = skip %v probe %v, want normal open channel", i, skip, probe)
		}
	}
}

func TestTemporaryChannelCircuitFailureReentersCooldown(t *testing.T) {
	now := time.Date(2026, 7, 2, 12, 0, 0, 0, time.UTC)
	circuit := &temporaryChannelCircuit{now: func() time.Time { return now }}
	circuit.clear()

	circuit.coolDown(5 * time.Minute)
	skip, probe, _ := circuit.shouldSkipOrProbe(5 * time.Minute)
	if !skip || probe {
		t.Fatalf("after failure shouldSkipOrProbe() = skip %v probe %v, want cooldown skip", skip, probe)
	}
}
