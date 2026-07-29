package service

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
)

const (
	DefaultUpstreamCostMarkupRate        = 0.08
	upstreamCostChannelCurrenciesEnvName = "UPSTREAM_COST_BILLING_CHANNEL_CURRENCIES"
)

type UpstreamCostBillingResult struct {
	Applied              bool
	Source               string
	FallbackReason       string
	UpstreamCost         float64
	UpstreamCostCurrency string
	MarkupRate           float64
	BilledCostUSD        float64
	PreviousQuota        int
	FinalQuota           int
}

type upstreamCostCandidate struct {
	source   string
	currency string
	value    any
}

func upstreamCostMarkupRate() float64 {
	value := common.GetEnvOrDefaultString("UPSTREAM_COST_MARKUP_RATE", "")
	if value == "" {
		return DefaultUpstreamCostMarkupRate
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil || parsed < 0 {
		common.SysError(fmt.Sprintf("invalid UPSTREAM_COST_MARKUP_RATE %q; using default %.4f", value, DefaultUpstreamCostMarkupRate))
		return DefaultUpstreamCostMarkupRate
	}
	return parsed
}

func upstreamCostCurrencyForChannel(relayInfo *relaycommon.RelayInfo) (string, string) {
	if relayInfo == nil || relayInfo.ChannelMeta == nil || relayInfo.ChannelId <= 0 {
		return "", "missing_cost_channel"
	}
	configured := common.GetEnvOrDefaultString(upstreamCostChannelCurrenciesEnvName, "")
	for _, entry := range strings.Split(configured, ",") {
		channelIDText, currencyText, found := strings.Cut(strings.TrimSpace(entry), ":")
		if !found {
			continue
		}
		channelID, err := strconv.Atoi(strings.TrimSpace(channelIDText))
		if err != nil || channelID != relayInfo.ChannelId {
			continue
		}
		currency := normalizeCostCurrency(currencyText)
		if currency != "USD" && currency != "CNY" {
			return "", "invalid_cost_channel_currency"
		}
		return currency, ""
	}
	return "", "unapproved_cost_channel"
}

var responseHeaderCostFields = []string{
	"X-Upstream-Cost",
	"X-Usage-Cost",
	"X-Provider-Cost",
	"X-Billing-Cost",
	"X-Total-Cost",
	"X-Cost",
}

var responseHeaderCostUSDFields = []string{
	"X-Upstream-Cost-Usd",
	"X-Usage-Cost-Usd",
	"X-Provider-Cost-Usd",
	"X-Billing-Cost-Usd",
	"X-Total-Cost-Usd",
	"X-Cost-Usd",
}

var responseHeaderCostCNYFields = []string{
	"X-Upstream-Cost-Cny",
	"X-Usage-Cost-Cny",
	"X-Provider-Cost-Cny",
	"X-Billing-Cost-Cny",
	"X-Total-Cost-Cny",
	"X-Cost-Cny",
}

var responseHeaderCurrencyFields = []string{
	"X-Upstream-Cost-Currency",
	"X-Billing-Currency",
	"X-Cost-Currency",
	"X-Currency",
}

func ApplyUpstreamCostBilling(relayInfo *relaycommon.RelayInfo, usage *dto.Usage, currentQuota int) (int, *UpstreamCostBillingResult) {
	markupRate := upstreamCostMarkupRate()
	result := &UpstreamCostBillingResult{
		MarkupRate:    markupRate,
		PreviousQuota: currentQuota,
		FinalQuota:    currentQuota,
	}
	if IsDiscountPricingGroup(relayInfo) {
		result.FallbackReason = "discount_group_static_pricing"
		return currentQuota, result
	}
	if IsGrok45PricingGroup(relayInfo) {
		result.FallbackReason = "grok45_static_pricing"
		return currentQuota, result
	}
	if IsKimiK3PricingGroup(relayInfo) {
		result.FallbackReason = "kimi_k3_static_pricing"
		return currentQuota, result
	}
	if IsSpecialPricingGroup(relayInfo) {
		result.FallbackReason = "special_group_static_pricing"
		return currentQuota, result
	}
	declaredCurrency, reason := upstreamCostCurrencyForChannel(relayInfo)
	if reason != "" {
		result.FallbackReason = reason
		return currentQuota, result
	}
	cost, currency, source, ok, reason := extractUpstreamCostFromUsage(usage, declaredCurrency)
	if !ok {
		result.FallbackReason = reason
		return currentQuota, result
	}
	if currency != declaredCurrency {
		result.FallbackReason = "upstream_cost_currency_mismatch"
		return currentQuota, result
	}

	quota, billedCostUSD, ok := quotaFromUpstreamCost(cost, currency, markupRate)
	if !ok {
		result.FallbackReason = "unsupported_currency"
		return currentQuota, result
	}

	result.Applied = true
	result.Source = source
	result.UpstreamCost = cost
	result.UpstreamCostCurrency = currency
	result.BilledCostUSD = billedCostUSD
	result.FinalQuota = quota
	return quota, result
}

func ApplyRealtimeUpstreamCostBilling(relayInfo *relaycommon.RelayInfo, usage *dto.RealtimeUsage, currentQuota int) (int, *UpstreamCostBillingResult) {
	if usage == nil {
		return ApplyUpstreamCostBilling(relayInfo, nil, currentQuota)
	}
	normalUsage := &dto.Usage{
		Cost:         usage.Cost,
		TotalCost:    usage.TotalCost,
		CostUSD:      usage.CostUSD,
		CostCNY:      usage.CostCNY,
		CostCurrency: usage.CostCurrency,
		Currency:     usage.Currency,
		CostDetails:  usage.CostDetails,
		Billing:      usage.Billing,
	}
	return ApplyUpstreamCostBilling(relayInfo, normalUsage, currentQuota)
}

func ExtractUpstreamCostFromUsage(usage *dto.Usage) (cost float64, currency string, source string, ok bool, reason string) {
	return extractUpstreamCostFromUsage(usage, "")
}

func extractUpstreamCostFromUsage(usage *dto.Usage, declaredCurrency string) (cost float64, currency string, source string, ok bool, reason string) {
	if usage == nil {
		return 0, "", "", false, "missing_usage"
	}

	defaultCurrency := normalizeCostCurrency(firstNonEmpty(usage.CostCurrency, usage.Currency))
	if defaultCurrency == "" {
		defaultCurrency = normalizeCostCurrency(declaredCurrency)
	}
	candidates := []upstreamCostCandidate{
		{source: "usage.cost_usd", currency: "USD", value: usage.CostUSD},
		{source: "usage.cost_cny", currency: "CNY", value: usage.CostCNY},
		{source: "usage.total_cost", currency: defaultCurrency, value: usage.TotalCost},
		{source: "usage.cost", currency: defaultCurrency, value: usage.Cost},
	}
	if usage.CostDetails != nil {
		detailsCurrency := normalizeCostCurrency(firstNonEmpty(usage.CostDetails.CostCurrency, usage.CostDetails.Currency, defaultCurrency))
		candidates = append(candidates,
			upstreamCostCandidate{source: "usage.cost_details.cost_usd", currency: "USD", value: usage.CostDetails.CostUSD},
			upstreamCostCandidate{source: "usage.cost_details.cost_cny", currency: "CNY", value: usage.CostDetails.CostCNY},
			upstreamCostCandidate{source: "usage.cost_details.total_cost", currency: detailsCurrency, value: usage.CostDetails.TotalCost},
			upstreamCostCandidate{source: "usage.cost_details.total", currency: detailsCurrency, value: usage.CostDetails.Total},
			upstreamCostCandidate{source: "usage.cost_details.cost", currency: detailsCurrency, value: usage.CostDetails.Cost},
		)
	}
	if usage.Billing != nil {
		billingCurrency := normalizeCostCurrency(firstNonEmpty(usage.Billing.CostCurrency, usage.Billing.Currency, defaultCurrency))
		candidates = append(candidates,
			upstreamCostCandidate{source: "usage.billing.cost_usd", currency: "USD", value: usage.Billing.CostUSD},
			upstreamCostCandidate{source: "usage.billing.cost_cny", currency: "CNY", value: usage.Billing.CostCNY},
			upstreamCostCandidate{source: "usage.billing.total_cost", currency: billingCurrency, value: usage.Billing.TotalCost},
			upstreamCostCandidate{source: "usage.billing.total", currency: billingCurrency, value: usage.Billing.Total},
			upstreamCostCandidate{source: "usage.billing.amount", currency: billingCurrency, value: usage.Billing.Amount},
			upstreamCostCandidate{source: "usage.billing.cost", currency: billingCurrency, value: usage.Billing.Cost},
		)
	}

	missingCurrency := false
	unsupportedCurrency := false
	for _, candidate := range candidates {
		parsed, parsedOK := parsePositiveCost(candidate.value)
		if !parsedOK {
			continue
		}
		currency = normalizeCostCurrency(candidate.currency)
		if currency == "" {
			missingCurrency = true
			continue
		}
		if currency != "USD" && currency != "CNY" {
			unsupportedCurrency = true
			continue
		}
		return parsed, currency, candidate.source, true, ""
	}
	if missingCurrency {
		return 0, "", "", false, "missing_upstream_cost_currency"
	}
	if unsupportedCurrency {
		return 0, "", "", false, "unsupported_currency"
	}
	return 0, "", "", false, "missing_upstream_cost"
}

func CopyUsageCostFields(dst *dto.Usage, src *dto.Usage) {
	if dst == nil || src == nil {
		return
	}
	if dst.Cost == nil {
		dst.Cost = src.Cost
	}
	if dst.TotalCost == nil {
		dst.TotalCost = src.TotalCost
	}
	if dst.CostUSD == nil {
		dst.CostUSD = src.CostUSD
	}
	if dst.CostCNY == nil {
		dst.CostCNY = src.CostCNY
	}
	if dst.CostCurrency == "" {
		dst.CostCurrency = src.CostCurrency
	}
	if dst.Currency == "" {
		dst.Currency = src.Currency
	}
	if dst.CostDetails == nil {
		dst.CostDetails = src.CostDetails
	}
	if dst.Billing == nil {
		dst.Billing = src.Billing
	}
}

func CopyClaudeUsageCostFields(dst *dto.Usage, src *dto.ClaudeUsage) {
	if dst == nil || src == nil {
		return
	}
	if dst.Cost == nil {
		dst.Cost = src.Cost
	}
	if dst.TotalCost == nil {
		dst.TotalCost = src.TotalCost
	}
	if dst.CostUSD == nil {
		dst.CostUSD = src.CostUSD
	}
	if dst.CostCNY == nil {
		dst.CostCNY = src.CostCNY
	}
	if dst.CostCurrency == "" {
		dst.CostCurrency = src.CostCurrency
	}
	if dst.Currency == "" {
		dst.Currency = src.Currency
	}
	if dst.CostDetails == nil {
		dst.CostDetails = src.CostDetails
	}
	if dst.Billing == nil {
		dst.Billing = src.Billing
	}
}

func CopyResponsesCostFields(dst *dto.Usage, src *dto.OpenAIResponsesResponse) {
	if dst == nil || src == nil {
		return
	}
	if src.Usage != nil {
		CopyUsageCostFields(dst, src.Usage)
	}
	if dst.Cost == nil {
		dst.Cost = src.Cost
	}
	if dst.TotalCost == nil {
		dst.TotalCost = src.TotalCost
	}
	if dst.CostUSD == nil {
		dst.CostUSD = src.CostUSD
	}
	if dst.CostCNY == nil {
		dst.CostCNY = src.CostCNY
	}
	if dst.CostCurrency == "" {
		dst.CostCurrency = src.CostCurrency
	}
	if dst.Currency == "" {
		dst.Currency = src.Currency
	}
	if dst.CostDetails == nil {
		dst.CostDetails = src.CostDetails
	}
	if dst.Billing == nil {
		dst.Billing = src.Billing
	}
}

func CopyResponseHeaderCostFields(dst *dto.Usage, headers http.Header) {
	if dst == nil || headers == nil {
		return
	}
	if dst.CostUSD == nil {
		if value := firstResponseHeader(headers, responseHeaderCostUSDFields...); value != "" {
			dst.CostUSD = value
			if dst.CostCurrency == "" {
				dst.CostCurrency = "USD"
			}
		}
	}
	if dst.CostCNY == nil {
		if value := firstResponseHeader(headers, responseHeaderCostCNYFields...); value != "" {
			dst.CostCNY = value
			if dst.CostCurrency == "" {
				dst.CostCurrency = "CNY"
			}
		}
	}
	if dst.Cost == nil {
		if value := firstResponseHeader(headers, responseHeaderCostFields...); value != "" {
			dst.Cost = value
		}
	}
	if dst.CostCurrency == "" {
		dst.CostCurrency = normalizeCostCurrency(firstResponseHeader(headers, responseHeaderCurrencyFields...))
	}
}

func MergeRealtimeUpstreamCost(totalUsage *dto.RealtimeUsage, usage *dto.RealtimeUsage) {
	if totalUsage == nil || usage == nil {
		return
	}
	normalUsage := &dto.Usage{
		Cost:         usage.Cost,
		TotalCost:    usage.TotalCost,
		CostUSD:      usage.CostUSD,
		CostCNY:      usage.CostCNY,
		CostCurrency: usage.CostCurrency,
		Currency:     usage.Currency,
		CostDetails:  usage.CostDetails,
		Billing:      usage.Billing,
	}
	cost, currency, _, ok, _ := ExtractUpstreamCostFromUsage(normalUsage)
	if !ok {
		return
	}
	totalNormalUsage := &dto.Usage{
		Cost:         totalUsage.Cost,
		TotalCost:    totalUsage.TotalCost,
		CostUSD:      totalUsage.CostUSD,
		CostCNY:      totalUsage.CostCNY,
		CostCurrency: totalUsage.CostCurrency,
		Currency:     totalUsage.Currency,
		CostDetails:  totalUsage.CostDetails,
		Billing:      totalUsage.Billing,
	}
	currentCost, currentCurrency, _, currentOK, _ := ExtractUpstreamCostFromUsage(totalNormalUsage)
	if currentOK && currentCurrency != currency {
		return
	}
	if currentOK {
		cost += currentCost
	}
	switch currency {
	case "CNY":
		totalUsage.CostCNY = cost
	default:
		totalUsage.CostUSD = cost
	}
	totalUsage.CostCurrency = currency
	totalUsage.Currency = currency
}

func InjectUpstreamCostBillingInfo(other map[string]interface{}, result *UpstreamCostBillingResult) {
	if other == nil || result == nil {
		return
	}
	other["upstream_cost_markup_rate"] = result.MarkupRate
	other["quota_before_upstream_cost"] = result.PreviousQuota
	if !result.Applied {
		other["upstream_cost_billing"] = "fallback"
		if result.FallbackReason != "" {
			other["upstream_cost_fallback_reason"] = result.FallbackReason
		}
		return
	}
	other["billing_mode"] = "upstream_cost_plus_markup"
	other["upstream_cost_billing"] = "applied"
	other["upstream_cost_source"] = result.Source
	other["upstream_cost"] = result.UpstreamCost
	other["upstream_cost_currency"] = result.UpstreamCostCurrency
	other["billed_cost_usd"] = result.BilledCostUSD
	other["quota_after_upstream_cost"] = result.FinalQuota
}

func quotaFromUpstreamCost(cost float64, currency string, markupRate float64) (quota int, billedCostUSD float64, ok bool) {
	currency = normalizeCostCurrency(currency)
	if currency == "" {
		return 0, 0, false
	}
	costDecimal := decimal.NewFromFloat(cost)
	switch currency {
	case "USD":
		billedCostUSD = costDecimal.Mul(decimal.NewFromFloat(1 + markupRate)).InexactFloat64()
	case "CNY":
		exchangeRate := operation_setting.USDExchangeRate
		if exchangeRate <= 0 {
			common.SysError("USDExchangeRate is not configured; upstream CNY cost billing is disabled to avoid profit distortion")
			return 0, 0, false
		}
		billedCostUSD = costDecimal.
			Div(decimal.NewFromFloat(exchangeRate)).
			Mul(decimal.NewFromFloat(1 + markupRate)).
			InexactFloat64()
	default:
		return 0, 0, false
	}
	quotaDecimal := decimal.NewFromFloat(billedCostUSD).Mul(decimal.NewFromFloat(common.QuotaPerUnit))
	// 防御异常上游成本（如恶意/错误的 cost header）导致 IntPart 溢出回绕成负数或垃圾值：
	// 超出安全范围或为负时不信任该成本，跳过上游成本计费，回退到标准计费。
	maxSafeQuota := decimal.New(1, 18) // 1e18，远超任何合理单请求成本，且安全位于 int64 范围内
	if quotaDecimal.IsNegative() || quotaDecimal.GreaterThan(maxSafeQuota) {
		common.SysError(fmt.Sprintf("upstream cost billing produced out-of-range quota (cost=%v %s, billedUSD=%v); skipping upstream cost billing", cost, currency, billedCostUSD))
		return 0, 0, false
	}
	quota = int(quotaDecimal.Round(0).IntPart())
	if quota == 0 && cost > 0 {
		quota = 1
	}
	return quota, billedCostUSD, true
}

func parsePositiveCost(value any) (float64, bool) {
	cost, ok := parseCost(value)
	if !ok || cost <= 0 {
		return 0, false
	}
	return cost, true
}

func firstResponseHeader(headers http.Header, names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(headers.Get(name)); value != "" {
			return value
		}
	}
	return ""
}

func parseCost(value any) (float64, bool) {
	switch v := value.(type) {
	case nil:
		return 0, false
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case int32:
		return float64(v), true
	case uint:
		return float64(v), true
	case uint64:
		return float64(v), true
	case json.Number:
		f, err := v.Float64()
		return f, err == nil
	case string:
		normalized := strings.TrimSpace(v)
		normalized = strings.TrimPrefix(normalized, "$")
		normalized = strings.TrimPrefix(normalized, "¥")
		normalized = strings.ReplaceAll(normalized, ",", "")
		if normalized == "" {
			return 0, false
		}
		f, err := strconv.ParseFloat(normalized, 64)
		return f, err == nil
	case map[string]any:
		for _, key := range []string{"total_cost", "total", "cost", "amount", "cost_usd", "usd", "cost_cny", "cny"} {
			if f, ok := parseCost(v[key]); ok {
				return f, true
			}
		}
	}
	return 0, false
}

func normalizeCostCurrency(currency string) string {
	currency = strings.TrimSpace(strings.ToUpper(currency))
	switch currency {
	case "":
		return ""
	case "DOLLAR", "DOLLARS", "US DOLLAR", "US DOLLARS", "US$", "$":
		return "USD"
	case "USD":
		return "USD"
	case "CNY", "RMB", "CN¥", "¥":
		return "CNY"
	default:
		return currency
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func FormatUpstreamCostBillingLog(result *UpstreamCostBillingResult) string {
	if result == nil || !result.Applied {
		return ""
	}
	return fmt.Sprintf("上游账单回填 +%.0f%%，上游成本 %.8f %s，最终扣费 %d",
		result.MarkupRate*100,
		result.UpstreamCost,
		result.UpstreamCostCurrency,
		result.FinalQuota,
	)
}
