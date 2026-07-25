package controller

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type playgroundDiscountBillingStub struct {
	preConsumed    int
	reserveTargets []int
	reserveErr     error
}

func TestShouldReuseInitialSelectedChannelReselectsExplicitGroupChainRetry(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{}

	retry := 0
	require.True(t, shouldReuseInitialSelectedChannel(ctx, info, &service.RetryParam{Ctx: ctx, Retry: &retry}))

	service.SetTokenGroupChain(ctx, []string{service.DiscountPricingGroupName, service.PlusPricingGroupName})
	retry = 0
	require.True(t, shouldReuseInitialSelectedChannel(ctx, info, &service.RetryParam{Ctx: ctx, Retry: &retry}))
	retry = 1
	require.False(t, shouldReuseInitialSelectedChannel(ctx, info, &service.RetryParam{Ctx: ctx, Retry: &retry}))
}

func (s *playgroundDiscountBillingStub) Settle(int) error { return nil }

func (s *playgroundDiscountBillingStub) Refund(*gin.Context) {}

func (s *playgroundDiscountBillingStub) NeedsRefund() bool { return true }

func (s *playgroundDiscountBillingStub) GetPreConsumedQuota() int { return s.preConsumed }

func (s *playgroundDiscountBillingStub) Reserve(targetQuota int) error {
	s.reserveTargets = append(s.reserveTargets, targetQuota)
	return s.reserveErr
}

func withPublicPlaygroundDiscountGroups(t *testing.T) {
	t.Helper()
	original := setting.UserUsableGroups2JSONString()
	t.Cleanup(func() {
		if err := setting.UpdateUserUsableGroupsByJSONString(original); err != nil {
			t.Fatalf("restore usable groups: %v", err)
		}
	})
	if err := setting.UpdateUserUsableGroupsByJSONString(`{"default":"原价","discount":"特价"}`); err != nil {
		t.Fatalf("configure usable groups: %v", err)
	}
}

func withTokenCounting(t *testing.T) {
	t.Helper()
	original := constant.CountToken
	constant.CountToken = true
	t.Cleanup(func() {
		constant.CountToken = original
	})
}

func withPlaygroundDiscountPricing(t *testing.T) {
	t.Helper()
	originalModelRatio := ratio_setting.ModelRatio2JSONString()
	originalGroupRatio := ratio_setting.GroupRatio2JSONString()
	originalCompletionRatio := ratio_setting.CompletionRatio2JSONString()
	t.Cleanup(func() {
		if err := ratio_setting.UpdateModelRatioByJSONString(originalModelRatio); err != nil {
			t.Fatalf("restore model ratio: %v", err)
		}
		if err := ratio_setting.UpdateGroupRatioByJSONString(originalGroupRatio); err != nil {
			t.Fatalf("restore group ratio: %v", err)
		}
		if err := ratio_setting.UpdateCompletionRatioByJSONString(originalCompletionRatio); err != nil {
			t.Fatalf("restore completion ratio: %v", err)
		}
	})
	if err := ratio_setting.UpdateModelRatioByJSONString(`{"gpt-5.5":2}`); err != nil {
		t.Fatalf("configure model ratio: %v", err)
	}
	if err := ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"discount":0.25}`); err != nil {
		t.Fatalf("configure group ratio: %v", err)
	}
	if err := ratio_setting.UpdateCompletionRatioByJSONString(`{"gpt-5.5":6}`); err != nil {
		t.Fatalf("configure completion ratio: %v", err)
	}
}

func newPlaygroundDiscountFallbackContext() (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
	c.Request.Header.Set(playgroundAutoPricingFallbackHeader, "1")
	return c, recorder
}

func TestPlaygroundDiscountAvailabilityErrorClassification(t *testing.T) {
	tests := []struct {
		name string
		err  *types.NewAPIError
		want bool
	}{
		{
			name: "network failure",
			err:  types.NewOpenAIError(errors.New("connection refused"), types.ErrorCodeDoRequestFailed, http.StatusInternalServerError),
			want: true,
		},
		{
			name: "upstream rate limit",
			err: types.WithOpenAIError(types.OpenAIError{
				Message: "temporarily busy",
				Code:    "rate_limit_exceeded",
			}, http.StatusTooManyRequests),
			want: true,
		},
		{
			name: "upstream quota unavailable",
			err: types.WithOpenAIError(types.OpenAIError{
				Message: "insufficient upstream quota",
				Code:    "insufficient_quota",
			}, http.StatusForbidden),
			want: true,
		},
		{
			name: "channel key unavailable",
			err:  types.NewError(errors.New("no key"), types.ErrorCodeChannelNoAvailableKey),
			want: true,
		},
		{
			name: "prompt blocked",
			err:  types.NewErrorWithStatusCode(errors.New("blocked"), types.ErrorCodePromptBlocked, http.StatusBadRequest),
			want: false,
		},
		{
			name: "upstream policy rejection",
			err: types.WithOpenAIError(types.OpenAIError{
				Message: "content policy rejection",
				Code:    "content_policy_violation",
			}, http.StatusForbidden),
			want: false,
		},
		{
			name: "upstream request validation",
			err: types.WithOpenAIError(types.OpenAIError{
				Message: "invalid parameter",
				Code:    "invalid_request_error",
			}, http.StatusBadRequest),
			want: false,
		},
		{
			name: "local quota failure",
			err:  types.NewErrorWithStatusCode(errors.New("quota insufficient"), types.ErrorCodeInsufficientUserQuota, http.StatusForbidden),
			want: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := isPlaygroundDiscountAvailabilityError(test.err); got != test.want {
				t.Fatalf("isPlaygroundDiscountAvailabilityError() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestPrepareTokenGroupFallbackBillingRepricesAndReservesActualGroup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withTokenCounting(t)
	withPlaygroundDiscountPricing(t)
	ctx, _ := newPlaygroundDiscountFallbackContext()
	service.SetTokenGroupChain(ctx, []string{service.DiscountPricingGroupName, "default"})
	service.MarkTokenGroupChainSelected(ctx, "default")
	billing := &playgroundDiscountBillingStub{preConsumed: 120}
	info := &relaycommon.RelayInfo{
		OriginModelName: "gpt-5.5",
		UserGroup:       "default",
		UsingGroup:      service.DiscountPricingGroupName,
		Billing:         billing,
		PriceData: types.PriceData{
			QuotaToPreConsume: 120,
			GroupRatioInfo:    types.GroupRatioInfo{GroupRatio: service.DiscountPricingGroupRatio},
		},
	}
	info.SetEstimatePromptTokens(100)

	apiErr := prepareTokenGroupFallbackBilling(ctx, info, &types.TokenCountMeta{MaxTokens: 100})

	require.Nil(t, apiErr)
	require.Equal(t, "default", info.UsingGroup)
	require.Equal(t, 1.0, info.PriceData.GroupRatioInfo.GroupRatio)
	require.Len(t, billing.reserveTargets, 1)
	require.Greater(t, billing.reserveTargets[0], 120)
}

func TestPrepareTokenGroupFallbackBillingRestoresPricingWhenReserveFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withTokenCounting(t)
	withPlaygroundDiscountPricing(t)
	ctx, _ := newPlaygroundDiscountFallbackContext()
	service.SetTokenGroupChain(ctx, []string{service.DiscountPricingGroupName, "default"})
	service.MarkTokenGroupChainSelected(ctx, "default")
	previousPrice := types.PriceData{
		QuotaToPreConsume: 120,
		GroupRatioInfo:    types.GroupRatioInfo{GroupRatio: service.DiscountPricingGroupRatio},
	}
	billing := &playgroundDiscountBillingStub{preConsumed: 120, reserveErr: errors.New("reserve rejected")}
	info := &relaycommon.RelayInfo{
		OriginModelName: "gpt-5.5",
		UserGroup:       "default",
		UsingGroup:      service.DiscountPricingGroupName,
		Billing:         billing,
		PriceData:       previousPrice,
	}
	info.SetEstimatePromptTokens(100)

	apiErr := prepareTokenGroupFallbackBilling(ctx, info, &types.TokenCountMeta{MaxTokens: 100})

	require.NotNil(t, apiErr)
	require.Equal(t, service.DiscountPricingGroupName, info.UsingGroup)
	require.Equal(t, service.DiscountPricingGroupName, common.GetContextKeyString(ctx, constant.ContextKeyUsingGroup))
	require.Equal(t, previousPrice, info.PriceData)
}

func TestShouldRetryExplicitGroupChainStopsAfterResponsesOutput(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := newPlaygroundDiscountFallbackContext()
	service.SetTokenGroupChain(ctx, []string{"default", service.DiscountPricingGroupName})
	ctx.Set("responses_stream_output_tracking", true)
	ctx.Set("response_stream_output_sent", true)
	upstreamErr := types.NewOpenAIError(errors.New("upstream unavailable"), types.ErrorCodeDoRequestFailed, http.StatusServiceUnavailable)

	require.False(t, shouldRetry(ctx, upstreamErr, 1))
}

func TestShouldFallbackPlaygroundDiscountRequiresUnwrittenFirstAttempt(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withPublicPlaygroundDiscountGroups(t)
	originalCountToken := constant.CountToken
	constant.CountToken = true
	t.Cleanup(func() {
		constant.CountToken = originalCountToken
	})
	availabilityErr := types.NewOpenAIError(errors.New("connection refused"), types.ErrorCodeDoRequestFailed, http.StatusInternalServerError)
	info := &relaycommon.RelayInfo{UsingGroup: service.DiscountPricingGroupName, UserGroup: "default"}
	boundedMeta := &types.TokenCountMeta{MaxTokens: 4096}

	c, _ := newPlaygroundDiscountFallbackContext()
	if !shouldFallbackPlaygroundDiscount(c, info, boundedMeta, availabilityErr) {
		t.Fatal("shouldFallbackPlaygroundDiscount() = false, want true before response output")
	}

	manualOnly, _ := newPlaygroundDiscountFallbackContext()
	manualOnly.Request.Header.Del(playgroundAutoPricingFallbackHeader)
	if shouldFallbackPlaygroundDiscount(manualOnly, info, boundedMeta, availabilityErr) {
		t.Fatal("shouldFallbackPlaygroundDiscount() = true without explicit auto-fallback opt-in")
	}

	cWithoutCompletionLimit, _ := newPlaygroundDiscountFallbackContext()
	if shouldFallbackPlaygroundDiscount(cWithoutCompletionLimit, info, &types.TokenCountMeta{}, availabilityErr) {
		t.Fatal("shouldFallbackPlaygroundDiscount() = true without a bounded completion size")
	}

	cWithoutTokenCounting, _ := newPlaygroundDiscountFallbackContext()
	constant.CountToken = false
	if shouldFallbackPlaygroundDiscount(cWithoutTokenCounting, info, boundedMeta, availabilityErr) {
		t.Fatal("shouldFallbackPlaygroundDiscount() = true while prompt token counting is disabled")
	}
	constant.CountToken = true

	cWithOutput, _ := newPlaygroundDiscountFallbackContext()
	_, _ = cWithOutput.Writer.Write([]byte("data: visible"))
	if shouldFallbackPlaygroundDiscount(cWithOutput, info, boundedMeta, availabilityErr) {
		t.Fatal("shouldFallbackPlaygroundDiscount() = true after response output")
	}

	cAlreadyRetried, _ := newPlaygroundDiscountFallbackContext()
	cAlreadyRetried.Set(playgroundDiscountFallbackKey, true)
	if shouldFallbackPlaygroundDiscount(cAlreadyRetried, info, boundedMeta, availabilityErr) {
		t.Fatal("shouldFallbackPlaygroundDiscount() = true after fallback was already attempted")
	}

	cancelledRequest, _ := newPlaygroundDiscountFallbackContext()
	cancelledCtx, cancel := context.WithCancel(cancelledRequest.Request.Context())
	cancel()
	cancelledRequest.Request = cancelledRequest.Request.WithContext(cancelledCtx)
	if shouldFallbackPlaygroundDiscount(cancelledRequest, info, boundedMeta, availabilityErr) {
		t.Fatal("shouldFallbackPlaygroundDiscount() = true after the client request was cancelled")
	}

	cOtherPath, _ := newPlaygroundDiscountFallbackContext()
	cOtherPath.Request.URL.Path = "/v1/chat/completions"
	if shouldFallbackPlaygroundDiscount(cOtherPath, info, boundedMeta, availabilityErr) {
		t.Fatal("shouldFallbackPlaygroundDiscount() = true outside the homepage playground route")
	}

	if err := setting.UpdateUserUsableGroupsByJSONString(`{"discount":"特价"}`); err != nil {
		t.Fatalf("hide default group: %v", err)
	}
	cDefaultHidden, _ := newPlaygroundDiscountFallbackContext()
	if shouldFallbackPlaygroundDiscount(cDefaultHidden, info, boundedMeta, availabilityErr) {
		t.Fatal("shouldFallbackPlaygroundDiscount() = true when default group is not usable")
	}
}

func TestPreparePlaygroundDiscountFallbackReservesDefaultPricing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withTokenCounting(t)
	withPlaygroundDiscountPricing(t)

	c, recorder := newPlaygroundDiscountFallbackContext()
	billing := &playgroundDiscountBillingStub{preConsumed: 10}
	info := &relaycommon.RelayInfo{
		OriginModelName: "gpt-5.5",
		UsingGroup:      service.DiscountPricingGroupName,
		UserGroup:       "default",
		Billing:         billing,
	}
	info.SetEstimatePromptTokens(100)
	retry := &service.RetryParam{
		Ctx:        c,
		TokenGroup: service.DiscountPricingGroupName,
		ModelName:  info.OriginModelName,
		Retry:      common.GetPointer(2),
	}

	if err := preparePlaygroundDiscountFallback(c, info, retry, &types.TokenCountMeta{MaxTokens: 4096}); err != nil {
		t.Fatalf("preparePlaygroundDiscountFallback() error = %v", err)
	}
	if info.UsingGroup != "default" || retry.TokenGroup != "default" || retry.GetRetry() != 0 {
		t.Fatalf("fallback groups not switched: info=%q token=%q retry=%d", info.UsingGroup, retry.TokenGroup, retry.GetRetry())
	}
	if got := common.GetContextKeyString(c, constant.ContextKeyUsingGroup); got != "default" {
		t.Fatalf("context using group = %q, want default", got)
	}
	if got := common.GetContextKeyString(c, constant.ContextKeyAutoGroup); got != "default" {
		t.Fatalf("context auto group = %q, want default", got)
	}
	if len(billing.reserveTargets) != 1 || billing.reserveTargets[0] != info.PriceData.QuotaToPreConsume {
		t.Fatalf("reserve targets = %v, price pre-consume = %d", billing.reserveTargets, info.PriceData.QuotaToPreConsume)
	}
	minimumCompletionQuota := 4096 * 2 * 6
	if billing.reserveTargets[0] < minimumCompletionQuota {
		t.Fatalf("reserve target = %d, want at least max completion cost %d", billing.reserveTargets[0], minimumCompletionQuota)
	}
	if info.PriceData.GroupRatioInfo.GroupRatio != 1 {
		t.Fatalf("fallback group ratio = %v, want 1", info.PriceData.GroupRatioInfo.GroupRatio)
	}
	if recorder.Header().Get(playgroundDiscountFallbackHeader) != "1" || recorder.Header().Get(playgroundPricingGroupHeader) != "default" {
		t.Fatalf("fallback headers = %v", recorder.Header())
	}

	walletContext, walletRecorder := newPlaygroundDiscountFallbackContext()
	walletBilling := &playgroundDiscountBillingStub{preConsumed: 1}
	walletInfo := &relaycommon.RelayInfo{
		OriginModelName: "gpt-5.5",
		UsingGroup:      service.DiscountPricingGroupName,
		UserGroup:       "default",
		UserQuota:       1,
		BillingSource:   service.BillingSourceWallet,
		Billing:         walletBilling,
	}
	walletInfo.SetEstimatePromptTokens(100)
	walletRetry := &service.RetryParam{
		Ctx:        walletContext,
		TokenGroup: service.DiscountPricingGroupName,
		ModelName:  walletInfo.OriginModelName,
		Retry:      common.GetPointer(0),
	}
	walletErr := preparePlaygroundDiscountFallback(walletContext, walletInfo, walletRetry, &types.TokenCountMeta{MaxTokens: 4096})
	if walletErr == nil || walletErr.GetErrorCode() != types.ErrorCodeInsufficientUserQuota || walletErr.StatusCode != http.StatusForbidden {
		t.Fatalf("wallet fallback error = %#v, want insufficient quota 403", walletErr)
	}
	if len(walletBilling.reserveTargets) != 0 {
		t.Fatalf("wallet reserve targets = %v, want no reserve when the full original-price estimate is unaffordable", walletBilling.reserveTargets)
	}
	if walletInfo.UsingGroup != service.DiscountPricingGroupName || walletRetry.TokenGroup != service.DiscountPricingGroupName {
		t.Fatalf("wallet fallback mutated groups after rejection: info=%q token=%q", walletInfo.UsingGroup, walletRetry.TokenGroup)
	}
	if walletRecorder.Header().Get(playgroundDiscountFallbackHeader) != "" || walletRecorder.Header().Get(playgroundPricingGroupHeader) != "" {
		t.Fatalf("wallet rejection exposed fallback headers = %v", walletRecorder.Header())
	}
}

func TestPreparePlaygroundDiscountFallbackStopsBeforeDefaultWhenReserveFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withTokenCounting(t)
	withPlaygroundDiscountPricing(t)
	c, recorder := newPlaygroundDiscountFallbackContext()
	reserveFailure := types.NewErrorWithStatusCode(errors.New("reserve failed"), types.ErrorCodeInsufficientUserQuota, http.StatusForbidden)
	billing := &playgroundDiscountBillingStub{preConsumed: 10, reserveErr: reserveFailure}
	info := &relaycommon.RelayInfo{
		OriginModelName: "gpt-5.5",
		UsingGroup:      service.DiscountPricingGroupName,
		UserGroup:       "default",
		Billing:         billing,
		PriceData:       types.PriceData{QuotaToPreConsume: 17},
	}
	info.SetEstimatePromptTokens(100)
	retry := &service.RetryParam{
		Ctx:        c,
		TokenGroup: service.DiscountPricingGroupName,
		ModelName:  info.OriginModelName,
		Retry:      common.GetPointer(0),
	}

	if err := preparePlaygroundDiscountFallback(c, info, retry, &types.TokenCountMeta{MaxTokens: 4096}); err != reserveFailure {
		t.Fatalf("preparePlaygroundDiscountFallback() error = %#v, want original reserve failure", err)
	} else if err.GetErrorCode() != types.ErrorCodeInsufficientUserQuota || err.StatusCode != http.StatusForbidden {
		t.Fatalf("reserve failure lost code/status: code=%q status=%d", err.GetErrorCode(), err.StatusCode)
	}
	if info.UsingGroup != service.DiscountPricingGroupName {
		t.Fatalf("relay info using group = %q, want discount when reserve fails", info.UsingGroup)
	}
	if info.PriceData.QuotaToPreConsume != 17 {
		t.Fatalf("relay price data was not restored after reserve failure: %#v", info.PriceData)
	}
	if got := common.GetContextKeyString(c, constant.ContextKeyUsingGroup); got != service.DiscountPricingGroupName {
		t.Fatalf("context using group = %q, want discount after reserve failure", got)
	}
	if got := common.GetContextKeyString(c, constant.ContextKeyAutoGroup); got != service.DiscountPricingGroupName {
		t.Fatalf("context auto group = %q, want discount after reserve failure", got)
	}
	if recorder.Header().Get(playgroundDiscountFallbackHeader) != "" || recorder.Header().Get(playgroundPricingGroupHeader) != "" {
		t.Fatalf("reserve failure exposed fallback headers = %v", recorder.Header())
	}
	if c.GetBool(playgroundDiscountFallbackKey) {
		t.Fatal("reserve failure marked fallback as completed")
	}
	if retry.TokenGroup != service.DiscountPricingGroupName {
		t.Fatalf("retry token group = %q, want discount when reserve fails", retry.TokenGroup)
	}
}

func TestPlaygroundDiscountFallbackRequestAppliesFullReserveBeforeBilling(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalCountToken := constant.CountToken
	constant.CountToken = true
	t.Cleanup(func() {
		constant.CountToken = originalCountToken
	})

	c, _ := newPlaygroundDiscountFallbackContext()
	c.Request.Header.Set(playgroundDiscountFallbackRequestHeader, "1")
	info := &relaycommon.RelayInfo{UsingGroup: "default"}
	info.SetEstimatePromptTokens(100)
	if !isPlaygroundDiscountFallbackRequest(c, info) {
		t.Fatal("isPlaygroundDiscountFallbackRequest() = false, want true for marked default request")
	}
	withoutHeader, _ := newPlaygroundDiscountFallbackContext()
	if isPlaygroundDiscountFallbackRequest(withoutHeader, info) {
		t.Fatal("isPlaygroundDiscountFallbackRequest() = true without fallback header")
	}
	nonPlayground, _ := newPlaygroundDiscountFallbackContext()
	nonPlayground.Request.URL.Path = "/v1/chat/completions"
	nonPlayground.Request.Header.Set(playgroundDiscountFallbackRequestHeader, "1")
	if isPlaygroundDiscountFallbackRequest(nonPlayground, info) {
		t.Fatal("isPlaygroundDiscountFallbackRequest() = true outside playground route")
	}
	discountInfo := &relaycommon.RelayInfo{UsingGroup: service.DiscountPricingGroupName}
	if isPlaygroundDiscountFallbackRequest(c, discountInfo) {
		t.Fatal("isPlaygroundDiscountFallbackRequest() = true for discount request")
	}

	priceData := types.PriceData{
		ModelRatio:      2,
		CompletionRatio: 6,
		GroupRatioInfo: types.GroupRatioInfo{
			GroupRatio: 1,
		},
		QuotaToPreConsume: 1000,
	}
	boundedMeta := &types.TokenCountMeta{MaxTokens: 4096}
	adjusted, apiErr := applyPlaygroundDiscountFallbackReserve(info, boundedMeta, priceData)
	if apiErr != nil {
		t.Fatalf("applyPlaygroundDiscountFallbackReserve() error = %v", apiErr)
	}
	minimumCompletionQuota := 4096 * 2 * 6
	if adjusted.QuotaToPreConsume < minimumCompletionQuota || info.PriceData.QuotaToPreConsume != adjusted.QuotaToPreConsume {
		t.Fatalf("fallback request reserve = %d, relay reserve = %d, want at least %d", adjusted.QuotaToPreConsume, info.PriceData.QuotaToPreConsume, minimumCompletionQuota)
	}

	constant.CountToken = false
	if _, apiErr := applyPlaygroundDiscountFallbackReserve(info, boundedMeta, priceData); apiErr == nil || apiErr.StatusCode != http.StatusBadRequest {
		t.Fatalf("fallback request without token counting error = %#v, want bad request", apiErr)
	}
}

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

func TestRespondTaskErrorSanitizesVideoUpstreamFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", nil)

	respondTaskError(c, &dto.TaskError{
		Code:       "UPSTREAM_INTERNAL_451",
		Message:    "supplier.example rejected internal-model-name",
		Data:       map[string]any{"request_id": "upstream-secret-id"},
		StatusCode: http.StatusUnavailableForLegalReasons,
		Error:      errors.New("supplier.example rejected internal-model-name"),
	})

	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadGateway)
	}
	var response dto.TaskError
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Code != "service_unavailable" {
		t.Fatalf("code = %q, want service_unavailable", response.Code)
	}
	if response.Message != "视频生成服务暂时不可用，请稍后重试。" {
		t.Fatalf("message = %q, want sanitized video message", response.Message)
	}
	if response.Data != nil {
		t.Fatalf("data = %#v, want nil", response.Data)
	}
	if strings.Contains(recorder.Body.String(), "supplier.example") ||
		strings.Contains(recorder.Body.String(), "internal-model-name") ||
		strings.Contains(recorder.Body.String(), "UPSTREAM_INTERNAL_451") ||
		strings.Contains(recorder.Body.String(), "upstream-secret-id") {
		t.Fatalf("response leaked upstream details: %s", recorder.Body.String())
	}
}

func TestRespondTaskErrorKeepsLocalVideoValidationDetail(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/pg/video/generations", nil)

	respondTaskError(c, &dto.TaskError{
		Code:       "invalid_request",
		Message:    "图生视频最多上传 1 张图片",
		StatusCode: http.StatusBadRequest,
		LocalError: true,
	})

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
	if !strings.Contains(recorder.Body.String(), "图生视频最多上传 1 张图片") {
		t.Fatalf("response = %s, want local validation detail", recorder.Body.String())
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
	if !strings.Contains(err.Error(), "特价 image-2") {
		t.Fatalf("error = %q, want public model name", err.Error())
	}
	if !strings.Contains(err.Error(), "/v1/images/generations") || strings.Contains(err.Error(), "/v1/images/edits") {
		t.Fatalf("error = %q, want generation-only endpoint hint", err.Error())
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

func TestShouldRetryAllowsDiscountImage2Fallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("channel_affinity_skip_retry_on_failure", true)
	setPlaygroundForcedChannelIDs(c, []int{discountImage2PrimaryChannelID, discountImage2FallbackChannelID})
	c.Set("use_channel", []string{"27"})

	err := types.NewOpenAIError(errors.New("upstream unavailable"), types.ErrorCodeDoRequestFailed, http.StatusServiceUnavailable)
	if !shouldRetry(c, err, 1) {
		t.Fatal("shouldRetry() = false, want true with the discount image-2 fallback remaining")
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

func TestShouldRetryAllowsPlusTextTimeoutFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name   string
		path   string
		status int
	}{
		{name: "responses 504", path: "/v1/responses", status: http.StatusGatewayTimeout},
		{name: "responses 524", path: "/v1/responses", status: 524},
		{name: "chat 504", path: "/v1/chat/completions", status: http.StatusGatewayTimeout},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, tc.path, nil)
			c.Set("channel_affinity_skip_retry_on_failure", true)
			common.SetContextKey(c, constant.ContextKeyUsingGroup, service.PlusPricingGroupName)

			err := types.WithOpenAIError(types.OpenAIError{
				Message: "gateway timeout",
				Type:    "openai_error",
				Code:    "upstream_timeout",
			}, tc.status)

			if !shouldRetry(c, err, 1) {
				t.Fatal("shouldRetry() = false, want true for Plus text timeout")
			}
		})
	}
}

func TestShouldRetryPlusTextTimeoutGuardrails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	newContext := func(path, group string) *gin.Context {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, path, nil)
		common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
		return c
	}
	newTimeout := func(options ...types.NewAPIErrorOptions) *types.NewAPIError {
		return types.WithOpenAIError(types.OpenAIError{
			Message: "gateway timeout",
			Type:    "openai_error",
			Code:    "upstream_timeout",
		}, http.StatusGatewayTimeout, options...)
	}

	tests := []struct {
		name       string
		context    *gin.Context
		err        *types.NewAPIError
		retryTimes int
	}{
		{name: "default group", context: newContext("/v1/responses", "default"), err: newTimeout(), retryTimes: 1},
		{name: "image path", context: newContext("/v1/images/generations", service.PlusPricingGroupName), err: newTimeout(), retryTimes: 1},
		{name: "no retries left", context: newContext("/v1/responses", service.PlusPricingGroupName), err: newTimeout(), retryTimes: 0},
		{name: "local skip retry error", context: newContext("/v1/responses", service.PlusPricingGroupName), err: newTimeout(types.ErrOptionWithSkipRetry()), retryTimes: 1},
		{name: "local non upstream error", context: newContext("/v1/responses", service.PlusPricingGroupName), err: types.NewErrorWithStatusCode(errors.New("local timeout"), types.ErrorCodeInvalidRequest, http.StatusGatewayTimeout), retryTimes: 1},
	}
	specificChannel := newContext("/v1/responses", service.PlusPricingGroupName)
	specificChannel.Set("specific_channel_id", 43)
	tests = append(tests, struct {
		name       string
		context    *gin.Context
		err        *types.NewAPIError
		retryTimes int
	}{name: "specific channel", context: specificChannel, err: newTimeout(), retryTimes: 1})
	outputSent := newContext("/v1/responses", service.PlusPricingGroupName)
	outputSent.Set("response_stream_output_sent", true)
	tests = append(tests, struct {
		name       string
		context    *gin.Context
		err        *types.NewAPIError
		retryTimes int
	}{name: "output already sent", context: outputSent, err: newTimeout(), retryTimes: 1})

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if shouldRetry(tc.context, tc.err, tc.retryTimes) {
				t.Fatal("shouldRetry() = true, want false")
			}
		})
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
