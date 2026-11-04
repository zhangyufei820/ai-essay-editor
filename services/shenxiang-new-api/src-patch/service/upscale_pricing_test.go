package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/require"
	"math"
	"testing"
)

func TestUpscaleOfficialPixelCredits(t *testing.T) {
	for _, x := range []struct {
		p    int64
		s, c int
	}{{1000000, 2, 90}, {1000000, 4, 360}, {1000000, 8, 1440}, {360000, 8, 540}, {90000, 16, 630}, {9000000, 2, 1080}, {2073600, 2, 180}} {
		c, e := UpscaleCredits(x.p, x.s)
		require.NoError(t, e)
		require.Equal(t, x.c, c)
	}
	_, e := UpscaleCredits(1000000, 16)
	require.Error(t, e)
	_, e = UpscaleCredits(1, 3)
	require.Error(t, e)
}

func TestUpscalePricingPixelReferenceCalibration(t *testing.T) {
	oldRate, oldQuota := operation_setting.USDExchangeRate, common.QuotaPerUnit
	defer func() { operation_setting.USDExchangeRate = oldRate; common.QuotaPerUnit = oldQuota }()
	operation_setting.USDExchangeRate, common.QuotaPerUnit = 7.3, 500000
	p := UpscalePricing{Mode: "per_credit_by_scale", PerCreditByScale: map[int]float64{2: 0.613 / 90, 4: 2.252 / 360, 8: 8.508 / 1440, 16: 8.921 / 1530}}
	for _, sample := range []struct {
		pixels int64
		scale  int
		amount float64
	}{{1000000, 2, 0.613}, {1000000, 4, 2.252}, {1000000, 8, 8.508}, {250000, 16, 8.921}} {
		amount, quota, err := p.Amount(sample.pixels, sample.scale)
		require.NoError(t, err)
		require.InDelta(t, sample.amount, amount, 0.00002)
		require.Greater(t, quota, 0)
	}
	small, _, err := p.Amount(250000, 4)
	require.NoError(t, err)
	large, _, err := p.Amount(1000000, 4)
	require.NoError(t, err)
	require.Less(t, small, large)
	_, _, err = p.Amount(1000000, 16)
	require.Error(t, err)
	_, err = UpscaleCredits(math.MaxInt64, 16)
	require.Error(t, err)
}

func TestUpscaleCreditTierBoundaries(t *testing.T) {
	for _, sample := range []struct {
		pixels int64
		want   int
	}{{1300000, 90}, {1300001, 180}, {3000000, 180}, {3000001, 270}, {6400000, 270}, {6400001, 1080}, {25300000, 1080}} {
		got, err := UpscaleCredits(sample.pixels, 2)
		require.NoError(t, err)
		require.Equal(t, sample.want, got)
	}
	_, err := UpscaleCredits(25300001, 2)
	require.Error(t, err)
	_, err = UpscaleCredits(395313, 16)
	require.Error(t, err)
	_, err = UpscaleCredits(395312, 16)
	require.NoError(t, err)
}
func TestUpscalePricingCNYConversion(t *testing.T) {
	oldRate, oldQuota := operation_setting.USDExchangeRate, common.QuotaPerUnit
	defer func() { operation_setting.USDExchangeRate = oldRate; common.QuotaPerUnit = oldQuota }()
	operation_setting.USDExchangeRate = 7.3
	common.QuotaPerUnit = 500000
	p := UpscalePricing{Mode: "per_credit", PerCredit: 0.613 / 90}
	a, q, e := p.Amount(1000000, 2)
	require.NoError(t, e)
	require.Equal(t, 41987, q)
	require.InDelta(t, 0.613, a, 0.00002)
	p = UpscalePricing{Mode: "per_credit", PerCredit: 0.01}
	a, _, e = p.Amount(1000000, 4)
	require.NoError(t, e)
	require.InDelta(t, 3.6, a, 0.00002)
}
