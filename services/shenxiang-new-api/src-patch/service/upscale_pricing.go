package service

import (
	"encoding/json"
	"errors"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"math"
)

const UpscalePrecisionModel = "精准放大"
const UpscaleCreativeModel = "创意放大"

type UpscalePricing struct {
	Mode             string          `json:"mode"`
	PerCredit        float64         `json:"per_credit_cny"`
	PerCreditByScale map[int]float64 `json:"per_credit_cny_by_scale,omitempty"`
}

func GetUpscalePricing() (UpscalePricing, error) {
	var option model.Option
	var p UpscalePricing
	if model.DB == nil {
		return p, errors.New("放大价格尚未配置")
	}
	if err := model.DB.Where("`key` = ?", "UpscalePricingCNY").First(&option).Error; err != nil {
		return p, errors.New("放大价格尚未配置")
	}
	if json.Unmarshal([]byte(option.Value), &p) != nil {
		return p, errors.New("放大价格配置错误")
	}
	if p.Mode != "per_credit" && p.Mode != "per_credit_by_scale" {
		return p, errors.New("放大价格尚未配置")
	}
	for _, scale := range []int{2, 4, 8, 16} {
		if _, _, err := p.Amount(256, scale); err != nil {
			return p, err
		}
	}
	return p, nil
}
func UpscaleCredits(pixels int64, scale int) (int, error) {
	if pixels <= 0 {
		return 0, errors.New("图片尺寸无效")
	}
	if scale != 2 && scale != 4 && scale != 8 && scale != 16 {
		return 0, errors.New("放大倍数只能为 2、4、8、16")
	}
	if pixels > 101200000/int64(scale*scale) {
		return 0, errors.New("放大后的图片不能超过一亿零一百二十万像素")
	}
	credits := 0
	for s := scale; s > 1; s /= 2 {
		switch {
		case pixels <= 1300000:
			credits += 90
		case pixels <= 3000000:
			credits += 180
		case pixels <= 6400000:
			credits += 270
		case pixels <= 25300000:
			credits += 1080
		default:
			return 0, errors.New("图片超过可放大像素上限")
		}
		pixels *= 4
	}
	return credits, nil
}
func (p UpscalePricing) Amount(pixels int64, scale int) (float64, int, error) {
	credits, err := UpscaleCredits(pixels, scale)
	if err != nil {
		return 0, 0, err
	}
	amount := float64(0)
	if p.Mode == "per_credit" {
		amount = float64(credits) * p.PerCredit
	} else if p.Mode == "per_credit_by_scale" {
		amount = float64(credits) * p.PerCreditByScale[scale]
	} else {
		return 0, 0, errors.New("放大价格尚未配置")
	}
	if math.IsNaN(amount) || math.IsInf(amount, 0) || amount <= 0 {
		return 0, 0, errors.New("放大价格尚未配置")
	}
	rate := operation_setting.USDExchangeRate
	if rate <= 0 || common.QuotaPerUnit <= 0 {
		return 0, 0, errors.New("人民币换算配置错误")
	}
	units := amount / rate * common.QuotaPerUnit
	if math.IsNaN(units) || math.IsInf(units, 0) || units > float64(math.MaxInt32) {
		return 0, 0, errors.New("放大金额超出可处理范围")
	}
	quota := int(math.Ceil(units))
	return float64(quota) / common.QuotaPerUnit * rate, quota, nil
}

func (p UpscalePricing) Examples() map[int]float64 {
	prices := map[int]float64{}
	for _, s := range []int{2, 4, 8, 16} {
		pixels := int64(1000000)
		if s == 16 {
			pixels = 250000
		}
		if amount, _, err := p.Amount(pixels, s); err == nil {
			prices[s] = amount
		}
	}
	return prices
}
