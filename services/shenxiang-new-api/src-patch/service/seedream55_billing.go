package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

const seedream55BillingKey = "seedream55_billing"

type Seedream55Billing struct {
	Quote         dto.Seedream55Quote
	QuotaPerCNY   decimal.Decimal
	ActualOutputs int
}

func StartSeedream55Billing(c *gin.Context, quote dto.Seedream55Quote, exchange float64) *Seedream55Billing {
	bill := &Seedream55Billing{
		Quote:       quote,
		QuotaPerCNY: decimal.NewFromFloat(common.QuotaPerUnit).Div(decimal.NewFromFloat(exchange)),
	}
	c.Set(seedream55BillingKey, bill)
	return bill
}

func GetSeedream55Billing(c *gin.Context) *Seedream55Billing {
	v, _ := c.Get(seedream55BillingKey)
	bill, _ := v.(*Seedream55Billing)
	return bill
}

func (b *Seedream55Billing) Quota(outputs int) int {
	units := b.Quote.TotalUnits(outputs)
	return int(decimal.New(int64(units), -4).Mul(b.QuotaPerCNY).Round(0).IntPart())
}

func (b *Seedream55Billing) Audit(other map[string]interface{}) {
	other["image_price_version"] = "seedream55-cny-20261120"
	other["image_input_count"] = b.Quote.InputCount
	other["image_output_count"] = b.ActualOutputs
	other["image_output_cap"] = b.Quote.OutputCap
	other["image_output_tier"] = b.Quote.Tier
	other["image_input_unit_cny"] = decimal.New(dto.Seedream55InputRate, -4).String()
	other["image_output_unit_cny"] = decimal.New(int64(b.Quote.OutputRate), -4).String()
	other["image_total_cny"] = decimal.New(int64(b.Quote.TotalUnits(b.ActualOutputs)), -4).String()
	other["reserved_quota"] = b.Quota(b.Quote.OutputCap)
	other["charged_quota"] = b.Quota(b.ActualOutputs)
}
